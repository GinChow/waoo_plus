'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query/keys'
import { NovelPromotionStoryboard, NovelPromotionClip, NovelPromotionPanel } from '@/types/project'
import { PanelEditData } from '../../PanelEditForm'
import {
  computeStoryboardStartIndex,
  computeTotalPanels,
  formatClipTitle,
  getStoryboardPanels,
  sortStoryboardsByClipOrder,
} from './storyboard-state-utils'

export interface StoryboardPanel {
  id: string
  panelIndex: number
  panel_number: number
  parent_group_number?: number
  shot_type: string
  camera_move: string | null
  description: string
  scene_type?: string
  characters: { name: string; appearance: string; slot?: string }[]
  location?: string
  srt_range?: string
  duration?: number
  video_prompt?: string
  first_frame_image_prompt?: string
  source_text?: string
  candidateImages?: string
  imageUrl?: string | null
  imageHistory?: string | null  // 历史图片 JSON 数组
  photographyRules?: string | null  // 单镜头摄影规则JSON
  actingNotes?: string | null       // 演技指导数据JSON
  imageTaskRunning?: boolean  // 任务态运行状态（由 tasks 派生）
  linkedToNextPanel?: boolean  // 是否与下一个相邻分镜链接（组合生成视频）
  first_last_frame_enabled?: boolean  // 两张图组合时：true=首尾帧模式，false=多镜头模式
}

