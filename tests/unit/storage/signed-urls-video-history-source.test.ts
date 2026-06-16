import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/storage', () => ({
  getSignedUrl: vi.fn((key: string, expires = 86400) => `/api/storage/sign?key=${encodeURIComponent(key)}&expires=${expires}`),
}))

import { addSignedUrlsToStoryboard } from '@/lib/storage/signed-urls'

describe('signed urls video history source images', () => {
  it('signs panel videoHistory sourceImageUrls with the same path shape as panel imageUrl', () => {
    const storyboard = addSignedUrlsToStoryboard({
      storyboardImageUrl: null,
      panels: [{
        imageUrl: 'images/source.png',
        sketchImageUrl: null,
        videoUrl: 'video/output.mp4',
        lipSyncVideoUrl: null,
        candidateImages: null,
        videoHistory: JSON.stringify([{
          videoUrl: 'video/output.mp4',
          sourceImageUrls: [
            'images/source.png',
            '/m/existing-image',
            '/api/storage/sign?key=images%2Fexisting.png&expires=7200',
          ],
        }]),
      }],
    })

    const panel = storyboard.panels[0]
    const history = JSON.parse(panel.videoHistory || '[]')
    expect(panel.imageUrl).toBe('/api/storage/sign?key=images%2Fsource.png&expires=86400')
    expect(history[0].sourceImageUrls).toEqual([
      '/api/storage/sign?key=images%2Fsource.png&expires=86400',
      '/m/existing-image',
      '/api/storage/sign?key=images%2Fexisting.png&expires=7200',
    ])
  })

  it('signs panel group videoHistory sourceImageUrls', () => {
    const storyboard = addSignedUrlsToStoryboard({
      storyboardImageUrl: null,
      panelGroups: [{
        videoUrl: 'video/group.mp4',
        videoHistory: [{
          videoUrl: 'video/group.mp4',
          sourceImageUrls: ['images/source.png'],
        }],
      }],
    })

    const group = (storyboard.panelGroups as Array<{ videoHistory: Array<{ sourceImageUrls: string[] }> }>)[0]
    expect(group.videoHistory[0].sourceImageUrls).toEqual(['/api/storage/sign?key=images%2Fsource.png&expires=86400'])
  })
})
