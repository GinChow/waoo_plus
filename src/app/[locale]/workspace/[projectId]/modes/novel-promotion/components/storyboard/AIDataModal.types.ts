'use client'

export interface AIDataCharacter {
  name: string
  appearance: string
  slot?: string
}

export interface PhotographyCharacter {
  name: string
  screen_position: string
  posture: string
  facing: string
}

export interface PhotographyRules {
  panel_number?: number
  scene_summary: string
  lighting: {
    direction: string
    quality: string
  }
  characters: PhotographyCharacter[]
  depth_of_field: string
  color_tone: string
  camera_angle?: string
  viewpoint_constraint?: string
  focus_priority?: string
  composition_note?: string
  shot_purpose?: string
  scene_type?: string
  source_text?: string
  duration_base?: number
  duration?: number
}

export interface ActingCharacter {
  name: string
  acting: string
}

export interface ActingNotes {
  panel_number?: number
  characters: ActingCharacter[]
}

export interface AIDataSavePayload {
  shotType: string | null
  cameraMove: string | null
  description: string | null
  videoPrompt: string | null
  firstFrameImagePrompt: string | null
  photographyRules: PhotographyRules | null
  actingNotes: ActingCharacter[] | null
}

export interface AIDataModalProps {
  isOpen: boolean
  onClose: () => void
  syncKey?: string
  panelNumber: number
  shotType: string | null
  cameraMove: string | null
  description: string | null
  sceneType?: string | null
  sourceText?: string | null
  duration?: number | null
  location: string | null
  characters: AIDataCharacter[]
  videoPrompt: string | null
  firstFrameImagePrompt: string | null
  photographyRules: PhotographyRules | null
  actingNotes: ActingNotes | ActingCharacter[] | null
  videoRatio: string
  onSave: (data: AIDataSavePayload) => void
}