function parseParentGroupByPanelNumber(raw: string | null): Map<number, number> {
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

interface UseStoryboardStateProps {
  projectId: string
  episodeId: string
  initialStoryboards: NovelPromotionStoryboard[]
  clips: NovelPromotionClip[]
}

export function useStoryboardState({
  projectId,
  episodeId,
  initialStoryboards,
  clips,
}: UseStoryboardStateProps) {
  const queryClient = useQueryClient()
  const localStoryboards = useMemo(
    () => sortStoryboardsByClipOrder(initialStoryboards, clips),
    [clips, initialStoryboards],
  )

  const setLocalStoryboards = useCallback<React.Dispatch<React.SetStateAction<NovelPromotionStoryboard[]>>>(
    (nextStoryboardsOrUpdater) => {
      const resolveNextStoryboards = (previousStoryboards: NovelPromotionStoryboard[]) => (
        typeof nextStoryboardsOrUpdater === 'function'
          ? (nextStoryboardsOrUpdater as (previous: NovelPromotionStoryboard[]) => NovelPromotionStoryboard[])(previousStoryboards)
          : nextStoryboardsOrUpdater
      )

      queryClient.setQueryData(queryKeys.episodeData(projectId, episodeId), (previous: unknown) => {
        if (!previous || typeof previous !== 'object') return previous
        const episode = previous as { storyboards?: NovelPromotionStoryboard[] }
        const previousStoryboards = Array.isArray(episode.storyboards) ? episode.storyboards : []
        const nextStoryboards = resolveNextStoryboards(previousStoryboards)
        if (nextStoryboards === previousStoryboards) return previous
        return {
          ...episode,
          storyboards: nextStoryboards,
        }
      })

      queryClient.setQueryData(queryKeys.storyboards.all(episodeId), (previous: unknown) => {
        if (!previous || typeof previous !== 'object') return previous
        const payload = previous as { storyboards?: NovelPromotionStoryboard[] }
        const previousStoryboards = Array.isArray(payload.storyboards) ? payload.storyboards : []
        const nextStoryboards = resolveNextStoryboards(previousStoryboards)
        if (nextStoryboards === previousStoryboards) return previous
        return {
          ...payload,
          storyboards: nextStoryboards,
        }
      })
    },
    [episodeId, projectId, queryClient],
  )

  const [expandedClips, setExpandedClips] = useState<Set<string>>(new Set())

  const [panelEdits, setPanelEdits] = useState<Record<string, PanelEditData>>({})
  // Keep latest panel edits for async callbacks without adding unstable deps.
  const panelEditsRef = useRef<Record<string, PanelEditData>>({})
  panelEditsRef.current = panelEdits

  const getClipInfo = (clipId: string) => clips.find(c => c.id === clipId)

  const getPanelImages = (storyboard: NovelPromotionStoryboard): Array<string | null> => {
    const panels = getStoryboardPanels(storyboard)
    if (panels.length > 0) {
      return panels.map((p) => p.imageUrl || null)
    }
    return []
  }

  const getTextPanels = (storyboard: NovelPromotionStoryboard): StoryboardPanel[] => {
    const parentGroupMap = parseParentGroupByPanelNumber(storyboard.storyboardTextJson)
    const panels = getStoryboardPanels(storyboard)
    const sortedPanels = [...panels].sort((a: NovelPromotionPanel, b: NovelPromotionPanel) =>
      (a.panelIndex || 0) - (b.panelIndex || 0)
    )
    return sortedPanels.map((p) => {
      const parsedChars = p.characters ? JSON.parse(p.characters) : []
      const characters = Array.isArray(parsedChars)
        ? parsedChars.flatMap((item): Array<{ name: string; appearance: string; slot?: string }> => {
          if (
            typeof item !== 'object'
            || item === null
            || typeof (item as { name?: unknown }).name !== 'string'
            || typeof (item as { appearance?: unknown }).appearance !== 'string'
          ) {
            return []
          }
          const candidate = item as { name: string; appearance: string; slot?: unknown }
          return [{
            name: candidate.name,
            appearance: candidate.appearance,
            slot: typeof candidate.slot === 'string' ? candidate.slot : undefined,
          }]
        })
        : []
      return {
        id: p.id,
        panelIndex: p.panelIndex,
        panel_number: p.panelNumber ?? p.panelIndex + 1,
        parent_group_number: parentGroupMap.get(p.panelNumber ?? (p.panelIndex + 1)),
        shot_type: p.shotType ?? '',
        camera_move: p.cameraMove,
        description: p.description ?? '',
        scene_type: p.sceneType || undefined,
        location: p.location || undefined,
        characters,
        srt_range: p.srtStart && p.srtEnd ? `${p.srtStart}-${p.srtEnd}` : undefined,
        duration: p.duration ?? undefined,
        video_prompt: p.videoPrompt || undefined,
        first_frame_image_prompt: p.firstLastFramePrompt || undefined,
        source_text: p.srtSegment || undefined,
        candidateImages: p.candidateImages || undefined,
        imageUrl: p.imageUrl,
        imageHistory: p.imageHistory,
        photographyRules: p.photographyRules,
        actingNotes: p.actingNotes,
        imageTaskRunning: p.imageTaskRunning || false,
        linkedToNextPanel: p.linkedToNextPanel ?? false,
        first_last_frame_enabled: p.firstLastFrameEnabled ?? undefined,
      }
    })
  }

  const getPanelEditData = (panel: StoryboardPanel): PanelEditData => {
    if (panelEdits[panel.id]) {
      return panelEdits[panel.id]
    }
    return {
      id: panel.id,
      panelIndex: panel.panelIndex,
      panelNumber: panel.panel_number,
      shotType: panel.shot_type,
      cameraMove: panel.camera_move,
      description: panel.description,
      sceneType: panel.scene_type || null,
      location: panel.location || null,
      characters: panel.characters || [],
      srtStart: null,
      srtEnd: null,
      duration: panel.duration || null,
      videoPrompt: panel.video_prompt || null,
      firstLastFramePrompt: panel.first_frame_image_prompt || null,
      photographyRules: panel.photographyRules ?? null,
      actingNotes: panel.actingNotes ?? null,
      sourceText: panel.source_text
    }
  }

  const updatePanelEdit = (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => {
    setPanelEdits(prev => {
      const currentData = prev[panelId] || getPanelEditData(panel)
      return {
        ...prev,
        [panelId]: { ...currentData, ...updates }
      }
    })
  }

  const toggleExpandedClip = (storyboardId: string) => {
    setExpandedClips(prev => {
      const next = new Set(prev)
      if (next.has(storyboardId)) {
        next.delete(storyboardId)
      } else {
        next.add(storyboardId)
      }
      return next
    })
  }

  const sortedStoryboards = [...localStoryboards].sort((a, b) => {
    const clipIndexA = clips.findIndex(c => c.id === a.clipId)
    const clipIndexB = clips.findIndex(c => c.id === b.clipId)
    return clipIndexA - clipIndexB
  })

  const totalPanels = computeTotalPanels(localStoryboards)
  const storyboardStartIndex = computeStoryboardStartIndex(sortedStoryboards)

  return {
    localStoryboards,
    setLocalStoryboards,
    sortedStoryboards,
    expandedClips,
    toggleExpandedClip,
    panelEdits,
    setPanelEdits,
    panelEditsRef,
    getClipInfo,
    getPanelImages,
    getTextPanels,
    getPanelEditData,
    updatePanelEdit,
    formatClipTitle,
    totalPanels,
    storyboardStartIndex
  }
}
