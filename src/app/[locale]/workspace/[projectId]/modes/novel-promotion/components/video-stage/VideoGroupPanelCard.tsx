'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { GlassSurface } from '@/components/ui/primitives'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { AppIcon } from '@/components/ui/icons'
import { useUpdateProjectPanelFirstLastFrameMode } from '@/lib/query/hooks'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import type {
  FirstLastFrameParams,
  GroupVideoGenerationOptions,
  MultiPromptShot,
  VideoGenerationOptions,
  VideoModelOption,
  VideoPanel,
} from '../video'
import VideoGroupOmniModal from './VideoGroupOmniModal'
import { PanelVideoHistoryDropdown } from '../video/panel-card/PanelVideoHistoryDropdown'

// kling-omni-video multi_prompt 最多支持 6 个分镜
const MAX_OMNI_SHOTS = 6
// 组合分镜固定使用 kling-v3-omni 多分镜合成模型。provider 不固定（用户可能配在
// yunwu / openai-compatible 等任意 provider 下），按 modelId 在已启用模型里动态匹配。
const OMNI_MODEL_ID = 'kling-v3-omni'

interface VideoGroupPanelCardProps {
  projectId: string
  episodeId: string
  groupPanels: VideoPanel[]
  groupStartGlobalNumber: number
  videoRatio: string
  onExpand: () => void
  onUnlinkAll: () => void
  onPreviewImage?: (url: string) => void
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
}

