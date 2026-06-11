import { describe, expect, it } from 'vitest'
import {
  buildVideoFrameCaptureTargets,
  requiresVideoFrameOverwriteConfirmation,
} from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/frame-capture-targets'
import type { VideoPanel } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video'

function createPanel(panelId: string | undefined, imageUrl?: string): VideoPanel {
  return {
    panelId,
    storyboardId: `storyboard-${panelId}`,
    panelIndex: 0,
    imageUrl,
  }
}

describe('buildVideoFrameCaptureTargets', () => {
  it('returns previous, current, and next targets in global panel order', () => {
    const targets = buildVideoFrameCaptureTargets([
      createPanel('panel-1', 'first.jpg'),
      createPanel('panel-2'),
      createPanel('panel-3', 'third.jpg'),
    ], 1)

    expect(targets).toEqual([
      { panelId: 'panel-1', panelNumber: 1, position: 'previous', hasImage: true },
      { panelId: 'panel-2', panelNumber: 2, position: 'current', hasImage: false },
      { panelId: 'panel-3', panelNumber: 3, position: 'next', hasImage: true },
    ])
  })

  it('omits out-of-range panels and panels that cannot be updated', () => {
    expect(buildVideoFrameCaptureTargets([
      createPanel('panel-1'),
      createPanel(undefined, 'unwritable.jpg'),
    ], 0)).toEqual([
      { panelId: 'panel-1', panelNumber: 1, position: 'current', hasImage: false },
    ])
  })
})

describe('requiresVideoFrameOverwriteConfirmation', () => {
  it('requires confirmation exactly when the target already has an image', () => {
    expect(requiresVideoFrameOverwriteConfirmation({
      panelId: 'panel-1',
      panelNumber: 1,
      position: 'current',
      hasImage: true,
    })).toBe(true)
    expect(requiresVideoFrameOverwriteConfirmation({
      panelId: 'panel-2',
      panelNumber: 2,
      position: 'next',
      hasImage: false,
    })).toBe(false)
  })
})
