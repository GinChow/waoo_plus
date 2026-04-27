import { Worker, type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { queueRedis } from '@/lib/redis'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { withInternalLLMStreamCallbacks, type InternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import type { LLMStreamKind } from '@/lib/llm-observe/types'
import { QUEUE_NAME } from '@/lib/task/queues'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { buildPrompt, getPromptTemplate, PROMPT_IDS } from '@/lib/prompt-i18n'
import { resolveInsertPanelUserInput } from '@/lib/novel-promotion/insert-panel'
import { buildInsertPanelLocationsDescription } from '@/lib/novel-promotion/insert-panel-prompt-context'
import {
  runScriptToStoryboardOrchestrator,
  type ScriptToStoryboardStepMeta,
  type StoryboardRegenerateStartPhase,
} from '@/lib/novel-promotion/script-to-storyboard/orchestrator'
import { persistStoryboardsAndPanels } from '@/lib/workers/handlers/script-to-storyboard-helpers'
import type { StoryboardPanel } from '@/lib/storyboard-phases'
import {
  getProjectModelConfig,
  getUserWorkflowConcurrencyConfig,
} from '@/lib/config-service'
import { reportTaskProgress, reportTaskStreamChunk, withTaskLifecycle } from './shared'
import { assertTaskActive } from './utils'
import { handleStoryToScriptTask } from './handlers/story-to-script'
import { handleScriptToStoryboardTask } from './handlers/script-to-storyboard'
import { handleVoiceAnalyzeTask } from './handlers/voice-analyze'
import { handleAssetHubAIDesignTask } from './handlers/asset-hub-ai-design'
import { handleAiStoryExpandTask } from './handlers/ai-story-expand'
import { handleClipsBuildTask } from './handlers/clips-build'
import { handleAnalyzeNovelTask } from './handlers/analyze-novel'
import { handleScreenplayConvertTask } from './handlers/screenplay-convert'
import { handleEpisodeSplitTask } from './handlers/episode-split'
import { handleAnalyzeGlobalTask } from './handlers/analyze-global'
import { handleAssetHubAIModifyTask } from './handlers/asset-hub-ai-modify'
import { handleReferenceToCharacterTask } from './handlers/reference-to-character'
import { handleShotAITask } from './handlers/shot-ai-tasks'
import { handleCharacterProfileTask } from './handlers/character-profile'

function readAssetKind(value: Record<string, unknown>): string {
  return typeof value.assetKind === 'string' ? value.assetKind : 'location'
}

function readNullableText(value: Record<string, unknown>, key: string): string | null {
  const field = value[key]
  return typeof field === 'string' ? field : null
}

type AnyObj = Record<string, unknown>
type JsonRecord = Record<string, unknown>

type WorkerLLMStreamContext = {
  streamRunId: string
  nextSeqByStepLane: Record<string, number>
}

type WorkerInternalLLMStreamCallbacks = InternalLLMStreamCallbacks & {
  flush: () => Promise<void>
}

function createWorkerLLMStreamContext(job: Job<TaskJobData>, label = 'worker'): WorkerLLMStreamContext {
  return {
    streamRunId: `run:${job.data.taskId}:${label}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    nextSeqByStepLane: {},
  }
}

function nextWorkerStreamSeq(streamContext: WorkerLLMStreamContext, stepId: string | null, lane: string) {
  const key = `${stepId || '__default'}|${lane || 'main'}`
  const current = streamContext.nextSeqByStepLane[key] || 1
  streamContext.nextSeqByStepLane[key] = current + 1
  return current
}

function createWorkerLLMStreamCallbacks(
  job: Job<TaskJobData>,
  streamContext: WorkerLLMStreamContext,
): WorkerInternalLLMStreamCallbacks {
  const maxChunkChars = 128
  let publishQueue: Promise<void> = Promise.resolve()

  const enqueue = (work: () => Promise<void>) => {
    publishQueue = publishQueue
      .catch(() => undefined)
      .then(work)
  }

  return {
    onStage: ({ stage, provider, step }) => {
      const stageLabel =
        stage === 'submit'
          ? 'progress.runtime.stage.llmSubmit'
          : stage === 'streaming'
            ? 'progress.runtime.stage.llmStreaming'
            : stage === 'fallback'
              ? 'progress.runtime.stage.llmFallbackNonStream'
              : 'progress.runtime.stage.llmCompleted'
      const stageKey = `worker_llm_${stage}`
      const stepId = typeof step?.id === 'string' && step.id.trim() ? step.id.trim() : null
      const stepTitle = typeof step?.title === 'string' && step.title.trim() ? step.title.trim() : null
      const stepIndex =
        typeof step?.index === 'number' && Number.isFinite(step.index) ? Math.max(1, Math.floor(step.index)) : null
      const stepTotal =
        typeof step?.total === 'number' && Number.isFinite(step.total)
          ? Math.max(stepIndex || 1, Math.floor(step.total))
          : null
      enqueue(async () => {
        await reportTaskProgress(job, 65, {
          stage: stageKey,
          stageLabel,
          displayMode: 'detail',
          message: stageLabel,
          streamRunId: streamContext.streamRunId,
          ...(stepId ? { stepId } : {}),
          ...(stepTitle ? { stepTitle } : {}),
          ...(stepIndex ? { stepIndex } : {}),
          ...(stepTotal ? { stepTotal } : {}),
          meta: {
            provider: provider || null,
          },
        })
      })
    },
    onChunk: ({ kind, delta, lane, step }) => {
      if (!delta) return
      const stepId = typeof step?.id === 'string' && step.id.trim() ? step.id.trim() : null
      const stepTitle = typeof step?.title === 'string' && step.title.trim() ? step.title.trim() : null
      const stepIndex =
        typeof step?.index === 'number' && Number.isFinite(step.index) ? Math.max(1, Math.floor(step.index)) : null
      const stepTotal =
        typeof step?.total === 'number' && Number.isFinite(step.total)
          ? Math.max(stepIndex || 1, Math.floor(step.total))
          : null
      const laneKey = lane || (kind === 'reasoning' ? 'reasoning' : 'main')
      for (let i = 0; i < delta.length; i += maxChunkChars) {
        const piece = delta.slice(i, i + maxChunkChars)
        if (!piece) continue
        enqueue(async () => {
          await reportTaskStreamChunk(
            job,
            {
              kind: kind as LLMStreamKind,
              delta: piece,
              seq: nextWorkerStreamSeq(streamContext, stepId, laneKey),
              lane: laneKey,
            },
            {
              stage: 'worker_llm_stream',
              stageLabel: 'progress.runtime.stage.llmStreaming',
              displayMode: 'detail',
              done: false,
              message: kind === 'reasoning' ? 'progress.runtime.llm.reasoning' : 'progress.runtime.llm.output',
              streamRunId: streamContext.streamRunId,
              ...(stepId ? { stepId } : {}),
              ...(stepTitle ? { stepTitle } : {}),
              ...(stepIndex ? { stepIndex } : {}),
              ...(stepTotal ? { stepTotal } : {}),
            },
          )
        })
      }
    },
    onComplete: () => {
      enqueue(async () => {
        await reportTaskProgress(job, 90, {
          stage: 'worker_llm_complete',
          stageLabel: 'progress.runtime.stage.llmCompleted',
          displayMode: 'detail',
          message: 'progress.runtime.llm.completed',
          streamRunId: streamContext.streamRunId,
        })
      })
    },
    onError: (error) => {
      enqueue(async () => {
        await reportTaskProgress(job, 90, {
          stage: 'worker_llm_error',
          stageLabel: 'progress.runtime.stage.llmFailed',
          displayMode: 'detail',
          message: error instanceof Error ? error.message : String(error),
          streamRunId: streamContext.streamRunId,
        })
      })
    },
    async flush() {
      await publishQueue.catch(() => undefined)
    },
  }
}

function asJsonRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null ? (value as JsonRecord) : null
}

function parseJsonObjectResponse(responseText: string): JsonRecord {
  let jsonText = responseText.trim()
  jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')

  const firstBrace = jsonText.indexOf('{')
  const lastBrace = jsonText.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('JSON format invalid')
  }

  const parsed = JSON.parse(jsonText.substring(firstBrace, lastBrace + 1))
  const record = asJsonRecord(parsed)
  if (!record) {
    throw new Error('JSON payload must be an object')
  }
  return record
}

function parsePanelCharacters(panel: { characters: string | null } | null | undefined): string[] {
  if (!panel?.characters) return []
  try {
    const raw = JSON.parse(panel.characters)
    if (!Array.isArray(raw)) return []
    return raw
      .map((item) =>
        typeof item === 'string'
          ? item
          : typeof item === 'object' && item !== null && typeof (item as JsonRecord).name === 'string'
            ? ((item as JsonRecord).name as string)
            : '',
      )
      .filter(Boolean)
  } catch {
    return []
  }
}

function parsePanelProps(panel: Record<string, unknown> | null | undefined): string[] {
  const rawValue = panel?.props
  if (typeof rawValue !== 'string' || !rawValue) return []
  try {
    const raw = JSON.parse(rawValue)
    if (!Array.isArray(raw)) return []
    return raw.map((item) => (typeof item === 'string' ? item : '')).filter(Boolean)
  } catch {
    return []
  }
}

function parseOptionalJson(value: string | null | undefined): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function parseParentGroupByPanelNumber(value: string | null | undefined): Map<number, number> {
  const output = new Map<number, number>()
  const parsed = parseOptionalJson(value)
  if (!Array.isArray(parsed)) return output
  for (const item of parsed) {
    if (!Array.isArray(item) || item.length < 2) continue
    const panelNumber = typeof item[0] === 'number' ? item[0] : null
    const parentGroupNumber = typeof item[1] === 'number' ? item[1] : null
    if (panelNumber !== null && parentGroupNumber !== null) {
      output.set(panelNumber, parentGroupNumber)
    }
  }
  return output
}

function normalizeRegenerateStartPhase(value: unknown): StoryboardRegenerateStartPhase {
  if (value === 'phase2' || value === 'phase3' || value === 'phase4') return value
  return 'phase1'
}

function buildSeedPanelsFromStoryboard(storyboard: {
  storyboardTextJson?: string | null
  panels?: Array<Record<string, unknown>>
}): StoryboardPanel[] {
  const parentGroupByPanelNumber = parseParentGroupByPanelNumber(storyboard.storyboardTextJson)
  const panels = Array.isArray(storyboard.panels) ? storyboard.panels : []
  return panels.map((panel, index) => {
    const panelNumber = typeof panel.panelNumber === 'number' ? panel.panelNumber : index + 1
    const photographyPlan = parseOptionalJson(typeof panel.photographyRules === 'string' ? panel.photographyRules : null)
    const actingNotes = parseOptionalJson(typeof panel.actingNotes === 'string' ? panel.actingNotes : null)
    const characters = parseOptionalJson(typeof panel.characters === 'string' ? panel.characters : null)
    const props = parseOptionalJson(typeof panel.props === 'string' ? panel.props : null)
    return {
      panel_number: panelNumber,
      parent_group_number: parentGroupByPanelNumber.get(panelNumber) || 1,
      shot_type: typeof panel.shotType === 'string' ? panel.shotType : undefined,
      camera_move: typeof panel.cameraMove === 'string' ? panel.cameraMove : undefined,
      description: typeof panel.description === 'string' ? panel.description : undefined,
      video_prompt: typeof panel.videoPrompt === 'string' ? panel.videoPrompt : undefined,
      first_frame_image_prompt: typeof panel.firstLastFramePrompt === 'string' ? panel.firstLastFramePrompt : undefined,
      location: typeof panel.location === 'string' ? panel.location : undefined,
      scene_type: typeof panel.sceneType === 'string' ? panel.sceneType : undefined,
      characters: Array.isArray(characters) ? characters : [],
      props: Array.isArray(props) ? props : [],
      source_text: typeof panel.srtSegment === 'string' ? panel.srtSegment : undefined,
      photographyPlan: photographyPlan && typeof photographyPlan === 'object' && !Array.isArray(photographyPlan)
        ? photographyPlan as Record<string, unknown>
        : undefined,
      actingNotes: actingNotes && typeof actingNotes === 'object'
        ? actingNotes
        : undefined,
      duration_base: typeof panel.duration === 'number' ? panel.duration : undefined,
      duration: typeof panel.duration === 'number' ? panel.duration : undefined,
    }
  })
}

async function handleRegenerateStoryboardTextTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const projectId = job.data.projectId
  const storyboardId = typeof payload.storyboardId === 'string' ? payload.storyboardId : job.data.targetId
  const startPhase = normalizeRegenerateStartPhase(payload.startPhase)
  const userId = job.data.userId

  if (!storyboardId) throw new Error('regenerate_storyboard_text requires storyboardId')

  const storyboard = await prisma.novelPromotionStoryboard.findUnique({
    where: { id: storyboardId },
    include: {
      clip: true,
      episode: true,
      panels: { orderBy: { panelIndex: 'asc' } },
    },
  })
  if (!storyboard) throw new Error('Storyboard not found')
  if (!storyboard.clip) throw new Error('Storyboard clip not found')

  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) throw new Error('Project not found')

  const novelPromotionData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    include: {
      characters: { include: { appearances: { orderBy: { appearanceIndex: 'asc' } } } },
      locations: { include: { images: { orderBy: { imageIndex: 'asc' } } } },
    },
  })
  if (!novelPromotionData) throw new Error('Novel promotion data not found')
  const payloadAnalysisModel = typeof payload.analysisModel === 'string' && payload.analysisModel.trim()
    ? payload.analysisModel.trim()
    : ''
  const analysisModel = payloadAnalysisModel || novelPromotionData.analysisModel
  if (!analysisModel) throw new Error('Analysis model not configured')
  const workflowConcurrency = await getUserWorkflowConcurrencyConfig(userId)
  const normalizedNovelPromotionData = {
    characters: novelPromotionData.characters || [],
    locations: novelPromotionData.locations.filter((item) => readAssetKind(item as unknown as Record<string, unknown>) !== 'prop'),
    props: novelPromotionData.locations
      .filter((item) => readAssetKind(item as unknown as Record<string, unknown>) === 'prop')
      .map((item) => ({ name: item.name, summary: item.summary })),
  }

  await reportTaskProgress(job, 20, { stage: 'regenerate_storyboard_prepare', storyboardId })
  const regenerateStreamContext = createWorkerLLMStreamContext(job, 'regenerate_storyboard')
  const regenerateCallbacks = createWorkerLLMStreamCallbacks(job, regenerateStreamContext)

  const promptTemplates = {
    phase1PlanTemplate: getPromptTemplate(PROMPT_IDS.NP_AGENT_STORYBOARD_PLAN_V4, job.data.locale),
    phase2GroupSplitTemplate: getPromptTemplate(PROMPT_IDS.NP_AGENT_STORYBOARD_GROUP_SPLIT, job.data.locale),
    phase2CinematographyTemplate: getPromptTemplate(PROMPT_IDS.NP_AGENT_CINEMATOGRAPHER_V3, job.data.locale),
    phase2ActingTemplate: getPromptTemplate(PROMPT_IDS.NP_AGENT_ACTING_DIRECTION_V2, job.data.locale),
    phase3DetailTemplate: getPromptTemplate(PROMPT_IDS.NP_AGENT_STORYBOARD_DETAIL_V4, job.data.locale),
  }
  const runStep = async (
    meta: ScriptToStoryboardStepMeta,
    prompt: string,
    action: string,
    _maxOutputTokens: number,
  ) => {
    void _maxOutputTokens
    const progress = 20 + Math.min(60, Math.floor((meta.stepIndex / Math.max(1, meta.stepTotal)) * 60))
    await reportTaskProgress(job, progress, {
      stage: 'regenerate_storyboard_step',
      displayMode: 'detail',
      message: meta.stepTitle,
      stepId: meta.stepId,
      stepAttempt: meta.stepAttempt,
      stepTitle: meta.stepTitle,
      stepIndex: meta.stepIndex,
      stepTotal: meta.stepTotal,
      groupId: meta.groupId || null,
      parallelKey: meta.parallelKey || null,
    })

    return await executeAiTextStep({
      userId,
      model: analysisModel,
      messages: [{ role: 'user', content: prompt }],
      reasoning: true,
      projectId,
      action,
      meta: {
        ...meta,
        stepAttempt: meta.stepAttempt || 1,
      },
    })
  }

  const orchestratorResult = await withInternalLLMStreamCallbacks(
    regenerateCallbacks,
    async () =>
      await runScriptToStoryboardOrchestrator({
        concurrency: workflowConcurrency.analysis,
        locale: job.data.locale,
        clips: [{
          id: storyboard.clip.id,
          content: storyboard.clip.content,
          characters: storyboard.clip.characters,
          location: storyboard.clip.location,
          props: readNullableText(storyboard.clip as unknown as Record<string, unknown>, 'props'),
          screenplay: storyboard.clip.screenplay,
        }],
        novelPromotionData: normalizedNovelPromotionData,
        promptTemplates,
        runStep,
        startPhase,
        seedPanelsByClipId: startPhase === 'phase1'
          ? undefined
          : { [storyboard.clip.id]: buildSeedPanelsFromStoryboard(storyboard as unknown as { storyboardTextJson?: string | null; panels?: Array<Record<string, unknown>> }) },
      }),
  )
  await regenerateCallbacks.flush()

  await reportTaskProgress(job, 85, { stage: 'regenerate_storyboard_persist', storyboardId })

  await assertTaskActive(job, 'regenerate_storyboard_transaction')
  const persisted = await persistStoryboardsAndPanels({
    episodeId: storyboard.episodeId,
    clipPanels: orchestratorResult.clipPanels,
  })
  const persistedStoryboard = persisted.find((item) => item.storyboardId === storyboardId) || persisted[0]

  return {
    storyboardId: persistedStoryboard?.storyboardId || storyboardId,
    panelCount: orchestratorResult.summary.totalPanelCount,
  }
}

async function handleInsertPanelTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const storyboardId = typeof payload.storyboardId === 'string' ? payload.storyboardId : job.data.targetId
  const insertAfterPanelId = typeof payload.insertAfterPanelId === 'string' ? payload.insertAfterPanelId : ''
  const userInput = resolveInsertPanelUserInput(payload, job.data.locale)

  if (!storyboardId || !insertAfterPanelId) {
    throw new Error('insert_panel requires storyboardId/insertAfterPanelId')
  }

  const storyboard = await prisma.novelPromotionStoryboard.findUnique({
    where: { id: storyboardId },
    include: {
      clip: true,
      panels: { orderBy: { panelIndex: 'asc' } },
    },
  })
  if (!storyboard) throw new Error('Storyboard not found')

  const prevPanel = storyboard.panels.find((panel) => panel.id === insertAfterPanelId)
  if (!prevPanel) throw new Error('insert_after panel not found')

  const nextPanel = storyboard.panels.find((panel) => panel.panelIndex === prevPanel.panelIndex + 1)
  const projectModels = await getProjectModelConfig(job.data.projectId, job.data.userId)
  const analysisModel = projectModels.analysisModel
  if (!analysisModel) throw new Error('Analysis model not configured')

  const projectData = await prisma.novelPromotionProject.findUnique({
    where: { projectId: job.data.projectId },
    include: {
      characters: { include: { appearances: { orderBy: { appearanceIndex: 'asc' } } } },
      locations: { include: { images: { orderBy: { imageIndex: 'asc' } } } },
    },
  })
  if (!projectData) throw new Error('Novel promotion data not found')
  const projectLocations = (projectData.locations || []).filter((item) => readAssetKind(item as unknown as Record<string, unknown>) !== 'prop')
  const projectProps = (projectData.locations || []).filter((item) => readAssetKind(item as unknown as Record<string, unknown>) === 'prop')

  const prevPanelJson = JSON.stringify(
    {
      shot_type: prevPanel.shotType,
      camera_move: prevPanel.cameraMove,
      description: prevPanel.description,
      video_prompt: prevPanel.videoPrompt,
      location: prevPanel.location,
      characters: prevPanel.characters ? JSON.parse(prevPanel.characters) : [],
      props: parsePanelProps(prevPanel),
      source_text: prevPanel.srtSegment,
    },
    null,
    2,
  )

  const nextPanelJson = nextPanel
    ? JSON.stringify(
      {
        shot_type: nextPanel.shotType,
        camera_move: nextPanel.cameraMove,
        description: nextPanel.description,
        video_prompt: nextPanel.videoPrompt,
        location: nextPanel.location,
        characters: nextPanel.characters ? JSON.parse(nextPanel.characters) : [],
        props: parsePanelProps(nextPanel),
        source_text: nextPanel.srtSegment,
      },
      null,
      2,
    )
    : '无'

  const relatedCharacters = Array.from(new Set([...parsePanelCharacters(prevPanel), ...parsePanelCharacters(nextPanel)]))
  const relatedLocations = Array.from(new Set([prevPanel.location, nextPanel?.location].filter((v): v is string => Boolean(v))))
  const relatedProps = Array.from(new Set([...parsePanelProps(prevPanel), ...parsePanelProps(nextPanel)]))

  const charactersFullDescription = (projectData.characters || [])
    .filter((character) => relatedCharacters.length === 0 || relatedCharacters.includes(character.name))
    .map((character) => {
      const appearances = character.appearances || []
      if (appearances.length === 0) return `${character.name}: 无形象信息`
      const appearanceText = appearances
        .map((appearance) => {
          const descriptions = appearance.descriptions ? (() => {
            try {
              const parsed = JSON.parse(appearance.descriptions)
              return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
            } catch {
              return [] as string[]
            }
          })() : []
          const selectedIndex = appearance.selectedIndex ?? 0
          const selectedDescription = descriptions[selectedIndex] || appearance.description || '无描述'
          return `${appearance.changeReason || '默认'}: ${selectedDescription}`
        })
        .join(' | ')
      return `${character.name}: ${appearanceText}`
    })
    .join('\n') || '无'

  const locationsDescription = buildInsertPanelLocationsDescription(
    projectLocations,
    relatedLocations,
    job.data.locale,
  )
  const propsDescription = projectProps
    .filter((prop) => relatedProps.length === 0 || relatedProps.includes(prop.name))
    .map((prop) => `${prop.name}: ${prop.summary || '无描述'}`)
    .join('\n') || '无'

  const prompt = buildPrompt({
    promptId: PROMPT_IDS.NP_AGENT_STORYBOARD_INSERT,
    locale: job.data.locale,
    variables: {
      user_input: userInput,
      prev_panel_json: prevPanelJson,
      next_panel_json: nextPanelJson,
      characters_full_description: charactersFullDescription,
      locations_description: locationsDescription,
      props_description: propsDescription,
    },
  })

  await reportTaskProgress(job, 40, { stage: 'insert_panel_generate_text' })
  const insertPanelStreamContext = createWorkerLLMStreamContext(job, 'insert_panel')
  const insertPanelCallbacks = createWorkerLLMStreamCallbacks(job, insertPanelStreamContext)

  const completion = await withInternalLLMStreamCallbacks(
    insertPanelCallbacks,
    async () =>
      await executeAiTextStep({
        userId: job.data.userId,
        model: analysisModel,
        messages: [{ role: 'user', content: prompt }],
        reasoning: true,
        projectId: job.data.projectId,
        action: 'insert_panel',
        meta: {
          stepId: 'insert_panel',
          stepTitle: '插入分镜',
          stepIndex: 1,
          stepTotal: 1,
        },
      }),
  )
  await insertPanelCallbacks.flush()

  const responseText = completion.text
  if (!responseText) throw new Error('Insert panel completion empty')

  const generatedPanel = parseJsonObjectResponse(responseText)
  const generatedShotType = typeof generatedPanel.shot_type === 'string' ? generatedPanel.shot_type : null
  const generatedCameraMove = typeof generatedPanel.camera_move === 'string' ? generatedPanel.camera_move : null
  const generatedDescription = typeof generatedPanel.description === 'string' ? generatedPanel.description : null
  const generatedVideoPrompt = typeof generatedPanel.video_prompt === 'string' ? generatedPanel.video_prompt : null
  const generatedFirstFrameImagePrompt =
    typeof generatedPanel.first_frame_image_prompt === 'string' ? generatedPanel.first_frame_image_prompt : null
  const generatedLocation = typeof generatedPanel.location === 'string' ? generatedPanel.location : null
  const generatedSrtSegment = typeof generatedPanel.source_text === 'string' ? generatedPanel.source_text : null
  const generatedDuration = typeof generatedPanel.duration === 'number' ? generatedPanel.duration : null

  await reportTaskProgress(job, 80, { stage: 'insert_panel_persist' })

  await assertTaskActive(job, 'insert_panel_transaction')
  const newPanel = await prisma.$transaction(async (tx) => {
    const panelModel = tx.novelPromotionPanel as unknown as {
      create: (args: { data: Record<string, unknown> }) => Promise<{ id: string; panelIndex: number }>
    }
    // Two-phase reindexing to avoid unique constraint collision on (storyboardId, panelIndex)
    // Phase A: shift affected panels to negative indices to clear the positive namespace
    const affectedPanels = await tx.novelPromotionPanel.findMany({
      where: { storyboardId, panelIndex: { gt: prevPanel.panelIndex } },
      select: { id: true, panelIndex: true },
      orderBy: { panelIndex: 'asc' },
    })
    for (const p of affectedPanels) {
      await tx.novelPromotionPanel.update({
        where: { id: p.id },
        data: { panelIndex: -(p.panelIndex + 1) },
      })
    }
    // Phase B: set affected panels to their final positive indices
    for (const p of affectedPanels) {
      await tx.novelPromotionPanel.update({
        where: { id: p.id },
        data: { panelIndex: p.panelIndex + 1 },
      })
    }

    const created = await panelModel.create({
      data: {
        storyboardId,
        panelIndex: prevPanel.panelIndex + 1,
        panelNumber: prevPanel.panelIndex + 2,
        shotType: generatedShotType || prevPanel.shotType,
        cameraMove: generatedCameraMove || prevPanel.cameraMove,
        description: generatedDescription || userInput,
        videoPrompt: generatedVideoPrompt || generatedDescription || userInput,
        firstLastFramePrompt: generatedFirstFrameImagePrompt,
        location: generatedLocation || prevPanel.location,
        characters: generatedPanel.characters ? JSON.stringify(generatedPanel.characters) : prevPanel.characters,
        props: generatedPanel.props ? JSON.stringify(generatedPanel.props) : readNullableText(prevPanel as unknown as Record<string, unknown>, 'props'),
        srtSegment: generatedSrtSegment || prevPanel.srtSegment,
        duration: generatedDuration,
      },
    })

    await tx.novelPromotionStoryboard.update({
      where: { id: storyboardId },
      data: { panelCount: { increment: 1 }, updatedAt: new Date() },
    })

    return created
  })

  return {
    storyboardId,
    panelId: newPanel.id,
    panelIndex: newPanel.panelIndex,
  }
}

async function processTextTask(job: Job<TaskJobData>) {
  await reportTaskProgress(job, 5, { stage: 'received' })

  switch (job.data.type) {
    case TASK_TYPE.STORY_TO_SCRIPT_RUN:
      return await handleStoryToScriptTask(job)
    case TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN:
      return await handleScriptToStoryboardTask(job)
    case TASK_TYPE.VOICE_ANALYZE:
      return await handleVoiceAnalyzeTask(job)
    case TASK_TYPE.ANALYZE_NOVEL:
      return await handleAnalyzeNovelTask(job)
    case TASK_TYPE.AI_STORY_EXPAND:
      return await handleAiStoryExpandTask(job)
    case TASK_TYPE.CLIPS_BUILD:
      return await handleClipsBuildTask(job)
    case TASK_TYPE.SCREENPLAY_CONVERT:
      return await handleScreenplayConvertTask(job)
    case TASK_TYPE.EPISODE_SPLIT_LLM:
      return await handleEpisodeSplitTask(job)
    case TASK_TYPE.ANALYZE_GLOBAL:
      return await handleAnalyzeGlobalTask(job)
    case TASK_TYPE.AI_CREATE_CHARACTER:
    case TASK_TYPE.AI_CREATE_LOCATION:
    case TASK_TYPE.ASSET_HUB_AI_DESIGN_CHARACTER:
    case TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION:
      return await handleAssetHubAIDesignTask(job)
    case TASK_TYPE.ASSET_HUB_AI_MODIFY_CHARACTER:
    case TASK_TYPE.ASSET_HUB_AI_MODIFY_LOCATION:
    case TASK_TYPE.ASSET_HUB_AI_MODIFY_PROP:
      return await handleAssetHubAIModifyTask(job)
    case TASK_TYPE.AI_MODIFY_APPEARANCE:
    case TASK_TYPE.AI_MODIFY_LOCATION:
    case TASK_TYPE.AI_MODIFY_PROP:
    case TASK_TYPE.AI_MODIFY_SHOT_PROMPT:
    case TASK_TYPE.ANALYZE_SHOT_VARIANTS:
      return await handleShotAITask(job)
    case TASK_TYPE.CHARACTER_PROFILE_CONFIRM:
    case TASK_TYPE.CHARACTER_PROFILE_BATCH_CONFIRM:
      return await handleCharacterProfileTask(job)
    case TASK_TYPE.REFERENCE_TO_CHARACTER:
    case TASK_TYPE.ASSET_HUB_REFERENCE_TO_CHARACTER:
      return await handleReferenceToCharacterTask(job)
    case TASK_TYPE.REGENERATE_STORYBOARD_TEXT:
      return await handleRegenerateStoryboardTextTask(job)
    case TASK_TYPE.INSERT_PANEL:
      return await handleInsertPanelTask(job)
    default:
      throw new Error(`Unsupported text task type: ${job.data.type}`)
  }
}

export function createTextWorker() {
  return new Worker<TaskJobData>(
    QUEUE_NAME.TEXT,
    async (job) => await withTaskLifecycle(job, processTextTask),
    {
      connection: queueRedis,
      concurrency: Number.parseInt(process.env.QUEUE_CONCURRENCY_TEXT || '10', 10) || 10,
    },
  )
}
