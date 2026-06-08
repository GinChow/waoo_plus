import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import {
  deleteCoarseGroupHistoryVideo,
  parseCoarseGroupsJson,
  selectCoarseGroupVideo,
} from '@/lib/novel-promotion/coarse-group-image-state'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { getSignedUrl } from '@/lib/storage'
import { logInfo as _ulogInfo } from '@/lib/logging/core'

function summarizeVideoUrl(value: string | null | undefined): string {
  if (!value) return ''
  return value.length > 96 ? `${value.slice(0, 48)}...${value.slice(-24)}` : value
}

function parseParentGroupByPanelNumber(raw: string | null | undefined): Map<number, number> {
  if (!raw) return new Map()
  try {
    const parsed = JSON.parse(raw)
    const mapping = new Map<number, number>()
    if (!Array.isArray(parsed)) return mapping
    for (const item of parsed) {
      if (
        item
        && typeof item === 'object'
        && !Array.isArray(item)
        && typeof (item as { panel_number?: unknown }).panel_number === 'number'
        && typeof (item as { parent_group_number?: unknown }).parent_group_number === 'number'
      ) {
        mapping.set(
          (item as { panel_number: number }).panel_number,
          (item as { parent_group_number: number }).parent_group_number,
        )
      }
      if (Array.isArray(item) && typeof item[0] === 'number' && typeof item[1] === 'number') {
        mapping.set(item[0], item[1])
      }
    }
    return mapping
  } catch {
    return new Map()
  }
}

