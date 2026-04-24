import { safeParseJsonArray } from '@/lib/json-repair'
import { buildCharactersIntroduction } from '@/lib/constants'
import { normalizeAnyError } from '@/lib/errors/normalize'
import { TaskTerminatedError } from '@/lib/task/errors'
import type {
  ScriptToStoryboardPromptTemplates,
  ScriptToStoryboardStepMeta,
  ScriptToStoryboardStepOutput,
} from '@/lib/novel-promotion/script-to-storyboard/orchestrator'
import { listArtifacts } from '@/lib/run-runtime/service'
import {
  type ActingDirection,
  type CharacterAsset,
  type ClipCharacterRef,
  formatClipId,
  getFilteredAppearanceList,
  getFilteredFullDescription,
  type LocationAsset,
  type PropAsset,
  type PhotographyRule,
  type StoryboardPanel,
} from '@/lib/storyboard-phases'
import type { ClipPanelsResult, JsonRecord } from './script-to-storyboard-helpers'
import {
  buildPromptAssetContext,
  compileAssetPromptFragments,
} from '@/lib/assets/services/asset-prompt-context'

type StoryboardClipInput = {
  id: string
  content: string | null
  characters: string | null
  location: string | null
  props?: string | null
  screenplay: string | null
}

type CoarseStoryboardGroup = JsonRecord & {
  group_number?: number
}

export type StoryboardRetryPhase = 'phase1' | 'phase2_cinematography' | 'phase2_acting' | 'phase3_detail'

export type StoryboardRetryTarget = {
  stepKey: string
  clipId: string
  phase: StoryboardRetryPhase
}

export type ScriptToStoryboardAtomicRetryResult = {
  clipPanels: ClipPanelsResult[]
  phase1PanelsByClipId: Record<string, StoryboardPanel[]>
  phase2CinematographyByClipId: Record<string, PhotographyRule[]>
  phase2ActingByClipId: Record<string, ActingDirection[]>
  phase3PanelsByClipId: Record<string, StoryboardPanel[]>
  totalPanelCount: number
  totalStepCount: number
}

type StepRunner = (
  meta: ScriptToStoryboardStepMeta,
  prompt: string,
  action: string,
  maxOutputTokens: number,
) => Promise<ScriptToStoryboardStepOutput>

const DEFAULT_MAX_STEP_ATTEMPTS = 3
const MAX_RETRY_DELAY_MS = 10_000

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asObjectArray(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is JsonRecord => typeof item === 'object' && item !== null)
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

