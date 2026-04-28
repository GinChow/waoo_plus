import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { getArtStylePrompt } from '@/lib/constants'
import { createScopedLogger } from '@/lib/logging/core'
import { type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '../shared'
import {
  assertTaskActive,
  getProjectModels,
  resolveImageSourceFromGeneration,
  uploadImageSourceToCos,
} from '../utils'
import { normalizeReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import {
  AnyObj,
  clampCount,
  collectPanelReferenceImages,
  findCharacterByName,
  parsePanelCharacterReferences,
  pickFirstString,
  resolveNovelData,
} from './image-task-handler-shared'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'
import {
  parseLocationAvailableSlots,
} from '@/lib/location-available-slots'

function parseJsonUnknown(raw: string | null | undefined): unknown | null {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

type CoarseGroupImageState = {
  groupNumber: number
  imagePrompt: string
  videoPrompt: string
  imageUrl: string | null
  candidateImages: string[] | null
  updatedAt: string
}

function parseParentGroupByPanelNumber(raw: string | null | undefined): Map<number, number> {
  if (!raw) return new Map()
  try {
    const parsed = JSON.parse(raw)
    const mapping = new Map<number, number>()
    if (!Array.isArray(parsed)) return mapping
    for (const item of parsed) {
      if (Array.isArray(item) && item.length >= 2 && typeof item[0] === 'number' && typeof item[1] === 'number') {
        mapping.set(item[0], item[1])
        continue
      }
      if (
        item
        && typeof item === 'object'
        && typeof (item as { panel_number?: unknown }).panel_number === 'number'
        && typeof (item as { parent_group_number?: unknown }).parent_group_number === 'number'
      ) {
        mapping.set(
          (item as { panel_number: number }).panel_number,
          (item as { parent_group_number: number }).parent_group_number,
        )
      }
    }
    return mapping
  } catch {
    return new Map()
  }
}

function parseCoarseGroupsJson(raw: string | null | undefined): CoarseGroupImageState[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item): CoarseGroupImageState[] => {
      if (!item || typeof item !== 'object') return []
      const record = item as Partial<CoarseGroupImageState>
      if (typeof record.groupNumber !== 'number') return []
      return [{
        groupNumber: record.groupNumber,
        imagePrompt: typeof record.imagePrompt === 'string' ? record.imagePrompt : '',
        videoPrompt: typeof record.videoPrompt === 'string' ? record.videoPrompt : '',
        imageUrl: typeof record.imageUrl === 'string' ? record.imageUrl : null,
        candidateImages: Array.isArray(record.candidateImages)
          ? record.candidateImages.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          : null,
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
      }]
    })
  } catch {
    return []
  }
}

function upsertCoarseGroupState(params: {
  raw: string | null | undefined
  groupNumber: number
  imagePrompt: string
  videoPrompt: string
  imageUrl: string | null
  candidateImages: string[] | null
}) {
  const groups = parseCoarseGroupsJson(params.raw).filter((group) => group.groupNumber !== params.groupNumber)
  groups.push({
    groupNumber: params.groupNumber,
    imagePrompt: params.imagePrompt,
    videoPrompt: params.videoPrompt,
    imageUrl: params.imageUrl,
    candidateImages: params.candidateImages,
    updatedAt: new Date().toISOString(),
  })
  groups.sort((left, right) => left.groupNumber - right.groupNumber)
  return JSON.stringify(groups, null, 2)
}

