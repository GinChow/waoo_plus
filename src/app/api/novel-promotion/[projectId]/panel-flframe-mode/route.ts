import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

// POST - 更新两张图组合分镜的「首尾帧模式」开关
// enabled=true：首尾帧模式（首帧+尾帧）；false：多镜头模式（multi-shot）
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({}))
  const storyboardId = typeof body?.storyboardId === 'string' ? body.storyboardId : ''
  const panelIndex = body?.panelIndex
  const enabled = body?.enabled
  if (!storyboardId || panelIndex === undefined || typeof enabled !== 'boolean') {
    throw new ApiError('INVALID_PARAMS')
  }

  await prisma.novelPromotionPanel.update({
    where: {
      storyboardId_panelIndex: {
        storyboardId,
        panelIndex: Number(panelIndex),
      },
    },
    data: {
      firstLastFrameEnabled: enabled,
    },
  })

  return NextResponse.json({ success: true })
})
