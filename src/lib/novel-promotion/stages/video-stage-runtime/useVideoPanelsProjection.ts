'use client'

import { useMemo } from 'react'
import type {
  Clip,
  Storyboard,
  VideoPanel,
} from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video'

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

        panels.push({
          panelId,
          storyboardId: storyboard.id,
          panelIndex: actualPanelIndex,
          parentGroupNumber,
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
          videoUrl: panel.videoUrl || undefined,
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

  return {
    sortedStoryboards,
    allPanels,
  }
}
