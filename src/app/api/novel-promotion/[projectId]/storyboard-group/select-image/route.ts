import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import {
  deleteCoarseGroupHistoryImage,
  parseCoarseGroupsJson,
  selectCoarseGroupImage,
} from '@/lib/novel-promotion/coarse-group-image-state'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { getSignedUrl } from '@/lib/storage'

async function resolveSelectableCoarseGroupImageUrl(raw: string | null, groupNumber: number, selectedImageUrl: string) {
  const selectedKey = await resolveStorageKeyFromMediaValue(selectedImageUrl)
  if (!selectedKey) return null

  const group = parseCoarseGroupsJson(raw).find((item) => item.groupNumber === groupNumber)
  if (!group) return null

  const storedUrls = [
    group.imageUrl,
    ...(group.candidateImages || []),
    ...group.imageHistory.map((entry) => entry.imageUrl),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  const storedKeys = await Promise.all(storedUrls.map(async (url) => resolveStorageKeyFromMediaValue(url)))
  return storedKeys.includes(selectedKey) ? selectedKey : null
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
  const selectedImageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl : ''
  const groupNumberRaw = typeof body?.groupNumber === 'number' ? body.groupNumber : Number(body?.groupNumber)
  const groupNumber = Number.isFinite(groupNumberRaw) ? Math.floor(groupNumberRaw) : null

  if (!storyboardId || !selectedImageUrl || groupNumber === null || groupNumber <= 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  const storyboard = await prisma.novelPromotionStoryboard.findUnique({
    where: { id: storyboardId },
    select: { id: true, coarseGroupsJson: true },
  })
  if (!storyboard) throw new ApiError('NOT_FOUND')

  const selectedKey = await resolveSelectableCoarseGroupImageUrl(
    storyboard.coarseGroupsJson,
    groupNumber,
    selectedImageUrl,
  )
  if (!selectedKey) throw new ApiError('INVALID_PARAMS')

  const coarseGroupsJson = selectCoarseGroupImage({
    raw: storyboard.coarseGroupsJson,
    groupNumber,
    selectedImageUrl: selectedKey,
  })
  if (!coarseGroupsJson) throw new ApiError('INVALID_PARAMS')

  await prisma.novelPromotionStoryboard.update({
    where: { id: storyboardId },
    data: { coarseGroupsJson },
  })

  return NextResponse.json({
    success: true,
    imageUrl: getSignedUrl(selectedKey, 7 * 24 * 3600),
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
  const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl : ''
  const groupNumberRaw = typeof body?.groupNumber === 'number' ? body.groupNumber : Number(body?.groupNumber)
  const groupNumber = Number.isFinite(groupNumberRaw) ? Math.floor(groupNumberRaw) : null

  if (!storyboardId || !imageUrl || groupNumber === null || groupNumber <= 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  const storyboard = await prisma.novelPromotionStoryboard.findUnique({
    where: { id: storyboardId },
    select: { id: true, coarseGroupsJson: true },
  })
  if (!storyboard) throw new ApiError('NOT_FOUND')

  const imageKey = await resolveSelectableCoarseGroupImageUrl(
    storyboard.coarseGroupsJson,
    groupNumber,
    imageUrl,
  )
  if (!imageKey) throw new ApiError('INVALID_PARAMS')

  const coarseGroupsJson = deleteCoarseGroupHistoryImage({
    raw: storyboard.coarseGroupsJson,
    groupNumber,
    imageUrl: imageKey,
  })
  if (!coarseGroupsJson) throw new ApiError('INVALID_PARAMS')

  await prisma.novelPromotionStoryboard.update({
    where: { id: storyboardId },
    data: { coarseGroupsJson },
  })

  return NextResponse.json({ success: true })
})
