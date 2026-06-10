'use client'

import { useCallback, useState } from 'react'
import { logError as _ulogError, logInfo as _ulogInfo } from '@/lib/logging/core'
import type { VideoPanel } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video'
import {
  buildFinalCutProXml,
  buildPremiereXml,
  buildTimelineManifest,
  resolveTimelineDimensions,
} from '@/lib/video-export/timeline-export'
import {
  calculateDownloadProgress,
  calculatePackingProgress,
  type TimelineExportProgress,
} from '@/lib/video-export/export-progress'
import type { EpisodeVideoUrlsResponse } from './types'
import { getErrorMessage } from './utils'

interface MutationLike<TInput = unknown, TOutput = unknown> {
  mutateAsync: (input: TInput) => Promise<TOutput>
}

interface UseVideoTimelineExportParams {
  episodeId: string
  t: (key: string) => string
  allPanels: VideoPanel[]
  panelVideoPreference: Map<string, boolean>
  listEpisodeVideoUrlsMutation: MutationLike<{
    episodeId: string
    panelPreferences: Record<string, boolean>
  }>
  downloadRemoteBlobMutation: MutationLike<string, Blob>
}

export function useVideoTimelineExport({
  episodeId,
  t,
  allPanels,
  panelVideoPreference,
  listEpisodeVideoUrlsMutation,
  downloadRemoteBlobMutation,
}: UseVideoTimelineExportParams) {
  const [isExportingTimeline, setIsExportingTimeline] = useState(false)
  const [timelineExportProgress, setTimelineExportProgress] = useState<TimelineExportProgress | null>(null)

  const handleExportTimeline = useCallback(async () => {
    setIsExportingTimeline(true)
    setTimelineExportProgress({ phase: 'preparing', percent: 2 })

    try {
      const JSZip = (await import('jszip')).default
      const panelPreferences: Record<string, boolean> = {}
      allPanels.forEach((panel) => {
        const panelKey = `${panel.storyboardId}-${panel.panelIndex}`
        panelPreferences[panelKey] = panelVideoPreference.get(panelKey) ?? true
      })

      const data = await listEpisodeVideoUrlsMutation.mutateAsync({
        episodeId,
        panelPreferences,
      })
      const result = (data || {}) as EpisodeVideoUrlsResponse
      const videos = result.videos || []
      if (videos.length === 0) throw new Error(t('stage.noVideos'))

      const zip = new JSZip()
      setTimelineExportProgress({
        phase: 'downloading',
        current: 0,
        total: videos.length,
        percent: calculateDownloadProgress(0, videos.length),
      })
      for (let index = 0; index < videos.length; index += 1) {
        const video = videos[index]
        _ulogInfo(`[导出剪辑工程] 下载素材 ${video.index}/${videos.length}: ${video.fileName}`)
        const blob = await downloadRemoteBlobMutation.mutateAsync(video.videoUrl)
        zip.file(`media/${video.fileName}`, blob)
        const current = index + 1
        setTimelineExportProgress({
          phase: 'downloading',
          current,
          total: videos.length,
          percent: calculateDownloadProgress(current, videos.length),
        })
      }

      const projectName = result.projectName || 'video-project'
      const dimensions = resolveTimelineDimensions(result.videoRatio || '16:9')
      const timelineProject = {
        projectName,
        episodeId,
        fps: 30,
        ...dimensions,
        clips: videos.map((video) => ({
          index: video.index,
          fileName: video.fileName,
          durationSeconds: video.durationSeconds,
          panelId: video.panelId,
          storyboardId: video.storyboardId,
          panelIndex: video.panelIndex,
          description: video.description,
          sourceType: video.sourceType,
        })),
      }

      zip.file('timeline.fcpxml', buildFinalCutProXml(timelineProject))
      zip.file('timeline.xml', buildPremiereXml(timelineProject))
      zip.file('manifest.json', buildTimelineManifest(timelineProject))

      setTimelineExportProgress({ phase: 'packing', percent: 85 })
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      let lastPackingPercent = 85
      const zipBlob = await zip.generateAsync(
        { type: 'blob', streamFiles: true },
        (metadata) => {
          const percent = calculatePackingProgress(metadata.percent)
          if (percent === lastPackingPercent) return
          lastPackingPercent = percent
          setTimelineExportProgress({
            phase: 'packing',
            percent,
          })
        },
      )
      const url = window.URL.createObjectURL(zipBlob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${projectName}_editing_project.zip`
      document.body.appendChild(anchor)
      anchor.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(anchor)
      _ulogInfo(`[导出剪辑工程] 已导出 ${videos.length} 个视频片段`)
    } catch (error: unknown) {
      _ulogError('[导出剪辑工程] 失败:', error)
      alert(`${t('stage.exportFailed')}: ${getErrorMessage(error) || t('stage.unknownError')}`)
    } finally {
      setIsExportingTimeline(false)
      setTimelineExportProgress(null)
    }
  }, [
    allPanels,
    downloadRemoteBlobMutation,
    episodeId,
    listEpisodeVideoUrlsMutation,
    panelVideoPreference,
    t,
  ])

  return {
    isExportingTimeline,
    timelineExportProgress,
    handleExportTimeline,
  }
}
