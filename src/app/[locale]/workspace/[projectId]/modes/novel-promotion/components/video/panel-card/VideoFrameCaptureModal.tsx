'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import ConfirmDialog from '@/components/ConfirmDialog'
import { AppIcon } from '@/components/ui/icons'
import { logError as _ulogError } from '@/lib/logging/core'
import { requiresVideoFrameOverwriteConfirmation } from './frame-capture-targets'
import type { VideoFrameCaptureTarget } from './types'

interface VideoFrameCaptureModalProps {
  projectId: string
  videoUrl: string
  aspectRatio: string
  targets: VideoFrameCaptureTarget[]
  onApply: (panelId: string, file: File) => Promise<void> | void
  onClose: () => void
}

const FRAME_STEP_SECONDS = 1 / 30

export default function VideoFrameCaptureModal({
  projectId,
  videoUrl,
  aspectRatio,
  targets,
  onApply,
  onClose,
}: VideoFrameCaptureModalProps) {
  const t = useTranslations('video')
  const videoRef = useRef<HTMLVideoElement>(null)
  const objectUrlRef = useRef<string | null>(null)
  const seekingRef = useRef(false)
  const pendingSeekRef = useRef<number | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isSeeking, setIsSeeking] = useState(false)
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<VideoFrameCaptureTarget | null>(null)

  const isBusy = activeAction !== null

  useEffect(() => {
    let cancelled = false
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setIsLoading(true)
    setLoadError(false)
    const proxyUrl = `/api/novel-promotion/${projectId}/video-proxy?key=${encodeURIComponent(videoUrl)}`
    ;(async () => {
      try {
        const response = await fetch(proxyUrl)
        if (!response.ok) throw new Error(`Failed to load video: ${response.status}`)
        const blob = await response.blob()
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        objectUrlRef.current = url
        setBlobUrl(url)
      } catch (error) {
        if (cancelled) return
        _ulogError('[VideoFrameCapture] 加载视频失败', error)
        setLoadError(true)
        setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
      document.body.style.overflow = previousOverflow
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [projectId, videoUrl])

  const handleClose = useCallback(() => {
    if (isBusy) return
    if (confirmTarget) {
      setConfirmTarget(null)
      return
    }
    onClose()
  }, [confirmTarget, isBusy, onClose])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [handleClose])

  const flushSeek = useCallback(() => {
    const video = videoRef.current
    if (!video || seekingRef.current) return
    const target = pendingSeekRef.current
    if (target == null) return
    pendingSeekRef.current = null
    if (Math.abs(video.currentTime - target) < 0.001) {
      setIsSeeking(false)
      return
    }
    seekingRef.current = true
    setIsSeeking(true)
    video.currentTime = target
  }, [])

  const handleSeeked = useCallback(() => {
    seekingRef.current = false
    if (pendingSeekRef.current != null) {
      flushSeek()
      return
    }
    setIsSeeking(false)
  }, [flushSeek])

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    setDuration(Number.isFinite(video.duration) ? video.duration : 0)
    setIsLoading(false)
    const initial = Math.min(0.1, (video.duration || 1) / 20)
    setCurrentTime(initial)
    pendingSeekRef.current = initial
    flushSeek()
  }, [flushSeek])

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration)) return
    const clamped = Math.max(0, Math.min(time, video.duration))
    setCurrentTime(clamped)
    pendingSeekRef.current = clamped
    flushSeek()
  }, [flushSeek])

  const stepFrame = useCallback((direction: -1 | 1) => {
    seekTo(currentTime + direction * FRAME_STEP_SECONDS)
  }, [currentTime, seekTo])

  const captureFrameFile = useCallback(async () => {
    const video = videoRef.current
    if (!video || isLoading || isSeeking) throw new Error('Video frame is not ready')
    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) throw new Error('Video dimensions unavailable')

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D context unavailable')
    context.drawImage(video, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    })
    if (!blob) throw new Error('Failed to encode frame')

    const timeLabel = currentTime.toFixed(2).replace('.', '-')
    return new File([blob], `video-frame-${timeLabel}s.jpg`, { type: 'image/jpeg' })
  }, [currentTime, isLoading, isSeeking])

  const handleDownload = useCallback(async () => {
    if (isBusy) return
    setActiveAction('download')
    try {
      const file = await captureFrameFile()
      const url = URL.createObjectURL(file)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = file.name
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      _ulogError('[VideoFrameCapture] 保存视频帧失败', error)
      window.alert(t('frameCapture.captureFailed'))
    } finally {
      setActiveAction(null)
    }
  }, [captureFrameFile, isBusy, t])

  const applyToTarget = useCallback(async (target: VideoFrameCaptureTarget) => {
    if (isBusy) return
    setConfirmTarget(null)
    setActiveAction(target.position)
    try {
      const file = await captureFrameFile()
      await onApply(target.panelId, file)
      onClose()
    } catch (error) {
      _ulogError('[VideoFrameCapture] 写入分镜图失败', error)
      window.alert(t('frameCapture.applyFailed'))
      setActiveAction(null)
    }
  }, [captureFrameFile, isBusy, onApply, onClose, t])

  const handleApply = useCallback((target: VideoFrameCaptureTarget) => {
    if (requiresVideoFrameOverwriteConfirmation(target)) {
      setConfirmTarget(target)
      return
    }
    void applyToTarget(target)
  }, [applyToTarget])

  const getTargetLabel = useCallback((target: VideoFrameCaptureTarget) => {
    const key = target.position === 'previous'
      ? 'frameCapture.setAsPreviousPanel'
      : target.position === 'next'
        ? 'frameCapture.setAsNextPanel'
        : 'frameCapture.setAsCurrentPanel'
    return t(key, { number: target.panelNumber })
  }, [t])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--glass-overlay)] p-4 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--glass-stroke-base)] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--glass-text-primary)]">
            <AppIcon name="film" className="h-4 w-4" />
            {t('frameCapture.title')}
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isBusy}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)] disabled:opacity-50"
          >
            <AppIcon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div
            className="relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-black"
            style={{ aspectRatio: aspectRatio.replace(':', '/') }}
          >
            {loadError ? (
              <div className="px-4 text-center text-xs text-[var(--glass-text-tertiary)]">
                {t('frameCapture.loadFailed')}
              </div>
            ) : (
              <>
                {blobUrl && (
                  <video
                    ref={videoRef}
                    src={blobUrl}
                    muted
                    playsInline
                    preload="auto"
                    className="h-full w-full object-contain"
                    onLoadedMetadata={handleLoadedMetadata}
                    onSeeked={handleSeeked}
                  />
                )}
                {(isLoading || isSeeking) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <AppIcon name="loader" className="h-8 w-8 animate-spin text-white" />
                  </div>
                )}
              </>
            )}
          </div>

          {!loadError && (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => stepFrame(-1)}
                  disabled={isLoading || isBusy}
                  className="glass-btn-base glass-btn-secondary flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg disabled:opacity-50"
                  title={t('frameCapture.prevFrame')}
                >
                  <AppIcon name="chevronLeft" className="h-4 w-4" />
                </button>
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.01}
                  value={currentTime}
                  disabled={isLoading || isBusy}
                  onChange={(event) => seekTo(parseFloat(event.target.value))}
                  className="flex-1 cursor-pointer accent-[var(--glass-accent-from)] disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => stepFrame(1)}
                  disabled={isLoading || isBusy}
                  className="glass-btn-base glass-btn-secondary flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg disabled:opacity-50"
                  title={t('frameCapture.nextFrame')}
                >
                  <AppIcon name="chevronRight" className="h-4 w-4" />
                </button>
                <span className="w-20 flex-shrink-0 text-right text-[11px] tabular-nums text-[var(--glass-text-tertiary)]">
                  {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
                </span>
              </div>

              <p className="text-[11px] text-[var(--glass-text-tertiary)]">{t('frameCapture.hint')}</p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void handleDownload()}
                  disabled={isLoading || isSeeking || isBusy}
                  className="glass-btn-base glass-btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                >
                  <AppIcon
                    name={activeAction === 'download' ? 'loader' : 'download'}
                    className={`h-4 w-4 ${activeAction === 'download' ? 'animate-spin' : ''}`}
                  />
                  {t('frameCapture.saveLocal')}
                </button>

                <div className="ml-auto flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isBusy}
                    className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                  >
                    {t('panelCard.cancel')}
                  </button>
                  {targets.map((target) => (
                    <button
                      key={target.position}
                      type="button"
                      onClick={() => handleApply(target)}
                      disabled={isLoading || isSeeking || isBusy}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${
                        target.position === 'current'
                          ? 'bg-[var(--glass-accent-from)] text-white'
                          : 'glass-btn-base glass-btn-secondary'
                      }`}
                    >
                      {activeAction === target.position ? (
                        <AppIcon name="loader" className="h-4 w-4 animate-spin" />
                      ) : (
                        <AppIcon name="image" className="h-4 w-4" />
                      )}
                      {activeAction === target.position ? t('frameCapture.applying') : getTargetLabel(target)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        show={confirmTarget !== null}
        title={t('frameCapture.overwriteTitle')}
        message={t('frameCapture.overwriteMessage', { number: confirmTarget?.panelNumber ?? 0 })}
        confirmText={t('frameCapture.overwriteConfirm')}
        onConfirm={() => {
          if (confirmTarget) void applyToTarget(confirmTarget)
        }}
        onCancel={() => setConfirmTarget(null)}
        type="warning"
        layerClassName="z-[10000]"
      />
    </div>,
    document.body,
  )
}
