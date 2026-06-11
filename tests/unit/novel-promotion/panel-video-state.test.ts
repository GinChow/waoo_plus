import { describe, expect, it } from 'vitest'
import {
  appendPanelVideoHistoryEntry,
  parsePanelVideoHistory,
  serializePanelVideoHistory,
} from '@/lib/novel-promotion/panel-video-state'

describe('panel video history source images', () => {
  it('round-trips the images used to generate a video', () => {
    const history = appendPanelVideoHistoryEntry([], {
      videoUrl: 'videos/output.mp4',
      generatedAt: '2026-06-10T00:00:00.000Z',
      source: 'generate',
      sourceImageUrls: ['images/first.png', 'images/last.png'],
    })

    expect(parsePanelVideoHistory(serializePanelVideoHistory(history))).toEqual(history)
  })

  it('preserves recorded source images when an existing video entry is updated', () => {
    const history = appendPanelVideoHistoryEntry([{
      videoUrl: 'videos/output.mp4',
      generatedAt: '2026-06-10T00:00:00.000Z',
      sourceImageUrls: ['images/source.png'],
    }], {
      videoUrl: 'videos/output.mp4',
      generatedAt: '2026-06-10T01:00:00.000Z',
      videoModel: 'provider::model',
    })

    expect(history[0]?.sourceImageUrls).toEqual(['images/source.png'])
  })
})
