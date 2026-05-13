'use client'

import { useTranslations } from 'next-intl'
import { GlassSurface } from '@/components/ui/primitives'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { AppIcon } from '@/components/ui/icons'
import type { StoryboardPanel } from './hooks/useStoryboardState'

interface GroupPanelCardProps {
  groupPanels: StoryboardPanel[]
  groupStartGlobalNumber: number
  videoRatio: string
  onExpand: () => void
  onUnlinkAll: () => void
  onPreviewImage?: (url: string) => void
  // 右侧链接按钮：把下一个 panel 拉入本组
  linkable?: boolean
  linkEnableAllowed?: boolean
  onToggleLinkToNext?: () => Promise<{ rejected: boolean; reason?: string; max?: number }> | void
}

export default function GroupPanelCard({
  groupPanels,
  groupStartGlobalNumber,
  videoRatio,
  onExpand,
  onUnlinkAll,
  onPreviewImage,
  linkable = false,
  linkEnableAllowed = true,
  onToggleLinkToNext,
}: GroupPanelCardProps) {
  const t = useTranslations('storyboard')
  const cssAspectRatio = videoRatio.replace(':', '/')
  const totalDuration = groupPanels.reduce((sum, panel) => sum + (panel.duration ?? 0), 0)
  const startNumber = groupStartGlobalNumber
  const endNumber = groupStartGlobalNumber + groupPanels.length - 1
  const generatedImageCount = groupPanels.filter((panel) => panel.imageUrl).length

  return (
    <GlassSurface
      variant="elevated"
      padded={false}
      className="relative h-full overflow-visible border-2 border-[var(--glass-accent-from)] shadow-[0_0_18px_rgba(99,102,241,0.25)] transition-all hover:shadow-[var(--glass-shadow-md)]"
    >
      {/* 顶部条带：组标识 + 操作按钮 */}
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
              key={panel.id || index}
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
              <span className="absolute left-1 top-1 glass-chip glass-chip-neutral px-1.5 py-0.5 text-[10px] font-medium">
                {startNumber + index}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧链接按钮：把下一个分镜加入本组 */}
      {linkable && onToggleLinkToNext && (
        <div className="absolute -right-[22px] top-1/2 -translate-y-1/2 z-50">
          <button
            type="button"
            onClick={() => { void onToggleLinkToNext() }}
            disabled={!linkEnableAllowed}
            className={`
              group relative h-7 w-7 rounded-full flex items-center justify-center
              glass-btn-base border border-[var(--glass-stroke-base)]
              bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)]
              shadow-[var(--glass-shadow-sm)] transition-all duration-200 ease-out
              ${linkEnableAllowed
                ? 'hover:-translate-y-0.5 hover:shadow-[var(--glass-shadow-md)] hover:border-[var(--glass-stroke-focus)] hover:bg-[var(--glass-tone-info-bg)]'
                : 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-tertiary)] cursor-not-allowed'
              }
            `}
            title={linkEnableAllowed
              ? t('panelActions.linkToNext')
              : t('panelActions.linkGroupMaxReached', { max: 6 })}
          >
            <AppIcon name="unplug" className="w-4 h-4" />
            <span className={`
              absolute -top-8 left-1/2 -translate-x-1/2
              px-2 py-1 text-xs text-white bg-[var(--glass-overlay)] rounded
              opacity-0 group-hover:opacity-100
              transition-opacity duration-200
              whitespace-nowrap pointer-events-none
              ${linkEnableAllowed ? '' : 'hidden'}
            `}>
              {t('panelActions.linkToNext')}
            </span>
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
            {t('panelGroup.imagesCount', { count: generatedImageCount, total: groupPanels.length })}
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