function parseScreenplay(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid clip screenplay JSON: ${error instanceof Error ? error.message : String(error)}`)
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

function parseJsonArray<T extends JsonRecord>(responseText: string, label: string): T[] {
  const rows = safeParseJsonArray(responseText)
  if (rows.length === 0) {
    throw new Error(`${label}: empty result`)
  }
  return rows as T[]
}

function shouldRetryStepError(error: unknown, message: string, retryable: boolean) {
  if (error instanceof TaskTerminatedError) return false
  if (error instanceof Error && error.name === 'TaskTerminatedError') return false
  const lowerTerminated = message.toLowerCase()
  if (
    lowerTerminated.includes('task terminated')
    || lowerTerminated.includes('terminated during')
    || lowerTerminated.includes('lease lost')
  ) {
    return false
  }
  if (retryable) return true
  const lowerMessage = message.toLowerCase()
  return lowerMessage.includes('json') || lowerMessage.includes('parse')
}

function computeRetryDelayMs(attempt: number) {
  const base = Math.min(1_000 * Math.pow(2, Math.max(0, attempt - 1)), MAX_RETRY_DELAY_MS)
  const jitter = Math.floor(Math.random() * 300)
  return base + jitter
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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
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

function readTextByKeys(record: Record<string, unknown> | null, keys: string[]): string {
  if (!record) return ''
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
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

function assignSequentialPanelNumbers(panels: StoryboardPanel[]) {
  return panels.map((panel, index) => ({
    ...panel,
    panel_number: index + 1,
  }))
}

function derivePhotographyRulesFromGuidancePanels(panels: StoryboardPanel[]): PhotographyRule[] {
  return panels.map((panel) => ({
    panel_number: panel.panel_number,
    lighting: panel.lighting as PhotographyRule['lighting'],
    camera_angle: asText((panel as JsonRecord).camera_angle),
    viewpoint_constraint: asText((panel as JsonRecord).viewpoint_constraint),
    depth_of_field: asText((panel as JsonRecord).depth_of_field),
    color_tone: asText((panel as JsonRecord).color_tone),
    focus_priority: asText((panel as JsonRecord).focus_priority),
    composition_note: asText((panel as JsonRecord).composition_note),
  }))
}

function deriveActingDirectionsFromGuidancePanels(panels: StoryboardPanel[]): ActingDirection[] {
  return panels.map((panel) => ({
    panel_number: panel.panel_number,
    characters: (panel as JsonRecord).acting_notes,
  }))
}

function extractArtifactRows<T extends JsonRecord>(payload: unknown, key: string): T[] {
  const record = asObject(payload)
  if (!record) return []
  return asObjectArray(record[key]) as T[]
}

function extractArtifactPanelGroups(payload: unknown, key: string): StoryboardPanel[][] {
  const record = asObject(payload)
  if (!record || !Array.isArray(record[key])) return []
  return (record[key] as unknown[]).reduce<StoryboardPanel[][]>((acc, item) => {
    const row = asObject(item)
    if (!row) return acc
    const panels = asObjectArray(row.panels) as StoryboardPanel[]
    if (panels.length > 0) {
      acc.push(panels)
    }
    return acc
  }, [])
}

async function readArtifactRows<T extends JsonRecord>(params: {
  runId: string
  clipId: string
  artifactType: string
  key: string
}) {
  const rows = await listArtifacts({
    runId: params.runId,
    artifactType: params.artifactType,
    refId: params.clipId,
    limit: 1,
  })
  const artifact = rows[0]
  if (!artifact) return []
  return extractArtifactRows<T>(artifact.payload, params.key)
}

async function readArtifactPanelGroups(params: {
  runId: string
  clipId: string
  artifactType: string
  key: string
}) {
  const rows = await listArtifacts({
    runId: params.runId,
    artifactType: params.artifactType,
    refId: params.clipId,
    limit: 1,
  })
  const artifact = rows[0]
  if (!artifact) return []
  return extractArtifactPanelGroups(artifact.payload, params.key)
}

function getStepNumbers(params: {
  phase: StoryboardRetryPhase
  clipIndex: number
  totalClipCount: number
}) {
  const zeroBasedClipIndex = params.clipIndex
  const totalStepCount = params.totalClipCount * 4 + 2
  if (params.phase === 'phase1') {
    return { stepIndex: zeroBasedClipIndex + 1, stepTotal: totalStepCount }
  }
  if (params.phase === 'phase2_cinematography') {
    return {
      stepIndex: params.totalClipCount + zeroBasedClipIndex * 3 + 1,
      stepTotal: totalStepCount,
    }
  }
  if (params.phase === 'phase2_acting') {
    return {
      stepIndex: params.totalClipCount + zeroBasedClipIndex * 3 + 2,
      stepTotal: totalStepCount,
    }
  }
  return {
    stepIndex: params.totalClipCount + zeroBasedClipIndex * 3 + 3,
    stepTotal: totalStepCount,
  }
}

function buildStepMeta(params: {
  target: StoryboardRetryTarget
  clipIndex: number
  totalClipCount: number
}): ScriptToStoryboardStepMeta {
  const stepNumbers = getStepNumbers({
    phase: params.target.phase,
    clipIndex: params.clipIndex,
    totalClipCount: params.totalClipCount,
  })
  const stepKey = params.target.stepKey
  const groupId = `clip_${params.target.clipId}`

  if (params.target.phase === 'phase1') {
    return {
      stepId: stepKey,
      stepTitle: 'progress.streamStep.storyboardPlan',
      stepIndex: stepNumbers.stepIndex,
      stepTotal: stepNumbers.stepTotal,
      groupId,
      parallelKey: 'phase1',
      retryable: true,
    }
  }
  if (params.target.phase === 'phase2_cinematography') {
    return {
      stepId: stepKey,
      stepTitle: 'progress.streamStep.storyboardGroupSplit',
      stepIndex: stepNumbers.stepIndex,
      stepTotal: stepNumbers.stepTotal,
      dependsOn: [`clip_${params.target.clipId}_phase1`],
      groupId,
      parallelKey: 'phase2',
      retryable: true,
    }
  }
  if (params.target.phase === 'phase2_acting') {
    return {
      stepId: stepKey,
      stepTitle: 'progress.streamStep.actingDirection',
      stepIndex: stepNumbers.stepIndex,
      stepTotal: stepNumbers.stepTotal,
      dependsOn: [`clip_${params.target.clipId}_phase1`],
      groupId,
      parallelKey: 'phase2',
      retryable: true,
    }
  }
  return {
    stepId: stepKey,
    stepTitle: 'progress.streamStep.storyboardDetailRefine',
    stepIndex: stepNumbers.stepIndex,
    stepTotal: stepNumbers.stepTotal,
    dependsOn: [
      `clip_${params.target.clipId}_phase2_cinematography`,
      `clip_${params.target.clipId}_phase2_acting`,
    ],
    groupId,
    parallelKey: 'phase3',
    retryable: true,
  }
}

async function runStepWithRetry<T>(params: {
  runStep: StepRunner
  baseMeta: ScriptToStoryboardStepMeta
  prompt: string
  action: string
  maxOutputTokens: number
  parse: (text: string) => T
  retryStepAttempt: number
  maxStepAttempts: number
}) {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= params.maxStepAttempts; attempt += 1) {
    const stepAttempt = params.retryStepAttempt + attempt - 1
    const meta: ScriptToStoryboardStepMeta = {
      ...params.baseMeta,
      stepAttempt,
    }
    try {
      const output = await params.runStep(meta, params.prompt, params.action, params.maxOutputTokens)
      const parsed = params.parse(output.text)
      return parsed
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      const normalized = normalizeAnyError(error, { context: 'worker' })
      const shouldRetry = attempt < params.maxStepAttempts
        && shouldRetryStepError(error, normalized.message, normalized.retryable)
      if (!shouldRetry) break
      const retryDelayMs = computeRetryDelayMs(attempt)
      await wait(retryDelayMs)
    }
  }
  throw lastError || new Error('step execution failed')
}

function mergePanelsWithRules(params: {
  finalPanels: StoryboardPanel[]
  photographyRules: PhotographyRule[]
  actingDirections: ActingDirection[]
}) {
  const { finalPanels, photographyRules, actingDirections } = params
  return finalPanels.map((panel, index) => {
    const rule = photographyRules.find((item) => item.panel_number === panel.panel_number)
    if (!rule) {
      throw new Error(`Missing photography rule for panel_number=${String(panel.panel_number)} at index=${index}`)
    }
    const acting = actingDirections.find((item) => item.panel_number === panel.panel_number)
    if (!acting) {
      throw new Error(`Missing acting direction for panel_number=${String(panel.panel_number)} at index=${index}`)
    }
    return {
      ...panel,
      photographyPlan: buildUnifiedPhotographyPlan(rule, panel),
      actingNotes: acting.characters,
    }
  })
}

function requireRows<T>(rows: T[], label: string) {
  if (rows.length === 0) {
    throw new Error(`missing dependency artifact: ${label}`)
  }
  return rows
}

export function parseStoryboardRetryTarget(stepKey: string): StoryboardRetryTarget | null {
  const trimmed = stepKey.trim()
  if (!trimmed) return null
  const match = /^clip_(.+)_(phase1|phase2_cinematography|phase2_acting|phase3_detail)$/.exec(trimmed)
  if (!match) return null
  const clipId = (match[1] || '').trim()
  const phase = match[2] as StoryboardRetryPhase
  if (!clipId) return null
  return {
    stepKey: trimmed,
    clipId,
    phase,
  }
}

export async function runScriptToStoryboardAtomicRetry(params: {
  runId: string
  retryTarget: StoryboardRetryTarget
  retryStepAttempt: number
  maxStepAttempts?: number
  locale?: 'zh' | 'en'
  clip: StoryboardClipInput
  clipIndex: number
  totalClipCount: number
  novelPromotionData: {
    characters: CharacterAsset[]
    locations: LocationAsset[]
    props?: PropAsset[]
  }
  promptTemplates: ScriptToStoryboardPromptTemplates
  runStep: StepRunner
}): Promise<ScriptToStoryboardAtomicRetryResult> {
  const maxStepAttempts =
    typeof params.maxStepAttempts === 'number' && Number.isFinite(params.maxStepAttempts)
      ? Math.max(1, Math.floor(params.maxStepAttempts))
      : DEFAULT_MAX_STEP_ATTEMPTS

  const clipCharacters = parseClipCharacters(params.clip.characters)
  const clipLocation = params.clip.location || null
  const clipProps = parseClipProps(params.clip.props ?? null)
  const filteredAppearanceList = getFilteredAppearanceList(params.novelPromotionData.characters || [], clipCharacters)
  const filteredFullDescription = getFilteredFullDescription(params.novelPromotionData.characters || [], clipCharacters)
  const filteredPropsDescription = compileAssetPromptFragments(buildPromptAssetContext({
    characters: [],
    locations: [],
    props: params.novelPromotionData.props || [],
    clipCharacters: [],
    clipLocation: null,
    clipProps,
  })).propsDescriptionText
  const baseMeta = buildStepMeta({
    target: params.retryTarget,
    clipIndex: params.clipIndex,
    totalClipCount: params.totalClipCount,
  })

  const phase1PanelsByClipId: Record<string, StoryboardPanel[]> = {}
  const phase2CinematographyByClipId: Record<string, PhotographyRule[]> = {}
  const phase2ActingByClipId: Record<string, ActingDirection[]> = {}
  const phase3PanelsByClipId: Record<string, StoryboardPanel[]> = {}
  const clipPanels: ClipPanelsResult[] = []

  let phase1Groups = await readArtifactRows<CoarseStoryboardGroup>({
    runId: params.runId,
    clipId: params.retryTarget.clipId,
    artifactType: 'storyboard.clip.phase1',
    key: 'panels',
  })
  let finePanelGroups = await readArtifactPanelGroups({
    runId: params.runId,
    clipId: params.retryTarget.clipId,
    artifactType: 'storyboard.clip.phase2.cine',
    key: 'fine_groups',
  })
  let phase2Rules = await readArtifactRows<PhotographyRule>({
    runId: params.runId,
    clipId: params.retryTarget.clipId,
    artifactType: 'storyboard.clip.phase2.acting',
    key: 'rules',
  })
  if (phase2Rules.length === 0) {
    phase2Rules = await readArtifactRows<PhotographyRule>({
      runId: params.runId,
      clipId: params.retryTarget.clipId,
      artifactType: 'storyboard.clip.phase2.cine',
      key: 'rules',
    })
  }
  let phase2Acting = await readArtifactRows<ActingDirection>({
    runId: params.runId,
    clipId: params.retryTarget.clipId,
    artifactType: 'storyboard.clip.phase2.acting',
    key: 'directions',
  })
  let fineGroupsWithGuidance = await readArtifactPanelGroups({
    runId: params.runId,
    clipId: params.retryTarget.clipId,
    artifactType: 'storyboard.clip.phase2.acting',
    key: 'fine_groups_with_guidance',
  })
  let phase3Panels = await readArtifactRows<StoryboardPanel>({
    runId: params.runId,
    clipId: params.retryTarget.clipId,
    artifactType: 'storyboard.clip.phase3',
    key: 'panels',
  })
  if (finePanelGroups.length === 0 && phase1Groups.length > 0) {
    finePanelGroups = [phase1Groups as StoryboardPanel[]]
  }
  if (fineGroupsWithGuidance.length === 0 && finePanelGroups.length > 0 && phase2Rules.length > 0 && phase2Acting.length > 0) {
    fineGroupsWithGuidance = [
      buildFinePanelsWithCinematography({
        finePanels: finePanelGroups[0] || [],
        photographyRules: phase2Rules,
        actingDirections: phase2Acting,
      }),
    ]
  }
  const charactersLibName = (params.novelPromotionData.characters || []).map((item) => item.name).join(', ') || '无'
  const locationsLibName = (params.novelPromotionData.locations || []).map((item) => item.name).join(', ') || '无'
  const charactersIntroduction = buildCharactersIntroduction(params.novelPromotionData.characters || [])
  const phase2GroupSplitTemplate = params.promptTemplates.phase2GroupSplitTemplate || '{coarse_storyboard_group}'

  if (params.retryTarget.phase === 'phase1') {
    const clipContent = typeof params.clip.content === 'string' ? params.clip.content.trim() : ''
    if (!clipContent) {
      throw new Error(`Clip ${formatClipId(params.clip)} content is empty`)
    }
    const clipJson = JSON.stringify(
      {
        id: params.clip.id,
        content: clipContent,
        characters: clipCharacters,
        location: clipLocation,
        props: clipProps,
      },
      null,
      2,
    )
    let phase1Prompt = params.promptTemplates.phase1PlanTemplate
      .replace('{characters_lib_name}', charactersLibName)
      .replace('{locations_lib_name}', locationsLibName)
      .replace('{characters_introduction}', charactersIntroduction)
      .replace('{characters_appearance_list}', filteredAppearanceList)
      .replace('{characters_full_description}', filteredFullDescription)
      .replace('{props_description}', filteredPropsDescription)
      .replace('{clip_json}', clipJson)
    const screenplay = parseScreenplay(params.clip.screenplay)
    if (screenplay) {
      phase1Prompt = phase1Prompt.replace('{clip_content}', `【剧本格式】\n${JSON.stringify(screenplay, null, 2)}`)
    } else {
      phase1Prompt = phase1Prompt.replace('{clip_content}', clipContent)
    }
    phase1Groups = await runStepWithRetry({
      runStep: params.runStep,
      baseMeta,
      prompt: phase1Prompt,
      action: 'storyboard_phase1_plan',
      maxOutputTokens: 2600,
      parse: (text) => {
        const panels = parseJsonArray<CoarseStoryboardGroup>(text, `phase1:${formatClipId(params.clip)}`)
        if (panels.length === 0) {
          throw new Error(`Phase 1 returned empty coarse groups for clip ${formatClipId(params.clip)}`)
        }
        return panels
      },
      retryStepAttempt: params.retryStepAttempt,
      maxStepAttempts,
    })
    phase1PanelsByClipId[params.clip.id] = phase1Groups as StoryboardPanel[]
  } else if (params.retryTarget.phase === 'phase2_cinematography') {
    const coarseGroups = requireRows(phase1Groups, 'storyboard.clip.phase1')
    finePanelGroups = []
    for (let groupIndex = 0; groupIndex < coarseGroups.length; groupIndex += 1) {
      const coarseGroup = coarseGroups[groupIndex]
      const splitPrompt = phase2GroupSplitTemplate
        .replace('{characters_lib_name}', charactersLibName)
        .replace('{locations_lib_name}', locationsLibName)
        .replace('{characters_introduction}', charactersIntroduction)
        .replace('{characters_appearance_list}', filteredAppearanceList)
        .replace('{characters_full_description}', filteredFullDescription)
        .replace('{props_description}', filteredPropsDescription)
        .replace('{coarse_storyboard_group}', JSON.stringify(coarseGroup, null, 2))
        .replace('{adjacent_groups_context}', buildAdjacentCoarseGroupsContext(coarseGroups, groupIndex))
      const finePanels = await runStepWithRetry({
        runStep: params.runStep,
        baseMeta,
        prompt: splitPrompt,
        action: 'storyboard_phase2_cinematography',
        maxOutputTokens: 2600,
        parse: (text) => parseJsonArray<StoryboardPanel>(text, `phase2-split:${formatClipId(params.clip)}:group-${groupIndex + 1}`),
        retryStepAttempt: params.retryStepAttempt,
        maxStepAttempts,
      })
      finePanelGroups.push(finePanels.map((panel, panelIndex) => ({
        ...panel,
        panel_number: typeof panel.panel_number === 'number' ? panel.panel_number : panelIndex + 1,
      })))
    }
  } else if (params.retryTarget.phase === 'phase2_acting') {
    const groupedFinePanels = requireRows(finePanelGroups, 'storyboard.clip.phase2.cine')
    fineGroupsWithGuidance = []
    phase2Rules = []
    phase2Acting = []
    for (let groupIndex = 0; groupIndex < groupedFinePanels.length; groupIndex += 1) {
      const finePanels = groupedFinePanels[groupIndex]
      const adjacentContext = buildAdjacentFineGroupContext(groupedFinePanels, groupIndex)
      const cinematographyMeta: ScriptToStoryboardStepMeta = {
        ...baseMeta,
        stepId: `clip_${params.retryTarget.clipId}_phase3_cinematography`,
        stepAttempt: groupIndex + 1,
        stepTitle: resolveGuidanceProgressTitle({
          locale: params.locale,
          kind: 'cinematography',
          current: groupIndex + 1,
          total: groupedFinePanels.length,
        }),
      }
      const actingMeta: ScriptToStoryboardStepMeta = {
        ...baseMeta,
        stepAttempt: groupIndex + 1,
        stepTitle: resolveGuidanceProgressTitle({
          locale: params.locale,
          kind: 'acting',
          current: groupIndex + 1,
          total: groupedFinePanels.length,
        }),
      }
      const cinematographyPrompt = params.promptTemplates.phase2CinematographyTemplate
        .replace('{characters_lib_name}', charactersLibName)
        .replace('{locations_lib_name}', locationsLibName)
        .replace('{characters_introduction}', charactersIntroduction)
        .replace('{characters_appearance_list}', filteredAppearanceList)
        .replace('{characters_full_description}', filteredFullDescription)
        .replace('{props_description}', filteredPropsDescription)
        .replace('{fine_storyboard_group}', JSON.stringify(finePanels, null, 2))
        .replace('{adjacent_context}', adjacentContext)
      const actingPrompt = params.promptTemplates.phase2ActingTemplate
        .replace('{panels_json}', JSON.stringify(finePanels, null, 2))
        .replace(/\{panel_count\}/g, String(finePanels.length))
        .replace('{characters_info}', filteredFullDescription)
        .replace('{adjacent_context}', adjacentContext)
      const [photographyRules, actingDirections] = await Promise.all([
        runStepWithRetry({
          runStep: params.runStep,
          baseMeta: cinematographyMeta,
          prompt: cinematographyPrompt,
          action: 'storyboard_phase2_cinematography',
          maxOutputTokens: 2400,
          parse: (text) => parseJsonArray<PhotographyRule>(text, `phase3-cine:${formatClipId(params.clip)}:group-${groupIndex + 1}`),
          retryStepAttempt: cinematographyMeta.stepAttempt || 1,
          maxStepAttempts,
        }),
        runStepWithRetry({
          runStep: params.runStep,
          baseMeta: actingMeta,
          prompt: actingPrompt,
          action: 'storyboard_phase2_acting',
          maxOutputTokens: 2400,
          parse: (text) => parseJsonArray<ActingDirection>(text, `phase3-acting:${formatClipId(params.clip)}:group-${groupIndex + 1}`),
          retryStepAttempt: actingMeta.stepAttempt || 1,
          maxStepAttempts,
        }),
      ])
      phase2Rules.push(...photographyRules)
      phase2Acting.push(...actingDirections)
      fineGroupsWithGuidance.push(buildFinePanelsWithCinematography({
        finePanels,
        photographyRules,
        actingDirections,
      }))
    }
    phase2CinematographyByClipId[params.clip.id] = phase2Rules
    phase2ActingByClipId[params.clip.id] = phase2Acting
  } else {
    const groupedFinePanels = requireRows(finePanelGroups, 'storyboard.clip.phase2.cine')
    const groupedGuidancePanels = requireRows(fineGroupsWithGuidance, 'storyboard.clip.phase2.acting')
    const finalPanelsByGroup: StoryboardPanel[][] = []
    phase2Rules = []
    phase2Acting = []
    for (let groupIndex = 0; groupIndex < groupedFinePanels.length; groupIndex += 1) {
      const finePanels = groupedFinePanels[groupIndex] || []
      const guidancePanels = groupedGuidancePanels[groupIndex] || []
      const photographyRules = derivePhotographyRulesFromGuidancePanels(guidancePanels)
      const actingDirections = deriveActingDirectionsFromGuidancePanels(guidancePanels)
      phase2Rules.push(...photographyRules)
      phase2Acting.push(...actingDirections)
      const detailMeta: ScriptToStoryboardStepMeta = {
        ...baseMeta,
        stepAttempt: groupIndex + 1,
        stepTitle: resolveDetailProgressTitle({
          locale: params.locale,
          current: groupIndex + 1,
          total: groupedFinePanels.length,
        }),
      }
      const detailPrompt = params.promptTemplates.phase3DetailTemplate
        .replace('{characters_lib_name}', charactersLibName)
        .replace('{locations_lib_name}', locationsLibName)
        .replace('{characters_introduction}', charactersIntroduction)
        .replace('{characters_appearance_list}', filteredAppearanceList)
        .replace('{characters_full_description}', filteredFullDescription)
        .replace('{props_description}', filteredPropsDescription)
        .replace('{fine_storyboard_group_with_cinematography}', JSON.stringify(guidancePanels, null, 2))
        .replace('{adjacent_context}', buildAdjacentFineGroupContext(groupedGuidancePanels, groupIndex))
      const rawDetailedPanels = await runStepWithRetry({
        runStep: params.runStep,
        baseMeta: detailMeta,
        prompt: detailPrompt,
        action: 'storyboard_phase3_detail',
        maxOutputTokens: 2600,
        parse: (text) => parseJsonArray<StoryboardPanel>(text, `phase4:${formatClipId(params.clip)}:group-${groupIndex + 1}`),
        retryStepAttempt: detailMeta.stepAttempt || 1,
        maxStepAttempts,
      })
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
      finalPanelsByGroup.push(mergePanelsWithRules({
        finalPanels: normalizedPanels,
        photographyRules,
        actingDirections,
      }))
    }
    phase3Panels = assignSequentialPanelNumbers(finalPanelsByGroup.flat())
    phase2CinematographyByClipId[params.clip.id] = phase2Rules
    phase2ActingByClipId[params.clip.id] = phase2Acting
    phase3PanelsByClipId[params.clip.id] = phase3Panels
  }

  if (params.retryTarget.phase !== 'phase1') {
    const basePanels = requireRows(phase3Panels, 'storyboard.clip.phase3')
    const currentRules = requireRows(phase2Rules, 'storyboard.clip.phase2.acting.rules')
    const currentActing = requireRows(phase2Acting, 'storyboard.clip.phase2.acting')
    const finalPanels = mergePanelsWithRules({
      finalPanels: basePanels,
      photographyRules: currentRules,
      actingDirections: currentActing,
    })
    clipPanels.push({
      clipId: params.clip.id,
      clipIndex: params.clipIndex + 1,
      finalPanels,
    })
  }

  const totalPanelCount = clipPanels.reduce((sum, item) => sum + item.finalPanels.length, 0)
  return {
    clipPanels,
    phase1PanelsByClipId,
    phase2CinematographyByClipId,
    phase2ActingByClipId,
    phase3PanelsByClipId,
    totalPanelCount,
    totalStepCount: params.totalClipCount * 4 + 2,
  }
}
