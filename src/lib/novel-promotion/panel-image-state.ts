export type PanelImageHistorySource = 'generate' | 'modify' | 'upload' | 'select'

export interface PanelImageHistoryEntry {
  url: string
  timestamp: string
  source?: PanelImageHistorySource
  imagePrompt?: string
  taskId?: string
}

export const PANEL_IMAGE_HISTORY_MAX = 50

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeEntry(value: unknown): PanelImageHistoryEntry | null {
  if (!isRecord(value)) return null
  const url = readString(value.url || value.imageUrl)
  if (!url) return null
  const timestamp = readString(value.timestamp || value.generatedAt) || new Date().toISOString()
  const sourceRaw = readString(value.source)
  const source: PanelImageHistorySource | undefined =
    sourceRaw === 'generate' || sourceRaw === 'modify' || sourceRaw === 'upload' || sourceRaw === 'select'
      ? sourceRaw
      : undefined
  const imagePrompt = readString(value.imagePrompt) || undefined
  const taskId = readString(value.taskId) || undefined
  return { url, timestamp, source, imagePrompt, taskId }
}

export function parsePanelImageHistory(raw: string | null | undefined): PanelImageHistoryEntry[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const result: PanelImageHistoryEntry[] = []
    for (const item of parsed) {
      const normalized = normalizeEntry(item)
      if (normalized) result.push(normalized)
    }
    return result
  } catch {
    return []
  }
}

export function serializePanelImageHistory(history: PanelImageHistoryEntry[]): string | null {
  if (!history.length) return null
  return JSON.stringify(history)
}

function trimToMax(history: PanelImageHistoryEntry[], max: number): PanelImageHistoryEntry[] {
  if (history.length <= max) return history
  return history.slice(history.length - max)
}

export function appendPanelImageHistoryEntry(
  history: PanelImageHistoryEntry[],
  entry: PanelImageHistoryEntry,
  max: number = PANEL_IMAGE_HISTORY_MAX,
): PanelImageHistoryEntry[] {
  if (!entry.url) return history
  const next = [...history]
  const existingIndex = next.findIndex((item) => item.url === entry.url)
  const merged: PanelImageHistoryEntry = {
    url: entry.url,
    timestamp: entry.timestamp || new Date().toISOString(),
    source: entry.source ?? (existingIndex >= 0 ? next[existingIndex].source : undefined),
    imagePrompt: entry.imagePrompt ?? (existingIndex >= 0 ? next[existingIndex].imagePrompt : undefined),
    taskId: entry.taskId ?? (existingIndex >= 0 ? next[existingIndex].taskId : undefined),
  }
  if (existingIndex >= 0) {
    next.splice(existingIndex, 1)
  }
  next.push(merged)
  return trimToMax(next, max)
}

export function appendPanelImageHistoryEntries(
  history: PanelImageHistoryEntry[],
  entries: PanelImageHistoryEntry[],
  max: number = PANEL_IMAGE_HISTORY_MAX,
): PanelImageHistoryEntry[] {
  let result = history
  for (const entry of entries) {
    result = appendPanelImageHistoryEntry(result, entry, max)
  }
  return result
}

export function removePanelImageHistoryEntry(
  history: PanelImageHistoryEntry[],
  url: string,
): PanelImageHistoryEntry[] {
  if (!url) return history
  return history.filter((item) => item.url !== url)
}
