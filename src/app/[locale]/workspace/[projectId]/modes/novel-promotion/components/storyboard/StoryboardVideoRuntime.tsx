'use client'

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import {
  useMatchedVoiceLines,
  useDownloadRemoteBlob,
  useListProjectEpisodeVideoUrls,
  useUpdateProjectPanelVideoPrompt,
} from '@/lib/query/hooks'
import { useLipSync } from '@/lib/query/hooks/useStoryboards'
import { useVideoTaskStates } from '@/lib/novel-promotion/stages/video-stage-runtime/useVideoTaskStates'
import { useVideoPanelsProjection } from '@/lib/novel-promotion/stages/video-stage-runtime/useVideoPanelsProjection'
import { useVideoVoiceLines } from '@/lib/novel-promotion/stages/video-stage-runtime/useVideoVoiceLines'
import { useVideoStageUiState } from '@/lib/novel-promotion/stages/video-stage-runtime/useVideoStageUiState'
import { useVideoFirstLastFrameFlow } from '@/lib/novel-promotion/stages/video-stage-runtime/useVideoFirstLastFrameFlow'
import { useVideoDownloadAll } from '@/lib/novel-promotion/stages/video-stage-runtime/useVideoDownloadAll'
import { useVideoTimelineExport } from '@/lib/novel-promotion/stages/video-stage-runtime/useVideoTimelineExport'
import { filterNormalVideoModelOptions } from '@/lib/model-capabilities/video-model-options'
import { useTranslations } from 'next-intl'
import type { CapabilitySelections } from '@/lib/model-config-contract'
import type {
  Clip,
  BatchVideoGenerationParams,
  FirstLastFrameParams,
  PanelGroupRuntime,
  Storyboard,
  VideoGenerationOptions,
  VideoModelOption,
  VideoPanel,
} from '../video'
import { VideoPanelCard } from '../video'
import VideoGroupPanelCard from '../video-stage/VideoGroupPanelCard'
import { buildVideoFrameCaptureTargets } from '../video/panel-card/frame-capture-targets'

interface StoryboardVideoRuntimeProviderProps {
  children: ReactNode
  projectId: string
  episodeId: string
  storyboards: Storyboard[]
  clips: Clip[]
  defaultVideoModel: string
  capabilityOverrides: CapabilitySelections
  videoRatio: string
  userVideoModels?: VideoModelOption[]
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
  onGenerateAllVideos: (options?: BatchVideoGenerationParams) => Promise<void>
  onUpdatePanelVideoModel: (storyboardId: string, panelIndex: number, model: string) => Promise<void>
  onUploadPanelImage?: (panelId: string, file: File) => Promise<void> | void
}

interface StoryboardVideoRuntimeValue {
  projectId: string
  episodeId: string
  videoRatio: string
  defaultVideoModel: string
  capabilityOverrides: CapabilitySelections
  videoModelOptions: VideoModelOption[]
  // 未过滤的全部已启用视频模型（组合视频需要匹配 kling-v3-omni 等非常规模型）
  userVideoModels: VideoModelOption[]
  allPanels: VideoPanel[]
  panelGroupsByAnchor: Map<string, PanelGroupRuntime>
  panelIndexByKey: Map<string, number>
  linkedPanels: Map<string, boolean>
  panelVideoPreference: Map<string, boolean>
  panelVoiceLines: ReturnType<typeof useVideoVoiceLines>['panelVoiceLines']
  runningVoiceLineIds: Set<string>
  toggleLipSyncVideo: (panelKey: string, value: boolean) => void
  onGenerateVideo: StoryboardVideoRuntimeProviderProps['onGenerateVideo']
  onGenerateAllVideos: () => Promise<void>
  onUpdatePanelVideoModel: StoryboardVideoRuntimeProviderProps['onUpdatePanelVideoModel']
  onLipSync: (storyboardId: string, panelIndex: number, voiceLineId: string, panelId?: string) => Promise<void>
  onUploadPanelImage?: (panelId: string, file: File) => Promise<void> | void
  flModel: string
  flModelOptions: VideoModelOption[]
  flGenerationOptions: VideoGenerationOptions
  flCapabilityFields: ReturnType<typeof useVideoFirstLastFrameFlow>['flCapabilityFields']
  flMissingCapabilityFields: string[]
  flCustomPrompts: Map<string, string>
  setFlModel: (model: string) => void
  setFlCapabilityValue: (field: string, rawValue: string) => void
  setFlCustomPrompt: (panelKey: string, value: string) => void
  resetFlCustomPrompt: (panelKey: string) => void
  handleGenerateFirstLastFrame: ReturnType<typeof useVideoFirstLastFrameFlow>['handleGenerateFirstLastFrame']
  getDefaultFlPrompt: ReturnType<typeof useVideoFirstLastFrameFlow>['getDefaultFlPrompt']
  runningVideoCount: number
  completedVideoCount: number
  staleVideoCount: number
  canGenerateAllVideos: boolean
  isDownloadingVideos: boolean
  isExportingTimeline: boolean
  downloadAllVideos: () => Promise<void>
  exportTimeline: () => Promise<void>
}

