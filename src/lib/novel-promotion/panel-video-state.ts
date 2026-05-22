export type PanelVideoHistorySource = 'generate' | 'firstlastframe' | 'select'

export interface PanelVideoHistoryEntry {
  videoUrl: string
  generatedAt: string
  source?: PanelVideoHistorySource
  videoPrompt?: string
  videoModel?: string
  generationMode?: string
  taskId?: string
}

export const PANEL_VIDEO_HISTORY_MAX = 50

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeEntry(value: unknown): PanelVideoHistoryEntry | null {
  if (!isRecord(value)) return null
  const videoUrl = readString(value.videoUrl || value.url)
  if (!videoUrl) return null
  const generatedAt = readString(value.generatedAt || value.timestamp) || new Date().toISOString()
  const sourceRaw = readString(value.source)
  const source: PanelVideoHistorySource | undefined =
    sourceRaw === 'generate' || sourceRaw === 'firstlastframe' || sourceRaw === 'select'
      ? sourceRaw
      : undefined
  const videoPrompt = readString(value.videoPrompt) || undefined
  const videoModel = readString(value.videoModel) || undefined
  const generationMode = readString(value.generationMode) || undefined
  const taskId = readString(value.taskId) || undefined
  return { videoUrl, generatedAt, source, videoPrompt, videoModel, generationMode, taskId }
}

export function parsePanelVideoHistory(raw: string | null | undefined): PanelVideoHistoryEntry[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const result: PanelVideoHistoryEntry[] = []
    for (const item of parsed) {
      const normalized = normalizeEntry(item)
      if (normalized) result.push(normalized)
    }
    return result
  } catch {
    return []
  }
}

export function serializePanelVideoHistory(history: PanelVideoHistoryEntry[]): string | null {
  if (!history.length) return null
  return JSON.stringify(history)
}

function trimToMax(history: PanelVideoHistoryEntry[], max: number): PanelVideoHistoryEntry[] {
  if (history.length <= max) return history
  return history.slice(history.length - max)
}

export function appendPanelVideoHistoryEntry(
  history: PanelVideoHistoryEntry[],
  entry: PanelVideoHistoryEntry,
  max: number = PANEL_VIDEO_HISTORY_MAX,
): PanelVideoHistoryEntry[] {
  if (!entry.videoUrl) return history
  const next = [...history]
  const existingIndex = next.findIndex((item) => item.videoUrl === entry.videoUrl)
  const merged: PanelVideoHistoryEntry = {
    videoUrl: entry.videoUrl,
    generatedAt: entry.generatedAt || new Date().toISOString(),
    source: entry.source ?? (existingIndex >= 0 ? next[existingIndex].source : undefined),
    videoPrompt: entry.videoPrompt ?? (existingIndex >= 0 ? next[existingIndex].videoPrompt : undefined),
    videoModel: entry.videoModel ?? (existingIndex >= 0 ? next[existingIndex].videoModel : undefined),
    generationMode: entry.generationMode ?? (existingIndex >= 0 ? next[existingIndex].generationMode : undefined),
    taskId: entry.taskId ?? (existingIndex >= 0 ? next[existingIndex].taskId : undefined),
  }
  if (existingIndex >= 0) {
    next.splice(existingIndex, 1)
  }
  next.push(merged)
  return trimToMax(next, max)
}

export function removePanelVideoHistoryEntry(
  history: PanelVideoHistoryEntry[],
  videoUrl: string,
): PanelVideoHistoryEntry[] {
  if (!videoUrl) return history
  return history.filter((item) => item.videoUrl !== videoUrl)
}
