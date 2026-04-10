import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadObject, generateUniqueKey } from '@/lib/storage'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/novel-promotion/[projectId]/panel/update-image
 * Upload a local image as the panel's image
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const formData = await request.formData()
  const file = formData.get('file') as File
  const panelId = formData.get('panelId') as string

  if (!file || !panelId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
    select: { id: true, imageUrl: true, previousImageUrl: true },
  })

  if (!panel) {
    throw new ApiError('NOT_FOUND')
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const key = generateUniqueKey(`panel-upload-${panelId}`, 'jpg')
  await uploadObject(buffer, key)

  await prisma.novelPromotionPanel.update({
    where: { id: panelId },
    data: {
      previousImageUrl: panel.imageUrl || panel.previousImageUrl || null,
      imageUrl: key,
      candidateImages: null,
    },
  })

  return NextResponse.json({ success: true, imageUrl: key })
})

/**
 * DELETE /api/novel-promotion/[projectId]/panel/update-image
 * Clear the panel's image (set imageUrl to null)
 */
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const panelId = searchParams.get('panelId')

  if (!panelId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
    select: { id: true, imageUrl: true },
  })

  if (!panel) {
    throw new ApiError('NOT_FOUND')
  }

  await prisma.novelPromotionPanel.update({
    where: { id: panelId },
    data: {
      previousImageUrl: panel.imageUrl || null,
      imageUrl: null,
      candidateImages: null,
    },
  })

  return NextResponse.json({ success: true })
})
