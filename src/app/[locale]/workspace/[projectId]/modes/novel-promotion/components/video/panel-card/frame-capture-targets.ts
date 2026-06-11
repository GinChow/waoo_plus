import type { VideoPanel } from '../types'
import type { VideoFrameCaptureTarget, VideoFrameCaptureTargetPosition } from './types'

const TARGET_OFFSETS: Array<{
  offset: -1 | 0 | 1
  position: VideoFrameCaptureTargetPosition
}> = [
  { offset: -1, position: 'previous' },
  { offset: 0, position: 'current' },
  { offset: 1, position: 'next' },
]

export function buildVideoFrameCaptureTargets(
  panels: VideoPanel[],
  currentIndex: number,
): VideoFrameCaptureTarget[] {
  return TARGET_OFFSETS.flatMap(({ offset, position }) => {
    const targetIndex = currentIndex + offset
    const panel = panels[targetIndex]
    if (!panel?.panelId) return []
    return [{
      panelId: panel.panelId,
      panelNumber: targetIndex + 1,
      position,
      hasImage: !!panel.imageUrl,
    }]
  })
}

export function requiresVideoFrameOverwriteConfirmation(target: VideoFrameCaptureTarget): boolean {
  return target.hasImage
}
