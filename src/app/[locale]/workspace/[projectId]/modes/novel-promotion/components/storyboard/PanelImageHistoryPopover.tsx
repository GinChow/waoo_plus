'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { parsePanelImageHistory, type PanelImageHistoryEntry } from '@/lib/novel-promotion/panel-image-state'

const PANEL_WIDTH = 320
const PANEL_MAX_HEIGHT = 320
const VIEWPORT_EDGE_GAP = 12

interface PanelImageHistoryPopoverProps {
  panelId: string
  imageHistoryRaw: string | null
  currentImageUrl: string | null
  onSelectHistoryImage: (panelId: string, imageUrl: string) => Promise<void>
  onDeleteHistoryImage: (panelId: string, imageUrl: string) => Promise<void>
  onPreviewImage?: (url: string) => void
}

function formatTime(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

export default function PanelImageHistoryPopover({
  panelId,
  imageHistoryRaw,
  currentImageUrl,
  onSelectHistoryImage,
  onDeleteHistoryImage,
  onPreviewImage,
}: PanelImageHistoryPopoverProps) {
  const t = useTranslations('storyboard')
  const [open, setOpen] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})

  const history: PanelImageHistoryEntry[] = parsePanelImageHistory(imageHistoryRaw)

  // 弹层通过 portal 渲染到 body 并以 fixed 定位锚定触发按钮，
  // 避免被分镜卡片的 overflow / zIndex 层级裁切或压盖
  const updatePlacement = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const panelWidth = Math.min(PANEL_WIDTH, viewportWidth - VIEWPORT_EDGE_GAP * 2)
    const idealLeft = rect.left + rect.width / 2 - panelWidth / 2
    const left = Math.max(VIEWPORT_EDGE_GAP, Math.min(idealLeft, viewportWidth - panelWidth - VIEWPORT_EDGE_GAP))
    const spaceAbove = rect.top - VIEWPORT_EDGE_GAP
    const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_EDGE_GAP
    const openUpward = spaceAbove >= spaceBelow
    const maxHeight = Math.max(160, Math.min(PANEL_MAX_HEIGHT, openUpward ? spaceAbove : spaceBelow))
    setPanelStyle({
      position: 'fixed',
      left,
      width: panelWidth,
      maxHeight,
      ...(openUpward
        ? { bottom: viewportHeight - rect.top + 8 }
        : { top: rect.bottom + 8 }),
    })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePlacement()
    const handleReposition = () => updatePlacement()
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)
    return () => {
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [open, updatePlacement])

  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  if (history.length === 0) return null

  const handleSelect = async (entryUrl: string) => {
    setBusyKey(`select:${entryUrl}`)
    try {
      await onSelectHistoryImage(panelId, entryUrl)
      setOpen(false)
    } finally {
      setBusyKey((current) => (current === `select:${entryUrl}` ? null : current))
    }
  }

  const handleDelete = async (entryUrl: string) => {
    if (typeof window !== 'undefined' && !window.confirm(t('panel.deleteHistoryImageConfirm'))) return
    setBusyKey(`delete:${entryUrl}`)
    try {
      await onDeleteHistoryImage(panelId, entryUrl)
    } finally {
      setBusyKey((current) => (current === `delete:${entryUrl}` ? null : current))
    }
  }

  return (
    <div className="relative inline-flex" onClick={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`glass-btn-base glass-btn-secondary flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95`}
        title={t('panel.imageHistory')}
      >
        <AppIcon name="clock" className="w-2.5 h-2.5" />
        <span>{t('panel.imageHistoryCount', { count: history.length })}</span>
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className="glass-surface-modal z-[9999] overflow-y-auto rounded-lg border border-[var(--glass-stroke-base)] p-2 shadow-xl"
          style={panelStyle}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="grid gap-2">
            {[...history].reverse().map((entry, historyIndex) => {
              const isCurrent = entry.url === currentImageUrl
              const positionFromNewest = historyIndex + 1
              const isSelecting = busyKey === `select:${entry.url}`
              const isDeleting = busyKey === `delete:${entry.url}`
              return (
                <div
                  key={`${entry.url}-${historyIndex}`}
                  className={`grid grid-cols-[64px_1fr_auto_auto] items-center gap-2 rounded-md border p-1.5 ${
                    isCurrent
                      ? 'border-[var(--glass-accent-from)] bg-[var(--glass-bg-muted)]'
                      : 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/60'
                  }`}
                >
                  <button
                    type="button"
                    className="h-12 overflow-hidden rounded border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]"
                    onClick={() => onPreviewImage?.(entry.url)}
                    title={t('image.clickToPreview')}
                  >
                    <MediaImageWithLoading
                      src={entry.url}
                      alt={`panel-history-${historyIndex + 1}`}
                      containerClassName="h-full w-full"
                      className="h-full w-full object-cover"
                    />
                  </button>
                  <div className="min-w-0">
                    <div className="truncate text-xs text-[var(--glass-text-primary)]">
                      {isCurrent
                        ? t('panel.currentImage')
                        : t('panel.historyImage', { number: positionFromNewest })}
                    </div>
                    <div className="truncate text-[11px] text-[var(--glass-text-tertiary)]">
                      {formatTime(entry.timestamp)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="glass-btn-base glass-btn-soft rounded-md px-2 py-1 text-xs disabled:opacity-60"
                    disabled={isCurrent || isSelecting || isDeleting}
                    onClick={() => handleSelect(entry.url)}
                  >
                    {isCurrent ? (
                      <AppIcon name="check" className="h-3.5 w-3.5" />
                    ) : (
                      <span>{isSelecting ? t('common.saving') : t('panel.useHistoryImage')}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="glass-btn-base glass-btn-tone-danger rounded-md px-2 py-1 text-xs disabled:opacity-60"
                    disabled={isCurrent || isSelecting || isDeleting}
                    onClick={() => handleDelete(entry.url)}
                    title={t('panel.deleteHistoryImage')}
                  >
                    <AppIcon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
