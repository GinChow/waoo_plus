'use client'

import { useState, useCallback, type SyntheticEvent } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import {
  useDeleteProjectPanelHistoryVideo,
  useSelectProjectPanelHistoryVideo,
} from '@/lib/query/hooks'
import type { VideoPanel } from '../types'

export function HistoryVideoThumbnail({ videoUrl, title }: { videoUrl: string; title: string }) {
  const handleSeekToFirstFrame = useCallback((event: SyntheticEvent<HTMLVideoElement>) => {
    const el = event.currentTarget
    try {
      if (el.currentTime === 0 && el.duration > 0) {
        el.currentTime = Math.min(0.1, el.duration / 10)
      }
    } catch {
      // ignore seek errors
    }
  }, [])

  const handleOpenPreview = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.open(videoUrl, '_blank', 'noopener,noreferrer')
    }
  }, [videoUrl])

  return (
    <button
      type="button"
      onClick={handleOpenPreview}
      title={title}
      className="group relative h-16 w-[112px] overflow-hidden rounded border border-[var(--glass-stroke-base)] bg-black"
    >
      <video
        src={videoUrl}
        className="h-full w-full object-cover pointer-events-none"
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={handleSeekToFirstFrame}
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
        <AppIcon name="play" className="h-5 w-5 text-white" />
      </span>
    </button>
  )
}

export function PanelVideoHistoryDropdown({
  projectId,
  panelId,
  currentVideoUrl,
  videoHistory,
}: {
  projectId: string
  panelId: string
  currentVideoUrl: string
  videoHistory: NonNullable<VideoPanel['videoHistory']>
}) {
  const t = useTranslations('video')
  const [open, setOpen] = useState(false)
  const selectMutation = useSelectProjectPanelHistoryVideo(projectId)
  const deleteMutation = useDeleteProjectPanelHistoryVideo(projectId)
  const [selectingUrl, setSelectingUrl] = useState<string | null>(null)
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null)

  const formatHistoryTime = useCallback((value: string) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString()
  }, [])

  const handleSelect = useCallback(async (videoUrl: string) => {
    setSelectingUrl(videoUrl)
    try {
      await selectMutation.mutateAsync({ panelId, videoUrl })
    } finally {
      setSelectingUrl(null)
    }
  }, [panelId, selectMutation])

  const handleDelete = useCallback(async (videoUrl: string) => {
    if (typeof window !== 'undefined' && !window.confirm(t('panelCard.deleteHistoryVideo'))) return
    setDeletingUrl(videoUrl)
    try {
      await deleteMutation.mutateAsync({ panelId, videoUrl })
    } finally {
      setDeletingUrl(null)
    }
  }, [deleteMutation, panelId, t])

  return (
    <div className="relative mt-2">
      <button
        type="button"
        className="flex h-8 w-full items-center justify-between rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-2 text-xs text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-surface-hover)]"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{t('panelCard.videoHistoryCount', { count: videoHistory.length })}</span>
        <AppIcon
          name="chevronDown"
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-9 z-20 max-h-80 overflow-y-auto rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-2 shadow-xl">
          <div className="grid gap-2">
            {[...videoHistory].reverse().map((entry, historyIndex) => {
              const isCurrent = entry.videoUrl === currentVideoUrl
              const isSelecting = selectingUrl === entry.videoUrl
              const isDeleting = deletingUrl === entry.videoUrl
              return (
                <div
                  key={`${entry.videoUrl}-${historyIndex}`}
                  className={`grid grid-cols-[112px_1fr_auto_auto] items-center gap-2 rounded-md border p-1.5 ${
                    isCurrent
                      ? 'border-[var(--glass-accent-from)] bg-[var(--glass-bg-muted)]'
                      : 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/60'
                  }`}
                >
                  <HistoryVideoThumbnail
                    videoUrl={entry.videoUrl}
                    title={isCurrent ? t('panelCard.currentVideo') : t('panelCard.historyVideo', { number: videoHistory.length - historyIndex })}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-xs text-[var(--glass-text-primary)]">
                      {isCurrent ? t('panelCard.currentVideo') : t('panelCard.historyVideo', { number: videoHistory.length - historyIndex })}
                    </div>
                    <div className="truncate text-[11px] text-[var(--glass-text-tertiary)]">
                      {formatHistoryTime(entry.generatedAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="glass-btn-base glass-btn-soft rounded-md px-2 py-1 text-xs disabled:opacity-60"
                    disabled={isCurrent || isSelecting || isDeleting}
                    onClick={() => handleSelect(entry.videoUrl)}
                  >
                    {isCurrent ? (
                      <AppIcon name="check" className="h-3.5 w-3.5" />
                    ) : (
                      <span>{isSelecting ? t('panelCard.saving') : t('panelCard.useHistoryVideo')}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="glass-btn-base glass-btn-danger rounded-md px-2 py-1 text-xs disabled:opacity-60"
                    disabled={isCurrent || isSelecting || isDeleting}
                    onClick={() => handleDelete(entry.videoUrl)}
                    title={t('panelCard.deleteHistoryVideo')}
                  >
                    {isDeleting ? (
                      <span>{t('panelCard.deleting')}</span>
                    ) : (
                      <AppIcon name="trashAlt" className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
