import { safeParseJsonArray } from '@/lib/json-repair'
import { buildCharactersIntroduction } from '@/lib/constants'
import { normalizeAnyError } from '@/lib/errors/normalize'
import { createScopedLogger } from '@/lib/logging/core'
import { mapWithConcurrency } from '@/lib/async/map-with-concurrency'
import { TaskTerminatedError } from '@/lib/task/errors'
import {
  type ActingDirection,
  type CharacterAsset,
  type ClipCharacterRef,
  type LocationAsset,
  type PropAsset,
  type PhotographyRule,
  type StoryboardPanel,
  formatClipId,
  getFilteredAppearanceList,
  getFilteredFullDescription,
} from '@/lib/storyboard-phases'
import {
  buildPromptAssetContext,
  compileAssetPromptFragments,
} from '@/lib/assets/services/asset-prompt-context'
import {
  DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
  normalizeWorkflowConcurrencyValue,
} from '@/lib/workflow-concurrency'

type JsonRecord = Record<string, unknown>
const orchestratorLogger = createScopedLogger({ module: 'worker.orchestrator.script_to_storyboard' })

export type ScriptToStoryboardStepMeta = {
  stepId: string
  stepAttempt?: number
  stepTitle: string
  stepIndex: number
  stepTotal: number
  dependsOn?: string[]
  groupId?: string
  parallelKey?: string
  retryable?: boolean
  blockedBy?: string[]
}

export type ScriptToStoryboardStepOutput = {
  text: string
  reasoning: string
}

type ClipInput = {
  id: string
  content: string | null
  characters: string | null
  location: string | null
  props?: string | null
  screenplay: string | null
}

export type ScriptToStoryboardPromptTemplates = {
  phase1PlanTemplate: string
  phase2GroupSplitTemplate?: string
  phase2CinematographyTemplate: string
  phase2ActingTemplate: string
  phase3DetailTemplate: string
}

type CoarseStoryboardGroup = JsonRecord & {
  group_number?: number
}

function isLikelyCoarseStoryboardGroup(value: CoarseStoryboardGroup) {
  return typeof value.group_number === 'number'
    || typeof value.group_purpose === 'string'
    || typeof value.description_group === 'string'
    || typeof value.duration_group === 'number'
}

export type ClipStoryboardPanels = {
  clipId: string
  clipIndex: number
  finalPanels: StoryboardPanel[]
}

export type StoryboardPhaseArtifact = {
  clipId: string
  stepKey: string
  artifactType: string
  payload: Record<string, unknown>
}

export type ScriptToStoryboardOrchestratorInput = {
  concurrency?: number
  maxStepAttempts?: number
  locale?: 'zh' | 'en'
  clips: ClipInput[]
  novelPromotionData: {
    characters: CharacterAsset[]
    locations: LocationAsset[]
    props?: PropAsset[]
  }
  promptTemplates: ScriptToStoryboardPromptTemplates
  runStep: (
    meta: ScriptToStoryboardStepMeta,
    prompt: string,
    action: string,
    maxOutputTokens: number,
  ) => Promise<ScriptToStoryboardStepOutput>
  onArtifact?: (artifact: StoryboardPhaseArtifact) => Promise<void>
  onClipCompleted?: (clip: ClipStoryboardPanels) => Promise<void>
}

export type ScriptToStoryboardOrchestratorResult = {
  clipPanels: ClipStoryboardPanels[]
  phase1PanelsByClipId: Record<string, StoryboardPanel[]>
  phase2CinematographyByClipId: Record<string, PhotographyRule[]>
  phase2ActingByClipId: Record<string, ActingDirection[]>
  phase3PanelsByClipId: Record<string, StoryboardPanel[]>
  summary: {
    clipCount: number
    totalPanelCount: number
    totalStepCount: number
  }
}


export class JsonParseError extends Error {
  rawText: string
  constructor(message: string, rawText: string) {
    super(message)
    this.name = 'JsonParseError'
    this.rawText = rawText
  }
}

function parseJsonArray<T extends JsonRecord>(responseText: string, label: string): T[] {
  const rows = safeParseJsonArray(responseText)
  if (rows.length === 0) {
    throw new JsonParseError(`${label}: empty result`, responseText)
  }
  return rows as T[]
}


