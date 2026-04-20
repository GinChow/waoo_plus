import { safeParseJsonArray } from '@/lib/json-repair'
import { buildCharactersIntroduction } from '@/lib/constants'
import { normalizeAnyError } from '@/lib/errors/normalize'
import { createScopedLogger } from '@/lib/logging/core'
import { mapWithConcurrency } from '@/lib/async/map-with-concurrency'
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
  getFilteredLocationsDescription,
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
  phase2CinematographyTemplate: string
  phase2ActingTemplate: string
  phase3DetailTemplate: string
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

    return {
      ...panel,
      photographyPlan: buildUnifiedPhotographyPlan(rules, panel),
      actingNotes: acting.characters,
    }
  })
}

function buildPhase3PanelsInput(params: {
  planPanels: StoryboardPanel[]
  photographyRules: PhotographyRule[]
  actingDirections: ActingDirection[]
}) {
  const { planPanels, photographyRules, actingDirections } = params
  return planPanels.map((panel, index) => {
    const matchedRule = photographyRules.find((rule) => rule.panel_number === panel.panel_number) || photographyRules[index]
    const matchedActing = actingDirections.find((item) => item.panel_number === panel.panel_number) || actingDirections[index]
    if (!matchedRule) {
      throw new Error(`Missing cinematography rule for panel_number=${String(panel.panel_number)} at index=${index}`)
    }
    if (!matchedActing) {
      throw new Error(`Missing acting direction for panel_number=${String(panel.panel_number)} at index=${index}`)
    }
    return {
      ...panel,
      photography_rules: matchedRule,
      acting_notes: matchedActing,
    }
  })
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
    const merged = {
      ...planPanel,
      ...matchedRule,
      characters: planPanel.characters,
      ...(rawPhase3 || {}),
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

function shouldRetryStepError(error: unknown, message: string, retryable: boolean) {
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
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= maxStepAttempts; attempt++) {
    const meta = attempt === 1
      ? baseMeta
      : {
        ...baseMeta,
        stepId: baseMeta.stepId,
        stepAttempt: attempt,
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

  const totalStepCount = clips.length * 4 + 2
  const charactersLibName = (novelPromotionData.characters || []).map((c) => c.name).join(', ') || '无'
  const locationsLibName = (novelPromotionData.locations || []).map((l) => l.name).join(', ') || '无'
  const charactersIntroduction = buildCharactersIntroduction(novelPromotionData.characters || [])

  const phase1PanelsByClipId = new Map<string, StoryboardPanel[]>()
  const phase2CinematographyByClipId = new Map<string, PhotographyRule[]>()
  const phase2ActingByClipId = new Map<string, ActingDirection[]>()
  const phase3PanelsByClipId = new Map<string, StoryboardPanel[]>()

  const clipPanels = await mapWithConcurrency(
    clips,
    concurrency,
    async (clip, index): Promise<ClipStoryboardPanels> => {
      const clipIndex = index + 1
      const clipContent = typeof clip.content === 'string' ? clip.content.trim() : ''
      if (!clipContent) {
        throw new Error(`Clip ${formatClipId(clip)} content is empty`)
      }
      const clipCharacters = parseClipCharacters(clip.characters)
      const clipLocation = clip.location || null
      const clipProps = parseClipProps(clip.props ?? null)
      const filteredAppearanceList = getFilteredAppearanceList(novelPromotionData.characters || [], clipCharacters)
      const filteredFullDescription = getFilteredFullDescription(novelPromotionData.characters || [], clipCharacters)
      const filteredLocationsDescription = getFilteredLocationsDescription(
        novelPromotionData.locations || [],
        clipLocation,
        input.locale ?? 'zh',
      )
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
      const { parsed: planPanels } = await runStepWithRetry(
        runStep, phase1Meta, phase1Prompt, 'storyboard_phase1_plan', 2600,
        (text) => {
          const panels = parseJsonArray<StoryboardPanel>(text, `phase1:${formatClipId(clip)}`)
          if (panels.length === 0) {
            throw new Error(`Phase 1 returned empty panels for clip ${formatClipId(clip)}`)
          }
          return panels
        },
        maxStepAttempts,
      )
      phase1PanelsByClipId.set(clip.id, planPanels)

      if (onArtifact) {
        await onArtifact({
          clipId: clip.id,
          stepKey: `clip_${clip.id}_phase1`,
          artifactType: 'storyboard.clip.phase1',
          payload: { panels: planPanels },
        })
      }

      const phase2Meta = withStepMeta(
        `clip_${clip.id}_phase2_cinematography`,
        'progress.streamStep.cinematographyRules',
        clips.length + index * 3 + 1,
        totalStepCount,
        {
          dependsOn: [`clip_${clip.id}_phase1`],
          groupId: `clip_${clip.id}`,
          parallelKey: 'phase2',
          retryable: true,
        },
      )
      const phase2ActingMeta = withStepMeta(
        `clip_${clip.id}_phase2_acting`,
        'progress.streamStep.actingDirection',
        clips.length + index * 3 + 2,
        totalStepCount,
        {
          dependsOn: [`clip_${clip.id}_phase1`],
          groupId: `clip_${clip.id}`,
          parallelKey: 'phase2',
          retryable: true,
        },
      )
      const phase3Meta = withStepMeta(
        `clip_${clip.id}_phase3_detail`,
        'progress.streamStep.storyboardDetailRefine',
        clips.length + index * 3 + 3,
        totalStepCount,
        {
          dependsOn: [
            `clip_${clip.id}_phase2_cinematography`,
            `clip_${clip.id}_phase2_acting`,
          ],
          groupId: `clip_${clip.id}`,
          parallelKey: 'phase3',
          retryable: true,
        },
      )

      const phase2Prompt = promptTemplates.phase2CinematographyTemplate
        .replace('{panels_json}', JSON.stringify(planPanels, null, 2))
        .replace(/\{panel_count\}/g, String(planPanels.length))
        .replace('{locations_description}', filteredLocationsDescription)
        .replace('{characters_info}', filteredFullDescription)
        .replace('{props_description}', filteredPropsDescription)

      const phase2ActingPrompt = promptTemplates.phase2ActingTemplate
        .replace('{panels_json}', JSON.stringify(planPanels, null, 2))
        .replace(/\{panel_count\}/g, String(planPanels.length))
        .replace('{characters_info}', filteredFullDescription)

      const [
        { parsed: photographyRules },
        { parsed: actingDirections },
      ] = await Promise.all([
        runStepWithRetry(
          runStep, phase2Meta, phase2Prompt, 'storyboard_phase2_cinematography', 2400,
          (text) => parseJsonArray<PhotographyRule>(text, `phase2:${formatClipId(clip)}`),
          maxStepAttempts,
        ),
        runStepWithRetry(
          runStep, phase2ActingMeta, phase2ActingPrompt, 'storyboard_phase2_acting', 2400,
          (text) => parseJsonArray<ActingDirection>(text, `phase2-acting:${formatClipId(clip)}`),
          maxStepAttempts,
        ),
      ])

      phase2CinematographyByClipId.set(clip.id, photographyRules)
      phase2ActingByClipId.set(clip.id, actingDirections)

      const phase3PanelsInput = buildPhase3PanelsInput({
        planPanels,
        photographyRules,
        actingDirections,
      })
      const phase3Prompt = promptTemplates.phase3DetailTemplate
        .replace('{panels_json}', JSON.stringify(phase3PanelsInput, null, 2))
        .replace('{characters_age_gender}', filteredFullDescription)
        .replace('{locations_description}', filteredLocationsDescription)
        .replace('{props_description}', filteredPropsDescription)

      if (onArtifact) {
        await Promise.all([
          onArtifact({
            clipId: clip.id,
            stepKey: `clip_${clip.id}_phase2_cinematography`,
            artifactType: 'storyboard.clip.phase2.cine',
            payload: { rules: photographyRules },
          }),
          onArtifact({
            clipId: clip.id,
            stepKey: `clip_${clip.id}_phase2_acting`,
            artifactType: 'storyboard.clip.phase2.acting',
            payload: { directions: actingDirections },
          }),
        ])
      }

      const { parsed: rawPhase3Panels } = await runStepWithRetry(
        runStep, phase3Meta, phase3Prompt, 'storyboard_phase3_detail', 2600,
        (text) => parseJsonArray<StoryboardPanel>(text, `phase3:${formatClipId(clip)}`),
        maxStepAttempts,
      )

      const reconciledPhase3Panels = reconcilePhase3Panels({
        phase3Panels: rawPhase3Panels,
        planPanels,
        photographyRules,
        actingDirections,
      }).filter(
        (panel) => panel.description && panel.description !== '无' && panel.location !== '无',
      )
      if (reconciledPhase3Panels.length === 0) {
        throw new Error(`Phase 3 returned empty valid panels for clip ${formatClipId(clip)}`)
      }

      const normalizedPhase3Panels = hydrateFinalPanelCharactersWithPlanSlots({
        finalPanels: reconciledPhase3Panels,
        planPanels,
      })

      phase3PanelsByClipId.set(clip.id, normalizedPhase3Panels)

      if (onArtifact) {
        await onArtifact({
          clipId: clip.id,
          stepKey: `clip_${clip.id}_phase3_detail`,
          artifactType: 'storyboard.clip.phase3',
          payload: { panels: normalizedPhase3Panels },
        })
      }

      const clipResult = {
        clipId: clip.id,
        clipIndex,
        finalPanels: mergePanelsWithRules({
          finalPanels: normalizedPhase3Panels,
          photographyRules,
          actingDirections,
        }),
      }
      if (onClipCompleted) {
        await onClipCompleted(clipResult)
      }
      return clipResult
    },
  )

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
