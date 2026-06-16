import { describe, expect, it, vi } from 'vitest'

const resolveMediaRefMock = vi.hoisted(() => vi.fn())
const resolveMediaRefFromLegacyValueMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/media/service', () => ({
  resolveMediaRef: resolveMediaRefMock,
  resolveMediaRefFromLegacyValue: resolveMediaRefFromLegacyValueMock,
}))

import { attachMediaFieldsToProject } from '@/lib/media/attach'

describe('media attach video history source images', () => {
  it('resolves panel videoHistory sourceImageUrls to stable media routes', async () => {
    resolveMediaRefMock.mockImplementation(async (_mediaId: unknown, legacyValue: unknown) => {
      if (legacyValue === 'images/source.png') return { url: '/m/source-image' }
      if (legacyValue === 'video/output.mp4') return { url: '/m/output-video' }
      return null
    })
    resolveMediaRefFromLegacyValueMock.mockImplementation(async (value: unknown) => {
      if (value === 'images/source.png') return { url: '/m/source-image' }
      if (value === 'video/output.mp4') return { url: '/m/output-video' }
      return null
    })

    const attached = await attachMediaFieldsToProject({
      storyboards: [{
        id: 'storyboard-1',
        storyboardImageUrl: null,
        panels: [{
          id: 'panel-1',
          imageUrl: 'images/source.png',
          videoUrl: 'video/output.mp4',
          videoHistory: JSON.stringify([{
            videoUrl: 'video/output.mp4',
            sourceImageUrls: ['images/source.png'],
          }]),
        }],
      }],
    })

    const panel = (attached.storyboards as Array<{ panels: Array<{ imageUrl: string; videoHistory: string }> }>)[0].panels[0]
    const history = JSON.parse(panel.videoHistory)
    expect(panel.imageUrl).toBe('/m/source-image')
    expect(history[0].videoUrl).toBe('/m/output-video')
    expect(history[0].sourceImageUrls).toEqual(['/m/source-image'])
  })

  it('resolves panel group videoHistory sourceImageUrls to stable media routes', async () => {
    resolveMediaRefMock.mockResolvedValue(null)
    resolveMediaRefFromLegacyValueMock.mockImplementation(async (value: unknown) => {
      if (value === 'images/source.png') return { url: '/m/source-image' }
      if (value === 'video/group.mp4') return { url: '/m/group-video' }
      return null
    })

    const attached = await attachMediaFieldsToProject({
      storyboards: [{
        id: 'storyboard-1',
        storyboardImageUrl: null,
        panelGroups: [{
          id: 'group-1',
          videoUrl: 'video/group.mp4',
          videoHistory: JSON.stringify([{
            videoUrl: 'video/group.mp4',
            sourceImageUrls: ['images/source.png'],
          }]),
        }],
      }],
    })

    const group = (attached.storyboards as Array<{ panelGroups: Array<{ videoHistory: string }> }>)[0].panelGroups[0]
    const history = JSON.parse(group.videoHistory)
    expect(history[0].videoUrl).toBe('/m/group-video')
    expect(history[0].sourceImageUrls).toEqual(['/m/source-image'])
  })
})
