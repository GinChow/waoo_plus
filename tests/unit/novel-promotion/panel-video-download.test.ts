import { describe, expect, it } from 'vitest'
import { buildPanelVideoFileName } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/runtime/hooks/usePanelVideoDownload'
import type { VideoPanel } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video'

function createPanel(description: string): VideoPanel {
  return {
    storyboardId: 'storyboard-1',
    panelIndex: 0,
    textPanel: {
      panel_number: 1,
      shot_type: '中景',
      description,
    },
  }
}

describe('buildPanelVideoFileName', () => {
  it('uses the displayed panel number and description', () => {
    expect(buildPanelVideoFileName(
      createPanel('主角走进房间'),
      7,
      'https://example.com/video.webm?token=1',
    )).toBe('007_主角走进房间.webm')
  })

  it('sanitizes invalid filename characters and resolves extension from mime type', () => {
    expect(buildPanelVideoFileName(
      createPanel('开场/对白:第一幕? '),
      12,
      'storage/video-file',
      'video/quicktime',
    )).toBe('012_开场_对白_第一幕_.mov')
  })
})
