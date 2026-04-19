'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ActingCharacter,
  ActingNotes,
  AIDataSavePayload,
  PhotographyCharacter,
  PhotographyRules,
} from '../AIDataModal.types'

interface UseAIDataModalStateParams {
  isOpen: boolean
  syncKey?: string
  initialShotType: string | null
  initialCameraMove: string | null
  initialDescription: string | null
  initialVideoPrompt: string | null
  initialFirstFrameImagePrompt: string | null
  initialPhotographyRules: PhotographyRules | null
  initialActingNotes: ActingNotes | ActingCharacter[] | null
}

export type DirtyField =
  | 'shotType'
  | 'cameraMove'
  | 'description'
  | 'videoPrompt'
  | 'firstFrameImagePrompt'
  | 'photographyRules'
  | 'actingNotes'

export interface AIDataModalDraftState {
  shotType: string
  cameraMove: string
  description: string
  videoPrompt: string
  firstFrameImagePrompt: string
  photographyRules: PhotographyRules | null
  actingNotes: ActingCharacter[]
}

function normalizeText(value: string | null): string {
  return value || ''
}

function clonePhotographyRules(rules: PhotographyRules | null): PhotographyRules | null {
  if (!rules) return null
  return {
    ...rules,
    scene_summary: rules.scene_summary || '',
    lighting: rules.lighting ? { ...rules.lighting } : { direction: '', quality: '' },
    depth_of_field: rules.depth_of_field || '',
    color_tone: rules.color_tone || '',
    camera_angle: rules.camera_angle || '',
    viewpoint_constraint: rules.viewpoint_constraint || '',
    focus_priority: rules.focus_priority || '',
    composition_note: rules.composition_note || '',
    characters: Array.isArray(rules.characters) ? rules.characters.map((character) => ({ ...character })) : [],
  }
}

function normalizeActingNotes(notes: ActingNotes | ActingCharacter[] | null): ActingCharacter[] {
  if (Array.isArray(notes)) return notes.map((character) => ({ ...character }))
  return (notes?.characters || []).map((character) => ({ ...character }))
}

export function createAIDataModalDraftState(params: {
  initialShotType: string | null
  initialCameraMove: string | null
  initialDescription: string | null
  initialVideoPrompt: string | null
  initialFirstFrameImagePrompt: string | null
  initialPhotographyRules: PhotographyRules | null
  initialActingNotes: ActingNotes | ActingCharacter[] | null
}): AIDataModalDraftState {
  return {
    shotType: normalizeText(params.initialShotType),
    cameraMove: normalizeText(params.initialCameraMove),
    description: normalizeText(params.initialDescription),
    videoPrompt: normalizeText(params.initialVideoPrompt),
    firstFrameImagePrompt: normalizeText(params.initialFirstFrameImagePrompt),
    photographyRules: clonePhotographyRules(params.initialPhotographyRules),
    actingNotes: normalizeActingNotes(params.initialActingNotes),
  }
}

export function mergeAIDataModalDraftStateByDirty(
  previous: AIDataModalDraftState,
  incoming: AIDataModalDraftState,
  dirtyFields: ReadonlySet<DirtyField>,
): AIDataModalDraftState {
  return {
    shotType: dirtyFields.has('shotType') ? previous.shotType : incoming.shotType,
    cameraMove: dirtyFields.has('cameraMove') ? previous.cameraMove : incoming.cameraMove,
    description: dirtyFields.has('description') ? previous.description : incoming.description,
    videoPrompt: dirtyFields.has('videoPrompt') ? previous.videoPrompt : incoming.videoPrompt,
    firstFrameImagePrompt: dirtyFields.has('firstFrameImagePrompt')
      ? previous.firstFrameImagePrompt
      : incoming.firstFrameImagePrompt,
    photographyRules: dirtyFields.has('photographyRules') ? previous.photographyRules : incoming.photographyRules,
    actingNotes: dirtyFields.has('actingNotes') ? previous.actingNotes : incoming.actingNotes,
  }
}