const StoryboardVideoRuntimeContext = createContext<StoryboardVideoRuntimeValue | null>(null)

export function StoryboardVideoRuntimeProvider({
  children,
  projectId,
  episodeId,
  storyboards,
  clips,
  defaultVideoModel,
  capabilityOverrides,
  videoRatio,
  userVideoModels,
  onGenerateVideo,
  onGenerateAllVideos,
  onUpdatePanelVideoModel,
  onUploadPanelImage,
}: StoryboardVideoRuntimeProviderProps) {
  const tVideo = useTranslations('video')
  const { panelVideoStates, panelLipStates } = useVideoTaskStates({ projectId, storyboards })
  const { allPanels, panelGroupsByAnchor } = useVideoPanelsProjection({
    storyboards,
    clips,
    panelVideoStates,
    panelLipStates,
  })
  const matchedVoiceLinesQuery = useMatchedVoiceLines(projectId, episodeId)
  const listEpisodeVideoUrlsMutation = useListProjectEpisodeVideoUrls(projectId)
  const downloadRemoteBlobMutation = useDownloadRemoteBlob()
  const { panelVoiceLines, runningVoiceLineIds } = useVideoVoiceLines({
    projectId,
    matchedVoiceLinesQuery,
  })
  const lipSyncMutation = useLipSync(projectId, episodeId)
  const {
    panelVideoPreference,
    toggleLipSyncVideo,
  } = useVideoStageUiState()
  const videoModelOptions = useMemo(
    () => filterNormalVideoModelOptions(userVideoModels || []),
    [userVideoModels],
  )
  const linkedPanels = useMemo(() => {
    const result = new Map<string, boolean>()
    allPanels.forEach((panel) => {
      if (panel.linkedToNextPanel) {
        result.set(`${panel.storyboardId}-${panel.panelIndex}`, true)
      }
    })
    return result
  }, [allPanels])
  const panelIndexByKey = useMemo(() => {
    const result = new Map<string, number>()
    allPanels.forEach((panel, index) => {
      result.set(`${panel.storyboardId}-${panel.panelIndex}`, index)
    })
    return result
  }, [allPanels])
  const firstLastFrame = useVideoFirstLastFrameFlow({
    allPanels,
    linkedPanels,
    videoModelOptions: userVideoModels || [],
    onGenerateVideo,
    t: (key) => tVideo(key as never),
  })
  const videoDownloads = useVideoDownloadAll({
    episodeId,
    t: (key) => tVideo(key as never),
    allPanels,
    panelVideoPreference,
    listEpisodeVideoUrlsMutation,
    downloadRemoteBlobMutation,
  })
  const timelineExport = useVideoTimelineExport({
    episodeId,
    t: (key) => tVideo(key as never),
    allPanels,
    panelVideoPreference,
    listEpisodeVideoUrlsMutation,
    downloadRemoteBlobMutation,
  })
  const handleLipSync = useCallback(async (
    storyboardId: string,
    panelIndex: number,
    voiceLineId: string,
    panelId?: string,
  ) => {
    await lipSyncMutation.mutateAsync({ storyboardId, panelIndex, voiceLineId, panelId })
  }, [lipSyncMutation])

  const value = useMemo<StoryboardVideoRuntimeValue>(() => ({
    projectId,
    episodeId,
    videoRatio,
    defaultVideoModel,
    capabilityOverrides,
    videoModelOptions,
    userVideoModels: userVideoModels || [],
    allPanels,
    panelGroupsByAnchor,
    panelIndexByKey,
    linkedPanels,
    panelVideoPreference,
    panelVoiceLines,
    runningVoiceLineIds,
    toggleLipSyncVideo,
    onGenerateVideo,
    onGenerateAllVideos: () => onGenerateAllVideos({ videoModel: defaultVideoModel }),
    onUpdatePanelVideoModel,
    onLipSync: handleLipSync,
    onUploadPanelImage,
    flModel: firstLastFrame.flModel,
    flModelOptions: firstLastFrame.flModelOptions,
    flGenerationOptions: firstLastFrame.flGenerationOptions,
    flCapabilityFields: firstLastFrame.flCapabilityFields,
    flMissingCapabilityFields: firstLastFrame.flMissingCapabilityFields,
    flCustomPrompts: firstLastFrame.flCustomPrompts,
    setFlModel: firstLastFrame.setFlModel,
    setFlCapabilityValue: firstLastFrame.setFlCapabilityValue,
    setFlCustomPrompt: firstLastFrame.setFlCustomPrompt,
    resetFlCustomPrompt: firstLastFrame.resetFlCustomPrompt,
    handleGenerateFirstLastFrame: firstLastFrame.handleGenerateFirstLastFrame,
    getDefaultFlPrompt: firstLastFrame.getDefaultFlPrompt,
    runningVideoCount: allPanels.filter((panel) => panel.videoTaskRunning).length,
    completedVideoCount: allPanels.filter((panel) => panel.videoUrl).length,
    staleVideoCount: allPanels.filter((panel) => panel.isVideoStale).length,
    canGenerateAllVideos: !!defaultVideoModel,
    isDownloadingVideos: videoDownloads.isDownloading,
    isExportingTimeline: timelineExport.isExportingTimeline,
    downloadAllVideos: videoDownloads.handleDownloadAllVideos,
    exportTimeline: timelineExport.handleExportTimeline,
  }), [
    allPanels,
    capabilityOverrides,
    defaultVideoModel,
    episodeId,
    firstLastFrame,
    handleLipSync,
    linkedPanels,
    onGenerateAllVideos,
    onGenerateVideo,
    onUpdatePanelVideoModel,
    onUploadPanelImage,
    panelGroupsByAnchor,
    panelIndexByKey,
    panelVideoPreference,
    panelVoiceLines,
    projectId,
    runningVoiceLineIds,
    toggleLipSyncVideo,
    userVideoModels,
    videoModelOptions,
    videoRatio,
    videoDownloads.handleDownloadAllVideos,
    videoDownloads.isDownloading,
    timelineExport.handleExportTimeline,
    timelineExport.isExportingTimeline,
  ])

  return (
    <StoryboardVideoRuntimeContext.Provider value={value}>
      {children}
    </StoryboardVideoRuntimeContext.Provider>
  )
}

