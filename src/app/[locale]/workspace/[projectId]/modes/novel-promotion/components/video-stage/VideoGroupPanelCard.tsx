'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { GlassSurface } from '@/components/ui/primitives'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { AppIcon } from '@/components/ui/icons'
import type {
  FirstLastFrameParams,
  GroupVideoGenerationOptions,
  MultiPromptShot,
  VideoGenerationOptions,
  VideoModelOption,
  VideoPanel,
} from '../video'
import VideoGroupOmniModal from './VideoGroupOmniModal'

// kling-omni-video multi_prompt 最多支持 6 个分镜
const MAX_OMNI_SHOTS = 6
// 组合分镜固定使用 kling-v3-omni 多分镜合成模型。provider 不固定（用户可能配在
// yunwu / openai-compatible 等任意 provider 下），按 modelId 在已启用模型里动态匹配。
const OMNI_MODEL_ID = 'kling-v3-omni'

interface VideoGroupPanelCardProps {
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
  const firstPanel = groupPanels[0]
  const isGroupVideoRunning = !!firstPanel?.videoTaskRunning
  const tooManyShots = groupPanels.length > MAX_OMNI_SHOTS
  const missingImage = groupPanels.some((panel) => !panel.imageUrl)
  // 在已启用视频模型里按 modelId 匹配 kling-v3-omni（provider 任意）
  const omniModel = (userVideoModels ?? []).find((model) => model.value.endsWith(`::${OMNI_MODEL_ID}`))
  const omniModelEnabled = !!omniModel
  const generateDisabled =
    tooManyShots || missingImage || !omniModelEnabled || isGroupVideoRunning || submitting

  const handleConfirmGenerate = async (multiPrompt: MultiPromptShot[], shotTotalDuration: number) => {
    if (!firstPanel || !omniModel) return
    setSubmitting(true)
    try {
      const groupVideo: GroupVideoGenerationOptions = {
        multiShot: true,
        shotType: 'customize',
        multiPrompt,
        sound: 'on',
        groupPanelIndices: groupPanels.map((panel) => panel.panelIndex),
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

      {modalOpen && firstPanel && (
        <VideoGroupOmniModal
          groupPanels={groupPanels}
          startNumber={startNumber}
          videoRatio={videoRatio}
          submitting={submitting}
          onClose={() => { if (!submitting) setModalOpen(false) }}
          onConfirm={handleConfirmGenerate}
        />
      )}
    </GlassSurface>
  )
}
