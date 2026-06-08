import { logError as _ulogError, logInfo as _ulogInfo } from '@/lib/logging/core'
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'

interface UsePanelPlayerParams {
  videoRatio: string
  traceKey?: string
  imageUrl?: string
  videoUrl?: string
  lipSyncVideoUrl?: string
  showLipSyncVideo: boolean
  onPreviewImage?: (imageUrl: string) => void
}

export function usePanelPlayer({
  videoRatio,
  traceKey,
  imageUrl,
  videoUrl,
  lipSyncVideoUrl,
  showLipSyncVideo,
  onPreviewImage,
}: UsePanelPlayerParams) {
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cssAspectRatio = videoRatio.replace(':', '/')
  const currentVideoUrl = videoUrl
    ? (showLipSyncVideo && lipSyncVideoUrl ? lipSyncVideoUrl : videoUrl)
    : undefined

  useEffect(() => {
    _ulogInfo('[VideoHistoryTrace][player] currentVideoUrl changed', {
      traceKey,
      videoUrl: currentVideoUrl || '',
      baseVideoUrl: videoUrl || '',
      lipSyncVideoUrl: lipSyncVideoUrl || '',
      showLipSyncVideo,
    })
    setIsPlaying(false)
    videoRef.current?.load()
  }, [currentVideoUrl, lipSyncVideoUrl, showLipSyncVideo, traceKey, videoUrl])

  const handlePreviewImage = useCallback((event?: MouseEvent) => {
    if (event) event.stopPropagation()
    if (!imageUrl || !onPreviewImage) return
    onPreviewImage(imageUrl)
  }, [imageUrl, onPreviewImage])

  const handlePlayClick = useCallback(async () => {
    _ulogInfo('[VideoHistoryTrace][player] play clicked', {
      traceKey,
      currentVideoUrl: currentVideoUrl || '',
      baseVideoUrl: videoUrl || '',
      lipSyncVideoUrl: lipSyncVideoUrl || '',
      showLipSyncVideo,
    })
    setIsPlaying(true)
    setTimeout(async () => {
      if (!videoRef.current) return
      try {
        await videoRef.current.play()
      } catch (error: unknown) {
        if ((error as { name?: string }).name !== 'AbortError') {
          _ulogError('Video play error:', error)
        }
      }
    }, 100)
  }, [currentVideoUrl, lipSyncVideoUrl, showLipSyncVideo, traceKey, videoUrl])

  return {
    cssAspectRatio,
    currentVideoUrl,
    isPlaying,
    setIsPlaying,
    videoRef,
    handlePreviewImage,
    handlePlayClick,
  }
}