function parseDescriptionList(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

function pickPanelImagePrompt(panel: {
  shotType: string | null
  cameraMove: string | null
  description: string | null
  imagePrompt: string | null
  firstLastFramePrompt?: string | null
  location: string | null
}): string {
  const base = panel.imagePrompt || panel.firstLastFramePrompt || panel.description || '无画面描述'
  const tags = [
    panel.shotType,
    panel.cameraMove,
    panel.location ? `场景：${panel.location}` : null,
  ].filter(Boolean).join('/')
  return tags ? `(${tags})${base}` : base
}

function pickPanelVideoPrompt(panel: {
  videoPrompt: string | null
  description: string | null
}): string {
  return panel.videoPrompt || panel.description || '无视频描述'
}

function buildCoarseGroupImagePrompt(panels: Array<{
  panelIndex: number
  panelNumber: number | null
  shotType: string | null
  cameraMove: string | null
  description: string | null
  imagePrompt: string | null
  firstLastFramePrompt?: string | null
  location: string | null
}>) {
  const sortedPanels = [...panels].sort((left, right) => left.panelIndex - right.panelIndex)
  const countText = sortedPanels.length === 9 ? '九宫格' : `${sortedPanels.length}宫格`
  const rows = sortedPanels.map((panel, index) => {
    return `分镜${index + 1}: ${pickPanelImagePrompt(panel)}`
  })
  return [
    `【${countText}版本分镜 提示词】：`,
    '生成一张多宫格分镜图片，所有格子属于同一个粗镜头，必须保持角色外貌、服装、场景、光线、色彩和镜头连续性一致。',
    '从左到右从上到下：',
    ...rows,
  ].join('\n')
}

function buildCoarseGroupVideoPrompt(panels: Array<{
  panelIndex: number
  duration: number | null
  videoPrompt: string | null
  description: string | null
}>) {
  const sortedPanels = [...panels].sort((left, right) => left.panelIndex - right.panelIndex)
  let cursor = 0
  return sortedPanels.map((panel) => {
    const current = cursor
    cursor += typeof panel.duration === 'number' && Number.isFinite(panel.duration) && panel.duration > 0
      ? panel.duration
      : 0.5
    return `[${current.toFixed(2)}秒]${pickPanelVideoPrompt(panel)}`
  }).join('\n')
}

function pickAppearanceDescription(appearance: {
  descriptions?: string | null
  description?: string | null
  selectedIndex?: number | null
}): string {
  const descriptions = parseDescriptionList(appearance.descriptions || null)
  if (descriptions.length > 0) {
    const selectedIndex = typeof appearance.selectedIndex === 'number' ? appearance.selectedIndex : 0
    const selected = descriptions[selectedIndex] || descriptions[0]
    if (selected && selected.trim()) return selected.trim()
  }
  if (typeof appearance.description === 'string' && appearance.description.trim()) {
    return appearance.description.trim()
  }
  return '无描述'
}

function buildPanelPromptContext(params: {
  panel: {
    id: string
    shotType: string | null
    cameraMove: string | null
    description: string | null
    imagePrompt: string | null
    videoPrompt: string | null
    location: string | null
    characters: string | null
    srtSegment: string | null
    photographyRules: string | null
    actingNotes: string | null
  }
  projectData: Awaited<ReturnType<typeof resolveNovelData>>
}) {
  const panelCharacters = parsePanelCharacterReferences(params.panel.characters)
  const characterContexts = panelCharacters.map((reference) => {
    const character = findCharacterByName(params.projectData.characters || [], reference.name)
    if (!character) {
      return {
        name: reference.name,
        appearance: reference.appearance || null,
        description: '无角色外貌数据',
      }
    }

    const appearances = character.appearances || []
    const matchedAppearance =
      (reference.appearance
        ? appearances.find((appearance) => (appearance.changeReason || '').toLowerCase() === reference.appearance!.toLowerCase())
        : null) || appearances[0] || null

    return {
      name: character.name,
      appearance: matchedAppearance?.changeReason || null,
      description: matchedAppearance ? pickAppearanceDescription(matchedAppearance) : '无角色外貌数据',
      slot: reference.slot || null,
    }
  })

  const locationContext = (() => {
    if (!params.panel.location) return null
    const matchedLocation = (params.projectData.locations || []).find(
      (item) => item.name.toLowerCase() === params.panel.location!.toLowerCase(),
    )
    if (!matchedLocation) return null
    const selectedImage = (matchedLocation.images || []).find((item) => item.isSelected) || matchedLocation.images?.[0]
    return {
      name: matchedLocation.name,
      description: selectedImage?.description || null,
      available_slots: parseLocationAvailableSlots(selectedImage?.availableSlots),
    }
  })()

  return {
    panel: {
      panel_id: params.panel.id,
      shot_type: params.panel.shotType || '',
      camera_move: params.panel.cameraMove || '',
      description: params.panel.description || '',
      image_prompt: params.panel.imagePrompt || '',
      video_prompt: params.panel.videoPrompt || '',
      location: params.panel.location || '',
      characters: panelCharacters,
      source_text: params.panel.srtSegment || '',
      photography_rules: parseJsonUnknown(params.panel.photographyRules),
      acting_notes: parseJsonUnknown(params.panel.actingNotes),
    },
    context: {
      character_appearances: characterContexts,
      location_reference: locationContext,
    },
  }
}

function buildPanelPrompt(params: {
  locale: TaskJobData['locale']
  aspectRatio: string
  styleText: string
  sourceText: string
  contextJson: string
}) {
  return buildPrompt({
    promptId: PROMPT_IDS.NP_SINGLE_PANEL_IMAGE,
    locale: params.locale,
    variables: {
      aspect_ratio: params.aspectRatio,
      storyboard_text_json_input: params.contextJson,
      source_text: params.sourceText || '无',
      style: params.styleText,
    },
  })
}

export async function handlePanelImageTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const panelId = pickFirstString(payload.panelId, job.data.targetId)
  if (!panelId) throw new Error('panelId missing')

  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
  })

  if (!panel) throw new Error('Panel not found')

  const projectData = await resolveNovelData(job.data.projectId)
  const modelConfig = await getProjectModels(job.data.projectId, job.data.userId)
  const modelKey = modelConfig.storyboardModel
  if (!modelKey) throw new Error('Storyboard model not configured')

  const candidateCount = clampCount(payload.candidateCount ?? payload.count, 1, 4, 1)
  const refs = await collectPanelReferenceImages(projectData, panel)
  const normalizedRefs = await normalizeReferenceImagesForGeneration(refs)

  const logger = createScopedLogger({
    module: 'worker.panel-image',
    action: 'panel_image_generate',
    requestId: job.data.trace?.requestId || undefined,
    taskId: job.data.taskId,
    projectId: job.data.projectId,
    userId: job.data.userId,
  })
  logger.info({
    message: 'panel image generation started',
    details: {
      panelId,
      modelKey,
      candidateCount,
      referenceImagesRawCount: refs.length,
      referenceImagesNormalizedCount: normalizedRefs.length,
      rawUrls: refs.map((u) => u.substring(0, 100)),
      normalizedUrls: normalizedRefs.map((u) => u.substring(0, 100)),
      panelCharacters: panel.characters,
      panelLocation: panel.location,
      artStyle: modelConfig.artStyle,
    },
  })

  const artStyle = getArtStylePrompt(modelConfig.artStyle, job.data.locale)
  if (!projectData.videoRatio) throw new Error('Project videoRatio not configured')
  const aspectRatio = projectData.videoRatio
  const promptContext = buildPanelPromptContext({
    panel: {
      id: panel.id,
      shotType: panel.shotType,
      cameraMove: panel.cameraMove,
      description: panel.description,
      imagePrompt: panel.imagePrompt,
      videoPrompt: panel.videoPrompt,
      location: panel.location,
      characters: panel.characters,
      srtSegment: panel.srtSegment,
      photographyRules: panel.photographyRules,
      actingNotes: panel.actingNotes,
    },
    projectData,
  })
  const contextJson = JSON.stringify(promptContext, null, 2)
  const prompt = buildPanelPrompt({
    locale: job.data.locale,
    aspectRatio,
    styleText: artStyle || '与参考图风格一致',
    sourceText: panel.srtSegment || panel.description || '',
    contextJson,
  })
  logger.info({
    message: 'panel image prompt resolved',
    details: {
      promptLength: prompt.length,
    },
  })

  const candidates: string[] = []

  for (let i = 0; i < candidateCount; i++) {
    await reportTaskProgress(job, 18 + Math.floor((i / Math.max(candidateCount, 1)) * 58), {
      stage: 'generate_panel_candidate',
      candidateIndex: i,
    })

    const source = await resolveImageSourceFromGeneration(job, {
      userId: job.data.userId,
      modelId: modelKey,
      prompt,
      options: {
        referenceImages: normalizedRefs,
        aspectRatio,
      },
      // 单个任务内会串行生成多候选，若允许按 task.externalId 续接会复用上一候选外部任务结果。
      allowTaskExternalIdResume: candidateCount === 1,
      pollProgress: { start: 30, end: 90 },
    })

    const cosKey = await uploadImageSourceToCos(source, 'panel-candidate', `${panel.id}-${i}`)
    candidates.push(cosKey)
  }

  const isFirstGeneration = !panel.imageUrl

  await assertTaskActive(job, 'persist_panel_image')
  if (isFirstGeneration) {
    await prisma.novelPromotionPanel.update({
      where: { id: panel.id },
      data: {
        imageUrl: candidates[0] || null,
        candidateImages: candidateCount > 1 ? JSON.stringify(candidates) : null,
      },
    })
  } else {
    await prisma.novelPromotionPanel.update({
      where: { id: panel.id },
      data: {
        previousImageUrl: panel.imageUrl,
        candidateImages: JSON.stringify(candidates),
      },
    })
  }

  return {
    panelId: panel.id,
    candidateCount: candidates.length,
    imageUrl: isFirstGeneration ? candidates[0] || null : null,
  }
}

export async function handleStoryboardGroupImageTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const storyboardId = pickFirstString(payload.storyboardId, job.data.targetId)
  const groupNumberRaw = typeof payload.groupNumber === 'number' ? payload.groupNumber : Number(payload.groupNumber)
  const groupNumber = Number.isFinite(groupNumberRaw) ? Math.floor(groupNumberRaw) : null
  if (!storyboardId || groupNumber === null || groupNumber <= 0) {
    throw new Error('storyboardId or groupNumber missing')
  }

  const storyboard = await prisma.novelPromotionStoryboard.findUnique({
    where: { id: storyboardId },
    include: {
      panels: { orderBy: { panelIndex: 'asc' } },
    },
  })
  if (!storyboard) throw new Error('Storyboard not found')

  const parentGroupByPanelNumber = parseParentGroupByPanelNumber(storyboard.storyboardTextJson)
  const groupPanels = storyboard.panels.filter((panel) => {
    const panelNumber = panel.panelNumber ?? panel.panelIndex + 1
    return (parentGroupByPanelNumber.get(panelNumber) ?? 1) === groupNumber
  })
  if (groupPanels.length === 0) throw new Error(`No panels found for coarse group ${groupNumber}`)

  const projectData = await resolveNovelData(job.data.projectId)
  const modelConfig = await getProjectModels(job.data.projectId, job.data.userId)
  const modelKey = modelConfig.storyboardModel
  if (!modelKey) throw new Error('Storyboard model not configured')

  const candidateCount = clampCount(payload.candidateCount ?? payload.count, 1, 4, 1)
  const rawRefs = (await Promise.all(groupPanels.map((panel) => collectPanelReferenceImages(projectData, panel)))).flat()
  const refs = Array.from(new Set(rawRefs))
  const normalizedRefs = await normalizeReferenceImagesForGeneration(refs)

  const artStyle = getArtStylePrompt(modelConfig.artStyle, job.data.locale)
  if (!projectData.videoRatio) throw new Error('Project videoRatio not configured')
  const aspectRatio = projectData.videoRatio
  const imagePrompt = buildCoarseGroupImagePrompt(groupPanels)
  const videoPrompt = buildCoarseGroupVideoPrompt(groupPanels)
  const contextJson = JSON.stringify({
    coarse_group: {
      storyboard_id: storyboard.id,
      group_number: groupNumber,
      image_prompt: imagePrompt,
      video_prompt: videoPrompt,
      panels: groupPanels.map((panel) => buildPanelPromptContext({ panel, projectData }).panel),
    },
  }, null, 2)
  const prompt = buildPanelPrompt({
    locale: job.data.locale,
    aspectRatio,
    styleText: artStyle || '与参考图风格一致',
    sourceText: imagePrompt,
    contextJson,
  })

  const candidates: string[] = []
  for (let i = 0; i < candidateCount; i += 1) {
    await reportTaskProgress(job, 18 + Math.floor((i / Math.max(candidateCount, 1)) * 58), {
      stage: 'generate_storyboard_group_candidate',
      candidateIndex: i,
      groupNumber,
    })

    const source = await resolveImageSourceFromGeneration(job, {
      userId: job.data.userId,
      modelId: modelKey,
      prompt,
      options: {
        referenceImages: normalizedRefs,
        aspectRatio,
      },
      allowTaskExternalIdResume: candidateCount === 1,
      pollProgress: { start: 30, end: 90 },
    })

    const cosKey = await uploadImageSourceToCos(source, 'storyboard-group-candidate', `${storyboard.id}-${groupNumber}-${i}`)
    candidates.push(cosKey)
  }

  await assertTaskActive(job, 'persist_storyboard_group_image')
  const coarseGroupsJson = upsertCoarseGroupState({
    raw: storyboard.coarseGroupsJson,
    groupNumber,
    imagePrompt,
    videoPrompt,
    imageUrl: candidates[0] || null,
    candidateImages: candidateCount > 1 ? candidates : null,
  })
  await prisma.novelPromotionStoryboard.update({
    where: { id: storyboard.id },
    data: {
      coarseGroupsJson,
    },
  })

  return {
    storyboardId: storyboard.id,
    groupNumber,
    candidateCount: candidates.length,
    imageUrl: candidates[0] || null,
  }
}
