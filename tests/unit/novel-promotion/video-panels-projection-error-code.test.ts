import { describe, expect, it, vi } from 'vitest'

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useMemo: <T,>(factory: () => T) => factory(),
  }
})

import { useVideoPanelsProjection } from '@/lib/novel-promotion/stages/video-stage-runtime/useVideoPanelsProjection'

describe('video panels projection error code', () => {
  it('projects failed task lastError code/message onto panel fields', () => {
    const result = useVideoPanelsProjection({
      clips: [{ id: 'clip-1', start: 0, end: 5, summary: 'clip' }],
      storyboards: [{
        id: 'sb-1',
        clipId: 'clip-1',
        panels: [{
          id: 'panel-1',
          panelIndex: 0,
          description: 'panel',
        }],
      }],
      panelVideoStates: {
        getTaskState: () => ({
          phase: 'failed',
          lastError: {
            code: 'EXTERNAL_ERROR',
            message: 'upstream failed',
          },
        }),
      },
      panelLipStates: {
        getTaskState: () => null,
      },
    })

    expect(result.allPanels).toHaveLength(1)
    expect(result.allPanels[0]?.videoErrorCode).toBe('EXTERNAL_ERROR')
    expect(result.allPanels[0]?.videoErrorMessage).toBe('upstream failed')
  })

  it('prefers panel videoUrl over stale coarse group videoUrl', () => {
    const result = useVideoPanelsProjection({
      clips: [{ id: 'clip-1', start: 0, end: 5, summary: 'clip' }],
      storyboards: [{
        id: 'sb-1',
        clipId: 'clip-1',
        storyboardTextJson: JSON.stringify([[1, 47]]),
        coarseGroupsJson: JSON.stringify([{
          groupNumber: 47,
          videoUrl: 'video/stale-coarse.mp4',
          videoHistory: [{ videoUrl: 'video/stale-coarse.mp4', generatedAt: 't1' }],
        }]),
        panels: [{
          id: 'panel-1',
          panelIndex: 0,
          panelNumber: 1,
          description: 'panel',
          videoUrl: 'video/selected-panel-history.mp4',
        }],
      }],
      panelVideoStates: {
        getTaskState: () => null,
      },
      panelLipStates: {
        getTaskState: () => null,
      },
    })

    expect(result.allPanels).toHaveLength(1)
    expect(result.allPanels[0]?.videoUrl).toBe('video/selected-panel-history.mp4')
  })
})
