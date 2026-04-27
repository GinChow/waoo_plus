'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { GlassButton } from '@/components/ui/primitives'
import { AppIcon } from '@/components/ui/icons'
import type { StoryboardRegenerateStartPhase } from './hooks/useStoryboardGroupActions'

interface StoryboardGroupActionsProps {
  hasAnyImage: boolean
  isSubmittingStoryboardTask: boolean
  isSubmittingStoryboardTextTask: boolean
  currentRunningCount: number
  pendingCount: number
  onRegenerateText: (startPhase?: StoryboardRegenerateStartPhase) => void
  onGenerateAllIndividually: () => void
  onAddPanel: () => void
  onDeleteStoryboard: () => void
}

export default function StoryboardGroupActions({
  hasAnyImage,
  isSubmittingStoryboardTask,
  isSubmittingStoryboardTextTask,
  currentRunningCount,
  pendingCount,
  onRegenerateText,
  onGenerateAllIndividually,
  onAddPanel,
  onDeleteStoryboard,
}: StoryboardGroupActionsProps) {
  const t = useTranslations('storyboard')
  const [regenerateStartPhase, setRegenerateStartPhase] = useState<StoryboardRegenerateStartPhase>('phase1')

  const textTaskRunningState = useMemo(() => {
    if (!isSubmittingStoryboardTextTask) return null
    return resolveTaskPresentationState({
      phase: 'processing',
      intent: 'regenerate',
      resource: 'text',
      hasOutput: true,
    })
  }, [isSubmittingStoryboardTextTask])

  const panelTaskRunningState = useMemo(() => {
    if (currentRunningCount <= 0) return null
    return resolveTaskPresentationState({
      phase: 'processing',
      intent: hasAnyImage ? 'regenerate' : 'generate',
      resource: 'image',
      hasOutput: hasAnyImage,
    })
  }, [currentRunningCount, hasAnyImage])

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <div className="relative">
          <select
            value={regenerateStartPhase}
            onChange={(event) => setRegenerateStartPhase(event.target.value as StoryboardRegenerateStartPhase)}
            disabled={isSubmittingStoryboardTextTask}
            title={t('group.regenerateTextStartPhase')}
            className="h-8 appearance-none rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg-surface)] pl-2 pr-7 text-xs text-[var(--glass-text-primary)] outline-none transition-colors hover:bg-[var(--glass-bg-surface-hover)] disabled:opacity-60"
          >
            <option value="phase1">{t('group.regenerateFromPhase1')}</option>
            <option value="phase2">{t('group.regenerateFromPhase2')}</option>
            <option value="phase3">{t('group.regenerateFromPhase3')}</option>
            <option value="phase4">{t('group.regenerateFromPhase4')}</option>
          </select>
          <AppIcon name="chevronDown" className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--glass-text-tertiary)]" />
        </div>
        <GlassButton
          variant="secondary"
          size="sm"
          onClick={() => onRegenerateText(regenerateStartPhase)}
          disabled={isSubmittingStoryboardTextTask}
        >
          {isSubmittingStoryboardTextTask ? (
            <TaskStatusInline state={textTaskRunningState} />
          ) : (
            <>
              <AppIcon name="refresh" className="h-3 w-3" />
              <span>{t('group.regenerateText')}</span>
            </>
          )}
        </GlassButton>
      </div>

      {pendingCount > 0 && (
        <GlassButton
          variant="primary"
          size="sm"
          onClick={onGenerateAllIndividually}
          disabled={currentRunningCount > 0}
          title={t('group.generateMissingImages')}
        >
          {currentRunningCount > 0 ? (
            <TaskStatusInline state={panelTaskRunningState} />
          ) : (
            <>
              <AppIcon name="plus" className="h-3 w-3" />
              <span>{t('group.generateAll')}</span>
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-white/25 text-white">{pendingCount}</span>
            </>
          )}
        </GlassButton>
      )}

      <GlassButton
        variant="secondary"
        size="sm"
        onClick={onAddPanel}
      >
        <AppIcon name="plusMd" className="h-3.5 w-3.5" />
        <span>{t('group.addPanel')}</span>
      </GlassButton>

      <GlassButton
        variant="danger"
        size="sm"
        onClick={onDeleteStoryboard}
        disabled={isSubmittingStoryboardTask}
        title={t('common.delete')}
      >
        <AppIcon name="trashAlt" className="h-3.5 w-3.5" />
        <span>{t('common.delete')}</span>
      </GlassButton>
    </div>
  )
}
