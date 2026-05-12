export interface CoarseGroupImageHistoryEntry {
  imageUrl: string
  generatedAt: string
  imagePrompt: string
  videoPrompt: string
}

export interface CoarseGroupVideoHistoryEntry {
  videoUrl: string
  generatedAt: string
  videoPrompt: string
  videoModel: string
  generationMode: string
}

export interface CoarseGroupImageState {
  groupNumber: number
  imagePrompt: string
  videoPrompt: string
  duration: number | null
  imageUrl: string | null
  videoUrl: string | null
  videoModel: string | null
  videoGenerationMode: string | null
  candidateImages: string[] | null
  imageHistory: CoarseGroupImageHistoryEntry[]
  videoHistory: CoarseGroupVideoHistoryEntry[]
  updatedAt: string
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function readPositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value
}

function normalizeHistoryEntry(
  value: unknown,
  fallbackPrompt: { imagePrompt: string; videoPrompt: string },
): CoarseGroupImageHistoryEntry | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const imageUrl = readString(record.imageUrl || record.url)
  if (!imageUrl) return null
  return {
    imageUrl,
    generatedAt: readString(record.generatedAt || record.timestamp) || '',
    imagePrompt: readString(record.imagePrompt) || fallbackPrompt.imagePrompt,
    videoPrompt: readString(record.videoPrompt) || fallbackPrompt.videoPrompt,
  }
}

function normalizeVideoHistoryEntry(
  value: unknown,
  fallback: { videoPrompt: string; videoModel: string; generationMode: string },
): CoarseGroupVideoHistoryEntry | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const videoUrl = readString(record.videoUrl || record.url)
  if (!videoUrl) return null
  return {
    videoUrl,
    generatedAt: readString(record.generatedAt || record.timestamp) || '',
    videoPrompt: readString(record.videoPrompt) || fallback.videoPrompt,
    videoModel: readString(record.videoModel) || fallback.videoModel,
    generationMode: readString(record.generationMode || record.videoGenerationMode) || fallback.generationMode,
  }
}

function appendUniqueHistory(
  history: CoarseGroupImageHistoryEntry[],
  entry: CoarseGroupImageHistoryEntry,
) {
  if (!entry.imageUrl) return
  const existingIndex = history.findIndex((item) => item.imageUrl === entry.imageUrl)
  if (existingIndex >= 0) {
    history[existingIndex] = {
      ...history[existingIndex],
      generatedAt: entry.generatedAt || history[existingIndex].generatedAt,
      imagePrompt: entry.imagePrompt || history[existingIndex].imagePrompt,
      videoPrompt: entry.videoPrompt || history[existingIndex].videoPrompt,
    }
    return
  }
  history.push(entry)
}

function appendUniqueVideoHistory(
  history: CoarseGroupVideoHistoryEntry[],
  entry: CoarseGroupVideoHistoryEntry,
) {
  if (!entry.videoUrl) return
  const existingIndex = history.findIndex((item) => item.videoUrl === entry.videoUrl)
  if (existingIndex >= 0) {
    history[existingIndex] = {
      ...history[existingIndex],
      generatedAt: entry.generatedAt || history[existingIndex].generatedAt,
      videoPrompt: entry.videoPrompt || history[existingIndex].videoPrompt,
      videoModel: entry.videoModel || history[existingIndex].videoModel,
      generationMode: entry.generationMode || history[existingIndex].generationMode,
    }
    return
  }
  history.push(entry)
}

