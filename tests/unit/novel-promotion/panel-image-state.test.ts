import { describe, expect, it } from 'vitest'
import {
  PANEL_IMAGE_HISTORY_MAX,
  appendPanelImageHistoryEntries,
  appendPanelImageHistoryEntry,
  parsePanelImageHistory,
  removePanelImageHistoryEntry,
  serializePanelImageHistory,
} from '@/lib/novel-promotion/panel-image-state'

describe('panel-image-state', () => {
  it('parses simple {url, timestamp} legacy format', () => {
    const raw = JSON.stringify([
      { url: 'cos/a.png', timestamp: '2026-01-01T00:00:00Z' },
      { url: 'cos/b.png', timestamp: '2026-01-02T00:00:00Z' },
    ])
    const history = parsePanelImageHistory(raw)
    expect(history).toHaveLength(2)
    expect(history[0].url).toBe('cos/a.png')
    expect(history[0].source).toBeUndefined()
  })

  it('drops entries without url', () => {
    const raw = JSON.stringify([
      { url: '', timestamp: 'now' },
      { foo: 'bar' },
      { url: 'cos/x.png', timestamp: 'now' },
    ])
    expect(parsePanelImageHistory(raw)).toHaveLength(1)
  })

  it('returns empty array for malformed json', () => {
    expect(parsePanelImageHistory('not-json')).toEqual([])
    expect(parsePanelImageHistory(null)).toEqual([])
    expect(parsePanelImageHistory(JSON.stringify({ foo: 1 }))).toEqual([])
  })

  it('appendPanelImageHistoryEntry deduplicates by url, refreshes timestamp', () => {
    const initial = [
      { url: 'cos/a.png', timestamp: 't1', source: 'generate' as const },
    ]
    const next = appendPanelImageHistoryEntry(initial, {
      url: 'cos/a.png',
      timestamp: 't2',
      source: 'modify',
    })
    expect(next).toHaveLength(1)
    expect(next[0].timestamp).toBe('t2')
    expect(next[0].source).toBe('modify')
  })

  it('appendPanelImageHistoryEntry pushes new entry to the end', () => {
    const initial = [
      { url: 'cos/a.png', timestamp: 't1' },
      { url: 'cos/b.png', timestamp: 't2' },
    ]
    const next = appendPanelImageHistoryEntry(initial, { url: 'cos/c.png', timestamp: 't3' })
    expect(next.map((entry) => entry.url)).toEqual(['cos/a.png', 'cos/b.png', 'cos/c.png'])
  })

  it('FIFO trims to PANEL_IMAGE_HISTORY_MAX (50)', () => {
    let history: Array<{ url: string; timestamp: string }> = []
    for (let i = 0; i < PANEL_IMAGE_HISTORY_MAX + 5; i += 1) {
      history = appendPanelImageHistoryEntry(history, { url: `cos/${i}.png`, timestamp: `t${i}` })
    }
    expect(history).toHaveLength(PANEL_IMAGE_HISTORY_MAX)
    expect(history[0].url).toBe('cos/5.png')
    expect(history[history.length - 1].url).toBe(`cos/${PANEL_IMAGE_HISTORY_MAX + 4}.png`)
  })

  it('appendPanelImageHistoryEntries batches and preserves order', () => {
    const next = appendPanelImageHistoryEntries([], [
      { url: 'cos/a.png', timestamp: 't1', source: 'generate' },
      { url: 'cos/b.png', timestamp: 't2', source: 'generate' },
    ])
    expect(next.map((entry) => entry.url)).toEqual(['cos/a.png', 'cos/b.png'])
  })

  it('removePanelImageHistoryEntry removes entry by url', () => {
    const initial = [
      { url: 'cos/a.png', timestamp: 't1' },
      { url: 'cos/b.png', timestamp: 't2' },
    ]
    const next = removePanelImageHistoryEntry(initial, 'cos/a.png')
    expect(next.map((entry) => entry.url)).toEqual(['cos/b.png'])
  })

  it('serializePanelImageHistory returns null for empty', () => {
    expect(serializePanelImageHistory([])).toBeNull()
  })

  it('round trip: serialize then parse yields original', () => {
    const original = [
      { url: 'cos/a.png', timestamp: 't1', source: 'generate' as const },
      { url: 'cos/b.png', timestamp: 't2', source: 'modify' as const, imagePrompt: 'p' },
    ]
    const raw = serializePanelImageHistory(original)
    const parsed = parsePanelImageHistory(raw)
    expect(parsed[0]).toMatchObject({ url: 'cos/a.png', source: 'generate' })
    expect(parsed[1]).toMatchObject({ url: 'cos/b.png', source: 'modify', imagePrompt: 'p' })
  })
})
