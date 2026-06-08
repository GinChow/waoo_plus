import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { getSignedUrl } from '@/lib/storage'
import {
  parsePanelVideoHistory,
  removePanelVideoHistoryEntry,
  serializePanelVideoHistory,
} from '@/lib/novel-promotion/panel-video-state'
import { logInfo as _ulogInfo } from '@/lib/logging/core'

function summarizeVideoUrl(value: string | null | undefined): string {
  if (!value) return ''
  return value.length > 96 ? `${value.slice(0, 48)}...${value.slice(-24)}` : value
}

async function clearMatchingCoarseGroupVideos(params: {
  storyboardId: string
  requestedVideoUrl: string
  targetKey: string | null
  currentVideoKey: string | null
}) {
  const storyboard = await prisma.novelPromotionStoryboard.findUnique({
    where: { id: params.storyboardId },
    select: { id: true, coarseGroupsJson: true },
  })
  if (!storyboard?.coarseGroupsJson) return

  let groups: unknown
  try {
    groups = JSON.parse(storyboard.coarseGroupsJson)
  } catch {
    return
  }
  if (!Array.isArray(groups)) return

  let changed = false
  const now = new Date().toISOString()
  const nextGroups = await Promise.all(groups.map(async (group) => {
    if (!group || typeof group !== 'object' || Array.isArray(group)) return group
    const record = group as Record<string, unknown>
    const groupVideoUrl = typeof record.videoUrl === 'string' ? record.videoUrl : ''
    if (!groupVideoUrl) return group

    const groupVideoKey = await resolveStorageKeyFromMediaValue(groupVideoUrl)
    const matches = groupVideoUrl === params.requestedVideoUrl
      || (!!params.targetKey && groupVideoKey === params.targetKey)
      || (!!params.currentVideoKey && groupVideoKey === params.currentVideoKey)
    if (!matches) return group

    changed = true
    return {
      ...record,
      videoUrl: null,
      videoModel: null,
      videoGenerationMode: null,
      updatedAt: now,
    }
  }))

  if (!changed) return
  await prisma.novelPromotionStoryboard.update({
    where: { id: params.storyboardId },
    data: { coarseGroupsJson: JSON.stringify(nextGroups, null, 2) },
  })
}