export function parseCoarseGroupsJson(raw: string | null | undefined): CoarseGroupImageState[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item): CoarseGroupImageState[] => {
      if (!item || typeof item !== 'object') return []
      const record = item as Record<string, unknown>
      if (typeof record.groupNumber !== 'number') return []
      const imagePrompt = readString(record.imagePrompt)
      const videoPrompt = readString(record.videoPrompt)
      const imageUrl = readString(record.imageUrl) || null
      const videoUrl = readString(record.videoUrl) || null
      const videoModel = readString(record.videoModel) || null
      const videoGenerationMode = readString(record.videoGenerationMode || record.generationMode) || null
      const history: CoarseGroupImageHistoryEntry[] = []
      const videoHistory: CoarseGroupVideoHistoryEntry[] = []
      const explicitHistory = Array.isArray(record.imageHistory) ? record.imageHistory : []
      for (const entry of explicitHistory) {
        const normalized = normalizeHistoryEntry(entry, { imagePrompt, videoPrompt })
        if (normalized) appendUniqueHistory(history, normalized)
      }
      const explicitVideoHistory = Array.isArray(record.videoHistory) ? record.videoHistory : []
      for (const entry of explicitVideoHistory) {
        const normalized = normalizeVideoHistoryEntry(entry, {
          videoPrompt,
          videoModel: videoModel || '',
          generationMode: videoGenerationMode || '',
        })
        if (normalized) appendUniqueVideoHistory(videoHistory, normalized)
      }
      for (const candidate of parseStringArray(record.candidateImages)) {
        appendUniqueHistory(history, {
          imageUrl: candidate,
          generatedAt: readString(record.updatedAt),
          imagePrompt,
          videoPrompt,
        })
      }
      if (imageUrl) {
        appendUniqueHistory(history, {
          imageUrl,
          generatedAt: readString(record.updatedAt),
          imagePrompt,
          videoPrompt,
        })
      }
      if (videoUrl) {
        appendUniqueVideoHistory(videoHistory, {
          videoUrl,
          generatedAt: readString(record.updatedAt),
          videoPrompt,
          videoModel: videoModel || '',
          generationMode: videoGenerationMode || '',
        })
      }
      return [{
        groupNumber: record.groupNumber,
        imagePrompt,
        videoPrompt,
        duration: readPositiveNumber(record.duration),
        imageUrl,
        videoUrl,
        videoModel,
        videoGenerationMode,
        candidateImages: parseStringArray(record.candidateImages),
        imageHistory: history,
        videoHistory,
        updatedAt: readString(record.updatedAt),
      }]
    })
  } catch {
    return []
  }
}

export function upsertCoarseGroupState(params: {
  raw: string | null | undefined
  groupNumber: number
  imagePrompt: string
  videoPrompt: string
  imageUrl: string | null
  candidateImages: string[] | null
  generatedAt?: string
}) {
  const generatedAt = params.generatedAt || new Date().toISOString()
  const groups = parseCoarseGroupsJson(params.raw).filter((group) => group.groupNumber !== params.groupNumber)
  const existing = parseCoarseGroupsJson(params.raw).find((group) => group.groupNumber === params.groupNumber)
  const imageHistory = existing ? [...existing.imageHistory] : []
  const generatedImages = params.candidateImages && params.candidateImages.length > 0
    ? params.candidateImages
    : params.imageUrl
      ? [params.imageUrl]
      : []

  for (const imageUrl of generatedImages) {
    appendUniqueHistory(imageHistory, {
      imageUrl,
      generatedAt,
      imagePrompt: params.imagePrompt,
      videoPrompt: params.videoPrompt,
    })
  }

  groups.push({
    groupNumber: params.groupNumber,
    imagePrompt: params.imagePrompt,
    videoPrompt: params.videoPrompt,
    duration: existing?.duration ?? null,
    imageUrl: params.imageUrl,
    videoUrl: existing?.videoUrl ?? null,
    videoModel: existing?.videoModel ?? null,
    videoGenerationMode: existing?.videoGenerationMode ?? null,
    candidateImages: params.candidateImages,
    imageHistory,
    videoHistory: existing?.videoHistory ?? [],
    updatedAt: generatedAt,
  })
  groups.sort((left, right) => left.groupNumber - right.groupNumber)
  return JSON.stringify(groups, null, 2)
}

