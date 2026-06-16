'use client'

import { useMemo } from 'react'
import type {
  Clip,
  PanelGroupRuntime,
  Storyboard,
  VideoPanel,
} from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video'
import { parsePanelVideoHistory } from '@/lib/novel-promotion/panel-video-state'

function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
  } catch {
    return []
  }
}
import { logInfo as _ulogInfo, logWarn as _ulogWarn } from '@/lib/logging/core'

interface TaskStateLike {
  phase?: string | null
  lastError?: { code?: string; message?: string } | null
}

interface TaskPresentationLike {
  getTaskState: (key: string) => TaskStateLike | null
}

interface UseVideoPanelsProjectionParams {
  storyboards: Storyboard[]
  clips: Clip[]
  panelVideoStates: TaskPresentationLike
  panelLipStates: TaskPresentationLike
}

interface CoarseGroupState {
  imageUrl: string | null
  videoUrl: string | null
  videoPrompt: string | null
  duration: number | null
  videoHistory: Array<{
    videoUrl: string
    generatedAt: string
    videoPrompt: string
    videoModel: string
    generationMode: string
  }>
}

function summarizeVideoUrl(value: string | null | undefined): string {
  if (!value) return ''
  return value.length > 96 ? `${value.slice(0, 48)}...${value.slice(-24)}` : value
}

const LOCAL_URL_ORIGIN = 'http://localhost'
const NEXT_IMAGE_PATH = '/_next/image'
const STORAGE_SIGN_PATH = '/api/storage/sign'
const LOCAL_FILE_PATH_PREFIX = '/api/files/'
const STORAGE_KEY_PREFIXES = ['images/', 'video/', 'voice/'] as const
const MAX_MEDIA_REF_UNWRAP_DEPTH = 5

function decodeUrlComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseMediaUrl(value: string): URL | null {
  try {
    return new URL(value, LOCAL_URL_ORIGIN)
  } catch {
    return null
  }
}

function findStorageKeyInPath(pathname: string): string | null {
  const normalizedPath = pathname.replace(/^\/+/, '')
  for (const prefix of STORAGE_KEY_PREFIXES) {
    const index = normalizedPath.indexOf(prefix)
    if (index >= 0) return decodeUrlComponent(normalizedPath.slice(index))
  }
  return null
}

