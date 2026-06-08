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
    select: { id: true, videoUrl: true, videoHistory: true },
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
 * The current panel videoUrl entry cannot be deleted.
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

  if (!panelId || !requestedVideoUrl) {
    throw new ApiError('INVALID_PARAMS')
  }

  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
    select: { id: true, videoUrl: true, videoHistory: true },
  })
  if (!panel) throw new ApiError('NOT_FOUND')

  const targetKey = await resolveStorageKeyFromMediaValue(requestedVideoUrl)
  if (!targetKey) throw new ApiError('INVALID_PARAMS')

  if (targetKey === panel.videoUrl) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CANNOT_DELETE_CURRENT_VIDEO',
      message: '不能删除当前正在使用的视频',
    })
  }

  const history = parsePanelVideoHistory(panel.videoHistory)
  const matchEntry = await (async () => {
    for (const entry of history) {
      const key = await resolveStorageKeyFromMediaValue(entry.videoUrl)
      if (key === targetKey) return entry
    }
    return null
  })()
  if (!matchEntry) throw new ApiError('NOT_FOUND')

  const nextHistory = removePanelVideoHistoryEntry(history, matchEntry.videoUrl)

  await prisma.novelPromotionPanel.update({
    where: { id: panelId },
    data: {
      videoHistory: serializePanelVideoHistory(nextHistory),
    },
  })

  return NextResponse.json({ success: true })
})
