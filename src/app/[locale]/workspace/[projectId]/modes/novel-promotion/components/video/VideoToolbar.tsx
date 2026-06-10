'use client'
import { useTranslations } from 'next-intl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'
import type { TimelineExportProgress } from '@/lib/video-export/export-progress'

interface VideoToolbarProps {
  totalCoarseShots: number
  totalFineShots: number
  totalPanels: number
  runningCount: number
  videosWithUrl: number
  failedCount: number
  isAnyTaskRunning: boolean
  isDownloading: boolean
  isExportingTimeline: boolean
  timelineExportProgress: TimelineExportProgress | null
  onGenerateAll: () => void
  onDownloadAll: () => void
  onExportTimeline: () => void
  onBack: () => void
  onEnterEditor?: () => void  // 进入剪辑器
  videosReady?: boolean  // 是否有视频可以剪辑
}

export default function VideoToolbar({
  totalCoarseShots,
  totalFineShots,
  totalPanels,
  runningCount,
  videosWithUrl,
  failedCount,
  isAnyTaskRunning,
  isDownloading,
  isExportingTimeline,
  timelineExportProgress,
  onGenerateAll,
  onDownloadAll,
  onExportTimeline,
  onBack,
  onEnterEditor,
  videosReady = false
}: VideoToolbarProps) {
  const t = useTranslations('video')
  const videoTaskRunningState = isAnyTaskRunning
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'video',
      hasOutput: videosWithUrl > 0,
    })
    : null
  const videoDownloadState = isDownloading
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'video',
      hasOutput: videosWithUrl > 0,
    })
    : null
  const timelineProgressText = timelineExportProgress?.phase === 'preparing'
    ? t('toolbar.exportPreparing')
    : timelineExportProgress?.phase === 'downloading'
      ? t('toolbar.exportDownloading', {
        current: timelineExportProgress.current,
        total: timelineExportProgress.total,
      })
      : timelineExportProgress?.phase === 'packing'
        ? t('toolbar.exportPacking', { percent: timelineExportProgress.percent })
        : ''
  return (
    <div className="glass-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-[var(--glass-text-secondary)]">
             {t('toolbar.title')}
          </span>
          <span className="text-sm text-[var(--glass-text-tertiary)]">
            {t('toolbar.totalCoarseShots', { count: totalCoarseShots })}
            <span className="ml-1">{t('toolbar.totalFineShots', { count: totalFineShots || totalPanels })}</span>
            {runningCount > 0 && (
              <span className="text-[var(--glass-tone-info-fg)] ml-2 animate-pulse">({t('toolbar.generatingShots', { count: runningCount })})</span>
            )}
            {videosWithUrl > 0 && (
              <span className="text-[var(--glass-tone-success-fg)] ml-2">({t('toolbar.completedShots', { count: videosWithUrl })})</span>
            )}
            {failedCount > 0 && (
              <span className="text-[var(--glass-tone-danger-fg)] ml-2">({t('toolbar.failedShots', { count: failedCount })})</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onGenerateAll}
            disabled={isAnyTaskRunning}
            className="glass-btn-base glass-btn-primary flex items-center gap-2 px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAnyTaskRunning ? (
              <TaskStatusInline state={videoTaskRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
            ) : (
              <>
                <AppIcon name="plus" className="w-4 h-4" />
                <span>{t('toolbar.generateAll')}</span>
              </>
            )}
          </button>
          <button
            onClick={onDownloadAll}
            disabled={videosWithUrl === 0 || isDownloading}
            className="glass-btn-base glass-btn-tone-info flex items-center gap-2 px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            title={videosWithUrl === 0 ? t('toolbar.noVideos') : t('toolbar.downloadCount', { count: videosWithUrl })}
          >
            {isDownloading ? (
              <TaskStatusInline state={videoDownloadState} className="text-white [&>span]:text-white [&_svg]:text-white" />
            ) : (
              <>
                <AppIcon name="image" className="w-4 h-4" />
                <span>{t('toolbar.downloadAll')}</span>
              </>
            )}
          </button>
          <button
            onClick={onExportTimeline}
            disabled={videosWithUrl === 0 || isExportingTimeline}
            className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-4 py-2 text-sm font-medium border border-[var(--glass-stroke-base)] disabled:opacity-50 disabled:cursor-not-allowed"
            title={videosWithUrl === 0 ? t('toolbar.noVideos') : t('toolbar.exportTimelineTitle')}
          >
            <AppIcon name="clapperboard" className="w-4 h-4" />
            <span>{isExportingTimeline ? t('toolbar.exportingTimeline') : t('toolbar.exportTimeline')}</span>
          </button>
          {onEnterEditor && (
            <button
              onClick={onEnterEditor}
              disabled={!videosReady}
              className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-4 py-2 text-sm font-medium border border-[var(--glass-stroke-base)] disabled:opacity-50 disabled:cursor-not-allowed"
              title={videosReady ? t('toolbar.enterEditor') : t('panelCard.needVideo')}
            >
              <AppIcon name="wandOff" className="w-4 h-4" />
              <span>{t('toolbar.enterEdit')}</span>
            </button>
          )}
          <button
            onClick={onBack}
            className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-4 py-2 text-sm font-medium border border-[var(--glass-stroke-base)] hover:text-[var(--glass-tone-info-fg)]"
          >
            <AppIcon name="chevronLeft" className="w-4 h-4" />
            <span>{t('toolbar.back')}</span>
          </button>
        </div>
      </div>
      {timelineExportProgress && (
        <div className="mt-3" role="status" aria-live="polite">
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-[var(--glass-text-secondary)]">
            <span>{timelineProgressText}</span>
            <span className="tabular-nums">{timelineExportProgress.percent}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-[var(--glass-bg-muted)]"
            role="progressbar"
            aria-label={timelineProgressText}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={timelineExportProgress.percent}
          >
            <div
              className="h-full rounded-full bg-[var(--glass-accent-from)] transition-[width] duration-300 ease-out"
              style={{ width: `${timelineExportProgress.percent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