function parseClipCharacters(raw: string | null): ClipCharacterRef[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error('characters field must be JSON array')
    }
    return parsed as ClipCharacterRef[]
  } catch (error) {
    throw new Error(`Invalid clip characters JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function parseClipProps(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error('props field must be JSON array')
    }
    return parsed.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
  } catch (error) {
    throw new Error(`Invalid clip props JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function parseScreenplay(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid clip screenplay JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function withStepMeta(
  stepId: string,
  stepTitle: string,
  stepIndex: number,
  stepTotal: number,
  extra?: Pick<ScriptToStoryboardStepMeta, 'dependsOn' | 'groupId' | 'parallelKey' | 'retryable' | 'blockedBy'>,
): ScriptToStoryboardStepMeta {
  return {
    stepId,
    stepTitle,
    stepIndex,
    stepTotal,
    ...extra,
  }
}

function resolveGroupSplitProgressTitle(params: {
  locale?: 'zh' | 'en'
  current: number
  total: number
}) {
  const total = Math.max(1, Math.floor(params.total))
  const current = Math.min(total, Math.max(1, Math.floor(params.current)))
  const base = params.locale === 'en' ? 'Split fine shots' : '细镜头拆分'
  return `${base} ${current}/${total}`
}

function resolveGuidanceProgressTitle(params: {
  locale?: 'zh' | 'en'
  kind: 'cinematography' | 'acting'
  current: number
  total: number
}) {
  const total = Math.max(1, Math.floor(params.total))
  const current = Math.min(total, Math.max(1, Math.floor(params.current)))
  const base = params.kind === 'cinematography'
    ? (params.locale === 'en' ? 'Generate cinematography rules' : '摄影规则生成')
    : (params.locale === 'en' ? 'Generate acting direction' : '演技指导生成')
  return `${base} ${current}/${total}`
}

function resolveDetailProgressTitle(params: {
  locale?: 'zh' | 'en'
  current: number
  total: number
}) {
  const total = Math.max(1, Math.floor(params.total))
  const current = Math.min(total, Math.max(1, Math.floor(params.current)))
  const base = params.locale === 'en' ? 'Refine storyboard details' : '分镜细节补全'
  return `${base} ${current}/${total}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readTextByKeys(record: Record<string, unknown> | null, keys: string[]): string {
  if (!record) return ''
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function normalizeLighting(value: PhotographyRule['lighting']) {
  if (typeof value === 'string') {
    return {
      direction: value,
      quality: '',
    }
  }
  const record = asRecord(value)
  return {
    direction: asText(record?.direction),
    quality: asText(record?.quality),
  }
}

function normalizePhotographyCharacters(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const record = asRecord(item)
    return {
      name: asText(record?.name),
      screen_position: readTextByKeys(record, ['screen_position', 'screenPosition', 'position', 'slot']),
      posture: readTextByKeys(record, ['posture', 'pose', 'body_pose', 'bodyPose']),
      facing: readTextByKeys(record, ['facing', 'look_direction', 'lookDirection', 'direction']),
    }
  })
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

function parsePanelCharacters(value: unknown): Array<{ name: string; appearance?: string; slot?: string }> {
  if (!Array.isArray(value)) return []
  return value.reduce<Array<{ name: string; appearance?: string; slot?: string }>>((acc, item) => {
      const record = asRecord(item)
      const name = asText(record?.name).trim()
      if (!name) return acc
      const appearance = asText(record?.appearance).trim()
      const slot = asText(record?.slot).trim()
      acc.push({
        name,
        appearance: appearance || undefined,
        slot: slot || undefined,
      })
      return acc
    }, [])
}

function backfillPanelCharacterSlots(
  current: Array<{ name: string; appearance?: string; slot?: string }>,
  plan: Array<{ name: string; appearance?: string; slot?: string }>,
) {
  if (current.length === 0 || plan.length === 0) return current
  const slotByName = new Map<string, string>()
  for (const item of plan) {
    if (typeof item.slot === 'string' && item.slot.trim()) {
      slotByName.set(normalizeName(item.name), item.slot.trim())
    }
  }
  return current.map((item) => {
    if (typeof item.slot === 'string' && item.slot.trim()) return item
    const slot = slotByName.get(normalizeName(item.name))
    return slot ? { ...item, slot } : item
  })
}

function hydrateFinalPanelCharactersWithPlanSlots(params: {
  finalPanels: StoryboardPanel[]
  planPanels: StoryboardPanel[]
}) {
  const planCharsByPanel = new Map<number, Array<{ name: string; appearance?: string; slot?: string }>>()
  for (const panel of params.planPanels) {
    if (typeof panel.panel_number !== 'number') continue
    planCharsByPanel.set(panel.panel_number, parsePanelCharacters(panel.characters))
  }

  return params.finalPanels.map((panel) => {
    if (typeof panel.panel_number !== 'number') return panel
    const currentChars = parsePanelCharacters(panel.characters)
    const planChars = planCharsByPanel.get(panel.panel_number) || []
    const mergedChars = backfillPanelCharacterSlots(currentChars, planChars)
    return {
      ...panel,
      characters: mergedChars,
    }
  })
}

function fallbackPhotographyCharactersFromPanel(panel: StoryboardPanel) {
  return parsePanelCharacters(panel.characters).map((item) => ({
    name: item.name,
    screen_position: item.slot || '',
    posture: '',
    facing: '',
  }))
}

function buildUnifiedPhotographyPlan(rule: PhotographyRule, panel: StoryboardPanel) {
  const sceneSummary = asText(rule.scene_summary) || asText(rule.composition)
  const lighting = normalizeLighting(rule.lighting)
  const characters = (() => {
    const fromRules = normalizePhotographyCharacters(rule.characters).filter((item) => item.name)
    const fallback = fallbackPhotographyCharactersFromPanel(panel)
    if (fromRules.length === 0) return fallback

    const fallbackByName = new Map(fallback.map((item) => [normalizeName(item.name), item]))
    const merged = fromRules.map((item) => {
      const fb = fallbackByName.get(normalizeName(item.name))
      return {
        ...item,
        screen_position: item.screen_position || fb?.screen_position || '',
        posture: item.posture || '',
        facing: item.facing || '',
      }
    })
    const existing = new Set(merged.map((item) => normalizeName(item.name)))
    const missing = fallback.filter((item) => !existing.has(normalizeName(item.name)))
    return [...merged, ...missing]
  })()
  const depthOfField = asText(rule.depth_of_field)
  const colorTone = asText(rule.color_tone) || asText(rule.color_palette)
  const cameraAngle = asText(rule.camera_angle)
  const viewpointConstraint = asText(rule.viewpoint_constraint)
  const focusPriority = asText(rule.focus_priority)
  const compositionNote = asText(rule.composition_note)
  const composition = asText(rule.composition) || compositionNote || sceneSummary
  const atmosphere = asText(rule.atmosphere)
  const technicalNotes = asText(rule.technical_notes)

  return {
    panel_number: rule.panel_number,
    shot_purpose: asText(panel.shot_purpose),
    scene_type: asText(panel.scene_type),
    source_text: asText(panel.source_text),
    duration_base: typeof panel.duration_base === 'number' ? panel.duration_base : null,
    duration: typeof panel.duration === 'number' ? panel.duration : null,
    scene_summary: sceneSummary,
    lighting,
    camera_angle: cameraAngle,
    viewpoint_constraint: viewpointConstraint,
    characters,
    depth_of_field: depthOfField,
    color_tone: colorTone,
    focus_priority: focusPriority,
    composition_note: compositionNote,
    // 兼容历史字段，避免旧调用链回归
    composition,
    colorPalette: asText(rule.color_palette) || colorTone,
    atmosphere,
    technicalNotes,
  }
}

function mergePanelsWithRules(params: {
  finalPanels: StoryboardPanel[]
  photographyRules: PhotographyRule[]
  actingDirections: ActingDirection[]
}) {
  const { finalPanels, photographyRules, actingDirections } = params
  return finalPanels.map((panel, index) => {
    const rules = photographyRules.find((rule) => rule.panel_number === panel.panel_number)
    if (!rules) {
      throw new Error(`Missing photography rule for panel_number=${String(panel.panel_number)} at index=${index}`)
    }
    const acting = actingDirections.find((item) => item.panel_number === panel.panel_number)
    if (!acting) {
      throw new Error(`Missing acting direction for panel_number=${String(panel.panel_number)} at index=${index}`)
    }
    const actingNotes = normalizeActingNotesPayload(acting.characters)

    return {
      ...panel,
      photographyPlan: buildUnifiedPhotographyPlan(rules, panel),
      acting_notes: actingNotes,
      actingNotes,
    }
  })
}

function normalizeActingNotesPayload(value: unknown) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object' && Array.isArray((value as JsonRecord).characters)) {
    return (value as JsonRecord).characters
  }
  return []
}

function findPanelByNumberOrIndex<T extends { panel_number?: number }>(
  rows: T[],
  panelNumber: number | undefined,
  index: number,
) {
  if (typeof panelNumber === 'number') {
    const byNumber = rows.find((row) => row.panel_number === panelNumber)
    if (byNumber) return byNumber
  }
  return rows[index]
}

function normalizePhase3Duration(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function pickPhase3DetailFields(panel: StoryboardPanel | undefined): Partial<StoryboardPanel> {
  if (!panel) return {}
  const duration = normalizePhase3Duration(panel.duration)
  return {
    shot_type: typeof panel.shot_type === 'string' ? panel.shot_type : undefined,
    camera_move: typeof panel.camera_move === 'string' ? panel.camera_move : undefined,
    video_prompt: typeof panel.video_prompt === 'string' ? panel.video_prompt : undefined,
    first_frame_image_prompt:
      typeof panel.first_frame_image_prompt === 'string' ? panel.first_frame_image_prompt : undefined,
    duration: duration ?? undefined,
  }
}

function reconcilePhase3Panels(params: {
  phase3Panels: StoryboardPanel[]
  planPanels: StoryboardPanel[]
  photographyRules: PhotographyRule[]
  actingDirections: ActingDirection[]
}) {
  const { phase3Panels, planPanels, photographyRules, actingDirections } = params
  return planPanels.map((planPanel, index) => {
    const rawPhase3 = findPanelByNumberOrIndex(phase3Panels, planPanel.panel_number, index)
    const matchedRule = findPanelByNumberOrIndex(photographyRules, planPanel.panel_number, index)
    const matchedActing = findPanelByNumberOrIndex(actingDirections, planPanel.panel_number, index)
    if (!matchedRule) {
      throw new Error(`Missing cinematography rule for panel_number=${String(planPanel.panel_number)} at index=${index}`)
    }
    if (!matchedActing) {
      throw new Error(`Missing acting direction for panel_number=${String(planPanel.panel_number)} at index=${index}`)
    }
    const phase3Detail = pickPhase3DetailFields(rawPhase3)
    const merged = {
      ...planPanel,
      characters: planPanel.characters,
      ...phase3Detail,
      photography_rules: matchedRule,
      acting_notes: matchedActing,
    } as StoryboardPanel
    if (merged.duration_base == null && planPanel.duration_base != null) {
      merged.duration_base = planPanel.duration_base
    }
    if (merged.duration == null && typeof merged.duration_base === 'number') {
      merged.duration = merged.duration_base
    }
    return merged
  })
}

function buildAdjacentCoarseGroupsContext(groups: CoarseStoryboardGroup[], index: number): string {
  const previous = index > 0 ? groups[index - 1] : null
  const next = index < groups.length - 1 ? groups[index + 1] : null
  return JSON.stringify(
    {
      previous_group: previous,
      next_group: next,
    },
    null,
    2,
  )
}

function summarizePanelForContext(panel: StoryboardPanel) {
  return {
    panel_number: panel.panel_number,
    shot_purpose: panel.shot_purpose,
    description: panel.description,
    source_text: panel.source_text,
    location: panel.location,
    scene_type: panel.scene_type,
  }
}

function buildAdjacentFineGroupContext(groups: StoryboardPanel[][], index: number): string {
  const previousPanels = index > 0 ? groups[index - 1] : null
  const nextPanels = index < groups.length - 1 ? groups[index + 1] : null
  return JSON.stringify(
    {
      previous_group: previousPanels?.map(summarizePanelForContext) || null,
      next_group: nextPanels?.map(summarizePanelForContext) || null,
    },
    null,
    2,
  )
}

function assignSequentialPanelNumbers(panels: StoryboardPanel[]) {
  return panels.map((panel, index) => ({
    ...panel,
    panel_number: index + 1,
  }))
}

function buildFinePanelsWithCinematography(params: {
  finePanels: StoryboardPanel[]
  photographyRules: PhotographyRule[]
  actingDirections: ActingDirection[]
}) {
  const { finePanels, photographyRules, actingDirections } = params
  return finePanels.map((panel, index) => {
    const matchedRule = findPanelByNumberOrIndex(photographyRules, panel.panel_number, index)
    const matchedActing = findPanelByNumberOrIndex(actingDirections, panel.panel_number, index)
    if (!matchedRule) {
      throw new Error(`Missing cinematography rule for panel_number=${String(panel.panel_number)} at index=${index}`)
    }
    if (!matchedActing) {
      throw new Error(`Missing acting direction for panel_number=${String(panel.panel_number)} at index=${index}`)
    }
    return {
      ...panel,
      lighting: matchedRule.lighting,
      camera_angle: matchedRule.camera_angle,
      viewpoint_constraint: matchedRule.viewpoint_constraint,
      depth_of_field: matchedRule.depth_of_field,
      color_tone: matchedRule.color_tone || matchedRule.color_palette,
      focus_priority: matchedRule.focus_priority,
      composition_note: matchedRule.composition_note,
      acting_notes: matchedActing,
    }
  })
}

const DEFAULT_MAX_STEP_ATTEMPTS = 3
const MAX_RETRY_DELAY_MS = 10_000

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function computeRetryDelayMs(attempt: number) {
  const base = Math.min(1_000 * Math.pow(2, Math.max(0, attempt - 1)), MAX_RETRY_DELAY_MS)
  const jitter = Math.floor(Math.random() * 300)
  return base + jitter
}

function isTerminatedStepError(error: unknown, message: string) {
  if (error instanceof TaskTerminatedError) return true
  if (error instanceof Error && error.name === 'TaskTerminatedError') return true
  const lowerMessage = message.toLowerCase()
  return lowerMessage.includes('task terminated')
    || lowerMessage.includes('terminated during')
    || lowerMessage.includes('lease lost')
}

function shouldRetryStepError(error: unknown, message: string, retryable: boolean) {
  if (isTerminatedStepError(error, message)) return false
  if (error instanceof JsonParseError) return true
  if (retryable) return true
  const lowerMessage = message.toLowerCase()
  if (lowerMessage.includes('ark responses 调用失败')) return false
  if (lowerMessage.includes('invalidparameter')) return false
  if (lowerMessage.includes('unknown field')) return false
  return lowerMessage.includes('unexpected token')
    || lowerMessage.includes('unexpected end of json input')
    || lowerMessage.includes('json format invalid')
    || lowerMessage.includes('invalid json output')
    || lowerMessage.includes('parse')
}

async function runStepWithRetry<T>(
  runStep: ScriptToStoryboardOrchestratorInput['runStep'],
  baseMeta: ScriptToStoryboardStepMeta,
  prompt: string,
  action: string,
  maxOutputTokens: number,
  parse: (text: string) => T,
  maxStepAttempts: number,
): Promise<{ output: ScriptToStoryboardStepOutput; parsed: T }> {
  const hasBaseStepAttempt =
    typeof baseMeta.stepAttempt === 'number' && Number.isFinite(baseMeta.stepAttempt)
  const baseStepAttempt = hasBaseStepAttempt
    ? Math.max(1, Math.floor(baseMeta.stepAttempt as number))
    : 1
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= maxStepAttempts; attempt++) {
    const stepAttempt = baseStepAttempt + attempt - 1
    const meta = attempt === 1
      ? (
        hasBaseStepAttempt
          ? {
            ...baseMeta,
            stepAttempt,
          }
          : baseMeta
      )
      : {
        ...baseMeta,
        stepId: baseMeta.stepId,
        stepAttempt,
        stepTitle: baseMeta.stepTitle,
      }
    try {
      const output = await runStep(meta, prompt, action, maxOutputTokens)
      const parsed = parse(output.text)
      return { output, parsed }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      const normalizedError = normalizeAnyError(error, { context: 'worker' })
      const shouldRetry = attempt < maxStepAttempts
        && shouldRetryStepError(error, normalizedError.message, normalizedError.retryable)

      orchestratorLogger.error({
        action: 'orchestrator.step.retry',
        message: shouldRetry ? 'step failed, retrying' : 'step failed, no more retry',
        errorCode: normalizedError.code,
        retryable: normalizedError.retryable,
        details: {
          stepId: baseMeta.stepId,
          action,
          attempt,
          maxAttempts: maxStepAttempts,
        },
        error: {
          name: lastError.name,
          message: lastError.message,
          stack: lastError.stack,
        },
      })

      if (!shouldRetry) {
        break
      }
      const retryDelayMs = computeRetryDelayMs(attempt)
      await wait(retryDelayMs)
    }
  }
  throw lastError!
}

export async function runScriptToStoryboardOrchestrator(
  input: ScriptToStoryboardOrchestratorInput,
): Promise<ScriptToStoryboardOrchestratorResult> {
  const {
    clips,
    novelPromotionData,
    promptTemplates,
    runStep,
    onArtifact,
    onClipCompleted,
    concurrency: rawConcurrency,
  } = input
  const maxStepAttempts =
    typeof input.maxStepAttempts === 'number' && Number.isFinite(input.maxStepAttempts)
      ? Math.max(1, Math.floor(input.maxStepAttempts))
      : DEFAULT_MAX_STEP_ATTEMPTS
  if (!Array.isArray(clips) || clips.length === 0) {
    throw new Error('No clips found')
  }
  const concurrency = normalizeWorkflowConcurrencyValue(
    rawConcurrency,
    DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
  )

  const totalStepCount = clips.length * 5 + 2
  const charactersLibName = (novelPromotionData.characters || []).map((c) => c.name).join(', ') || '无'
  const locationsLibName = (novelPromotionData.locations || []).map((l) => l.name).join(', ') || '无'
  const charactersIntroduction = buildCharactersIntroduction(novelPromotionData.characters || [])
  const phase2GroupSplitTemplate = promptTemplates.phase2GroupSplitTemplate || '{coarse_storyboard_group}'

  const phase1PanelsByClipId = new Map<string, StoryboardPanel[]>()
  const phase2CinematographyByClipId = new Map<string, PhotographyRule[]>()
  const phase2ActingByClipId = new Map<string, ActingDirection[]>()
  const phase3PanelsByClipId = new Map<string, StoryboardPanel[]>()

  const clipPanels = await mapWithConcurrency(clips, concurrency, async (clip, index): Promise<ClipStoryboardPanels> => {
    const clipIndex = index + 1
    const clipContent = typeof clip.content === 'string' ? clip.content.trim() : ''
    if (!clipContent) {
      throw new Error(`Clip ${formatClipId(clip)} content is empty`)
    }
    const clipCharacters = parseClipCharacters(clip.characters)
    const clipProps = parseClipProps(clip.props ?? null)
    const filteredAppearanceList = getFilteredAppearanceList(novelPromotionData.characters || [], clipCharacters)
    const filteredFullDescription = getFilteredFullDescription(novelPromotionData.characters || [], clipCharacters)
    const filteredPropsDescription = compileAssetPromptFragments(buildPromptAssetContext({
      characters: [],
      locations: [],
      props: novelPromotionData.props || [],
      clipCharacters: [],
      clipLocation: null,
      clipProps,
    })).propsDescriptionText
    const clipJson = JSON.stringify(
      {
        id: clip.id,
        content: clipContent,
        characters: clipCharacters,
        location: clip.location || null,
        props: clipProps,
      },
      null,
      2,
    )

    let phase1Prompt = promptTemplates.phase1PlanTemplate
      .replace('{characters_lib_name}', charactersLibName)
      .replace('{locations_lib_name}', locationsLibName)
      .replace('{characters_introduction}', charactersIntroduction)
      .replace('{characters_appearance_list}', filteredAppearanceList)
      .replace('{characters_full_description}', filteredFullDescription)
      .replace('{props_description}', filteredPropsDescription)
      .replace('{clip_json}', clipJson)

    const screenplay = parseScreenplay(clip.screenplay)
    if (screenplay) {
      phase1Prompt = phase1Prompt.replace('{clip_content}', `【剧本格式】\n${JSON.stringify(screenplay, null, 2)}`)
    } else {
      phase1Prompt = phase1Prompt.replace('{clip_content}', clipContent)
    }

    const phase1Meta = withStepMeta(
      `clip_${clip.id}_phase1`,
      'progress.streamStep.storyboardPlan',
      clipIndex,
      totalStepCount,
      {
        groupId: `clip_${clip.id}`,
        parallelKey: 'phase1',
        retryable: true,
      },
    )
    const { parsed: coarseGroups } = await runStepWithRetry(
      runStep,
      phase1Meta,
      phase1Prompt,
      'storyboard_phase1_plan',
      2600,
      (text) => {
        const groups = parseJsonArray<CoarseStoryboardGroup>(text, `phase1:${formatClipId(clip)}`)
        if (groups.length === 0) {
          throw new Error(`Phase 1 returned empty coarse groups for clip ${formatClipId(clip)}`)
        }
        return groups
      },
      maxStepAttempts,
    )
    phase1PanelsByClipId.set(clip.id, coarseGroups as StoryboardPanel[])

    if (onArtifact) {
      await onArtifact({
        clipId: clip.id,
        stepKey: `clip_${clip.id}_phase1`,
        artifactType: 'storyboard.clip.phase1',
        payload: { panels: coarseGroups },
      })
    }

    const phase2Meta = withStepMeta(
      `clip_${clip.id}_phase2_cinematography`,
      'progress.streamStep.storyboardGroupSplit',
      clips.length + index * 4 + 1,
      totalStepCount,
      {
        dependsOn: [`clip_${clip.id}_phase1`],
        groupId: `clip_${clip.id}`,
        parallelKey: 'phase2',
        retryable: true,
      },
    )
    const phase3CinematographyMeta = withStepMeta(
      `clip_${clip.id}_phase3_cinematography`,
      'progress.streamStep.cinematographyRules',
      clips.length + index * 4 + 2,
      totalStepCount,
      {
        dependsOn: [`clip_${clip.id}_phase2_cinematography`],
        groupId: `clip_${clip.id}`,
        parallelKey: 'phase3',
        retryable: false,
      },
    )
    const phase3ActingMeta = withStepMeta(
      `clip_${clip.id}_phase2_acting`,
      'progress.streamStep.actingDirection',
      clips.length + index * 4 + 3,
      totalStepCount,
      {
        dependsOn: [`clip_${clip.id}_phase2_cinematography`],
        groupId: `clip_${clip.id}`,
        parallelKey: 'phase3',
        retryable: true,
      },
    )
    const phase3Meta = withStepMeta(
      `clip_${clip.id}_phase3_detail`,
      'progress.streamStep.storyboardDetailRefine',
      clips.length + index * 4 + 4,
      totalStepCount,
      {
        dependsOn: [
          `clip_${clip.id}_phase3_cinematography`,
          `clip_${clip.id}_phase2_acting`,
        ],
        groupId: `clip_${clip.id}`,
        parallelKey: 'phase4',
        retryable: true,
      },
    )

    const finePanelsByGroup: StoryboardPanel[][] = []
    const isCoarsePlan = coarseGroups.some(isLikelyCoarseStoryboardGroup)
    if (isCoarsePlan) {
      const splitResults = await mapWithConcurrency(coarseGroups, concurrency, async (coarseGroup, groupIndex) => {
        const groupNumber = groupIndex + 1
        const splitStepMeta: ScriptToStoryboardStepMeta = {
          ...phase2Meta,
          stepAttempt: groupNumber,
          stepTitle: resolveGroupSplitProgressTitle({
            locale: input.locale,
            current: groupNumber,
            total: coarseGroups.length,
          }),
        }
        const splitPrompt = phase2GroupSplitTemplate
          .replace('{characters_lib_name}', charactersLibName)
          .replace('{locations_lib_name}', locationsLibName)
          .replace('{characters_introduction}', charactersIntroduction)
          .replace('{characters_appearance_list}', filteredAppearanceList)
          .replace('{characters_full_description}', filteredFullDescription)
          .replace('{props_description}', filteredPropsDescription)
          .replace('{coarse_storyboard_group}', JSON.stringify(coarseGroup, null, 2))
          .replace('{adjacent_groups_context}', buildAdjacentCoarseGroupsContext(coarseGroups, groupIndex))
        const { parsed: finePanels } = await runStepWithRetry(
          runStep,
          splitStepMeta,
          splitPrompt,
          'storyboard_phase2_cinematography',
          2600,
          (text) => {
            const panels = parseJsonArray<StoryboardPanel>(text, `phase2-split:${formatClipId(clip)}:group-${groupNumber}`)
            if (panels.length === 0) {
              throw new Error(`Phase 2 returned empty fine panels for clip ${formatClipId(clip)} group ${groupNumber}`)
            }
            return panels
          },
          maxStepAttempts,
        )
        return finePanels.map((panel, panelIndex) => ({
          ...panel,
          panel_number: typeof panel.panel_number === 'number' ? panel.panel_number : panelIndex + 1,
          parent_group_number:
            typeof (panel as Record<string, unknown>).parent_group_number === 'number'
              ? (panel as Record<string, unknown>).parent_group_number
              : (typeof coarseGroup.group_number === 'number' ? coarseGroup.group_number : groupNumber),
        }))
      })
      finePanelsByGroup.push(...splitResults)
    } else {
      finePanelsByGroup.push((coarseGroups as StoryboardPanel[]).map((panel, panelIndex) => ({
        ...panel,
        panel_number: typeof panel.panel_number === 'number' ? panel.panel_number : panelIndex + 1,
      })))
    }

    const flattenedFinePanels = finePanelsByGroup.flat()
    if (flattenedFinePanels.length === 0) {
      throw new Error(`Phase 2 produced no fine panels for clip ${formatClipId(clip)}`)
    }

    if (onArtifact) {
      await onArtifact({
        clipId: clip.id,
        stepKey: `clip_${clip.id}_phase2_cinematography`,
        artifactType: 'storyboard.clip.phase2.cine',
        payload: {
          fine_groups: finePanelsByGroup.map((panels, groupIndex) => ({
            group_index: groupIndex + 1,
            panels,
          })),
          panels: flattenedFinePanels,
        },
      })
    }

    const finePanelsWithGuidanceByGroup: StoryboardPanel[][] = []
    const photographyRulesByGroup: PhotographyRule[][] = []
    const actingDirectionsByGroup: ActingDirection[][] = []
    const guidanceResults = await mapWithConcurrency(finePanelsByGroup, concurrency, async (finePanels, groupIndex) => {
      const groupNumber = groupIndex + 1
      const adjacentContext = buildAdjacentFineGroupContext(finePanelsByGroup, groupIndex)
      const cinematographyMeta: ScriptToStoryboardStepMeta = {
        ...phase3CinematographyMeta,
        stepAttempt: groupNumber,
        stepTitle: resolveGuidanceProgressTitle({
          locale: input.locale,
          kind: 'cinematography',
          current: groupNumber,
          total: finePanelsByGroup.length,
        }),
      }
      const actingMeta: ScriptToStoryboardStepMeta = {
        ...phase3ActingMeta,
        stepAttempt: groupNumber,
        stepTitle: resolveGuidanceProgressTitle({
          locale: input.locale,
          kind: 'acting',
          current: groupNumber,
          total: finePanelsByGroup.length,
        }),
      }
      const cinematographyPrompt = promptTemplates.phase2CinematographyTemplate
        .replace('{characters_lib_name}', charactersLibName)
        .replace('{locations_lib_name}', locationsLibName)
        .replace('{characters_introduction}', charactersIntroduction)
        .replace('{characters_appearance_list}', filteredAppearanceList)
        .replace('{characters_full_description}', filteredFullDescription)
        .replace('{props_description}', filteredPropsDescription)
        .replace('{fine_storyboard_group}', JSON.stringify(finePanels, null, 2))
        .replace('{adjacent_context}', adjacentContext)
        .replace('{panels_json}', JSON.stringify(finePanels, null, 2))
        .replace(/\{panel_count\}/g, String(finePanels.length))
        .replace('{locations_description}', '')
        .replace('{characters_info}', filteredFullDescription)
      const actingPrompt = promptTemplates.phase2ActingTemplate
        .replace('{panels_json}', JSON.stringify(finePanels, null, 2))
        .replace(/\{panel_count\}/g, String(finePanels.length))
        .replace('{characters_info}', filteredFullDescription)
        .replace('{adjacent_context}', adjacentContext)

      const [
        { parsed: photographyRules },
        { parsed: actingDirections },
      ] = await Promise.all([
        runStepWithRetry(
          runStep,
          cinematographyMeta,
          cinematographyPrompt,
          'storyboard_phase2_cinematography',
          2400,
          (text) => parseJsonArray<PhotographyRule>(text, `phase3-cine:${formatClipId(clip)}:group-${groupNumber}`),
          maxStepAttempts,
        ),
        runStepWithRetry(
          runStep,
          actingMeta,
          actingPrompt,
          'storyboard_phase2_acting',
          2400,
          (text) => parseJsonArray<ActingDirection>(text, `phase3-acting:${formatClipId(clip)}:group-${groupNumber}`),
          maxStepAttempts,
        ),
      ])

      return {
        photographyRules,
        actingDirections,
        finePanelsWithGuidance: buildFinePanelsWithCinematography({
          finePanels,
          photographyRules,
          actingDirections,
        }),
      }
    })
    photographyRulesByGroup.push(...guidanceResults.map((result) => result.photographyRules))
    actingDirectionsByGroup.push(...guidanceResults.map((result) => result.actingDirections))
    finePanelsWithGuidanceByGroup.push(...guidanceResults.map((result) => result.finePanelsWithGuidance))

    const flattenedPhotographyRules = photographyRulesByGroup.flat()
    const flattenedActingDirections = actingDirectionsByGroup.flat()
    phase2CinematographyByClipId.set(clip.id, flattenedPhotographyRules)
    phase2ActingByClipId.set(clip.id, flattenedActingDirections)

    if (onArtifact) {
      await onArtifact({
        clipId: clip.id,
        stepKey: `clip_${clip.id}_phase2_acting`,
        artifactType: 'storyboard.clip.phase2.acting',
        payload: {
          rules: flattenedPhotographyRules,
          directions: flattenedActingDirections,
          fine_groups_with_guidance: finePanelsWithGuidanceByGroup.map((panels, groupIndex) => ({
            group_index: groupIndex + 1,
            panels,
          })),
        },
      })
    }

    const finalPanelsByGroup: StoryboardPanel[][] = []
    finalPanelsByGroup.push(...await mapWithConcurrency(finePanelsByGroup, concurrency, async (finePanels, groupIndex) => {
      const groupNumber = groupIndex + 1
      const photographyRules = photographyRulesByGroup[groupIndex] || []
      const actingDirections = actingDirectionsByGroup[groupIndex] || []
      const guidancePanels = finePanelsWithGuidanceByGroup[groupIndex] || []
      const detailMeta: ScriptToStoryboardStepMeta = {
        ...phase3Meta,
        stepAttempt: groupNumber,
        stepTitle: resolveDetailProgressTitle({
          locale: input.locale,
          current: groupNumber,
          total: finePanelsByGroup.length,
        }),
      }
      const detailPrompt = promptTemplates.phase3DetailTemplate
        .replace('{characters_lib_name}', charactersLibName)
        .replace('{locations_lib_name}', locationsLibName)
        .replace('{characters_introduction}', charactersIntroduction)
        .replace('{characters_appearance_list}', filteredAppearanceList)
        .replace('{characters_full_description}', filteredFullDescription)
        .replace('{props_description}', filteredPropsDescription)
        .replace('{fine_storyboard_group_with_cinematography}', JSON.stringify(guidancePanels, null, 2))
        .replace('{adjacent_context}', buildAdjacentFineGroupContext(finePanelsWithGuidanceByGroup, groupIndex))
        .replace('{panels_json}', JSON.stringify(guidancePanels, null, 2))
        .replace('{characters_age_gender}', filteredFullDescription)
        .replace('{locations_description}', '')

      const { parsed: rawDetailedPanels } = await runStepWithRetry(
        runStep,
        detailMeta,
        detailPrompt,
        'storyboard_phase3_detail',
        2600,
        (text) => parseJsonArray<StoryboardPanel>(text, `phase4:${formatClipId(clip)}:group-${groupNumber}`),
        maxStepAttempts,
      )
      const reconciledPanels = reconcilePhase3Panels({
        phase3Panels: rawDetailedPanels,
        planPanels: finePanels,
        photographyRules,
        actingDirections,
      })
      const normalizedPanels = hydrateFinalPanelCharactersWithPlanSlots({
        finalPanels: reconciledPanels,
        planPanels: finePanels,
      })
      return mergePanelsWithRules({
        finalPanels: normalizedPanels,
        photographyRules,
        actingDirections,
      })
    }))

    const finalPanels = assignSequentialPanelNumbers(finalPanelsByGroup.flat())
    if (finalPanels.length === 0) {
      throw new Error(`Phase 4 returned empty valid panels for clip ${formatClipId(clip)}`)
    }

    phase3PanelsByClipId.set(clip.id, finalPanels)

    if (onArtifact) {
      await onArtifact({
        clipId: clip.id,
        stepKey: `clip_${clip.id}_phase3_detail`,
        artifactType: 'storyboard.clip.phase3',
        payload: { panels: finalPanels },
      })
    }

    const clipResult = {
      clipId: clip.id,
      clipIndex,
      finalPanels,
    }
    if (onClipCompleted) {
      await onClipCompleted(clipResult)
    }
    return clipResult
  })

  const totalPanelCount = clipPanels.reduce((sum, item) => sum + item.finalPanels.length, 0)

  const mapToRecord = <T>(source: Map<string, T>): Record<string, T> => {
    const output: Record<string, T> = {}
    for (const [key, value] of source.entries()) {
      output[key] = value
    }
    return output
  }

  return {
    clipPanels,
    phase1PanelsByClipId: mapToRecord(phase1PanelsByClipId),
    phase2CinematographyByClipId: mapToRecord(phase2CinematographyByClipId),
    phase2ActingByClipId: mapToRecord(phase2ActingByClipId),
    phase3PanelsByClipId: mapToRecord(phase3PanelsByClipId),
    summary: {
      clipCount: clips.length,
      totalPanelCount,
      totalStepCount,
    },
  }
}
