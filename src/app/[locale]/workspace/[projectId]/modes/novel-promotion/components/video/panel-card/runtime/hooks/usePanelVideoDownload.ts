'use client'

import { useCallback, useState } from 'react'
import { useDownloadRemoteBlob } from '@/lib/query/hooks'
import { logError as _ulogError } from '@/lib/logging/core'
import type { VideoPanel } from '../../../types'

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'm4v'])

function resolveVideoExtension(videoUrl: string, mimeType: string): string {
  const path = videoUrl.split(/[?#]/, 1)[0]
  const urlExtension = path.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase()
  if (urlExtension && VIDEO_EXTENSIONS.has(urlExtension)) return urlExtension

  if (mimeType.includes('quicktime')) return 'mov'
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('x-m4v')) return 'm4v'
  return 'mp4'
}

export function buildPanelVideoFileName(
  panel: VideoPanel,
  panelNumber: number,
  videoUrl: string,
  mimeType = '',
): string {
  const description = panel.textPanel?.description?.trim() || '镜头'
  const safeDescription = description
    .slice(0, 50)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '') || '镜头'
  const extension = resolveVideoExtension(videoUrl, mimeType)
  return `${String(panelNumber).padStart(3, '0')}_${safeDescription}.${extension}`
}

interface UsePanelVideoDownloadParams {
  projectId: string
  panel: VideoPanel
  panelNumber: number
  videoUrl?: string
  downloadFailedMessage: string
}

export function usePanelVideoDownload({
  projectId,
  panel,
  panelNumber,
  videoUrl,
  downloadFailedMessage,
}: UsePanelVideoDownloadParams) {
  const downloadRemoteBlobMutation = useDownloadRemoteBlob()
  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownload = useCallback(async () => {
    if (!videoUrl || isDownloading) return
    setIsDownloading(true)

    try {
      const proxyUrl = `/api/novel-promotion/${projectId}/video-proxy?key=${encodeURIComponent(videoUrl)}`
      const blob = await downloadRemoteBlobMutation.mutateAsync(proxyUrl)
      const objectUrl = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = buildPanelVideoFileName(panel, panelNumber, videoUrl, blob.type)
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.URL.revokeObjectURL(objectUrl)
    } catch (error) {
      _ulogError('[下载视频] 单个分镜下载失败', error)
      alert(downloadFailedMessage)
    } finally {
      setIsDownloading(false)
    }
  }, [
    downloadFailedMessage,
    downloadRemoteBlobMutation,
    isDownloading,
    panel,
    panelNumber,
    projectId,
    videoUrl,
  ])

  return {
    isDownloading,
    handleDownload,
  }
}
