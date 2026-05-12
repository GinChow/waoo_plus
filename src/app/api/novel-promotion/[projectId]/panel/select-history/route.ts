import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { getSignedUrl } from '@/lib/storage'
import {
  parsePanelImageHistory,
  removePanelImageHistoryEntry,
  serializePanelImageHistory,
} from '@/lib/novel-promotion/panel-image-state'

/**
 * POST /api/novel-promotion/[projectId]/panel/select-history
 * Restore an image from panel history as the current panel image.
 * body: { panelId, imageUrl }
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
  const requestedImageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl.trim() : ''

  if (!panelId || !requestedImageUrl) {
    throw new ApiError('INVALID_PARAMS')
  }

  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
    select: { id: true, imageUrl: true, previousImageUrl: true, imageHistory: true },
  })
  if (!panel) throw new ApiError('NOT_FOUND')

  const history = parsePanelImageHistory(panel.imageHistory)
  const targetKey = await resolveStorageKeyFromMediaValue(requestedImageUrl)
  if (!targetKey) throw new ApiError('INVALID_PARAMS')

  const historyKeys = await Promise.all(
    history.map(async (entry) => ({
      key: await resolveStorageKeyFromMediaValue(entry.url),
      entry,
    })),
  )
  const match = historyKeys.find((item) => item.key === targetKey)
  if (!match || !match.key) throw new ApiError('INVALID_PARAMS')

  if (match.key === panel.imageUrl) {
    return NextResponse.json({
      success: true,
      imageUrl: getSignedUrl(match.key, 7 * 24 * 3600),
      cosKey: match.key,
      noop: true,
    })
  }

  await prisma.novelPromotionPanel.update({
    where: { id: panelId },
    data: {
      previousImageUrl: panel.imageUrl || panel.previousImageUrl || null,
      imageUrl: match.key,
      candidateImages: null,
    },
  })

  return NextResponse.json({
    success: true,
    imageUrl: getSignedUrl(match.key, 7 * 24 * 3600),
    cosKey: match.key,
  })
})

/**
 * DELETE /api/novel-promotion/[projectId]/panel/select-history
 * Remove an image entry from panel history.
 * body: { panelId, imageUrl }
 * The current panel imageUrl entry cannot be deleted.
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
  const requestedImageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl.trim() : ''

  if (!panelId || !requestedImageUrl) {
    throw new ApiError('INVALID_PARAMS')
  }

  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
    select: { id: true, imageUrl: true, imageHistory: true },
  })
  if (!panel) throw new ApiError('NOT_FOUND')

  const targetKey = await resolveStorageKeyFromMediaValue(requestedImageUrl)
  if (!targetKey) throw new ApiError('INVALID_PARAMS')

  if (targetKey === panel.imageUrl) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CANNOT_DELETE_CURRENT_IMAGE',
      message: '不能删除当前正在使用的图片',
    })
  }

  const history = parsePanelImageHistory(panel.imageHistory)
  const matchEntry = await (async () => {
    for (const entry of history) {
      const key = await resolveStorageKeyFromMediaValue(entry.url)
      if (key === targetKey) return entry
    }
    return null
  })()
  if (!matchEntry) throw new ApiError('NOT_FOUND')

  const nextHistory = removePanelImageHistoryEntry(history, matchEntry.url)

  await prisma.novelPromotionPanel.update({
    where: { id: panelId },
    data: {
      imageHistory: serializePanelImageHistory(nextHistory),
    },
  })

  return NextResponse.json({ success: true })
})
