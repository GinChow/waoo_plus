'use client'

import { getAspectRatioConfig } from '@/lib/constants'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { CapabilitySelections, CapabilityValue } from '@/lib/model-config-contract'
import { VideoPanelCard, type VideoPanel, type VideoModelOption, type MatchedVoiceLine, type FirstLastFrameParams, type VideoGenerationOptions } from '../video'

interface VideoRenderPanelProps {
  allPanels: VideoPanel[]
  highlightedPanelKey: string | null
  panelRefs: MutableRefObject<Map<string, HTMLDivElement>>
  videoRatio: string
  defaultVideoModel: string
  capabilityOverrides: CapabilitySelections
  userVideoModels?: VideoModelOption[]
  projectId: string
  episodeId: string
  runningVoiceLineIds: Set<string>
  panelVoiceLines: Map<string, MatchedVoiceLine[]>
  panelVideoPreference: Map<string, boolean>
  flModel: string
  flModelOptions: VideoModelOption[]
  flGenerationOptions: VideoGenerationOptions
  flCapabilityFields: Array<{
    field: string
    label: string
    options: CapabilityValue[]
    disabledOptions?: CapabilityValue[]
    value: CapabilityValue | undefined
  }>
  flMissingCapabilityFields: string[]
  flCustomPrompts: Map<string, string>
  onGenerateVideo: (
    storyboardId: string,
    panelIndex: number,
    videoModel?: string,
    firstLastFrame?: FirstLastFrameParams,
    generationOptions?: VideoGenerationOptions,
    panelId?: string,
    groupNumber?: number,
    customPrompt?: string,
  ) => Promise<void>
  onUpdatePanelVideoModel: (storyboardId: string, panelIndex: number, model: string) => Promise<void>
  onLipSync: (storyboardId: string, panelIndex: number, voiceLineId: string, panelId?: string) => Promise<void>
  onToggleLink: (panelKey: string, storyboardId: string, panelIndex: number) => Promise<void>
  onFlModelChange: (model: string) => void
  onFlCapabilityChange: (field: string, rawValue: string) => void
  onFlCustomPromptChange: (key: string, value: string) => void
  onResetFlPrompt: (key: string) => void
  onGenerateFirstLastFrame: (
    firstStoryboardId: string,
    firstPanelIndex: number,
    lastStoryboardId: string,
    lastPanelIndex: number,
    panelKey: string,
    generationOptions?: VideoGenerationOptions,
    firstPanelId?: string,
  ) => Promise<void>
  onPreviewImage: (imageUrl: string | null) => void
  onToggleLipSyncVideo: (key: string, value: boolean) => void
  getDefaultFlPrompt: (firstPrompt?: string, lastPrompt?: string) => string
}

function buildCoarseGroupVideoPrompt(entries: Array<{ panel: VideoPanel }>) {
  let cursor = 0
  return entries.map(({ panel }) => {
    const current = cursor
    const duration = panel.textPanel?.duration
    cursor += typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : 0.5
    return `[${current.toFixed(2)}秒]${panel.textPanel?.video_prompt || panel.textPanel?.description || '无视频描述'}`
  }).join('\n')
}

