import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import { resolveMediaRef, resolveMediaRefFromLegacyValue } from './service'
import type { MediaRef } from './types'

function parseStringArray(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

async function resolveAppearanceImageArray(raw: unknown, fieldName: string): Promise<{ urls: string[]; medias: MediaRef[] }> {
  if ((raw === null || raw === undefined) && fieldName.endsWith('previousImageUrls')) {
    return { urls: [], medias: [] }
  }
  const values = decodeImageUrlsFromDb(raw as string | null | undefined, fieldName)
  const refs = await Promise.all(values.map((value) => resolveMediaRefFromLegacyValue(value)))
  return {
    urls: values.map((value, index) => refs[index]?.url || value),
    medias: refs.filter((ref): ref is MediaRef => !!ref),
  }
}

async function attachMediaFieldsToAppearance<T extends Record<string, unknown>>(appearance: T) {
  const imageMedia = await resolveMediaRef(appearance.imageMediaId, appearance.imageUrl)
  const previousImageMedia = await resolveMediaRef(appearance.previousImageMediaId, appearance.previousImageUrl)
  const imageResult = await resolveAppearanceImageArray(appearance.imageUrls, 'appearance.imageUrls')
  const previousImageResult = await resolveAppearanceImageArray(appearance.previousImageUrls, 'appearance.previousImageUrls')

  return {
    ...appearance,
    imageMedia,
    media: imageMedia,
    previousImageMedia,
    imageMedias: imageResult.medias,
    previousImageMedias: previousImageResult.medias,
    imageUrl: imageMedia?.url || appearance.imageUrl || null,
    previousImageUrl: previousImageMedia?.url || appearance.previousImageUrl || null,
    imageUrls: imageResult.urls,
    previousImageUrls: previousImageResult.urls,
  }
}

export async function attachMediaFieldsToGlobalCharacter<T extends Record<string, unknown>>(character: T) {
  const customVoiceMedia = await resolveMediaRef(character.customVoiceMediaId, character.customVoiceUrl)
  const appearances = await Promise.all(
    ((character.appearances as Array<Record<string, unknown>>) || []).map(attachMediaFieldsToAppearance),
  )

  return {
    ...character,
    media: customVoiceMedia,
    customVoiceMedia,
    customVoiceUrl: customVoiceMedia?.url || character.customVoiceUrl || null,
    appearances,
  }
}

export async function attachMediaFieldsToGlobalLocation<T extends Record<string, unknown>>(location: T) {
  const images = await Promise.all(
    ((location.images as Array<Record<string, unknown>>) || []).map(async (img) => {
    const imageMedia = await resolveMediaRef(img.imageMediaId, img.imageUrl)
    const previousImageMedia = await resolveMediaRef(img.previousImageMediaId, img.previousImageUrl)
    return {
      ...img,
      media: imageMedia,
      imageMedia,
      previousImageMedia,
      imageUrl: imageMedia?.url || img.imageUrl || null,
      previousImageUrl: previousImageMedia?.url || img.previousImageUrl || null,
    }
    }),
  )

  return {
    ...location,
    images,
  }
}

export async function attachMediaFieldsToGlobalVoice<T extends Record<string, unknown>>(voice: T) {
  const customVoiceMedia = await resolveMediaRef(voice.customVoiceMediaId, voice.customVoiceUrl)
  return {
    ...voice,
    media: customVoiceMedia,
    customVoiceMedia,
    customVoiceUrl: customVoiceMedia?.url || voice.customVoiceUrl || null,
  }
}

async function attachMediaFieldsToPanel<T extends Record<string, unknown>>(panel: T) {
  const imageMedia = await resolveMediaRef(panel.imageMediaId, panel.imageUrl)
  const videoMedia = await resolveMediaRef(panel.videoMediaId, panel.videoUrl)
  const lipSyncVideoMedia = await resolveMediaRef(panel.lipSyncVideoMediaId, panel.lipSyncVideoUrl)
  const sketchImageMedia = await resolveMediaRef(panel.sketchImageMediaId, panel.sketchImageUrl)
  const previousImageMedia = await resolveMediaRef(panel.previousImageMediaId, panel.previousImageUrl)

  const candidateRaw = parseStringArray(panel.candidateImages)
  const candidateMediaUrls: string[] = []
  for (const candidate of candidateRaw) {
    if (candidate.startsWith('PENDING:')) {
      candidateMediaUrls.push(candidate)
      continue
    }
    const media = await resolveMediaRefFromLegacyValue(candidate)
    candidateMediaUrls.push(media?.url || candidate)
  }

  let resolvedImageHistoryJson: unknown = panel.imageHistory
  if (typeof panel.imageHistory === 'string' && panel.imageHistory.trim()) {
    try {
      const parsed = JSON.parse(panel.imageHistory)
      if (Array.isArray(parsed)) {
        const resolved = await Promise.all(parsed.map(async (entry) => {
          if (!entry || typeof entry !== 'object') return entry
          const record = entry as Record<string, unknown>
          const url = typeof record.url === 'string' ? record.url : ''
          if (!url || url.startsWith('PENDING:')) return record
          const media = await resolveMediaRefFromLegacyValue(url)
          return {
            ...record,
            url: media?.url || url,
          }
        }))
        resolvedImageHistoryJson = JSON.stringify(resolved)
      }
    } catch {
      // keep original on parse failure
    }
  }

  let resolvedVideoHistoryJson: unknown = panel.videoHistory
  if (typeof panel.videoHistory === 'string' && panel.videoHistory.trim()) {
    try {
      const parsed = JSON.parse(panel.videoHistory)
      if (Array.isArray(parsed)) {
        const resolved = await Promise.all(parsed.map(async (entry) => {
          if (!entry || typeof entry !== 'object') return entry
          const record = entry as Record<string, unknown>
          const videoUrl = typeof record.videoUrl === 'string' ? record.videoUrl : ''
          if (!videoUrl || videoUrl.startsWith('PENDING:')) return record
          const media = await resolveMediaRefFromLegacyValue(videoUrl)
          return {
            ...record,
            videoUrl: media?.url || videoUrl,
          }
        }))
        resolvedVideoHistoryJson = JSON.stringify(resolved)
      }
    } catch {
      // keep original on parse failure
    }
  }

  return {
    ...panel,
    media: imageMedia,
    imageMedia,
    videoMedia,
    lipSyncVideoMedia,
    sketchImageMedia,
    previousImageMedia,
    imageUrl: imageMedia?.url || panel.imageUrl || null,
    videoUrl: videoMedia?.url || panel.videoUrl || null,
    lipSyncVideoUrl: lipSyncVideoMedia?.url || panel.lipSyncVideoUrl || null,
    sketchImageUrl: sketchImageMedia?.url || panel.sketchImageUrl || null,
    previousImageUrl: previousImageMedia?.url || panel.previousImageUrl || null,
    candidateImages: candidateRaw.length > 0 ? JSON.stringify(candidateMediaUrls) : panel.candidateImages,
    imageHistory: resolvedImageHistoryJson,
    videoHistory: resolvedVideoHistoryJson,
  }
}

async function attachMediaFieldsToStoryboard<T extends Record<string, unknown>>(storyboard: T) {
  const storyboardImageMedia = await resolveMediaRefFromLegacyValue(storyboard.storyboardImageUrl)
  let coarseGroupsJson = storyboard.coarseGroupsJson
  if (typeof storyboard.coarseGroupsJson === 'string' && storyboard.coarseGroupsJson.trim()) {
    try {
      const groups = JSON.parse(storyboard.coarseGroupsJson)
      if (Array.isArray(groups)) {
        const resolvedGroups = await Promise.all(groups.map(async (group) => {
          if (!group || typeof group !== 'object') return group
          const record = group as Record<string, unknown>
          const imageMedia = await resolveMediaRefFromLegacyValue(record.imageUrl)
          const candidates = parseStringArray(record.candidateImages)
          const resolvedCandidates = await Promise.all(candidates.map(async (candidate) => {
            if (candidate.startsWith('PENDING:')) return candidate
            const media = await resolveMediaRefFromLegacyValue(candidate)
            return media?.url || candidate
          }))
          const history = Array.isArray(record.imageHistory) ? record.imageHistory : []
          const resolvedHistory = await Promise.all(history.map(async (entry) => {
            if (!entry || typeof entry !== 'object') return entry
            const historyRecord = entry as Record<string, unknown>
            const imageUrl = typeof historyRecord.imageUrl === 'string' ? historyRecord.imageUrl : ''
            if (!imageUrl || imageUrl.startsWith('PENDING:')) return historyRecord
            const media = await resolveMediaRefFromLegacyValue(imageUrl)
            return {
              ...historyRecord,
              imageUrl: media?.url || imageUrl,
            }
          }))
          const videoHistory = Array.isArray(record.videoHistory) ? record.videoHistory : []
          const resolvedVideoHistory = await Promise.all(videoHistory.map(async (entry) => {
            if (!entry || typeof entry !== 'object') return entry
            const historyRecord = entry as Record<string, unknown>
            const videoUrl = typeof historyRecord.videoUrl === 'string' ? historyRecord.videoUrl : ''
            if (!videoUrl || videoUrl.startsWith('PENDING:')) return historyRecord
            const media = await resolveMediaRefFromLegacyValue(videoUrl)
            return {
              ...historyRecord,
              videoUrl: media?.url || videoUrl,
            }
          }))
          const videoMedia = await resolveMediaRefFromLegacyValue(record.videoUrl)
          return {
            ...record,
            imageUrl: imageMedia?.url || record.imageUrl || null,
            videoUrl: videoMedia?.url || record.videoUrl || null,
            candidateImages: candidates.length > 0 ? resolvedCandidates : record.candidateImages || null,
            imageHistory: history.length > 0 ? resolvedHistory : record.imageHistory || [],
            videoHistory: videoHistory.length > 0 ? resolvedVideoHistory : record.videoHistory || [],
          }
        }))
        coarseGroupsJson = JSON.stringify(resolvedGroups)
      }
    } catch {
      coarseGroupsJson = storyboard.coarseGroupsJson
    }
  }
  const panels = await Promise.all(
    ((storyboard.panels as Array<Record<string, unknown>>) || []).map(attachMediaFieldsToPanel),
  )

  return {
    ...storyboard,
    media: storyboardImageMedia,
    storyboardImageMedia,
    storyboardImageUrl: storyboardImageMedia?.url || storyboard.storyboardImageUrl || null,
    coarseGroupsJson,
    panels,
  }
}

async function attachMediaFieldsToProjectCharacter<T extends Record<string, unknown>>(character: T) {
  const customVoiceMedia = await resolveMediaRef(character.customVoiceMediaId, character.customVoiceUrl)
  const appearances = await Promise.all(
    ((character.appearances as Array<Record<string, unknown>>) || []).map(attachMediaFieldsToAppearance),
  )
  return {
    ...character,
    media: customVoiceMedia,
    customVoiceMedia,
    customVoiceUrl: customVoiceMedia?.url || character.customVoiceUrl || null,
    appearances,
  }
}

async function attachMediaFieldsToProjectLocation<T extends Record<string, unknown>>(location: T) {
  const images = await Promise.all(
    ((location.images as Array<Record<string, unknown>>) || []).map(async (img) => {
    const imageMedia = await resolveMediaRef(img.imageMediaId, img.imageUrl)
    const previousImageMedia = await resolveMediaRef(img.previousImageMediaId, img.previousImageUrl)
    return {
      ...img,
      media: imageMedia,
      imageMedia,
      previousImageMedia,
      imageUrl: imageMedia?.url || img.imageUrl || null,
      previousImageUrl: previousImageMedia?.url || img.previousImageUrl || null,
    }
    }),
  )

  return {
    ...location,
    images,
  }
}

async function attachMediaFieldsToProjectProp<T extends Record<string, unknown>>(prop: T) {
  return await attachMediaFieldsToProjectLocation(prop)
}

async function attachMediaFieldsToShot<T extends Record<string, unknown>>(shot: T) {
  const imageMedia = await resolveMediaRef(shot.imageMediaId, shot.imageUrl)
  const videoMedia = await resolveMediaRefFromLegacyValue(shot.videoUrl)
  return {
    ...shot,
    media: imageMedia,
    imageMedia,
    videoMedia,
    imageUrl: imageMedia?.url || shot.imageUrl || null,
    videoUrl: videoMedia?.url || shot.videoUrl || null,
  }
}

async function attachMediaFieldsToVoiceLine<T extends Record<string, unknown>>(line: T) {
  const audioMedia = await resolveMediaRef(line.audioMediaId, line.audioUrl)
  return {
    ...line,
    media: audioMedia,
    audioMedia,
    audioUrl: audioMedia?.url || line.audioUrl || null,
  }
}

export async function attachMediaFieldsToProject<T extends Record<string, unknown>>(projectLike: T) {
  const audioMedia = await resolveMediaRef(projectLike.audioMediaId, projectLike.audioUrl)
  const characters = await Promise.all(
    ((projectLike.characters as Array<Record<string, unknown>>) || []).map(attachMediaFieldsToProjectCharacter),
  )
  const locations = await Promise.all(
    ((projectLike.locations as Array<Record<string, unknown>>) || []).map(attachMediaFieldsToProjectLocation),
  )
  const props = await Promise.all(
    ((projectLike.props as Array<Record<string, unknown>>) || []).map(attachMediaFieldsToProjectProp),
  )
  const shots = await Promise.all(
    ((projectLike.shots as Array<Record<string, unknown>>) || []).map(attachMediaFieldsToShot),
  )
  const storyboards = await Promise.all(
    ((projectLike.storyboards as Array<Record<string, unknown>>) || []).map(attachMediaFieldsToStoryboard),
  )
  const voiceLines = await Promise.all(
    ((projectLike.voiceLines as Array<Record<string, unknown>>) || []).map(attachMediaFieldsToVoiceLine),
  )

  return {
    ...projectLike,
    media: audioMedia,
    audioMedia,
    audioUrl: audioMedia?.url || projectLike.audioUrl || null,
    characters,
    locations,
    props,
    shots,
    storyboards,
    voiceLines,
  }
}

export function firstMediaUrl(list: MediaRef[]): string[] {
  return list.map((m) => m.url)
}
