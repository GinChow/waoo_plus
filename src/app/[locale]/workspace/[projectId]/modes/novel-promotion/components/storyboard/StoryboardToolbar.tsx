'use client'

import { useTranslations } from 'next-intl'
import type { TaskPresentationState } from '@/lib/task/presentation'
import StoryboardHeader from './StoryboardHeader'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { AppIcon } from '@/components/ui/icons'
import { GlassButton } from '@/components/ui/primitives'
import { useStoryboardVideoRuntime } from './StoryboardVideoRuntime'

interface StoryboardToolbarProps {
  totalSegments: number
  totalPanels: number
  isDownloadingImages: boolean
  runningCount: number
  pendingPanelCount: number
  isBatchSubmitting: boolean
  addingStoryboardGroup: boolean
  addingStoryboardGroupState: TaskPresentationState | null
  onDownloadAllImages: () => Promise<void>
  onGenerateAllPanels: () => Promise<void>
  onAddStoryboardGroupAtStart: () => void
  onBack: () => void
}

export default function StoryboardToolbar({
  totalSegments,
  totalPanels,
  isDownloadingImages,
  runningCount,
  pendingPanelCount,
  isBatchSubmitting,
  addingStoryboardGroup,
  addingStoryboardGroupState,
  onDownloadAllImages,
  onGenerateAllPanels,
  onAddStoryboardGroupAtStart,
  onBack,
}: StoryboardToolbarProps) {
  const t = useTranslations('storyboard')
  const videoRuntime = useStoryboardVideoRuntime()
  return (
    <>
      <StoryboardHeader
        totalSegments={totalSegments}
        totalPanels={totalPanels}
        isDownloadingImages={isDownloadingImages}
        runningCount={runningCount}
        pendingPanelCount={pendingPanelCount}
        isBatchSubmitting={isBatchSubmitting}
        onDownloadAllImages={onDownloadAllImages}
        onGenerateAllPanels={onGenerateAllPanels}
        onBack={onBack}
      />

      <div className="flex justify-center">
        <div className="glass-surface-soft flex flex-wrap items-center justify-center gap-2 p-2">
          <GlassButton
            variant="primary"
            size="sm"
            onClick={() => { void videoRuntime.onGenerateAllVideos() }}
            disabled={!videoRuntime.canGenerateAllVideos || videoRuntime.runningVideoCount > 0}
          >
            <AppIcon name="playCircle" className="w-4 h-4" />
            <span>{videoRuntime.runningVideoCount > 0
              ? t('production.generatingVideos', { count: videoRuntime.runningVideoCount })
              : t('production.generateMissingVideos')}</span>
          </GlassButton>
          <GlassButton
            variant="secondary"
            size="sm"
            onClick={() => { void videoRuntime.downloadAllVideos() }}
            disabled={videoRuntime.completedVideoCount === 0 || videoRuntime.isDownloadingVideos}
          >
            <AppIcon name="download" className="w-4 h-4" />
            <span>{videoRuntime.isDownloadingVideos
              ? t('production.downloadingVideos')
              : t('production.downloadVideos', { count: videoRuntime.completedVideoCount })}</span>
          </GlassButton>
          <GlassButton
            variant="secondary"
            size="sm"
            onClick={() => { void videoRuntime.exportTimeline() }}
            disabled={videoRuntime.completedVideoCount === 0 || videoRuntime.isExportingTimeline}
          >
            <AppIcon name="clapperboard" className="w-4 h-4" />
            <span>{videoRuntime.isExportingTimeline
              ? t('production.exportingTimeline')
              : t('production.exportTimeline')}</span>
          </GlassButton>
          {videoRuntime.staleVideoCount > 0 && (
            <span className="glass-chip glass-chip-warning px-2 py-1 text-xs">
              {t('production.possiblyStale')} {videoRuntime.staleVideoCount}
            </span>
          )}
          <GlassButton
            variant="ghost"
            size="sm"
            onClick={onAddStoryboardGroupAtStart}
            disabled={addingStoryboardGroup}
            className="opacity-60 hover:opacity-100"
          >
            {addingStoryboardGroup ? (
              <TaskStatusInline state={addingStoryboardGroupState} />
            ) : (
              <>
                <AppIcon name="plusAlt" className="w-4 h-4" />
                <span>{t('group.addAtStart')}</span>
              </>
            )}
          </GlassButton>
        </div>
      </div>
    </>
  )
}
