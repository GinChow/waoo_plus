'use client'

import { getAspectRatioConfig } from '@/lib/constants'
import { useEffect, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { CapabilitySelections, CapabilityValue } from '@/lib/model-config-contract'
import { VideoPanelCard, type VideoPanel, type VideoModelOption, type MatchedVoiceLine, type FirstLastFrameParams, type VideoGenerationOptions } from '../video'
import { useUpdateProjectPanelVideoPrompt } from '@/lib/query/hooks'

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
  const [panelPromptOverrides, setPanelPromptOverrides] = useState<Map<string, string>>(new Map())
  const updatePanelVideoPromptMutation = useUpdateProjectPanelVideoPrompt(projectId)

  useEffect(() => {
    if (!highlightedPanelKey) return
    panelRefs.current.get(highlightedPanelKey)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightedPanelKey, panelRefs])

  return (
    <div className={`grid gap-4 ${getAspectRatioConfig(videoRatio).isVertical
      ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
    }`}>
      {allPanels.map((panel) => {
        const panelKey = `${panel.storyboardId}-${panel.panelIndex}`
        const localPrompt = panelPromptOverrides.get(panelKey) ?? panel.textPanel?.video_prompt ?? ''

        return (
          <div
            key={panelKey}
            ref={(element) => {
              if (element) panelRefs.current.set(panelKey, element)
              else panelRefs.current.delete(panelKey)
            }}
            className={`transition-all duration-500 ${panelKey === highlightedPanelKey
              ? 'ring-4 ring-[var(--glass-stroke-focus)] ring-offset-2 ring-offset-[var(--glass-bg-canvas)] rounded-2xl scale-[1.02]'
              : ''
            }`}
          >
            <VideoPanelCard
              panel={{
                ...panel,
                videoTargetGroupNumber: undefined,
                coarseGroupImageUrl: null,
                coarseGroupVideoPrompt: null,
                coarseGroupDuration: null,
                coarseGroupVideoHistory: [],
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
                setPanelPromptOverrides((previous) => {
                  const next = new Map(previous)
                  next.set(panelKey, value)
                  return next
                })
              }}
              onSavePrompt={async (value) => {
                setPanelPromptOverrides((previous) => {
                  const next = new Map(previous)
                  next.set(panelKey, value)
                  return next
                })
                await updatePanelVideoPromptMutation.mutateAsync({
                  storyboardId: panel.storyboardId,
                  panelIndex: panel.panelIndex,
                  value,
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
