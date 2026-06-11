import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateUniqueKey, getSignedUrl, uploadObject } from '@/lib/storage'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import {
  appendPanelVideoHistoryEntry,
  parsePanelVideoHistory,
  serializePanelVideoHistory,
} from '@/lib/novel-promotion/panel-video-state'

const VIDEO_EXTENSION_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
}

function toPanelVideoHistoryUrl(value: string): string {
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/api/')) {
    return value
  }
  return getSignedUrl(value, 7200)
}

function readVideoExtension(file: File): string | null {
  if (file.type && VIDEO_EXTENSION_BY_MIME[file.type]) {
    return VIDEO_EXTENSION_BY_MIME[file.type]
  }
  const match = file.name.match(/\.([a-z0-9]+)$/i)
  const ext = match?.[1]?.toLowerCase()
  if (!ext) return null
  return ['mp4', 'mov', 'webm', 'm4v'].includes(ext) ? ext : null
}

/**
 * POST /api/novel-promotion/[projectId]/panel/upload-video
 * 上传本地视频并设置为单分镜当前视频，同时写入分镜视频历史。
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const panelId = formData.get('panelId') as string | null

  if (!file || !panelId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const ext = readVideoExtension(file)
  if (!ext) {
    throw new ApiError('INVALID_PARAMS')
  }

  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
    select: {
      id: true,
      videoHistory: true,
      videoPrompt: true,
      imageUrl: true,
    },
  })

  if (!panel) {
    throw new ApiError('NOT_FOUND')
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const contentType = file.type || `video/${ext === 'mov' ? 'quicktime' : ext}`
  const key = generateUniqueKey(`panel-video-upload-${panelId}`, ext)
  await uploadObject(buffer, key, 1, contentType)

  const nextVideoHistory = appendPanelVideoHistoryEntry(
    parsePanelVideoHistory(panel.videoHistory),
    {
      videoUrl: key,
      generatedAt: new Date().toISOString(),
      source: 'upload',
      videoPrompt: panel.videoPrompt || undefined,
      generationMode: 'upload',
      sourceImageUrls: panel.imageUrl ? [panel.imageUrl] : undefined,
    },
  )

  await prisma.novelPromotionPanel.update({
    where: { id: panelId },
    data: {
      videoUrl: key,
      videoGenerationMode: 'normal',
      videoHistory: serializePanelVideoHistory(nextVideoHistory),
      lipSyncVideoUrl: null,
      lipSyncTaskId: null,
    },
  })

  return NextResponse.json({
    success: true,
    videoUrl: getSignedUrl(key, 7200),
    cosKey: key,
    videoHistory: nextVideoHistory.map((entry) => ({
      ...entry,
      videoUrl: toPanelVideoHistoryUrl(entry.videoUrl),
    })),
  })
})
