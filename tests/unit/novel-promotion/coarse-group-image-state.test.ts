import { describe, expect, it } from 'vitest'
import {
  deleteCoarseGroupHistoryImage,
  parseCoarseGroupsJson,
  selectCoarseGroupImage,
  updateCoarseGroupVideoSettings,
  upsertCoarseGroupState,
} from '@/lib/novel-promotion/coarse-group-image-state'

describe('coarse group image state', () => {
  it('appends every generated candidate to image history while keeping current image', () => {
    const first = upsertCoarseGroupState({
      raw: null,
      groupNumber: 1,
      imagePrompt: 'prompt 1',
      videoPrompt: 'video 1',
      imageUrl: 'cos/group-1-a.png',
      candidateImages: ['cos/group-1-a.png', 'cos/group-1-b.png'],
      generatedAt: '2026-05-01T00:00:00.000Z',
    })
    const second = upsertCoarseGroupState({
      raw: first,
      groupNumber: 1,
      imagePrompt: 'prompt 2',
      videoPrompt: 'video 2',
      imageUrl: 'cos/group-1-c.png',
      candidateImages: ['cos/group-1-c.png'],
      generatedAt: '2026-05-01T01:00:00.000Z',
    })

    const [group] = parseCoarseGroupsJson(second)
    expect(group.imageUrl).toBe('cos/group-1-c.png')
    expect(group.imageHistory.map((entry) => entry.imageUrl)).toEqual([
      'cos/group-1-a.png',
      'cos/group-1-b.png',
      'cos/group-1-c.png',
    ])
    expect(group.imageHistory.at(-1)?.imagePrompt).toBe('prompt 2')
  })

  it('selects only an image already present in the group history', () => {
    const raw = upsertCoarseGroupState({
      raw: null,
      groupNumber: 2,
      imagePrompt: 'prompt',
      videoPrompt: 'video',
      imageUrl: 'cos/group-2-a.png',
      candidateImages: ['cos/group-2-a.png', 'cos/group-2-b.png'],
      generatedAt: '2026-05-01T00:00:00.000Z',
    })

    const selected = selectCoarseGroupImage({
      raw,
      groupNumber: 2,
      selectedImageUrl: 'cos/group-2-b.png',
    })
    expect(parseCoarseGroupsJson(selected)[0].imageUrl).toBe('cos/group-2-b.png')

    expect(selectCoarseGroupImage({
      raw,
      groupNumber: 2,
      selectedImageUrl: 'cos/not-in-history.png',
    })).toBeNull()
  })

  it('deletes a non-current history image without changing current image', () => {
    const raw = upsertCoarseGroupState({
      raw: null,
      groupNumber: 3,
      imagePrompt: 'prompt',
      videoPrompt: 'video',
      imageUrl: 'cos/group-3-current.png',
      candidateImages: ['cos/group-3-old.png', 'cos/group-3-current.png'],
      generatedAt: '2026-05-01T00:00:00.000Z',
    })

    const deleted = deleteCoarseGroupHistoryImage({
      raw,
      groupNumber: 3,
      imageUrl: 'cos/group-3-old.png',
    })
    const [group] = parseCoarseGroupsJson(deleted)
    expect(group.imageUrl).toBe('cos/group-3-current.png')
    expect(group.imageHistory.map((entry) => entry.imageUrl)).toEqual(['cos/group-3-current.png'])
    expect(group.candidateImages).toEqual(['cos/group-3-current.png'])
  })

  it('deletes current image and falls back to the latest remaining history image', () => {
    const first = upsertCoarseGroupState({
      raw: null,
      groupNumber: 4,
      imagePrompt: 'prompt 1',
      videoPrompt: 'video 1',
      imageUrl: 'cos/group-4-a.png',
      candidateImages: ['cos/group-4-a.png'],
      generatedAt: '2026-05-01T00:00:00.000Z',
    })
    const second = upsertCoarseGroupState({
      raw: first,
      groupNumber: 4,
      imagePrompt: 'prompt 2',
      videoPrompt: 'video 2',
      imageUrl: 'cos/group-4-b.png',
      candidateImages: ['cos/group-4-b.png'],
      generatedAt: '2026-05-01T01:00:00.000Z',
    })

    const deleted = deleteCoarseGroupHistoryImage({
      raw: second,
      groupNumber: 4,
      imageUrl: 'cos/group-4-b.png',
    })
    const [group] = parseCoarseGroupsJson(deleted)
    expect(group.imageUrl).toBe('cos/group-4-a.png')
    expect(group.imageHistory.map((entry) => entry.imageUrl)).toEqual(['cos/group-4-a.png'])
  })

  it('rejects deleting images that are not recorded for the group', () => {
    const raw = upsertCoarseGroupState({
      raw: null,
      groupNumber: 5,
      imagePrompt: 'prompt',
      videoPrompt: 'video',
      imageUrl: 'cos/group-5-a.png',
      candidateImages: ['cos/group-5-a.png'],
      generatedAt: '2026-05-01T00:00:00.000Z',
    })

    expect(deleteCoarseGroupHistoryImage({
      raw,
      groupNumber: 5,
      imageUrl: 'cos/not-in-history.png',
    })).toBeNull()
  })

  it('persists group video prompt and duration without dropping image state', () => {
    const raw = upsertCoarseGroupState({
      raw: null,
      groupNumber: 6,
      imagePrompt: 'image prompt',
      videoPrompt: 'old video',
      imageUrl: 'cos/group-6-a.png',
      candidateImages: ['cos/group-6-a.png'],
      generatedAt: '2026-05-01T00:00:00.000Z',
    })

    const updated = updateCoarseGroupVideoSettings({
      raw,
      groupNumber: 6,
      videoPrompt: 'new video',
      duration: 19,
    })
    const [group] = parseCoarseGroupsJson(updated)

    expect(group.videoPrompt).toBe('new video')
    expect(group.duration).toBe(19)
    expect(group.imagePrompt).toBe('image prompt')
    expect(group.imageUrl).toBe('cos/group-6-a.png')
    expect(group.imageHistory.map((entry) => entry.imageUrl)).toEqual(['cos/group-6-a.png'])
  })
})
