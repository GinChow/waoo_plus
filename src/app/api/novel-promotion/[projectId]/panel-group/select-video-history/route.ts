import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { getSignedUrl } from '@/lib/storage'
import {
  selectPanelGroupVideo,
  deletePanelGroupHistoryVideo,
} from '@/lib/novel-promotion/panel-group-state'

function signVideoUrl(value: string | null): string | null {
  if (!value) return null
  return value.startsWith('http') ? value : getSignedUrl(value, 7200) || value
}

async function assertGroupBelongsToProject(projectId: string, panelGroupId: string) {
  const group = await prisma.novelPromotionPanelGroup.findUnique({
    where: { id: panelGroupId },
    select: { storyboard: { select: { episode: { select: { novelPromotionProject: { select: { projectId: true } } } } } } },
  })
  return group?.storyboard?.episode?.novelPromotionProject?.projectId === projectId
}

/**
 * POST /api/novel-promotion/[projectId]/panel-group/select-video-history
 * 从组合视频历史中切换当前视频。body: { panelGroupId, videoUrl }
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const panelGroupId = typeof body?.panelGroupId === 'string' ? body.panelGroupId : ''
  const videoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl : ''
  if (!panelGroupId || !videoUrl) throw new ApiError('INVALID_PARAMS')
  if (!(await assertGroupBelongsToProject(projectId, panelGroupId))) throw new ApiError('NOT_FOUND')

  const result = await selectPanelGroupVideo({ panelGroupId, videoUrl })
  if (!result) throw new ApiError('NOT_FOUND')
  return NextResponse.json({ success: true, videoUrl: signVideoUrl(result.videoUrl) })
})

/**
 * DELETE /api/novel-promotion/[projectId]/panel-group/select-video-history
 * 删除组合视频历史项。query: panelGroupId, videoUrl, clearCurrent?
 */
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const panelGroupId = searchParams.get('panelGroupId') || ''
  const videoUrl = searchParams.get('videoUrl') || ''
  const clearCurrent = searchParams.get('clearCurrent') === 'true'
  if (!panelGroupId || !videoUrl) throw new ApiError('INVALID_PARAMS')
  if (!(await assertGroupBelongsToProject(projectId, panelGroupId))) throw new ApiError('NOT_FOUND')

  const result = await deletePanelGroupHistoryVideo({ panelGroupId, videoUrl, clearCurrent })
  if (!result) throw new ApiError('NOT_FOUND')
  return NextResponse.json({ success: true, videoUrl: signVideoUrl(result.videoUrl) })
})
