import { NextRequest } from 'next/server'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json().catch(() => ({}))
  const firstVideoPrompt = typeof body?.firstVideoPrompt === 'string' ? body.firstVideoPrompt.trim() : ''
  const lastVideoPrompt = typeof body?.lastVideoPrompt === 'string' ? body.lastVideoPrompt.trim() : ''
  const userInput = typeof body?.userInput === 'string' ? body.userInput.trim() : ''
  if (!firstVideoPrompt && !lastVideoPrompt && !userInput) {
    throw new ApiError('INVALID_PARAMS')
  }
  const panelId = typeof body?.panelId === 'string' ? body.panelId.trim() : ''
  const episodeId = typeof body?.episodeId === 'string' ? body.episodeId.trim() : ''

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId,
    episodeId: episodeId || null,
    type: TASK_TYPE.AI_FIRST_LAST_FRAME_PROMPT,
    targetType: panelId ? 'NovelPromotionPanel' : 'NovelPromotionProject',
    targetId: panelId || projectId,
    routePath: `/api/novel-promotion/${projectId}/ai-first-last-frame-prompt`,
    body,
    dedupeKey: panelId ? `ai_first_last_frame_prompt:${panelId}` : `ai_first_last_frame_prompt:${projectId}`,
  })
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
