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

  it('marks a video stale when the current image differs from its recorded source image', () => {
    const result = useVideoPanelsProjection({
      clips: [{ id: 'clip-1', start: 0, end: 5, summary: 'clip' }],
      storyboards: [{
        id: 'sb-1',
        clipId: 'clip-1',
        panels: [{
          id: 'panel-1',
          panelIndex: 0,
          imageUrl: 'images/current.png?signature=current',
          videoUrl: 'videos/output.mp4?signature=video',
          videoHistory: JSON.stringify([{
            videoUrl: 'videos/output.mp4',
            generatedAt: '2026-06-10T00:00:00.000Z',
            sourceImageUrls: ['images/source.png'],
          }]),
        }],
      }],
      panelVideoStates: { getTaskState: () => null },
      panelLipStates: { getTaskState: () => null },
    })

    expect(result.allPanels[0]?.isVideoStale).toBe(true)
  })

  it('keeps a video current when signed URLs resolve to the recorded source image', () => {
    const result = useVideoPanelsProjection({
      clips: [{ id: 'clip-1', start: 0, end: 5, summary: 'clip' }],
      storyboards: [{
        id: 'sb-1',
        clipId: 'clip-1',
        panels: [{
          id: 'panel-1',
          panelIndex: 0,
          imageUrl: 'images/source.png?signature=new',
          videoUrl: 'videos/output.mp4?signature=new',
          videoHistory: JSON.stringify([{
            videoUrl: 'videos/output.mp4?signature=old',
            generatedAt: '2026-06-10T00:00:00.000Z',
            sourceImageUrls: ['images/source.png?signature=old'],
          }]),
        }],
      }],
      panelVideoStates: { getTaskState: () => null },
      panelLipStates: { getTaskState: () => null },
    })

    expect(result.allPanels[0]?.isVideoStale).toBe(false)
  })

  it('keeps a video current when current image is an api storage signed url for the recorded source key', () => {
    const result = useVideoPanelsProjection({
      clips: [{ id: 'clip-1', start: 0, end: 5, summary: 'clip' }],
      storyboards: [{
        id: 'sb-1',
        clipId: 'clip-1',
        panels: [{
          id: 'panel-1',
          panelIndex: 0,
          imageUrl: '/api/storage/sign?key=images%2Fsource.png&expires=7200',
          videoUrl: '/api/storage/sign?key=video%2Foutput.mp4&expires=7200',
          videoHistory: JSON.stringify([{
            videoUrl: 'video/output.mp4',
            generatedAt: '2026-06-10T00:00:00.000Z',
            sourceImageUrls: ['images/source.png'],
          }]),
        }],
      }],
      panelVideoStates: { getTaskState: () => null },
      panelLipStates: { getTaskState: () => null },
    })

    expect(result.allPanels[0]?.isVideoStale).toBe(false)
  })

  it('keeps a video current when current image is wrapped by next image optimizer', () => {
    const result = useVideoPanelsProjection({
      clips: [{ id: 'clip-1', start: 0, end: 5, summary: 'clip' }],
      storyboards: [{
        id: 'sb-1',
        clipId: 'clip-1',
        panels: [{
          id: 'panel-1',
          panelIndex: 0,
          imageUrl: '/_next/image?url=%2Fapi%2Fstorage%2Fsign%3Fkey%3Dimages%252Fsource.png%26expires%3D7200&w=1200&q=75',
          videoUrl: '/api/storage/sign?key=video%2Foutput.mp4&expires=7200',
          videoHistory: JSON.stringify([{
            videoUrl: 'video/output.mp4',
            generatedAt: '2026-06-10T00:00:00.000Z',
            sourceImageUrls: ['images/source.png'],
          }]),
        }],
      }],
      panelVideoStates: { getTaskState: () => null },
      panelLipStates: { getTaskState: () => null },
    })

    expect(result.allPanels[0]?.isVideoStale).toBe(false)
  })
})
