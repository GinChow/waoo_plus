'use client'

import { useTranslations } from 'next-intl'
import { GlassSurface } from '@/components/ui/primitives'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { AppIcon } from '@/components/ui/icons'
import type { VideoPanel } from '../video'

interface VideoGroupPanelCardProps {
  groupPanels: VideoPanel[]
  groupStartGlobalNumber: number
  videoRatio: string
  onExpand: () => void
  onUnlinkAll: () => void
  onPreviewImage?: (url: string) => void
}

export default function VideoGroupPanelCard({
  groupPanels,
  groupStartGlobalNumber,
  videoRatio,
  onExpand,
  onUnlinkAll,
  onPreviewImage,
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
            className="glass-btn-base glass-btn-primary flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px]"
            title={t('panelGroup.expandTitle')}
          >
            <AppIcon name="chevronRightMd" className="h-3 w-3" />
            <span>{t('panelGroup.expand')}</span>
          </button>
        </div>
      </div>
    </GlassSurface>
  )
}