export function updateCoarseGroupVideoSettings(params: {
  raw: string | null | undefined
  groupNumber: number
  videoPrompt?: string
  duration?: number | null
}) {
  if (!Number.isFinite(params.groupNumber) || params.groupNumber <= 0) return null
  if (params.videoPrompt === undefined && params.duration === undefined) return null

  const now = new Date().toISOString()
  const groups = parseCoarseGroupsJson(params.raw)
  const existing = groups.find((group) => group.groupNumber === params.groupNumber)
  const nextGroup: CoarseGroupImageState = {
    groupNumber: params.groupNumber,
    imagePrompt: existing?.imagePrompt ?? '',
    videoPrompt: params.videoPrompt !== undefined ? params.videoPrompt : (existing?.videoPrompt ?? ''),
    duration: params.duration !== undefined ? params.duration : (existing?.duration ?? null),
    imageUrl: existing?.imageUrl ?? null,
    videoUrl: existing?.videoUrl ?? null,
    videoModel: existing?.videoModel ?? null,
    videoGenerationMode: existing?.videoGenerationMode ?? null,
    candidateImages: existing?.candidateImages ?? null,
    imageHistory: existing?.imageHistory ?? [],
    videoHistory: existing?.videoHistory ?? [],
    updatedAt: now,
  }
  const nextGroups = [
    ...groups.filter((group) => group.groupNumber !== params.groupNumber),
    nextGroup,
  ].sort((left, right) => left.groupNumber - right.groupNumber)

  return JSON.stringify(nextGroups, null, 2)
}

export function upsertCoarseGroupVideoState(params: {
  raw: string | null | undefined
  groupNumber: number
  videoUrl: string
  videoPrompt: string
  videoModel: string
  generationMode: string
  generatedAt?: string
}) {
  if (!Number.isFinite(params.groupNumber) || params.groupNumber <= 0 || !params.videoUrl) return null

  const generatedAt = params.generatedAt || new Date().toISOString()
  const groups = parseCoarseGroupsJson(params.raw)
  const existing = groups.find((group) => group.groupNumber === params.groupNumber)
  const videoHistory = existing ? [...existing.videoHistory] : []
  appendUniqueVideoHistory(videoHistory, {
    videoUrl: params.videoUrl,
    generatedAt,
    videoPrompt: params.videoPrompt,
    videoModel: params.videoModel,
    generationMode: params.generationMode,
  })

  const nextGroup: CoarseGroupImageState = {
    groupNumber: params.groupNumber,
    imagePrompt: existing?.imagePrompt ?? '',
    videoPrompt: params.videoPrompt || existing?.videoPrompt || '',
    duration: existing?.duration ?? null,
    imageUrl: existing?.imageUrl ?? null,
    videoUrl: params.videoUrl,
    videoModel: params.videoModel || existing?.videoModel || null,
    videoGenerationMode: params.generationMode || existing?.videoGenerationMode || null,
    candidateImages: existing?.candidateImages ?? null,
    imageHistory: existing?.imageHistory ?? [],
    videoHistory,
    updatedAt: generatedAt,
  }
  const nextGroups = [
    ...groups.filter((group) => group.groupNumber !== params.groupNumber),
    nextGroup,
  ].sort((left, right) => left.groupNumber - right.groupNumber)

  return JSON.stringify(nextGroups, null, 2)
}

export function selectCoarseGroupVideo(params: {
  raw: string | null | undefined
  groupNumber: number
  selectedVideoUrl: string
}) {
  const groups = parseCoarseGroupsJson(params.raw)
  const group = groups.find((item) => item.groupNumber === params.groupNumber)
  if (!group) return null
  const selectableVideos = new Set([
    group.videoUrl,
    ...group.videoHistory.map((entry) => entry.videoUrl),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0))
  if (!selectableVideos.has(params.selectedVideoUrl)) return null

  const selectedEntry = group.videoHistory.find((entry) => entry.videoUrl === params.selectedVideoUrl) || null
  const now = new Date().toISOString()
  const nextGroups = groups.map((item) =>
    item.groupNumber === params.groupNumber
      ? {
        ...item,
        videoUrl: params.selectedVideoUrl,
        ...(selectedEntry?.videoPrompt ? { videoPrompt: selectedEntry.videoPrompt } : {}),
        videoModel: selectedEntry?.videoModel || item.videoModel,
        videoGenerationMode: selectedEntry?.generationMode || item.videoGenerationMode,
        updatedAt: now,
      }
      : item,
  )
  nextGroups.sort((left, right) => left.groupNumber - right.groupNumber)
  return JSON.stringify(nextGroups, null, 2)
}