async function resolveSelectableCoarseGroupVideoUrl(raw: string | null, groupNumber: number, selectedVideoUrl: string) {
  const selectedKey = await resolveStorageKeyFromMediaValue(selectedVideoUrl)
  if (!selectedKey) return null

  const group = parseCoarseGroupsJson(raw).find((item) => item.groupNumber === groupNumber)
  if (!group) return null

  const storedUrls = [
    group.videoUrl,
    ...group.videoHistory.map((entry) => entry.videoUrl),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  const storedKeys = await Promise.all(storedUrls.map(async (url) => resolveStorageKeyFromMediaValue(url)))
  return storedKeys.includes(selectedKey) ? selectedKey : null
}

async function resolveRepresentativePanelId(storyboardId: string, storyboardTextJson: string | null, groupNumber: number) {
  const panels = await prisma.novelPromotionPanel.findMany({
    where: { storyboardId },
    orderBy: { panelIndex: 'asc' },
    select: { id: true, panelIndex: true, panelNumber: true },
  })
  const parentGroupMap = parseParentGroupByPanelNumber(storyboardTextJson)
  const representative = panels.find((panel) => {
    const panelNumber = panel.panelNumber ?? panel.panelIndex + 1
    return (parentGroupMap.get(panelNumber) || 1) === groupNumber
  })
  return representative?.id || null
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const storyboardId = typeof body?.storyboardId === 'string' ? body.storyboardId : ''
  const selectedVideoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl : ''
  const groupNumberRaw = typeof body?.groupNumber === 'number' ? body.groupNumber : Number(body?.groupNumber)
  const groupNumber = Number.isFinite(groupNumberRaw) ? Math.floor(groupNumberRaw) : null

  if (!storyboardId || !selectedVideoUrl || groupNumber === null || groupNumber <= 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  _ulogInfo('[VideoHistoryTrace][API group select] request', {
    projectId,
    storyboardId,
    groupNumber,
    selectedVideoUrl: summarizeVideoUrl(selectedVideoUrl),
  })

  const storyboard = await prisma.novelPromotionStoryboard.findUnique({
    where: { id: storyboardId },
    select: { id: true, storyboardTextJson: true, coarseGroupsJson: true },
  })
  if (!storyboard) throw new ApiError('NOT_FOUND')

  const beforeGroup = parseCoarseGroupsJson(storyboard.coarseGroupsJson).find((item) => item.groupNumber === groupNumber)
  _ulogInfo('[VideoHistoryTrace][API group select] loaded storyboard state', {
    projectId,
    storyboardId,
    groupNumber,
    currentVideoUrl: summarizeVideoUrl(beforeGroup?.videoUrl),
    historyCount: beforeGroup?.videoHistory.length ?? 0,
    historyUrls: beforeGroup?.videoHistory.map((entry) => summarizeVideoUrl(entry.videoUrl)) ?? [],
  })

  const selectedKey = await resolveSelectableCoarseGroupVideoUrl(
    storyboard.coarseGroupsJson,
    groupNumber,
    selectedVideoUrl,
  )
  if (!selectedKey) throw new ApiError('INVALID_PARAMS')

  _ulogInfo('[VideoHistoryTrace][API group select] resolved selected key', {
    projectId,
    storyboardId,
    groupNumber,
    selectedKey,
  })

  const coarseGroupsJson = selectCoarseGroupVideo({
    raw: storyboard.coarseGroupsJson,
    groupNumber,
    selectedVideoUrl: selectedKey,
  })
  if (!coarseGroupsJson) throw new ApiError('INVALID_PARAMS')

  const afterGroup = parseCoarseGroupsJson(coarseGroupsJson).find((item) => item.groupNumber === groupNumber)
  _ulogInfo('[VideoHistoryTrace][API group select] computed next state', {
    projectId,
    storyboardId,
    groupNumber,
    nextVideoUrl: summarizeVideoUrl(afterGroup?.videoUrl),
    nextVideoModel: afterGroup?.videoModel || null,
    nextGenerationMode: afterGroup?.videoGenerationMode || null,
  })

  const panelId = await resolveRepresentativePanelId(storyboardId, storyboard.storyboardTextJson, groupNumber)
  await prisma.$transaction(async (tx) => {
    await tx.novelPromotionStoryboard.update({
      where: { id: storyboardId },
      data: { coarseGroupsJson },
    })
    if (panelId) {
      await tx.novelPromotionPanel.update({
        where: { id: panelId },
        data: { videoUrl: selectedKey },
      })
    }
  })

  _ulogInfo('[VideoHistoryTrace][API group select] persisted', {
    projectId,
    storyboardId,
    groupNumber,
    representativePanelId: panelId,
    selectedKey,
    responseVideoUrl: summarizeVideoUrl(getSignedUrl(selectedKey, 7200)),
  })

  return NextResponse.json({
    success: true,
    videoUrl: getSignedUrl(selectedKey, 7200),
    cosKey: selectedKey,
  })
})

export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const storyboardId = typeof body?.storyboardId === 'string' ? body.storyboardId : ''
  const videoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl : ''
  const clearCurrent = body?.clearCurrent === true
  const groupNumberRaw = typeof body?.groupNumber === 'number' ? body.groupNumber : Number(body?.groupNumber)
  const groupNumber = Number.isFinite(groupNumberRaw) ? Math.floor(groupNumberRaw) : null

  if (!storyboardId || !videoUrl || groupNumber === null || groupNumber <= 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  const storyboard = await prisma.novelPromotionStoryboard.findUnique({
    where: { id: storyboardId },
    select: { id: true, storyboardTextJson: true, coarseGroupsJson: true },
  })
  if (!storyboard) throw new ApiError('NOT_FOUND')

  const videoKey = clearCurrent
    ? await resolveStorageKeyFromMediaValue(videoUrl)
    : await resolveSelectableCoarseGroupVideoUrl(
        storyboard.coarseGroupsJson,
        groupNumber,
        videoUrl,
      )
  if (!videoKey && !clearCurrent) throw new ApiError('INVALID_PARAMS')

  const coarseGroupsJson = clearCurrent
    ? (() => {
        const groups = parseCoarseGroupsJson(storyboard.coarseGroupsJson)
        const matched = groups.some((group) => group.groupNumber === groupNumber)
        if (!matched) return null
        const now = new Date().toISOString()
        const nextGroups = groups.map((group) => {
          if (group.groupNumber !== groupNumber) return group
          return {
            ...group,
            videoUrl: null,
            videoModel: null,
            videoGenerationMode: null,
            videoHistory: videoKey
              ? group.videoHistory.filter((entry) => entry.videoUrl !== videoKey)
              : group.videoHistory,
            updatedAt: now,
          }
        })
        nextGroups.sort((left, right) => left.groupNumber - right.groupNumber)
        return JSON.stringify(nextGroups, null, 2)
      })()
    : deleteCoarseGroupHistoryVideo({
        raw: storyboard.coarseGroupsJson,
        groupNumber,
        videoUrl: videoKey || '',
      })
  if (!coarseGroupsJson) throw new ApiError('INVALID_PARAMS')

  const nextGroup = parseCoarseGroupsJson(coarseGroupsJson).find((item) => item.groupNumber === groupNumber)
  const panelId = await resolveRepresentativePanelId(storyboardId, storyboard.storyboardTextJson, groupNumber)
  await prisma.$transaction(async (tx) => {
    await tx.novelPromotionStoryboard.update({
      where: { id: storyboardId },
      data: { coarseGroupsJson },
    })
    if (panelId) {
      await tx.novelPromotionPanel.update({
        where: { id: panelId },
        data: {
          videoUrl: nextGroup?.videoUrl || null,
          videoMediaId: null,
          videoGenerationMode: clearCurrent
            ? null
            : nextGroup?.videoGenerationMode === 'firstlastframe' ? 'firstlastframe' : 'normal',
          lipSyncTaskId: clearCurrent ? null : undefined,
          lipSyncVideoUrl: clearCurrent ? null : undefined,
          lipSyncVideoMediaId: clearCurrent ? null : undefined,
        },
      })
    }
  })

  return NextResponse.json({ success: true, deletedCurrent: clearCurrent, videoUrl: clearCurrent ? null : undefined })
})
