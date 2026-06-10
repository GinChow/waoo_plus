import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) => {
    if (key === 'toolbar.exportDownloading') {
      return `正在下载视频片段 ${values?.current}/${values?.total}`
    }
    return key
  },
}))

vi.mock('@/components/task/TaskStatusInline', () => ({ default: () => null }))
vi.mock('@/components/ui/icons', () => ({ AppIcon: () => null }))

describe('VideoToolbar editing project export progress', () => {
  it('renders clip count, percentage, and an accessible progress bar', async () => {
    Object.assign(globalThis, { React })
    const { default: VideoToolbar } = await import(
      '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/VideoToolbar'
    )
    const html = renderToStaticMarkup(React.createElement(VideoToolbar, {
      totalCoarseShots: 2,
      totalFineShots: 8,
      totalPanels: 8,
      runningCount: 0,
      videosWithUrl: 8,
      failedCount: 0,
      isAnyTaskRunning: false,
      isDownloading: false,
      isExportingTimeline: true,
      timelineExportProgress: {
        phase: 'downloading',
        current: 3,
        total: 8,
        percent: 35,
      },
      onGenerateAll: vi.fn(),
      onDownloadAll: vi.fn(),
      onExportTimeline: vi.fn(),
      onBack: vi.fn(),
    }))

    expect(html).toContain('正在下载视频片段 3/8')
    expect(html).toContain('35%')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="35"')
  })
})
