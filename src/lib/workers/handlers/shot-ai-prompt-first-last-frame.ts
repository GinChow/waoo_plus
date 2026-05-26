import type { Job } from 'bullmq'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import type { TaskJobData } from '@/lib/task/types'
import { resolveAnalysisModel } from './shot-ai-persist'
import { runShotPromptCompletion } from './shot-ai-prompt-runtime'
import { parseJsonObject, readText, type AnyObj } from './shot-ai-prompt-utils'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'

/**
 * 首尾帧组合分镜：结合相邻两个分镜的视频提示词，
 * 让 LLM 生成一条从首帧画面运动/过渡到尾帧画面的视频运动提示词。
 */
export async function handleFirstLastFramePromptTask(job: Job<TaskJobData>, payload: AnyObj) {
  const firstVideoPrompt = readText(payload.firstVideoPrompt).trim()
  const lastVideoPrompt = readText(payload.lastVideoPrompt).trim()
  const userInput = readText(payload.userInput).trim()
  if (!firstVideoPrompt && !lastVideoPrompt && !userInput) {
    throw new Error('firstVideoPrompt, lastVideoPrompt or userInput is required')
  }
  const novelData = await resolveAnalysisModel(job.data.projectId, job.data.userId)

  const finalPrompt = buildPrompt({
    promptId: PROMPT_IDS.NP_FIRST_LAST_FRAME_PROMPT,
    locale: job.data.locale,
    variables: {
      first_video_prompt: firstVideoPrompt || '无',
      last_video_prompt: lastVideoPrompt || '无',
      user_input: userInput || '无',
    },
  })

  await reportTaskProgress(job, 22, {
    stage: 'ai_first_last_frame_prompt_prepare',
    stageLabel: '准备首尾帧提示词合成参数',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'ai_first_last_frame_prompt_prepare')

  const responseText = await runShotPromptCompletion({
    job,
    model: novelData.analysisModel,
    prompt: finalPrompt,
    action: 'ai_first_last_frame_prompt',
    streamContextKey: 'ai_first_last_frame_prompt',
    streamStepId: 'ai_first_last_frame_prompt',
    streamStepTitle: '首尾帧提示词合成',
  })
  await assertTaskActive(job, 'ai_first_last_frame_prompt_parse')

  const parsed = parseJsonObject(responseText)
  const videoPrompt = typeof parsed.video_prompt === 'string' ? parsed.video_prompt.trim() : ''
  if (!videoPrompt) {
    throw new Error('Invalid first-last frame prompt response')
  }

  await reportTaskProgress(job, 96, {
    stage: 'ai_first_last_frame_prompt_done',
    stageLabel: '首尾帧提示词合成完成',
    displayMode: 'detail',
  })

  return {
    success: true,
    firstLastFramePrompt: videoPrompt,
  }
}
