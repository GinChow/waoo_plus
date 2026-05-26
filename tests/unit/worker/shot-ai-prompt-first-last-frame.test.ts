import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const persistMock = vi.hoisted(() => ({
  resolveAnalysisModel: vi.fn(),
}))

const runtimeMock = vi.hoisted(() => ({
  runShotPromptCompletion: vi.fn(),
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

vi.mock('@/lib/workers/handlers/shot-ai-persist', () => persistMock)
vi.mock('@/lib/workers/handlers/shot-ai-prompt-runtime', () => ({
  runShotPromptCompletion: runtimeMock.runShotPromptCompletion,
}))
vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: runtimeMock.reportTaskProgress,
}))
vi.mock('@/lib/workers/utils', () => ({
  assertTaskActive: runtimeMock.assertTaskActive,
}))
const buildPromptMock = vi.hoisted(() => vi.fn(() => 'fl-final-prompt'))
vi.mock('@/lib/prompt-i18n', () => ({
  PROMPT_IDS: { NP_FIRST_LAST_FRAME_PROMPT: 'np_first_last_frame_prompt' },
  buildPrompt: buildPromptMock,
}))

import { handleFirstLastFramePromptTask } from '@/lib/workers/handlers/shot-ai-prompt-first-last-frame'

function buildJob(payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-fl-prompt-1',
      type: TASK_TYPE.AI_FIRST_LAST_FRAME_PROMPT,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'NovelPromotionPanel',
      targetId: 'panel-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker shot-ai-prompt-first-last-frame behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    persistMock.resolveAnalysisModel.mockResolvedValue({ id: 'np-1', analysisModel: 'llm::analysis' })
    runtimeMock.runShotPromptCompletion.mockResolvedValue('{"video_prompt":"fused first-last frame motion"}')
  })

  it('missing all inputs -> explicit error', async () => {
    const payload = {}
    const job = buildJob(payload)

    await expect(handleFirstLastFramePromptTask(job, payload)).rejects.toThrow(
      'firstVideoPrompt, lastVideoPrompt or userInput is required',
    )
  })

  it('success -> returns fused first-last frame prompt', async () => {
    const payload = {
      firstVideoPrompt: 'first shot motion',
      lastVideoPrompt: 'second shot motion',
    }
    const job = buildJob(payload)

    const result = await handleFirstLastFramePromptTask(job, payload)

    expect(runtimeMock.runShotPromptCompletion).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ai_first_last_frame_prompt',
      prompt: 'fl-final-prompt',
    }))
    expect(buildPromptMock).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({
        first_video_prompt: 'first shot motion',
        last_video_prompt: 'second shot motion',
        user_input: '无',
      }),
    }))
    expect(result).toEqual({
      success: true,
      firstLastFramePrompt: 'fused first-last frame motion',
    })
  })

  it('user instruction provided -> forwarded as user_input', async () => {
    const payload = {
      firstVideoPrompt: 'first shot motion',
      lastVideoPrompt: 'second shot motion',
      userInput: 'zoom in slowly',
    }
    const job = buildJob(payload)

    await handleFirstLastFramePromptTask(job, payload)

    expect(buildPromptMock).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({ user_input: 'zoom in slowly' }),
    }))
  })

  it('only user instruction (no video prompts) -> still succeeds', async () => {
    const payload = { userInput: 'make it a slow dolly shot' }
    const job = buildJob(payload)

    const result = await handleFirstLastFramePromptTask(job, payload)

    expect(result).toEqual({
      success: true,
      firstLastFramePrompt: 'fused first-last frame motion',
    })
  })

  it('invalid response without video_prompt -> explicit error', async () => {
    runtimeMock.runShotPromptCompletion.mockResolvedValue('{"foo":"bar"}')
    const payload = { firstVideoPrompt: 'first shot motion' }
    const job = buildJob(payload)

    await expect(handleFirstLastFramePromptTask(job, payload)).rejects.toThrow(
      'Invalid first-last frame prompt response',
    )
  })
})