export function deleteCoarseGroupHistoryVideo(params: {
  raw: string | null | undefined
  groupNumber: number
  videoUrl: string
}) {
  const groups = parseCoarseGroupsJson(params.raw)
  const group = groups.find((item) => item.groupNumber === params.groupNumber)
  if (!group) return null

  const hasVideo = [
    group.videoUrl,
    ...group.videoHistory.map((entry) => entry.videoUrl),
  ].some((videoUrl) => videoUrl === params.videoUrl)
  if (!hasVideo) return null

  const nextHistory = group.videoHistory.filter((entry) => entry.videoUrl !== params.videoUrl)
  const fallbackEntry = nextHistory.at(-1) || null
  const nextVideoUrl = group.videoUrl === params.videoUrl
    ? fallbackEntry?.videoUrl || null
    : group.videoUrl
  const now = new Date().toISOString()

  const nextGroups = groups.map((item) =>
    item.groupNumber === params.groupNumber
      ? {
        ...item,
        videoUrl: nextVideoUrl,
        videoModel: group.videoUrl === params.videoUrl
          ? fallbackEntry?.videoModel || null
          : item.videoModel,
        videoGenerationMode: group.videoUrl === params.videoUrl
          ? fallbackEntry?.generationMode || null
          : item.videoGenerationMode,
        videoHistory: nextHistory,
        updatedAt: now,
      }
      : item,
  )
  nextGroups.sort((left, right) => left.groupNumber - right.groupNumber)
  return JSON.stringify(nextGroups, null, 2)
}

export function selectCoarseGroupImage(params: {
  raw: string | null | undefined
  groupNumber: number
  selectedImageUrl: string
}) {
  const groups = parseCoarseGroupsJson(params.raw)
  const group = groups.find((item) => item.groupNumber === params.groupNumber)
  if (!group) return null
  const selectableImages = new Set([
    group.imageUrl,
    ...(group.candidateImages || []),
    ...group.imageHistory.map((entry) => entry.imageUrl),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0))
  if (!selectableImages.has(params.selectedImageUrl)) return null
  const now = new Date().toISOString()
  const nextGroups = groups.map((item) =>
    item.groupNumber === params.groupNumber
      ? { ...item, imageUrl: params.selectedImageUrl, updatedAt: now }
      : item,
  )
  nextGroups.sort((left, right) => left.groupNumber - right.groupNumber)
  return JSON.stringify(nextGroups, null, 2)
}

export function deleteCoarseGroupHistoryImage(params: {
  raw: string | null | undefined
  groupNumber: number
  imageUrl: string
}) {
  const groups = parseCoarseGroupsJson(params.raw)
  const group = groups.find((item) => item.groupNumber === params.groupNumber)
  if (!group) return null

  const hasImage = [
    group.imageUrl,
    ...(group.candidateImages || []),
    ...group.imageHistory.map((entry) => entry.imageUrl),
  ].some((imageUrl) => imageUrl === params.imageUrl)
  if (!hasImage) return null

  const nextHistory = group.imageHistory.filter((entry) => entry.imageUrl !== params.imageUrl)
  const nextCandidateImages = (group.candidateImages || []).filter((imageUrl) => imageUrl !== params.imageUrl)
  const nextImageUrl = group.imageUrl === params.imageUrl
    ? nextHistory.at(-1)?.imageUrl || null
    : group.imageUrl
  const now = new Date().toISOString()

  const nextGroups = groups.map((item) =>
    item.groupNumber === params.groupNumber
      ? {
        ...item,
        imageUrl: nextImageUrl,
        candidateImages: nextCandidateImages.length > 0 ? nextCandidateImages : null,
        imageHistory: nextHistory,
        updatedAt: now,
      }
      : item,
  )
  nextGroups.sort((left, right) => left.groupNumber - right.groupNumber)
  return JSON.stringify(nextGroups, null, 2)
}