export function useStoryboardVideoRuntime() {
  const value = useContext(StoryboardVideoRuntimeContext)
  if (!value) throw new Error('useStoryboardVideoRuntime must be used within StoryboardVideoRuntimeProvider')
  return value
}

interface StoryboardVideoPaneProps {
  storyboardId: string
  panelIndex: number
  onToggleLink: (panelKey: string, storyboardId: string, panelIndex: number) => void
  onPreviewImage?: (imageUrl: string) => void
}

export function StoryboardVideoPane({
  storyboardId,
  panelIndex,
  onToggleLink,
  onPreviewImage,
}: StoryboardVideoPaneProps) {
  const runtime = useStoryboardVideoRuntime()
  const key = `${storyboardId}-${panelIndex}`
  const allPanelsIndex = runtime.panelIndexByKey.get(key)
  const [promptOverrides, setPromptOverrides] = useState<Map<string, string>>(new Map())
  const updatePromptMutation = useUpdateProjectPanelVideoPrompt(runtime.projectId)
  if (allPanelsIndex === undefined) return null

  const panel = runtime.allPanels[allPanelsIndex]
  const previousPanel = allPanelsIndex > 0 ? runtime.allPanels[allPanelsIndex - 1] : null
  const nextPanel = allPanelsIndex < runtime.allPanels.length - 1
    ? runtime.allPanels[allPanelsIndex + 1]
    : null
  const isPanelLinked = (index: number) => {
    const target = runtime.allPanels[index]
    return runtime.linkedPanels.get(`${target.storyboardId}-${target.panelIndex}`) === true
  }
  // 首尾帧模式仅在恰好两个分镜组合为一个镜头时生效；3 个及以上的链接组按普通单镜模式制作
  let chainStart = allPanelsIndex
  while (chainStart > 0 && isPanelLinked(chainStart - 1)) chainStart -= 1
  let chainEnd = allPanelsIndex
  while (chainEnd < runtime.allPanels.length - 1 && isPanelLinked(chainEnd)) chainEnd += 1
  const isFirstLastFramePair = chainEnd - chainStart === 1
  const isLinked = isFirstLastFramePair && runtime.linkedPanels.get(key) === true
  const isLastFrame = isFirstLastFramePair && !!previousPanel
    && runtime.linkedPanels.get(`${previousPanel.storyboardId}-${previousPanel.panelIndex}`) === true
  const localPrompt = promptOverrides.get(key) ?? panel.textPanel?.video_prompt ?? ''
  const frameCaptureTargets = buildVideoFrameCaptureTargets(runtime.allPanels, allPanelsIndex)

  return (
    <VideoPanelCard
      embedded
      panel={panel}
      panelIndex={panel.panelIndex}
      defaultVideoModel={panel.videoModel || runtime.defaultVideoModel}
      capabilityOverrides={runtime.capabilityOverrides}
      videoRatio={runtime.videoRatio}
      userVideoModels={runtime.videoModelOptions}
      projectId={runtime.projectId}
      episodeId={runtime.episodeId}
      runningVoiceLineIds={runtime.runningVoiceLineIds}
      matchedVoiceLines={runtime.panelVoiceLines.get(key) || []}
      onLipSync={runtime.onLipSync}
      showLipSyncVideo={runtime.panelVideoPreference.get(key) ?? true}
      onToggleLipSyncVideo={runtime.toggleLipSyncVideo}
      isLinked={isLinked}
      isLastFrame={isLastFrame}
      nextPanel={nextPanel}
      prevPanel={previousPanel}
      hasNext={!!nextPanel && nextPanel.storyboardId === storyboardId}
      flModel={runtime.flModel}
      flModelOptions={runtime.flModelOptions}
      flGenerationOptions={runtime.flGenerationOptions}
      flCapabilityFields={runtime.flCapabilityFields}
      flMissingCapabilityFields={runtime.flMissingCapabilityFields}
      flCustomPrompt={runtime.flCustomPrompts.get(key) || panel.firstLastFramePrompt || ''}
      defaultFlPrompt={runtime.getDefaultFlPrompt(panel.textPanel?.video_prompt, nextPanel?.textPanel?.video_prompt)}
      localPrompt={localPrompt}
      isSavingPrompt={updatePromptMutation.isPending}
      onUpdateLocalPrompt={(value) => {
        setPromptOverrides((previous) => new Map(previous).set(key, value))
      }}
      onSavePrompt={async (value) => {
        setPromptOverrides((previous) => new Map(previous).set(key, value))
        await updatePromptMutation.mutateAsync({ storyboardId, panelIndex, value })
      }}
      onGenerateVideo={runtime.onGenerateVideo}
      onUpdatePanelVideoModel={runtime.onUpdatePanelVideoModel}
      onToggleLink={onToggleLink}
      onFlModelChange={runtime.setFlModel}
      onFlCapabilityChange={runtime.setFlCapabilityValue}
      onFlCustomPromptChange={runtime.setFlCustomPrompt}
      onResetFlPrompt={runtime.resetFlCustomPrompt}
      onGenerateFirstLastFrame={runtime.handleGenerateFirstLastFrame}
      onPreviewImage={onPreviewImage}
      frameCaptureTargets={frameCaptureTargets}
      onCaptureFrameAsImage={runtime.onUploadPanelImage}
    />
  )
}