export function useAIDataModalState({
  isOpen,
  syncKey,
  initialShotType,
  initialCameraMove,
  initialDescription,
  initialVideoPrompt,
  initialFirstFrameImagePrompt,
  initialPhotographyRules,
  initialActingNotes,
}: UseAIDataModalStateParams) {
  const initialDraftState = createAIDataModalDraftState({
    initialShotType,
    initialCameraMove,
    initialDescription,
    initialVideoPrompt,
    initialFirstFrameImagePrompt,
    initialPhotographyRules,
    initialActingNotes,
  })
  const [shotType, setShotTypeState] = useState(initialDraftState.shotType)
  const [cameraMove, setCameraMoveState] = useState(initialDraftState.cameraMove)
  const [description, setDescriptionState] = useState(initialDraftState.description)
  const [videoPrompt, setVideoPromptState] = useState(initialDraftState.videoPrompt)
  const [firstFrameImagePrompt, setFirstFrameImagePromptState] = useState(initialDraftState.firstFrameImagePrompt)
  const [photographyRules, setPhotographyRulesState] = useState<PhotographyRules | null>(initialDraftState.photographyRules)
  const [actingNotes, setActingNotesState] = useState<ActingCharacter[]>(initialDraftState.actingNotes)
  const [dirtyFields, setDirtyFields] = useState<Set<DirtyField>>(new Set())
  const hydratedSyncKeyRef = useRef<string | null>(null)
  const latestDraftStateRef = useRef<AIDataModalDraftState>(initialDraftState)
  const effectiveSyncKey = syncKey ?? '__default_ai_data_sync_key__'

  useEffect(() => {
    latestDraftStateRef.current = {
      shotType,
      cameraMove,
      description,
      videoPrompt,
      firstFrameImagePrompt,
      photographyRules,
      actingNotes,
    }
  }, [actingNotes, cameraMove, description, firstFrameImagePrompt, photographyRules, shotType, videoPrompt])

  const hydrateFromInitial = useCallback(() => {
    const nextDraft = createAIDataModalDraftState({
      initialShotType,
      initialCameraMove,
      initialDescription,
      initialVideoPrompt,
      initialFirstFrameImagePrompt,
      initialPhotographyRules,
      initialActingNotes,
    })
    latestDraftStateRef.current = nextDraft
    setShotTypeState(nextDraft.shotType)
    setCameraMoveState(nextDraft.cameraMove)
    setDescriptionState(nextDraft.description)
    setVideoPromptState(nextDraft.videoPrompt)
    setFirstFrameImagePromptState(nextDraft.firstFrameImagePrompt)
    setPhotographyRulesState(nextDraft.photographyRules)
    setActingNotesState(nextDraft.actingNotes)
    setDirtyFields(new Set())
  }, [
    initialActingNotes,
    initialCameraMove,
    initialDescription,
    initialFirstFrameImagePrompt,
    initialPhotographyRules,
    initialShotType,
    initialVideoPrompt,
  ])

  useEffect(() => {
    if (!isOpen) {
      hydratedSyncKeyRef.current = null
      return
    }

    if (hydratedSyncKeyRef.current !== effectiveSyncKey) {
      hydrateFromInitial()
      hydratedSyncKeyRef.current = effectiveSyncKey
    }
  }, [effectiveSyncKey, hydrateFromInitial, isOpen])

  useEffect(() => {
    if (!isOpen || hydratedSyncKeyRef.current !== effectiveSyncKey) return

    const incomingDraft = createAIDataModalDraftState({
      initialShotType,
      initialCameraMove,
      initialDescription,
      initialVideoPrompt,
      initialFirstFrameImagePrompt,
      initialPhotographyRules,
      initialActingNotes,
    })
    const mergedDraft = mergeAIDataModalDraftStateByDirty(
      latestDraftStateRef.current,
      incomingDraft,
      dirtyFields,
    )
    latestDraftStateRef.current = mergedDraft

    setShotTypeState(mergedDraft.shotType)
    setCameraMoveState(mergedDraft.cameraMove)
    setDescriptionState(mergedDraft.description)
    setVideoPromptState(mergedDraft.videoPrompt)
    setFirstFrameImagePromptState(mergedDraft.firstFrameImagePrompt)
    setPhotographyRulesState(mergedDraft.photographyRules)
    setActingNotesState(mergedDraft.actingNotes)
  }, [
    dirtyFields,
    effectiveSyncKey,
    initialActingNotes,
    initialCameraMove,
    initialDescription,
    initialFirstFrameImagePrompt,
    initialPhotographyRules,
    initialShotType,
    initialVideoPrompt,
    isOpen,
  ])

  const markDirty = useCallback((field: DirtyField) => {
    setDirtyFields((previous) => {
      if (previous.has(field)) return previous
      const next = new Set(previous)
      next.add(field)
      return next
    })
  }, [])

  const setShotType = useCallback((value: string) => {
    markDirty('shotType')
    setShotTypeState(value)
  }, [markDirty])

  const setCameraMove = useCallback((value: string) => {
    markDirty('cameraMove')
    setCameraMoveState(value)
  }, [markDirty])

  const setDescription = useCallback((value: string) => {
    markDirty('description')
    setDescriptionState(value)
  }, [markDirty])

  const setVideoPrompt = useCallback((value: string) => {
    markDirty('videoPrompt')
    setVideoPromptState(value)
  }, [markDirty])

  const setFirstFrameImagePrompt = useCallback((value: string) => {
    markDirty('firstFrameImagePrompt')
    setFirstFrameImagePromptState(value)
  }, [markDirty])

  const updatePhotographyField = (path: string, value: string) => {
    if (!photographyRules) return
    const nextRules = clonePhotographyRules(photographyRules)
    if (!nextRules) return
    const parts = path.split('.')

    if (parts.length === 1) {
      const field = parts[0]
      if (
        field === 'scene_summary'
        || field === 'depth_of_field'
        || field === 'color_tone'
        || field === 'camera_angle'
        || field === 'viewpoint_constraint'
        || field === 'focus_priority'
        || field === 'composition_note'
      ) {
        nextRules[field] = value
      }
    } else if (parts.length === 2) {
      const [group, field] = parts
      if (group === 'lighting' && (field === 'direction' || field === 'quality')) {
        nextRules.lighting = { ...nextRules.lighting, [field]: value }
      }
    }

    markDirty('photographyRules')
    setPhotographyRulesState(nextRules)
  }

  const updatePhotographyCharacter = (index: number, field: keyof PhotographyCharacter, value: string) => {
    if (!photographyRules) return
    const nextRules = clonePhotographyRules(photographyRules)
    if (!nextRules) return
    nextRules.characters[index] = { ...nextRules.characters[index], [field]: value }
    markDirty('photographyRules')
    setPhotographyRulesState(nextRules)
  }

  const updateActingCharacter = (index: number, field: keyof ActingCharacter, value: string) => {
    const nextNotes = actingNotes.map((note, noteIndex) => (
      noteIndex === index ? { ...note, [field]: value } : note
    ))
    markDirty('actingNotes')
    setActingNotesState(nextNotes)
  }

  const savePayload = useMemo<AIDataSavePayload>(() => ({
    shotType: shotType || null,
    cameraMove: cameraMove || null,
    description: description || null,
    videoPrompt: videoPrompt || null,
    firstFrameImagePrompt: firstFrameImagePrompt || null,
    photographyRules,
    actingNotes: actingNotes.length > 0 ? actingNotes : null,
  }), [actingNotes, cameraMove, description, firstFrameImagePrompt, photographyRules, shotType, videoPrompt])

  return {
    shotType,
    setShotType,
    cameraMove,
    setCameraMove,
    description,
    setDescription,
    videoPrompt,
    setVideoPrompt,
    firstFrameImagePrompt,
    setFirstFrameImagePrompt,
    photographyRules,
    actingNotes,
    updatePhotographyField,
    updatePhotographyCharacter,
    updateActingCharacter,
    savePayload,
  }
}