export default function VideoRenderPanel({
  allPanels,
  highlightedPanelKey,
  panelRefs,
  videoRatio,
  defaultVideoModel,
  capabilityOverrides,
  userVideoModels,
  projectId,
  episodeId,
  runningVoiceLineIds,
  panelVoiceLines,
  panelVideoPreference,
  flModel,
  flModelOptions,
  flGenerationOptions,
  flCapabilityFields,
  flMissingCapabilityFields,
  flCustomPrompts,
  onGenerateVideo,
  onUpdatePanelVideoModel,
  onLipSync,
  onToggleLink,
  onFlModelChange,
  onFlCapabilityChange,
  onFlCustomPromptChange,
  onResetFlPrompt,
  onGenerateFirstLastFrame,
  onPreviewImage,
  onToggleLipSyncVideo,
  getDefaultFlPrompt,
}: VideoRenderPanelProps) {
  const t = useTranslations('video')
  const [groupPromptOverrides, setGroupPromptOverrides] = useState<Map<string, string>>(new Map())
  const groupedPanels = useMemo(() => allPanels.reduce<Array<{
    storyboardId: string
    groupNumber: number
    entries: Array<{ panel: VideoPanel; localIndex: number }>
  }>>((groups, panel) => {
    const current = groups[groups.length - 1]
    const currentGroupNumber = panel.parentGroupNumber ?? 1
    if (current && current.storyboardId === panel.storyboardId && current.groupNumber === currentGroupNumber) {
      current.entries.push({ panel, localIndex: current.entries.length })
      return groups
    }
    groups.push({
      storyboardId: panel.storyboardId,
      groupNumber: currentGroupNumber,
      entries: [{ panel, localIndex: 0 }],
    })
    return groups
  }, []), [allPanels])
  const groupPanels = useMemo(() => groupedPanels.map((group) => {
    const firstEntry = group.entries[0]
    const firstPanel = firstEntry.panel
    const groupImageUrl = firstPanel.coarseGroupImageUrl || firstPanel.imageUrl
    const groupVideoPrompt = firstPanel.coarseGroupVideoPrompt || buildCoarseGroupVideoPrompt(group.entries)
    const totalDuration = group.entries.reduce((sum, { panel }) => {
      const duration = panel.textPanel?.duration
      return sum + (typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : 0)
    }, 0)
    const hasRunning = group.entries.some(({ panel }) => panel.videoTaskRunning)
    const failedPanel = group.entries.find(({ panel }) => panel.videoErrorMessage || panel.videoErrorCode)?.panel

    return {
      group,
      panel: {
        ...firstPanel,
        imageUrl: groupImageUrl || undefined,
        videoTargetGroupNumber: group.groupNumber,
        videoTaskRunning: hasRunning,
        videoErrorCode: failedPanel?.videoErrorCode || firstPanel.videoErrorCode,
        videoErrorMessage: failedPanel?.videoErrorMessage || firstPanel.videoErrorMessage,
        textPanel: {
          ...firstPanel.textPanel,
          panel_number: group.groupNumber,
          parent_group_number: group.groupNumber,
          shot_type: t('render.coarseShot', { number: group.groupNumber }),
          description: group.entries
            .map(({ panel }, index) => `${index + 1}. ${panel.textPanel?.description || ''}`.trim())
            .filter((text) => text.length > 2)
            .join('\n'),
          duration: totalDuration > 0 ? totalDuration : firstPanel.textPanel?.duration,
          video_prompt: groupVideoPrompt || firstPanel.textPanel?.video_prompt,
        },
      } satisfies VideoPanel,
    }
  }), [groupedPanels, t])

  useEffect(() => {
    if (!highlightedPanelKey) return
    const matchedGroup = groupedPanels.find((group) =>
      group.entries.some(({ panel }) => `${panel.storyboardId}-${panel.panelIndex}` === highlightedPanelKey),
    )
    if (!matchedGroup) return
    const firstPanel = matchedGroup.entries[0]?.panel
    if (!firstPanel) return
    const panelKey = `${firstPanel.storyboardId}-${firstPanel.panelIndex}`
    panelRefs.current.get(panelKey)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [groupedPanels, highlightedPanelKey, panelRefs])

  return (
    <div className={`grid gap-4 ${getAspectRatioConfig(videoRatio).isVertical
      ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
    }`}>
      {groupPanels.map(({ group, panel }) => {
        const panelKey = `${panel.storyboardId}-${panel.panelIndex}`
        const groupPromptKey = `${group.storyboardId}:group:${group.groupNumber}`
        const localPrompt = groupPromptOverrides.get(groupPromptKey) ?? panel.textPanel?.video_prompt ?? ''

        return (
          <div
            key={`${group.storyboardId}:${group.groupNumber}`}
            ref={(element) => {
              if (element) panelRefs.current.set(panelKey, element)
              else panelRefs.current.delete(panelKey)
            }}
            className={`transition-all duration-500 ${group.entries.some(({ panel: entryPanel }) => `${entryPanel.storyboardId}-${entryPanel.panelIndex}` === highlightedPanelKey)
              ? 'ring-4 ring-[var(--glass-stroke-focus)] ring-offset-2 ring-offset-[var(--glass-bg-canvas)] rounded-2xl scale-[1.02]'
              : ''
            }`}
          >
            <VideoPanelCard
              panel={{
                ...panel,
                lipSyncTaskRunning: panel.lipSyncTaskRunning || false,
              }}
              panelIndex={panel.panelIndex}
              defaultVideoModel={defaultVideoModel}
              capabilityOverrides={capabilityOverrides}
              videoRatio={videoRatio}
              userVideoModels={userVideoModels}
              projectId={projectId}
              episodeId={episodeId}
              runningVoiceLineIds={runningVoiceLineIds}
              matchedVoiceLines={panelVoiceLines.get(panelKey) || []}
              onLipSync={onLipSync}
              showLipSyncVideo={panelVideoPreference.get(panelKey) ?? true}
              onToggleLipSyncVideo={onToggleLipSyncVideo}
              isLinked={false}
              isLastFrame={false}
              nextPanel={null}
              prevPanel={null}
              hasNext={false}
              flModel={flModel}
              flModelOptions={flModelOptions}
              flGenerationOptions={flGenerationOptions}
              flCapabilityFields={flCapabilityFields}
              flMissingCapabilityFields={flMissingCapabilityFields}
              flCustomPrompt={flCustomPrompts.get(panelKey) || panel.firstLastFramePrompt || ''}
              defaultFlPrompt={getDefaultFlPrompt(panel.textPanel?.video_prompt)}
              localPrompt={localPrompt}
              isSavingPrompt={false}
              onUpdateLocalPrompt={(value) => {
                setGroupPromptOverrides((previous) => {
                  const next = new Map(previous)
                  next.set(groupPromptKey, value)
                  return next
                })
              }}
              onSavePrompt={async (value) => {
                setGroupPromptOverrides((previous) => {
                  const next = new Map(previous)
                  next.set(groupPromptKey, value)
                  return next
                })
              }}
              onGenerateVideo={onGenerateVideo}
              onUpdatePanelVideoModel={onUpdatePanelVideoModel}
              onToggleLink={onToggleLink}
              onFlModelChange={onFlModelChange}
              onFlCapabilityChange={onFlCapabilityChange}
              onFlCustomPromptChange={onFlCustomPromptChange}
              onResetFlPrompt={onResetFlPrompt}
              onGenerateFirstLastFrame={onGenerateFirstLastFrame}
              onPreviewImage={onPreviewImage}
            />
          </div>
        )
      })}
    </div>
  )
}
