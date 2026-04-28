'use client'

import { useMemo } from 'react'
import { NovelPromotionStoryboard } from '@/types/project'
import { useStoryboardTaskPresentation } from '@/lib/query/hooks/useTaskPresentation'

interface TaskTarget {
  key: string
  targetType: string
  targetId: string
  types: string[]
  resource: 'text' | 'image' | 'video'
  hasOutput: boolean
}

interface UseStoryboardTaskAwareStoryboardsProps {
  projectId: string
  initialStoryboards: NovelPromotionStoryboard[]
  isRunningPhase: (phase: string | null | undefined) => boolean
}

function buildStoryboardTextTargets(storyboards: NovelPromotionStoryboard[]): TaskTarget[] {
  const targets: TaskTarget[] = []

  for (const storyboard of storyboards) {
    targets.push({
      key: `storyboard:${storyboard.id}`,
      targetType: 'NovelPromotionStoryboard',
      targetId: storyboard.id,
      types: ['regenerate_storyboard_text', 'insert_panel'],
      resource: 'text',
      hasOutput: !!(storyboard.panels || []).length,
    })
    if (storyboard.episodeId) {
      targets.push({
        key: `episode:${storyboard.episodeId}`,
        targetType: 'NovelPromotionEpisode',
        targetId: storyboard.episodeId,
        types: ['regenerate_storyboard_text', 'insert_panel'],
        resource: 'text',
        hasOutput: !!(storyboard.panels || []).length,
      })
    }
  }

  return targets
}

function buildStoryboardImageTargets(storyboards: NovelPromotionStoryboard[]): TaskTarget[] {
  return storyboards.map((storyboard) => ({
    key: `storyboard-image:${storyboard.id}`,
    targetType: 'NovelPromotionStoryboard',
    targetId: storyboard.id,
    types: ['image_panel'],
    resource: 'image' as const,
    hasOutput: !!storyboard.coarseGroupsJson,
  }))
}

function buildPanelTargets(storyboards: NovelPromotionStoryboard[], type: 'image' | 'video' | 'lip-sync'): TaskTarget[] {
  const targets: TaskTarget[] = []

  for (const storyboard of storyboards) {
    for (const panel of storyboard.panels || []) {
      if (type === 'image') {
        targets.push({
          key: `panel-image:${panel.id}`,
          targetType: 'NovelPromotionPanel',
          targetId: panel.id,
          types: ['image_panel', 'panel_variant', 'modify_asset_image'],
          resource: 'image',
          hasOutput: !!panel.imageUrl,
        })
      } else if (type === 'video') {
        targets.push({
          key: `panel-video:${panel.id}`,
          targetType: 'NovelPromotionPanel',
          targetId: panel.id,
          types: ['video_panel'],
          resource: 'video',
          hasOutput: !!panel.videoUrl,
        })
      } else {
        targets.push({
          key: `panel-lip:${panel.id}`,
          targetType: 'NovelPromotionPanel',
          targetId: panel.id,
          types: ['lip_sync'],
          resource: 'video',
          hasOutput: !!panel.lipSyncVideoUrl,
        })
      }
    }
  }

  return targets
}

export function useStoryboardTaskAwareStoryboards({
  projectId,
  initialStoryboards,
  isRunningPhase,
}: UseStoryboardTaskAwareStoryboardsProps) {
  const storyboardTextTargets = useMemo(
    () => buildStoryboardTextTargets(initialStoryboards),
    [initialStoryboards],
  )
  const panelImageTargets = useMemo(
    () => buildPanelTargets(initialStoryboards, 'image'),
    [initialStoryboards],
  )
  const storyboardImageTargets = useMemo(
    () => buildStoryboardImageTargets(initialStoryboards),
    [initialStoryboards],
  )
  const panelVideoTargets = useMemo(
    () => buildPanelTargets(initialStoryboards, 'video'),
    [initialStoryboards],
  )
  const panelLipSyncTargets = useMemo(
    () => buildPanelTargets(initialStoryboards, 'lip-sync'),
    [initialStoryboards],
  )

  const storyboardTextStates = useStoryboardTaskPresentation(
    projectId,
    storyboardTextTargets,
    !!projectId && storyboardTextTargets.length > 0,
  )
  const panelImageStates = useStoryboardTaskPresentation(
    projectId,
    panelImageTargets,
    !!projectId && panelImageTargets.length > 0,
  )
  const storyboardImageStates = useStoryboardTaskPresentation(
    projectId,
    storyboardImageTargets,
    !!projectId && storyboardImageTargets.length > 0,
  )
  const panelVideoStates = useStoryboardTaskPresentation(
    projectId,
    panelVideoTargets,
    !!projectId && panelVideoTargets.length > 0,
  )
  const panelLipSyncStates = useStoryboardTaskPresentation(
    projectId,
    panelLipSyncTargets,
    !!projectId && panelLipSyncTargets.length > 0,
  )

  const taskAwareStoryboards = useMemo(() => {
    return initialStoryboards.map((storyboard) => {
      const storyboardTaskState = storyboardTextStates.getTaskState(`storyboard:${storyboard.id}`)
      const episodeTaskState = storyboardTextStates.getTaskState(`episode:${storyboard.episodeId}`)
      const activeTextTaskState = isRunningPhase(storyboardTaskState?.phase)
        ? storyboardTaskState
        : isRunningPhase(episodeTaskState?.phase)
          ? episodeTaskState
          : storyboardTaskState || episodeTaskState || null
      const storyboardImageTaskState = storyboardImageStates.getTaskState(`storyboard-image:${storyboard.id}`)
      const activeStoryboardTaskState = isRunningPhase(storyboardImageTaskState?.phase)
        ? storyboardImageTaskState
        : activeTextTaskState

      return {
        ...storyboard,
        storyboardTaskRunning:
          isRunningPhase(storyboardTaskState?.phase) ||
          isRunningPhase(episodeTaskState?.phase) ||
          isRunningPhase(storyboardImageTaskState?.phase),
        storyboardTaskProgress: activeStoryboardTaskState?.progress ?? null,
        storyboardTaskStageLabel: activeStoryboardTaskState?.stageLabel ?? null,
        storyboardTaskMessage: activeStoryboardTaskState?.message ?? null,
        storyboardTaskStepTitle: activeStoryboardTaskState?.stepTitle ?? null,
        storyboardTaskStepIndex: activeStoryboardTaskState?.stepIndex ?? null,
        storyboardTaskStepTotal: activeStoryboardTaskState?.stepTotal ?? null,
        storyboardTaskStepAttempt: activeStoryboardTaskState?.stepAttempt ?? null,
        panels: (storyboard.panels || []).map((panel) => {
          const panelImageTaskState = panelImageStates.getTaskState(`panel-image:${panel.id}`)
          const panelImageRunning = isRunningPhase(panelImageTaskState?.phase)
          return {
            ...panel,
            imageTaskRunning: panelImageRunning,
            imageTaskIntent: panelImageTaskState?.intent,
            videoTaskRunning: isRunningPhase(panelVideoStates.getTaskState(`panel-video:${panel.id}`)?.phase),
            lipSyncTaskRunning: isRunningPhase(panelLipSyncStates.getTaskState(`panel-lip:${panel.id}`)?.phase),
          }
        }),
      }
    })
  }, [
    initialStoryboards,
    isRunningPhase,
    panelImageStates,
    panelLipSyncStates,
    panelVideoStates,
    storyboardImageStates,
    storyboardTextStates,
  ])

  return {
    taskAwareStoryboards,
  }
}