function canonicalMediaRef(value: string | null | undefined): string {
  if (!value) return ''
  let current = value.trim()
  if (!current) return ''

  for (let depth = 0; depth < MAX_MEDIA_REF_UNWRAP_DEPTH; depth += 1) {
    const parsed = parseMediaUrl(current)
    if (!parsed || parsed.pathname !== NEXT_IMAGE_PATH) break

    const nestedUrl = parsed.searchParams.get('url')
    if (!nestedUrl) break

    const decoded = decodeUrlComponent(nestedUrl)
    if (!decoded || decoded === current) break
    current = decoded
  }

  const parsed = parseMediaUrl(current)
  if (parsed?.pathname === STORAGE_SIGN_PATH) {
    const key = parsed.searchParams.get('key')
    if (key) return decodeUrlComponent(key)
  }

  if (parsed?.pathname.startsWith(LOCAL_FILE_PATH_PREFIX)) {
    return decodeUrlComponent(parsed.pathname.slice(LOCAL_FILE_PATH_PREFIX.length))
  }

  if (parsed) {
    const storageKey = findStorageKeyInPath(parsed.pathname)
    if (storageKey) return storageKey
  }

  const stripped = current.split(/[?#]/, 1)[0]
  return decodeUrlComponent(stripped)
}

function isCurrentVideoStale(params: {
  currentVideoUrl: string | undefined
  currentImageUrls: Array<string | null | undefined>
  videoHistory: ReturnType<typeof parsePanelVideoHistory>
}): boolean {
  if (!params.currentVideoUrl) return false
  const currentVideoRef = canonicalMediaRef(params.currentVideoUrl)
  const currentEntry = [...params.videoHistory].reverse().find(
    (entry) => canonicalMediaRef(entry.videoUrl) === currentVideoRef,
  )
  const sourceImageUrls = currentEntry?.sourceImageUrls
  if (!sourceImageUrls?.length) return false
  const currentImageUrls = params.currentImageUrls
    .map(canonicalMediaRef)
    .filter(Boolean)
  if (sourceImageUrls.length !== currentImageUrls.length) return true
  return sourceImageUrls.some(
    (sourceImageUrl, index) => canonicalMediaRef(sourceImageUrl) !== currentImageUrls[index],
  )
}

function parseCoarseGroupStates(raw: string | null | undefined): Map<number, CoarseGroupState> {
  if (!raw) return new Map()
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Map()
    const states = new Map<number, CoarseGroupState>()
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const groupNumber = (item as { groupNumber?: unknown }).groupNumber
      if (typeof groupNumber !== 'number') continue
      states.set(groupNumber, {
        imageUrl: typeof (item as { imageUrl?: unknown }).imageUrl === 'string'
          ? (item as { imageUrl: string }).imageUrl
          : null,
        videoUrl: typeof (item as { videoUrl?: unknown }).videoUrl === 'string'
          ? (item as { videoUrl: string }).videoUrl
          : null,
        videoPrompt: typeof (item as { videoPrompt?: unknown }).videoPrompt === 'string'
          ? (item as { videoPrompt: string }).videoPrompt
          : null,
        duration: typeof (item as { duration?: unknown }).duration === 'number'
          && Number.isFinite((item as { duration: number }).duration)
          && (item as { duration: number }).duration > 0
          ? (item as { duration: number }).duration
          : null,
        videoHistory: Array.isArray((item as { videoHistory?: unknown }).videoHistory)
          ? ((item as { videoHistory: unknown[] }).videoHistory).flatMap((entry) => {
            if (!entry || typeof entry !== 'object') return []
            const record = entry as Record<string, unknown>
            if (typeof record.videoUrl !== 'string' || !record.videoUrl) return []
            return [{
              videoUrl: record.videoUrl,
              generatedAt: typeof record.generatedAt === 'string' ? record.generatedAt : '',
              videoPrompt: typeof record.videoPrompt === 'string' ? record.videoPrompt : '',
              videoModel: typeof record.videoModel === 'string' ? record.videoModel : '',
              generationMode: typeof record.generationMode === 'string' ? record.generationMode : '',
            }]
          })
          : [],
      })
    }
    return states
  } catch {
    _ulogWarn('[VideoHistoryTrace][projection] failed to parse coarseGroupsJson', {
      rawPreview: raw.slice(0, 200),
    })
    return new Map()
  }
}

function parseParentGroupByPanelNumber(raw: string | null | undefined): Map<number, number> {
  if (!raw) return new Map()
  try {
    const parsed = JSON.parse(raw)
    const mapping = new Map<number, number>()
    if (Array.isArray(parsed)) {
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
    }

    if (parsed && typeof parsed === 'object') {
      for (const [panelNumberRaw, groupRaw] of Object.entries(parsed as Record<string, unknown>)) {
        const panelNumber = Number(panelNumberRaw)
        if (!Number.isFinite(panelNumber) || typeof groupRaw !== 'number') continue
        mapping.set(panelNumber, groupRaw)
      }
      return mapping
    }

    return new Map()
  } catch {
    return new Map()
  }
}

