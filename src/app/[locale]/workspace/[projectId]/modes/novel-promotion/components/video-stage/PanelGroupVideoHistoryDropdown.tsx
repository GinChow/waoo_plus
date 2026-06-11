'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import {
  useSelectProjectPanelGroupVideo,
  useDeleteProjectPanelGroupHistoryVideo,
} from '@/lib/query/hooks'
import { HistoryVideoThumbnail } from '../video/panel-card/PanelVideoHistoryDropdown'
import type { PanelGroupRuntime } from '../video'

export function PanelGroupVideoHistoryDropdown({
  projectId,
  episodeId,
  panelGroupId,
  currentVideoUrl,
  videoHistory,
}: {
  projectId: string
  episodeId?: string
  panelGroupId: string
  currentVideoUrl: string
  videoHistory: PanelGroupRuntime['videoHistory']
}) {
  const t = useTranslations('video')
  const [open, setOpen] = useState(false)
  const selectMutation = useSelectProjectPanelGroupVideo(projectId, episodeId)
  const deleteMutation = useDeleteProjectPanelGroupHistoryVideo(projectId, episodeId)
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
      await selectMutation.mutateAsync({ panelGroupId, videoUrl })
    } finally {
      setSelectingUrl(null)
    }
  }, [panelGroupId, selectMutation])

  const handleDelete = useCallback(async (videoUrl: string) => {
    if (typeof window !== 'undefined' && !window.confirm(t('panelCard.deleteHistoryVideo'))) return
    setDeletingUrl(videoUrl)
    try {
      await deleteMutation.mutateAsync({ panelGroupId, videoUrl })
    } finally {
      setDeletingUrl(null)
    }
  }, [deleteMutation, panelGroupId, t])

  if (videoHistory.length === 0) return null

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
                    disabled={isSelecting || isDeleting}
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
