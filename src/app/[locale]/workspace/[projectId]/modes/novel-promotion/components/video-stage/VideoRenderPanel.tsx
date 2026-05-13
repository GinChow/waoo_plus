'use client'

import { getAspectRatioConfig } from '@/lib/constants'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MutableRefObject } from 'react'
import { useTranslations } from 'next-intl'
import type { CapabilitySelections, CapabilityValue } from '@/lib/model-config-contract'
import { VideoPanelCard, type VideoPanel, type VideoModelOption, type MatchedVoiceLine, type FirstLastFrameParams, type VideoGenerationOptions } from '../video'
import { useUpdateProjectPanelVideoPrompt } from '@/lib/query/hooks'
import { AppIcon } from '@/components/ui/icons'
import VideoGroupPanelCard from './VideoGroupPanelCard'

interface VideoPanelGroup {
  groupKey: string
  panelIndices: number[]
}

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
  const t = useTranslations('storyboard')
  const [panelPromptOverrides, setPanelPromptOverrides] = useState<Map<string, string>>(new Map())
  const updatePanelVideoPromptMutation = useUpdateProjectPanelVideoPrompt(projectId)

  useEffect(() => {
    if (!highlightedPanelKey) return
    panelRefs.current.get(highlightedPanelKey)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightedPanelKey, panelRefs])

  // 计算连续链接组（仅在同一 storyboard 内合并；跨 storyboard 边界不合并）
  const groups: VideoPanelGroup[] = useMemo(() => {
    const result: VideoPanelGroup[] = []
    let cursor = 0
    while (cursor < allPanels.length) {
      const indices: number[] = [cursor]
      while (cursor < allPanels.length - 1) {
        const panel = allPanels[cursor]
        const nextPanel = allPanels[cursor + 1]
        const linkKey = `${panel.storyboardId}-${panel.panelIndex}`
        // 跨 storyboard 不合并
        if (panel.storyboardId !== nextPanel.storyboardId) break
        if (!linkedPanels.get(linkKey)) break
        cursor += 1
        indices.push(cursor)
      }
      const firstPanel = allPanels[indices[0]]
      const groupKey = `${firstPanel.storyboardId}-grp-${firstPanel.panelIndex}-${indices.length}`
      result.push({ groupKey, panelIndices: indices })
      cursor += 1
    }
    return result
  }, [allPanels, linkedPanels])

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  useEffect(() => {
    setExpandedGroups((previous) => {
      if (previous.size === 0) return previous
      const validKeys = new Set(groups.map((group) => group.groupKey))
      let changed = false
      const next = new Set<string>()
      previous.forEach((key) => {
        if (validKeys.has(key)) next.add(key)
        else changed = true
      })
      return changed ? next : previous
    })
  }, [groups])

  const toggleExpand = useCallback((groupKey: string) => {
    setExpandedGroups((previous) => {
      const next = new Set(previous)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }, [])

  const handleUnlinkGroup = useCallback(async (group: VideoPanelGroup) => {
    for (let i = 0; i < group.panelIndices.length - 1; i += 1) {
      const panel = allPanels[group.panelIndices[i]]
      const linkKey = `${panel.storyboardId}-${panel.panelIndex}`
      if (linkedPanels.get(linkKey)) {
        await onToggleLink(linkKey, panel.storyboardId, panel.panelIndex)
      }
    }
  }, [allPanels, linkedPanels, onToggleLink])

  const renderPanelCard = (
    panelIndexInAllPanels: number,
    groupContext?: { isInGroup: boolean; isGroupStart: boolean; onCollapse?: () => void },
  ) => {
    const panel = allPanels[panelIndexInAllPanels]
    const panelKey = `${panel.storyboardId}-${panel.panelIndex}`
    const localPrompt = panelPromptOverrides.get(panelKey) ?? panel.textPanel?.video_prompt ?? ''
    const inGroup = !!groupContext?.isInGroup

    return (
      <div
        key={panelKey}
        ref={(element) => {
          if (element) panelRefs.current.set(panelKey, element)
          else panelRefs.current.delete(panelKey)
        }}
        className={`relative transition-all duration-500 ${panelKey === highlightedPanelKey
          ? 'ring-4 ring-[var(--glass-stroke-focus)] ring-offset-2 ring-offset-[var(--glass-bg-canvas)] rounded-2xl scale-[1.02]'
          : ''
        } ${inGroup ? 'ring-2 ring-[var(--glass-accent-from)] rounded-2xl' : ''}`}
      >
        {inGroup && groupContext?.isGroupStart && (
          <div className="absolute -top-2 left-2 right-2 z-20 flex items-center gap-2 pointer-events-none">
            <div className="flex items-center gap-1.5 rounded-full bg-[var(--glass-accent-from)] px-2 py-0.5 text-[10px] font-semibold text-white shadow-[var(--glass-shadow-sm)] pointer-events-auto">
              <AppIcon name="unplug" className="h-2.5 w-2.5" />
              <span>{t('panelGroup.badge')}</span>
            </div>
            {groupContext.onCollapse && (
              <button
                type="button"
                onClick={groupContext.onCollapse}
                className="ml-auto pointer-events-auto rounded-full bg-[var(--glass-bg-surface)] border border-[var(--glass-accent-from)] px-2 py-0.5 text-[10px] text-[var(--glass-accent-from)] hover:bg-[var(--glass-tone-info-bg)]"
                title={t('panelGroup.collapseTitle')}
              >
                {t('panelGroup.collapse')}
              </button>
            )}
          </div>
        )}
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
  }

  return (
    <div className={`grid gap-4 ${getAspectRatioConfig(videoRatio).isVertical
      ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
    }`}>
      {groups.flatMap((group) => {
        const isCollapsibleGroup = group.panelIndices.length > 1
        const isExpanded = expandedGroups.has(group.groupKey)
        if (isCollapsibleGroup && !isExpanded) {
          const firstPanelIndex = group.panelIndices[0]
          const firstPanel = allPanels[firstPanelIndex]
          const groupStartGlobalNumber = firstPanel.panelIndex + 1
          const groupPanels = group.panelIndices.map((index) => allPanels[index])
          return [(
            <div key={group.groupKey} className="relative h-full">
              <VideoGroupPanelCard
                groupPanels={groupPanels}
                groupStartGlobalNumber={groupStartGlobalNumber}
                videoRatio={videoRatio}
                onExpand={() => toggleExpand(group.groupKey)}
                onUnlinkAll={() => { void handleUnlinkGroup(group) }}
                onPreviewImage={(url) => onPreviewImage(url)}
              />
            </div>
          )]
        }

        return group.panelIndices.map((index, position) => {
          const groupContext = isCollapsibleGroup
            ? {
              isInGroup: true,
              isGroupStart: position === 0,
              onCollapse: position === 0 ? () => toggleExpand(group.groupKey) : undefined,
            }
            : undefined
          return renderPanelCard(index, groupContext)
        })
      })}
    </div>
  )
}
