import { prisma } from '@/lib/prisma'
import {
  appendPanelVideoHistoryEntry,
  parsePanelVideoHistory,
  removePanelVideoHistoryEntry,
  serializePanelVideoHistory,
} from './panel-video-state'

/**
 * 组合分镜（用户手动连接 linkedToNextPanel 的相邻原子分镜）的 omni 合成视频状态。
 * 与原子分镜解耦：成员为快照，合成视频/历史只存 NovelPromotionPanelGroup 表。
 */

export function parseMemberPanelIds(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
  } catch {
    return []
  }
}

export function serializeMemberPanelIds(ids: string[]): string {
  return JSON.stringify(ids)
}

/** 按 storyboard + 有序 panelIndex 列表解析出有序的成员 panelId 列表 */
export async function resolveGroupMemberPanelIds(
  storyboardId: string,
  panelIndices: number[],
): Promise<string[]> {
  if (panelIndices.length === 0) return []
  const panels = await prisma.novelPromotionPanel.findMany({
    where: { storyboardId, panelIndex: { in: panelIndices } },
    select: { id: true, panelIndex: true },
  })
  const byIndex = new Map(panels.map((panel) => [panel.panelIndex, panel.id]))
  return panelIndices
    .map((index) => byIndex.get(index))
    .filter((id): id is string => !!id)
}

interface UpsertPanelGroupVideoParams {
  storyboardId: string
  memberPanelIds: string[] // 有序
  videoUrl: string
  videoModel: string
  videoGenerationMode: string // normal | firstlastframe
  videoPrompt?: string | null
  firstLastFramePrompt?: string | null
  firstLastFrameEnabled?: boolean
  duration?: number | null
  taskId?: string
  sourceImageUrls?: string[]
  generatedAt?: string
}

/** omni 生成完成后写入/更新组合分镜视频状态，返回组 id */
export async function upsertPanelGroupVideo(params: UpsertPanelGroupVideoParams): Promise<string> {
  const anchorPanelId = params.memberPanelIds[0]
  if (!anchorPanelId) throw new Error('panel group has no member panels')

  const existing = await prisma.novelPromotionPanelGroup.findUnique({
    where: { storyboardId_anchorPanelId: { storyboardId: params.storyboardId, anchorPanelId } },
    select: { id: true, videoHistory: true },
  })
  const generatedAt = params.generatedAt || new Date().toISOString()
  const nextHistory = appendPanelVideoHistoryEntry(parsePanelVideoHistory(existing?.videoHistory ?? null), {
    videoUrl: params.videoUrl,
    generatedAt,
    source: params.videoGenerationMode === 'firstlastframe' ? 'firstlastframe' : 'generate',
    videoPrompt: params.videoPrompt ?? undefined,
    videoModel: params.videoModel,
    generationMode: params.videoGenerationMode,
    taskId: params.taskId,
    sourceImageUrls: params.sourceImageUrls,
  })

  const data = {
    memberPanelIdsJson: serializeMemberPanelIds(params.memberPanelIds),
    videoUrl: params.videoUrl,
    videoHistory: serializePanelVideoHistory(nextHistory),
    videoModel: params.videoModel,
    videoGenerationMode: params.videoGenerationMode,
    videoPrompt: params.videoPrompt ?? null,
    ...(params.firstLastFramePrompt !== undefined ? { firstLastFramePrompt: params.firstLastFramePrompt } : {}),
    ...(params.firstLastFrameEnabled !== undefined ? { firstLastFrameEnabled: params.firstLastFrameEnabled } : {}),
    ...(params.duration != null ? { duration: params.duration } : {}),
  }

  const row = await prisma.novelPromotionPanelGroup.upsert({
    where: { storyboardId_anchorPanelId: { storyboardId: params.storyboardId, anchorPanelId } },
    create: { storyboardId: params.storyboardId, anchorPanelId, ...data },
    update: data,
  })
  return row.id
}

/** 从历史视频中切换当前组合视频 */
export async function selectPanelGroupVideo(params: {
  panelGroupId: string
  videoUrl: string
}): Promise<{ videoUrl: string } | null> {
  const group = await prisma.novelPromotionPanelGroup.findUnique({
    where: { id: params.panelGroupId },
    select: { videoHistory: true },
  })
  if (!group) return null
  const history = parsePanelVideoHistory(group.videoHistory)
  const entry = history.find((item) => item.videoUrl === params.videoUrl)
  if (!entry) return null
  await prisma.novelPromotionPanelGroup.update({
    where: { id: params.panelGroupId },
    data: {
      videoUrl: entry.videoUrl,
      videoModel: entry.videoModel ?? null,
      videoGenerationMode: entry.generationMode ?? null,
      videoPrompt: entry.videoPrompt ?? null,
    },
  })
  return { videoUrl: entry.videoUrl }
}

/** 删除组合视频历史项；若删除的是当前视频则回退到最近一条历史 */
export async function deletePanelGroupHistoryVideo(params: {
  panelGroupId: string
  videoUrl: string
  clearCurrent?: boolean
}): Promise<{ videoUrl: string | null } | null> {
  const group = await prisma.novelPromotionPanelGroup.findUnique({
    where: { id: params.panelGroupId },
    select: { videoUrl: true, videoHistory: true },
  })
  if (!group) return null
  const nextHistory = removePanelVideoHistoryEntry(parsePanelVideoHistory(group.videoHistory), params.videoUrl)
  const wasCurrent = params.clearCurrent || group.videoUrl === params.videoUrl
  const nextCurrent = wasCurrent ? (nextHistory.length > 0 ? nextHistory[nextHistory.length - 1].videoUrl : null) : group.videoUrl
  await prisma.novelPromotionPanelGroup.update({
    where: { id: params.panelGroupId },
    data: {
      videoHistory: serializePanelVideoHistory(nextHistory),
      ...(wasCurrent ? { videoUrl: nextCurrent } : {}),
    },
  })
  return { videoUrl: nextCurrent }
}

/** 更新组合视频的提示词/时长/首尾帧设置 */
export async function updatePanelGroupVideoSettings(params: {
  panelGroupId: string
  videoPrompt?: string | null
  duration?: number | null
  firstLastFrameEnabled?: boolean
  firstLastFramePrompt?: string | null
}): Promise<void> {
  await prisma.novelPromotionPanelGroup.update({
    where: { id: params.panelGroupId },
    data: {
      ...(params.videoPrompt !== undefined ? { videoPrompt: params.videoPrompt } : {}),
      ...(params.duration !== undefined ? { duration: params.duration } : {}),
      ...(params.firstLastFrameEnabled !== undefined ? { firstLastFrameEnabled: params.firstLastFrameEnabled } : {}),
      ...(params.firstLastFramePrompt !== undefined ? { firstLastFramePrompt: params.firstLastFramePrompt } : {}),
    },
  })
}