export default function VideoGroupPanelCard({
  projectId,
  episodeId,
  groupPanels,
  groupStartGlobalNumber,
  videoRatio,
  onExpand,
  onUnlinkAll,
  onPreviewImage,
  userVideoModels,
  onGenerateVideo,
}: VideoGroupPanelCardProps) {
  const t = useTranslations('storyboard')
  const cssAspectRatio = videoRatio.replace(':', '/')
  const totalDuration = groupPanels.reduce(
    (sum, panel) => sum + (panel.textPanel?.duration ?? 0),
    0,
  )
  const startNumber = groupStartGlobalNumber
  const endNumber = groupStartGlobalNumber + groupPanels.length - 1
  const generatedVideoCount = groupPanels.filter((panel) => panel.videoUrl).length

  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [groupVideoPlaying, setGroupVideoPlaying] = useState(false)
  const groupVideoRef = useRef<HTMLVideoElement>(null)
  const firstPanel = groupPanels[0]
  // 组合（omni）合成视频写入组内首个面板的 videoUrl
  const groupVideoUrl = firstPanel?.videoUrl

  useEffect(() => {
    _ulogInfo('[VideoHistoryTrace][group card] group video url changed', {
      projectId,
      episodeId,
      storyboardId: firstPanel?.storyboardId,
      panelId: firstPanel?.panelId,
      panelIndex: firstPanel?.panelIndex,
      groupVideoUrl: groupVideoUrl || '',
      historyCount: firstPanel?.videoHistory?.length ?? 0,
    })
    setGroupVideoPlaying(false)
    groupVideoRef.current?.load()
  }, [episodeId, firstPanel?.panelId, firstPanel?.panelIndex, firstPanel?.storyboardId, firstPanel?.videoHistory?.length, groupVideoUrl, projectId])

  // 仅两张图组合支持「首尾帧 / 多镜头」模式切换（与分镜面板共享同一持久化标记）
  const isTwoPanelGroup = groupPanels.length === 2
  const flModeMutation = useUpdateProjectPanelFirstLastFrameMode(projectId)
  const [flModeEnabled, setFlModeEnabled] = useState(firstPanel?.firstLastFrameEnabled ?? true)
  const handleToggleFlMode = () => {
    if (!firstPanel) return
    const next = !flModeEnabled
    setFlModeEnabled(next)
    flModeMutation.mutate({
      storyboardId: firstPanel.storyboardId,
      panelIndex: firstPanel.panelIndex,
      enabled: next,
    })
  }

  const handlePlayGroupVideo = () => {
    _ulogInfo('[VideoHistoryTrace][group card] play group video', {
      projectId,
      episodeId,
      storyboardId: firstPanel?.storyboardId,
      panelId: firstPanel?.panelId,
      panelIndex: firstPanel?.panelIndex,
      groupVideoUrl: groupVideoUrl || '',
    })
    setGroupVideoPlaying(true)
    setTimeout(() => {
      groupVideoRef.current?.play().catch(() => {})
    }, 100)
  }
  const isGroupVideoRunning = !!firstPanel?.videoTaskRunning
  const tooManyShots = groupPanels.length > MAX_OMNI_SHOTS
  const missingImage = groupPanels.some((panel) => !panel.imageUrl)
  // 在已启用视频模型里按 modelId 匹配 kling-v3-omni（provider 任意）
  const omniModel = (userVideoModels ?? []).find((model) => model.value.endsWith(`::${OMNI_MODEL_ID}`))
  const omniModelEnabled = !!omniModel
  const generateDisabled =
    tooManyShots || missingImage || !omniModelEnabled || isGroupVideoRunning || submitting

  const handleConfirmGenerate = async (multiPrompt: MultiPromptShot[], shotTotalDuration: number, fusedPrompt?: string) => {
    if (!firstPanel || !omniModel) return
    setSubmitting(true)
    try {
      const groupVideo: GroupVideoGenerationOptions = {
        multiShot: true,
        shotType: 'customize',
        multiPrompt,
        sound: 'on',
        groupPanelIndices: groupPanels.map((panel) => panel.panelIndex),
        // 两张图组合时携带模式标记：首尾帧 or 多镜头
        ...(isTwoPanelGroup ? { firstLastFrame: flModeEnabled } : {}),
        // 首尾帧模式：携带融合后的单条提示词，后端优先采用
        ...(isTwoPanelGroup && flModeEnabled && fusedPrompt ? { firstLastFramePrompt: fusedPrompt } : {}),
      }
      // kling-v3-omni 的能力字段（duration / generateAudio / resolution）必须齐全，
      // 否则 API 的 requireAllFields 校验会因缺省值而失败；generationMode 由 API 自动补。
      // 其余 omni 专属参数收进 groupVideo 嵌套对象，避免被当作能力选择项校验。
      const generationOptions = {
        duration: shotTotalDuration,
        generateAudio: false,
        resolution: 'pro',
        groupVideo,
      }
      await onGenerateVideo(
        firstPanel.storyboardId,
        firstPanel.panelIndex,
        omniModel.value,
        undefined,
        generationOptions as unknown as VideoGenerationOptions,
        firstPanel.panelId,
        undefined,
        undefined,
      )
      setModalOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <GlassSurface
      variant="elevated"
      padded={false}
      className="relative h-full overflow-visible border-2 border-[var(--glass-accent-from)] shadow-[0_0_18px_rgba(99,102,241,0.25)] transition-all hover:shadow-[var(--glass-shadow-md)]"
    >
      {/* 顶部条带：组标识 + 时长 + 镜头数 */}
      <div className="flex items-center justify-between gap-2 rounded-t-2xl bg-[var(--glass-accent-from)] px-3 py-1.5 text-white">
        <div className="flex items-center gap-1.5 min-w-0">
          <AppIcon name="unplug" className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs font-semibold truncate">
            {t('panelGroup.title', { start: startNumber, end: endNumber })}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] shrink-0">
          {totalDuration > 0 && (
            <span className="opacity-90">{totalDuration.toFixed(1)}{t('panel.duration')}</span>
          )}
          <span className="opacity-90">×{groupPanels.length}</span>
        </div>
      </div>

      {/* 缩略图横排 */}
      <div
        className="relative w-full overflow-hidden bg-[var(--glass-bg-muted)]"
        style={{ aspectRatio: cssAspectRatio }}
      >
        <div className="absolute inset-0 flex">
          {groupPanels.map((panel, index) => (
            <div
              key={`${panel.storyboardId}-${panel.panelIndex}`}
              className="relative h-full flex-1 border-r border-[var(--glass-stroke-base)] last:border-r-0 cursor-pointer"
              onClick={() => panel.imageUrl && onPreviewImage?.(panel.imageUrl)}
              title={panel.imageUrl ? t('image.clickToPreview') : ''}
            >
              {panel.imageUrl ? (
                <MediaImageWithLoading
                  src={panel.imageUrl}
                  alt={`shot-${startNumber + index}`}
                  containerClassName="h-full w-full"
                  className="h-full w-full object-cover"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[var(--glass-bg-surface-strong)] text-[var(--glass-text-tertiary)]">
                  <AppIcon name="imagePreview" className="h-5 w-5" />
                </div>
              )}
              {panel.videoUrl && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
                  <AppIcon name="play" className="h-6 w-6 text-white" />
                </div>
              )}
              <span className="absolute left-1 top-1 glass-chip glass-chip-neutral px-1.5 py-0.5 text-[10px] font-medium">
                {startNumber + index}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 两张图组合：首尾帧 / 多镜头 模式切换 */}
      {isTwoPanelGroup && (
        <div className="flex items-center justify-between gap-2 border-t border-[var(--glass-stroke-base)] px-2.5 pt-2">
          <span className="text-[11px] font-medium text-[var(--glass-text-secondary)] inline-flex items-center gap-1">
            <AppIcon name="unplug" className="w-3 h-3" />
            {flModeEnabled ? t('firstLastFrame.modeFirstLast') : t('firstLastFrame.modeMultiShot')}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={flModeEnabled}
            onClick={handleToggleFlMode}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${flModeEnabled ? 'bg-[var(--glass-accent-from)]' : 'bg-[var(--glass-stroke-base)]'}`}
            title={t('firstLastFrame.modeLabel')}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${flModeEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>
      )}

      {/* 底部信息条 + 操作 */}
      <div className="flex items-center justify-between gap-2 p-2.5">
        <div className="min-w-0 text-xs text-[var(--glass-text-secondary)]">
          <div className="font-medium text-[var(--glass-text-primary)]">
            {t('panelGroup.subtitle')}
          </div>
          <div className="text-[11px] text-[var(--glass-text-tertiary)] mt-0.5">
            {t('panelGroup.videosCount', { count: generatedVideoCount, total: groupPanels.length })}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onUnlinkAll}
            className="glass-btn-base glass-btn-soft flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
            title={t('panelGroup.unlinkAllTitle')}
          >
            <AppIcon name="unplug" className="h-3 w-3" />
            <span>{t('panelGroup.unlinkAll')}</span>
          </button>
          <button
            type="button"
            onClick={onExpand}
            className="glass-btn-base glass-btn-soft flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
            title={t('panelGroup.expandTitle')}
          >
            <AppIcon name="chevronRightMd" className="h-3 w-3" />
            <span>{t('panelGroup.expand')}</span>
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={generateDisabled}
            className="glass-btn-base glass-btn-primary flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] disabled:opacity-50"
            title={
              tooManyShots
                ? t('panelGroup.omni.tooManyShotsTitle', { max: MAX_OMNI_SHOTS })
                : missingImage
                  ? t('panelGroup.omni.missingImageTitle')
                  : !omniModelEnabled
                    ? t('panelGroup.omni.modelNotEnabledTitle')
                    : t('panelGroup.omni.generateTitle')
            }
          >
            <AppIcon name={isGroupVideoRunning ? 'loader' : 'play'} className="h-3 w-3" />
            <span>{isGroupVideoRunning ? t('panelGroup.omni.generating') : t('panelGroup.omni.generate')}</span>
          </button>
        </div>
      </div>

      {/* 组合视频播放区：合成完成后直接在卡片下方播放，无需展开 */}
      {groupVideoUrl && (
        <div className="border-t border-[var(--glass-stroke-base)] p-2.5">
          <div
            className="relative w-full overflow-hidden rounded-lg bg-black"
            style={{ aspectRatio: cssAspectRatio }}
          >
            {groupVideoPlaying ? (
              <video
                ref={groupVideoRef}
                key={groupVideoUrl}
                src={groupVideoUrl}
                controls
                playsInline
                className="h-full w-full object-contain bg-black"
                onEnded={() => setGroupVideoPlaying(false)}
              />
            ) : (
              <button
                type="button"
                onClick={handlePlayGroupVideo}
                className="group relative block h-full w-full"
                title={t('panelGroup.subtitle')}
              >
                {firstPanel?.imageUrl ? (
                  <MediaImageWithLoading
                    src={firstPanel.imageUrl}
                    alt="group-video"
                    containerClassName="h-full w-full"
                    className="h-full w-full object-cover"
                  />
                ) : null}
                <div className="absolute inset-0 flex items-center justify-center bg-black/35 transition-colors group-hover:bg-black/45">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--glass-bg-surface-strong)] shadow-lg transition-transform group-hover:scale-110">
                    <AppIcon name="play" className="h-6 w-6 text-white" />
                  </div>
                </div>
              </button>
            )}
          </div>
          {firstPanel?.panelId && (firstPanel?.videoHistory?.length ?? 0) > 0 && (
            <PanelVideoHistoryDropdown
              projectId={projectId}
              episodeId={episodeId}
              panelId={firstPanel.panelId}
              currentVideoUrl={groupVideoUrl}
              videoHistory={firstPanel.videoHistory ?? []}
            />
          )}
        </div>
      )}

      {modalOpen && firstPanel && (
        <VideoGroupOmniModal
          groupPanels={groupPanels}
          startNumber={startNumber}
          videoRatio={videoRatio}
          submitting={submitting}
          firstLastFrameMode={isTwoPanelGroup && flModeEnabled}
          initialFirstLastFramePrompt={firstPanel?.firstLastFramePrompt}
          onClose={() => { if (!submitting) setModalOpen(false) }}
          onConfirm={handleConfirmGenerate}
        />
      )}
    </GlassSurface>
  )
}