/**
 * POST /api/novel-promotion/[projectId]/panel/select-video-history
 * Restore a video from panel history as the current panel video.
 * body: { panelId, videoUrl }
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const panelId = typeof body?.panelId === 'string' ? body.panelId.trim() : ''
  const requestedVideoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl.trim() : ''

  if (!panelId || !requestedVideoUrl) {
    throw new ApiError('INVALID_PARAMS')
  }

  _ulogInfo('[VideoHistoryTrace][API panel select] request', {
    projectId,
    panelId,
    requestedVideoUrl: summarizeVideoUrl(requestedVideoUrl),
  })

  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
    select: { id: true, storyboardId: true, videoUrl: true, videoHistory: true },
  })
  if (!panel) throw new ApiError('NOT_FOUND')

  const history = parsePanelVideoHistory(panel.videoHistory)
  _ulogInfo('[VideoHistoryTrace][API panel select] loaded panel state', {
    projectId,
    panelId,
    currentVideoUrl: summarizeVideoUrl(panel.videoUrl),
    historyCount: history.length,
    historyUrls: history.map((entry) => summarizeVideoUrl(entry.videoUrl)),
  })
  const targetKey = await resolveStorageKeyFromMediaValue(requestedVideoUrl)
  if (!targetKey) throw new ApiError('INVALID_PARAMS')

  const historyKeys = await Promise.all(
    history.map(async (entry) => ({
      key: await resolveStorageKeyFromMediaValue(entry.videoUrl),
      entry,
    })),
  )
  const match = historyKeys.find((item) => item.key === targetKey)
  if (!match || !match.key) throw new ApiError('INVALID_PARAMS')

  _ulogInfo('[VideoHistoryTrace][API panel select] resolved selected key', {
    projectId,
    panelId,
    targetKey,
    currentVideoUrl: summarizeVideoUrl(panel.videoUrl),
    matchedGenerationMode: match.entry.generationMode || null,
  })

  if (match.key === panel.videoUrl) {
    _ulogInfo('[VideoHistoryTrace][API panel select] noop current video already selected', {
      projectId,
      panelId,
      targetKey,
    })
    return NextResponse.json({
      success: true,
      videoUrl: getSignedUrl(match.key, 7 * 24 * 3600),
      cosKey: match.key,
      noop: true,
    })
  }

  await prisma.novelPromotionPanel.update({
    where: { id: panelId },
    data: {
      videoUrl: match.key,
      videoGenerationMode: match.entry.generationMode || undefined,
    },
  })

  _ulogInfo('[VideoHistoryTrace][API panel select] persisted', {
    projectId,
    panelId,
    previousVideoUrl: summarizeVideoUrl(panel.videoUrl),
    nextVideoUrl: targetKey,
    responseVideoUrl: summarizeVideoUrl(getSignedUrl(match.key, 7 * 24 * 3600)),
  })

  return NextResponse.json({
    success: true,
    videoUrl: getSignedUrl(match.key, 7 * 24 * 3600),
    cosKey: match.key,
  })
})

/**
 * DELETE /api/novel-promotion/[projectId]/panel/select-video-history
 * Remove a video entry from panel history.
 * body: { panelId, videoUrl }
 * When the deleted entry is the current video, also clear the panel video output.
 */
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const panelId = typeof body?.panelId === 'string' ? body.panelId.trim() : ''
  const requestedVideoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl.trim() : ''
  const clearCurrent = body?.clearCurrent === true

  if (!panelId || !requestedVideoUrl) {
    throw new ApiError('INVALID_PARAMS')
  }

  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
    select: { id: true, storyboardId: true, videoUrl: true, videoHistory: true },
  })
  if (!panel) throw new ApiError('NOT_FOUND')

  const targetKey = await resolveStorageKeyFromMediaValue(requestedVideoUrl)
  if (!targetKey && !clearCurrent) throw new ApiError('INVALID_PARAMS')

  const history = parsePanelVideoHistory(panel.videoHistory)
  const currentVideoKey = await resolveStorageKeyFromMediaValue(panel.videoUrl)
  const deletedCurrent = clearCurrent || targetKey === currentVideoKey || requestedVideoUrl === panel.videoUrl
  const matchEntry = await (async () => {
    if (!targetKey) return null
    for (const entry of history) {
      const key = await resolveStorageKeyFromMediaValue(entry.videoUrl)
      if (key === targetKey) return entry
    }
    return null
  })()
  if (!matchEntry && !deletedCurrent) throw new ApiError('NOT_FOUND')

  const nextHistory = matchEntry
    ? removePanelVideoHistoryEntry(history, matchEntry.videoUrl)
    : history

  await prisma.novelPromotionPanel.update({
    where: { id: panelId },
    data: {
      videoHistory: serializePanelVideoHistory(nextHistory),
      ...(deletedCurrent
        ? {
            videoUrl: null,
            videoMediaId: null,
            videoGenerationMode: null,
            lipSyncTaskId: null,
            lipSyncVideoUrl: null,
            lipSyncVideoMediaId: null,
          }
        : {}),
    },
  })

  if (deletedCurrent && panel.storyboardId) {
    const matchingVideoValues = Array.from(new Set([
      panel.videoUrl,
      requestedVideoUrl,
      targetKey,
      currentVideoKey,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0)))

    if (matchingVideoValues.length > 0) {
      await prisma.novelPromotionPanel.updateMany({
        where: {
          storyboardId: panel.storyboardId,
          id: { not: panelId },
          videoUrl: { in: matchingVideoValues },
        },
        data: {
          videoUrl: null,
          videoMediaId: null,
          videoGenerationMode: null,
          lipSyncTaskId: null,
          lipSyncVideoUrl: null,
          lipSyncVideoMediaId: null,
        },
      })
    }

    await clearMatchingCoarseGroupVideos({
      storyboardId: panel.storyboardId,
      requestedVideoUrl,
      targetKey,
      currentVideoKey,
    })
  }

  return NextResponse.json({ success: true, deletedCurrent, videoUrl: deletedCurrent ? null : undefined })
})
