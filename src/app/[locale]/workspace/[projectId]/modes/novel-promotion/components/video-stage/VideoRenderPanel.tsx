'use client'

import { getAspectRatioConfig } from '@/lib/constants'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { CapabilitySelections, CapabilityValue } from '@/lib/model-config-contract'
import { VideoPanelCard, type VideoPanel, type VideoModelOption, type MatchedVoiceLine, type FirstLastFrameParams, type VideoGenerationOptions } from '../video'
import type { PromptField } from '@/lib/novel-promotion/stages/video-stage-runtime/useVideoPromptState'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { AppIcon } from '@/components/ui/icons'

interface VideoRenderPanelProps {
  allPanels: VideoPanel[]
  linkedPanels: Map<string, boolean>
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
  savingPrompts: Set<string>
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
  getLocalPrompt: (panelKey: string, externalPrompt?: string, field?: PromptField) => string
  updateLocalPrompt: (panelKey: string, value: string, field?: PromptField) => void
  savePrompt: (
    storyboardId: string,
    panelIndex: number,
    panelKey: string,
    value: string,
    field?: PromptField,
  ) => Promise<void>
}

export default function VideoRenderPanel({
  allPanels,
  linkedPanels,
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
  savingPrompts,
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
  getLocalPrompt,
  updateLocalPrompt,
  savePrompt,
}: VideoRenderPanelProps) {
  const t = useTranslations('video')
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
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null)

  const activeGroup = useMemo(
    () => groupedPanels.find((group) => `${group.storyboardId}:${group.groupNumber}` === activeGroupKey) || null,
    [activeGroupKey, groupedPanels],
  )

  useEffect(() => {
    if (!highlightedPanelKey) return
    if (activeGroup) return
    const matchedGroup = groupedPanels.find((group) =>
      group.entries.some(({ panel }) => `${panel.storyboardId}-${panel.panelIndex}` === highlightedPanelKey),
    )
    if (!matchedGroup) return
    setActiveGroupKey(`${matchedGroup.storyboardId}:${matchedGroup.groupNumber}`)
  }, [activeGroup, groupedPanels, highlightedPanelKey])

  return (
    <div className="space-y-4">
      {activeGroup ? (
        <section className="glass-surface-elevated p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">
                {t('render.coarseShot', { number: activeGroup.groupNumber })}
              </h3>
              <p className="text-xs text-[var(--glass-text-tertiary)]">
                {t('render.fineShotCount', { count: activeGroup.entries.length })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveGroupKey(null)}
              className="glass-btn-base glass-btn-soft rounded-xl px-3 py-2 text-sm"
            >
              <AppIcon name="chevronLeft" className="h-4 w-4" />
              <span>{t('render.backToCoarseList')}</span>
            </button>
          </div>

          <div className={`grid gap-4 ${getAspectRatioConfig(videoRatio).isVertical
            ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          }`}>
            {activeGroup.entries.map(({ panel, localIndex }) => {
              const panelKey = `${panel.storyboardId}-${panel.panelIndex}`
              const isLinked = linkedPanels.get(panelKey) || false
              const nextPanel = localIndex < activeGroup.entries.length - 1 ? activeGroup.entries[localIndex + 1].panel : null
              const prevPanel = localIndex > 0 ? activeGroup.entries[localIndex - 1].panel : null
              const isLastFrame = localIndex > 0
                ? (linkedPanels.get(`${activeGroup.entries[localIndex - 1].panel.storyboardId}-${activeGroup.entries[localIndex - 1].panel.panelIndex}`) || false)
                : false
              const hasNext = localIndex < activeGroup.entries.length - 1
              const promptField: PromptField = isLinked ? 'firstLastFramePrompt' : 'videoPrompt'
              const defaultFlPrompt = getDefaultFlPrompt(panel.textPanel?.video_prompt, nextPanel?.textPanel?.video_prompt)
              const externalPrompt = isLinked
                ? (panel.firstLastFramePrompt || defaultFlPrompt)
                : panel.textPanel?.video_prompt
              const localPrompt = getLocalPrompt(panelKey, externalPrompt, promptField)
              const isSavingPrompt = savingPrompts.has(`${promptField}:${panelKey}`)

              return (
                <div
                  key={panelKey}
                  ref={(element) => {
                    if (element) panelRefs.current.set(panelKey, element)
                    else panelRefs.current.delete(panelKey)
                  }}
                  className={`transition-all duration-500 ${highlightedPanelKey === panelKey
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
                    isLinked={isLinked}
                    isLastFrame={isLastFrame}
                    nextPanel={nextPanel}
                    prevPanel={prevPanel}
                    hasNext={hasNext}
                    flModel={flModel}
                    flModelOptions={flModelOptions}
                    flGenerationOptions={flGenerationOptions}
                    flCapabilityFields={flCapabilityFields}
                    flMissingCapabilityFields={flMissingCapabilityFields}
                    flCustomPrompt={flCustomPrompts.get(panelKey) || panel.firstLastFramePrompt || ''}
                    defaultFlPrompt={defaultFlPrompt}
                    localPrompt={localPrompt}
                    isSavingPrompt={isSavingPrompt}
                    onUpdateLocalPrompt={(value) => {
                      updateLocalPrompt(panelKey, value, promptField)
                      if (isLinked) onFlCustomPromptChange(panelKey, value)
                    }}
                    onSavePrompt={(value) => savePrompt(panel.storyboardId, panel.panelIndex, panelKey, value, promptField)}
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
        </section>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groupedPanels.map((group, groupIndex) => {
            const previewImages = group.entries
              .map((entry) => entry.panel.imageUrl)
              .filter((url): url is string => typeof url === 'string' && url.length > 0)
              .slice(0, 4)
            const hasRunning = group.entries.some(({ panel }) => panel.videoTaskRunning || panel.lipSyncTaskRunning)
            const hasFailed = group.entries.some(({ panel }) => !!panel.videoErrorMessage || !!panel.lipSyncErrorMessage)
            const allDone = group.entries.every(({ panel }) => !!panel.videoUrl)
            return (
              <button
                key={`${group.storyboardId}:${group.groupNumber}`}
                type="button"
                onClick={() => setActiveGroupKey(`${group.storyboardId}:${group.groupNumber}`)}
                className="glass-surface-elevated p-3 text-left space-y-2 hover:bg-[var(--glass-bg-muted)] transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--glass-text-primary)]">
                    {t('render.coarseShot', { number: group.groupNumber || (groupIndex + 1) })}
                  </span>
                  <span className="text-xs text-[var(--glass-text-tertiary)]">
                    {t('render.fineShotCount', { count: group.entries.length })}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 4 }).map((_, tileIndex) => {
                    const imageUrl = previewImages[tileIndex]
                    return (
                      <div
                        key={`${group.storyboardId}:${group.groupNumber}:preview:${tileIndex}`}
                        className="relative h-20 w-full overflow-hidden rounded-md border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]"
                      >
                        {imageUrl ? (
                          <MediaImageWithLoading
                            src={imageUrl}
                            alt={`preview-${tileIndex + 1}`}
                            containerClassName="h-full w-full"
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                <div className="text-xs text-[var(--glass-text-tertiary)]">
                  {hasRunning
                    ? t('render.groupRunning')
                    : hasFailed
                      ? t('render.groupFailed')
                      : allDone
                        ? t('render.groupCompleted')
                        : t('render.groupPending')}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