interface StoryboardGroupVideoPaneProps {
  storyboardId: string
  // 组内各分镜在所属 storyboard 中的 panelIndex（按顺序）
  panelIndexes: number[]
  groupStartGlobalNumber: number
  onExpand: () => void
  onUnlinkAll: () => void
  onPreviewImage?: (imageUrl: string) => void
}

// 折叠组合分镜的视频制作区：复用成片组合卡片（kling-v3-omni 多镜头合成）
export function StoryboardGroupVideoPane({
  storyboardId,
  panelIndexes,
  groupStartGlobalNumber,
  onExpand,
  onUnlinkAll,
  onPreviewImage,
}: StoryboardGroupVideoPaneProps) {
  const runtime = useStoryboardVideoRuntime()
  const groupPanels = panelIndexes
    .map((panelIndex) => {
      const index = runtime.panelIndexByKey.get(`${storyboardId}-${panelIndex}`)
      return index === undefined ? null : runtime.allPanels[index]
    })
    .filter((panel): panel is VideoPanel => !!panel)
  if (groupPanels.length === 0) return null

  const anchorPanelId = groupPanels[0]?.panelId
  const group = anchorPanelId ? runtime.panelGroupsByAnchor.get(anchorPanelId) : undefined

  return (
    <VideoGroupPanelCard
      embedded
      projectId={runtime.projectId}
      episodeId={runtime.episodeId}
      groupPanels={groupPanels}
      group={group}
      groupStartGlobalNumber={groupStartGlobalNumber}
      videoRatio={runtime.videoRatio}
      onExpand={onExpand}
      onUnlinkAll={onUnlinkAll}
      onPreviewImage={onPreviewImage}
      userVideoModels={runtime.userVideoModels}
      onGenerateVideo={runtime.onGenerateVideo}
    />
  )
}