export function useVideoPanelsProjection({
  storyboards,
  clips,
  panelVideoStates,
  panelLipStates,
}: UseVideoPanelsProjectionParams) {
  const sortedStoryboards = useMemo(() => {
    return [...storyboards].sort((left, right) => {
      const leftIndex = clips.findIndex((clip) => clip.id === left.clipId)
      const rightIndex = clips.findIndex((clip) => clip.id === right.clipId)
      return leftIndex - rightIndex
    })
  }, [clips, storyboards])

  const allPanels = useMemo<VideoPanel[]>(() => {
    const panels: VideoPanel[] = []
    sortedStoryboards.forEach((storyboard) => {
      const parentGroupMap = parseParentGroupByPanelNumber(storyboard.storyboardTextJson)
      const coarseGroupStates = parseCoarseGroupStates(storyboard.coarseGroupsJson)
      const tracedGroups = Array.from(coarseGroupStates.entries())
        .filter(([, state]) => state.videoUrl || state.videoHistory.length > 0)
        .map(([groupNumber, state]) => ({
          groupNumber,
          videoUrl: summarizeVideoUrl(state.videoUrl),
          historyCount: state.videoHistory.length,
          historyUrls: state.videoHistory.map((entry) => summarizeVideoUrl(entry.videoUrl)),
        }))
      if (tracedGroups.length > 0) {
        _ulogInfo('[VideoHistoryTrace][projection] parsed coarse group video states', {
          storyboardId: storyboard.id,
          coarseGroupsJsonLength: typeof storyboard.coarseGroupsJson === 'string' ? storyboard.coarseGroupsJson.length : 0,
          groups: tracedGroups,
        })
      }
      const storyboardPanels = storyboard.panels || []
      storyboardPanels.forEach((panel, index) => {
        const actualPanelIndex = panel.panelIndex ?? index
        const panelNumber = panel.panelNumber || actualPanelIndex + 1
        const parentGroupNumber = parentGroupMap.get(panelNumber)
        let charactersArray: string[] = []
        if (panel.characters) {
          try {
            const parsed = typeof panel.characters === 'string' ? JSON.parse(panel.characters) : panel.characters
            charactersArray = Array.isArray(parsed) ? parsed : []
          } catch {
            charactersArray = []
          }
        }

        const panelId = panel.id
        const panelVideoState = panelId ? panelVideoStates.getTaskState(`panel-video:${panelId}`) : null
        const panelLipState = panelId ? panelLipStates.getTaskState(`panel-lip:${panelId}`) : null
        const coarseGroupState = parentGroupNumber ? coarseGroupStates.get(parentGroupNumber) : null
        // 原子分镜彻底独立：视频只用自身 videoUrl，不再回退到粗分组的组视频
        const projectedVideoUrl = panel.videoUrl || undefined

        const videoHistory = parsePanelVideoHistory(panel.videoHistory || null)
        panels.push({
          panelId,
          storyboardId: storyboard.id,
          panelIndex: actualPanelIndex,
          parentGroupNumber,
          // 视频维度不再把粗分组状态投到原子分镜（解耦，原子分镜独立）。
          // 粗分组图片(coarseGroupImageUrl)属设计阶段产物，保留。
          videoTargetGroupNumber: undefined,
          coarseGroupImageUrl: coarseGroupState?.imageUrl || null,
          coarseGroupVideoPrompt: null,
          coarseGroupDuration: null,
          coarseGroupVideoHistory: [],
          videoHistory: videoHistory.map((entry) => ({
            videoUrl: entry.videoUrl,
            generatedAt: entry.generatedAt,
            videoPrompt: entry.videoPrompt,
            videoModel: entry.videoModel,
            generationMode: entry.generationMode,
            source: entry.source,
            taskId: entry.taskId,
            sourceImageUrls: entry.sourceImageUrls,
          })),
          textPanel: {
            panel_number: panelNumber,
            parent_group_number: parentGroupNumber,
            shot_type: panel.shotType || '',
            camera_move: panel.cameraMove || '',
            description: panel.description || '',
            characters: charactersArray,
            location: panel.location || '',
            text_segment: panel.srtSegment || '',
            duration: panel.duration || undefined,
            imagePrompt: panel.imagePrompt || undefined,
            video_prompt: panel.videoPrompt || undefined,
            videoModel: panel.videoModel || undefined,
          },
          imageUrl: panel.imageUrl || undefined,
          firstLastFramePrompt: panel.firstLastFramePrompt || undefined,
          firstLastFrameEnabled: panel.firstLastFrameEnabled ?? undefined,
          videoUrl: projectedVideoUrl,
          videoStorageKey: panel.videoStorageKey || undefined,
          videoGenerationMode: panel.videoGenerationMode || undefined,
          videoTaskRunning: panelVideoState?.phase === 'queued' || panelVideoState?.phase === 'processing',
          videoErrorCode:
            panelVideoState?.phase === 'failed'
              ? panelVideoState.lastError?.code || panel.videoErrorCode || undefined
              : panel.videoErrorCode || undefined,
          videoErrorMessage:
            panelVideoState?.phase === 'failed'
              ? panelVideoState.lastError?.message || panel.videoErrorMessage || undefined
              : panel.videoErrorMessage || undefined,
          videoModel: panel.videoModel || undefined,
          isVideoStale: isCurrentVideoStale({
            currentVideoUrl: projectedVideoUrl,
            currentImageUrls: (() => {
              const currentEntry = [...videoHistory].reverse().find(
                (entry) => canonicalMediaRef(entry.videoUrl) === canonicalMediaRef(projectedVideoUrl),
              )
              const sourceCount = currentEntry?.sourceImageUrls?.length || 1
              return storyboardPanels
                .slice(index, index + sourceCount)
                .map((item) => item.imageUrl)
            })(),
            videoHistory,
          }),
          linkedToNextPanel: panel.linkedToNextPanel || false,
          lipSyncVideoUrl: panel.lipSyncVideoUrl || undefined,
          lipSyncTaskRunning: panelLipState?.phase === 'queued' || panelLipState?.phase === 'processing',
          lipSyncErrorCode:
            panelLipState?.phase === 'failed'
              ? panelLipState.lastError?.code || panel.lipSyncErrorCode || undefined
              : panel.lipSyncErrorCode || undefined,
          lipSyncErrorMessage:
            panelLipState?.phase === 'failed'
              ? panelLipState.lastError?.message || panel.lipSyncErrorMessage || undefined
              : panel.lipSyncErrorMessage || undefined,
        })
      })
    })
    return panels
  }, [panelLipStates, panelVideoStates, sortedStoryboards])

  // 组合分镜（linkedToNextPanel）的 omni 合成视频：按 anchorPanelId（组内首个成员）建索引，供组卡读取。
  const panelGroupsByAnchor = useMemo<Map<string, PanelGroupRuntime>>(() => {
    const imageUrlByPanelId = new Map<string, string | undefined>()
    allPanels.forEach((panel) => {
      if (panel.panelId) imageUrlByPanelId.set(panel.panelId, panel.imageUrl)
    })
    const result = new Map<string, PanelGroupRuntime>()
    sortedStoryboards.forEach((storyboard) => {
      const groups = storyboard.panelGroups || []
      groups.forEach((group) => {
        const memberPanelIds = parseJsonStringArray(group.memberPanelIdsJson)
        const anchorPanelId = group.anchorPanelId || memberPanelIds[0]
        if (!anchorPanelId) return
        const videoHistory = parsePanelVideoHistory(group.videoHistory || null).map((entry) => ({
          videoUrl: entry.videoUrl,
          generatedAt: entry.generatedAt,
          videoPrompt: entry.videoPrompt,
          videoModel: entry.videoModel,
          generationMode: entry.generationMode,
          source: entry.source,
          taskId: entry.taskId,
          sourceImageUrls: entry.sourceImageUrls,
        }))
        const videoUrl = group.videoUrl || undefined
        const isVideoStale = isCurrentVideoStale({
          currentVideoUrl: videoUrl,
          currentImageUrls: memberPanelIds.map((id) => imageUrlByPanelId.get(id)),
          videoHistory: parsePanelVideoHistory(group.videoHistory || null),
        })
        result.set(anchorPanelId, {
          id: group.id,
          storyboardId: storyboard.id,
          anchorPanelId,
          memberPanelIds,
          videoUrl,
          videoHistory,
          videoModel: group.videoModel || undefined,
          videoGenerationMode: group.videoGenerationMode || undefined,
          videoPrompt: group.videoPrompt || undefined,
          firstLastFramePrompt: group.firstLastFramePrompt || undefined,
          firstLastFrameEnabled: group.firstLastFrameEnabled ?? true,
          duration: group.duration ?? null,
          isVideoStale,
        })
      })
    })
    return result
  }, [allPanels, sortedStoryboards])

  return {
    sortedStoryboards,
    allPanels,
    panelGroupsByAnchor,
  }
}
