'use client'

import { useTranslations } from 'next-intl'
import type { TaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

type TaskStatusOverlayProps = {
  state: TaskPresentationState | null
  className?: string
  detailLabel?: string | null
  progress?: number | null
  progressLabel?: string | null
}

export default function TaskStatusOverlay({
  state,
  className,
  detailLabel,
  progress,
  progressLabel,
}: TaskStatusOverlayProps) {
  const t = useTranslations('common')
  if (!state) return null
  if (state.mode !== 'overlay' && state.mode !== 'placeholder') return null
  const label = state.labelKey ? t(state.labelKey) : t('loading')
  const normalizedProgress =
    typeof progress === 'number' && Number.isFinite(progress)
      ? Math.max(0, Math.min(100, Math.floor(progress)))
      : null

  return (
    <div
      className={[
        'absolute inset-0 flex flex-col items-center justify-center',
        'bg-[var(--glass-overlay)]',
        className || '',
      ].join(' ').trim()}
    >
      {state.isError ? (
        <AppIcon name="alertSolid" className="h-7 w-7 text-[var(--glass-tone-danger-fg)]" />
      ) : (
        <AppIcon name="loader" className="h-7 w-7 animate-spin text-white" />
      )}
      <span className="mt-2 text-xs text-white">{label}</span>
      {detailLabel && (
        <span className="mt-1 max-w-[80%] text-center text-[11px] font-medium text-white/90">
          {detailLabel}
        </span>
      )}
      {normalizedProgress !== null && (
        <div className="mt-3 w-40 max-w-[70%]">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-[width] duration-300"
              style={{ width: `${Math.max(normalizedProgress, 3)}%` }}
            />
          </div>
          <div className="mt-1 text-center text-[10px] text-white/80">
            {progressLabel || `${normalizedProgress}%`}
          </div>
        </div>
      )}
    </div>
  )
}
