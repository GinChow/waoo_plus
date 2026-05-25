// 视频阶段共享类型定义
import type { ModelCapabilities } from '@/lib/model-config-contract'
import type { VideoPricingTier } from '@/lib/model-pricing/video-tier'

// 用户视频模型选项
export interface VideoModelOption {
  value: string
  label: string
  provider?: string
  providerName?: string
  disabled?: boolean
  capabilities?: ModelCapabilities
  videoPricingTiers?: VideoPricingTier[]
}

export type VideoGenerationMode = 'normal' | 'firstlastframe'

export interface TextPanel {
  panel_number: number
  parent_group_number?: number
  shot_type: string
  camera_move?: string
  description: string
  characters?: Array<string | { name?: string; appearance?: string }>
  location?: string
  text_segment?: string
  duration?: number
  video_prompt?: string
  imagePrompt?: string
  videoModel?: string
}

export interface Panel {
  id?: string
  panelIndex: number
  panelNumber?: number | null
  shotType?: string | null
  cameraMove?: string | null
  description?: string | null
  characters?: string | null
  location?: string | null
  textSegment?: string | null
  srtSegment?: string | null  // SRT 原文片段
  duration?: number | null
  imagePrompt?: string | null
  imageUrl?: string | null  // 图片URL
  videoPrompt?: string | null
  firstLastFramePrompt?: string | null
  videoUrl?: string | null
  videoHistory?: string | null  // panel 级视频历史（JSON 字符串）
  videoGenerationMode?: VideoGenerationMode | null
  videoModel?: string | null
  linkedToNextPanel?: boolean | null
  videoTaskRunning?: boolean | null
  videoErrorMessage?: string | null  // 视频生成错误消息
  videoErrorCode?: string | null
  imageTaskRunning?: boolean | null
  // 口型同步相关
  lipSyncVideoUrl?: string | null
  lipSyncTaskRunning?: boolean | null
  lipSyncErrorMessage?: string | null  // 口型同步错误消息
  lipSyncErrorCode?: string | null
}

export interface Storyboard {
  id: string
  clipId?: string | null
  storyboardTextJson?: string | null
  coarseGroupsJson?: string | null
  panels?: Panel[]
  clip?: {
    start: number
    end: number
    summary: string
  }
}

export interface Clip {
  id: string
  start: number
  end: number
  summary: string
}

export interface VideoPanel {
  panelId?: string  // 任务目标ID
  storyboardId: string
  panelIndex: number
  parentGroupNumber?: number
  videoTargetGroupNumber?: number
  coarseGroupImageUrl?: string | null
  coarseGroupVideoPrompt?: string | null
  coarseGroupDuration?: number | null
  coarseGroupVideoHistory?: Array<{
    videoUrl: string
    generatedAt: string
    videoPrompt: string
    videoModel: string
    generationMode: string
  }>
  videoHistory?: Array<{
    videoUrl: string
    generatedAt: string
    videoPrompt?: string
    videoModel?: string
    generationMode?: string
    source?: string
    taskId?: string
  }>
  textPanel?: TextPanel
  firstLastFramePrompt?: string
  imageUrl?: string
  videoUrl?: string
  videoGenerationMode?: VideoGenerationMode
  videoTaskRunning?: boolean
  videoErrorMessage?: string  // 视频生成错误消息
  videoErrorCode?: string
  videoModel?: string
  linkedToNextPanel?: boolean
  // 口型同步相关
  lipSyncVideoUrl?: string
  lipSyncTaskRunning?: boolean
  lipSyncTaskId?: string
  lipSyncErrorMessage?: string  // 口型同步错误消息
  lipSyncErrorCode?: string
}

// 匹配的配音信息
export interface MatchedVoiceLine {
  id: string
  lineIndex: number
  speaker: string
  content: string
  audioUrl?: string
  audioDuration?: number
  emotionStrength?: number
}

export interface FirstLastFrameParams {
  lastFrameStoryboardId: string
  lastFramePanelIndex: number
  flModel: string
  customPrompt?: string
}

// 组合分镜（kling-omni-video multi_prompt）单个分镜项
export interface MultiPromptShot {
  index: number
  prompt: string
  duration: string
}

export type VideoGenerationOptionValue = string | number | boolean
export type VideoGenerationOptions = Record<string, VideoGenerationOptionValue>

// 组合分镜 omni 合成专用选项。注意：这些字段不是 kling-v3-omni 的能力字段，
// 必须收进 generationOptions.groupVideo 这个嵌套对象里，避免被 API 的能力校验
// （toVideoRuntimeSelections）当作能力选择项处理。
export interface GroupVideoGenerationOptions {
  multiShot: true
  shotType: 'customize'
  multiPrompt: MultiPromptShot[]
  sound: 'on' | 'off'
  groupPanelIndices: number[]
}

export interface BatchVideoGenerationParams {
  videoModel: string
  generationOptions?: VideoGenerationOptions
}
