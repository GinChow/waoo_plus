import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import VideoPanelCardBody from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoPanelCardBody'
import VideoPanelCardHeader from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoPanelCardHeader'
import type { VideoPanelRuntime } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/hooks/useVideoPanelActions'

vi.mock('@/components/task/TaskStatusInline', () => ({
  default: () => React.createElement('span', null, 'task-status'),
}))

vi.mock('@/components/task/TaskStatusOverlay', () => ({
  default: () => React.createElement('span', null, 'task-overlay'),
}))

vi.mock('@/components/media/MediaImageWithLoading', () => ({
  MediaImageWithLoading: () => React.createElement('img', { alt: 'preview' }),
}))

vi.mock('@/components/ui/config-modals/ModelCapabilityDropdown', () => ({
  ModelCapabilityDropdown: () => React.createElement('div', null, 'model-dropdown'),
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name }: { name: string }) => React.createElement('span', null, name),
}))

vi.mock('@/lib/query/hooks', () => ({
  useAiFirstLastFramePrompt: () => ({
    mutateAsync: vi.fn(async () => ({ firstLastFramePrompt: '' })),
  }),
  useDeleteProjectPanelHistoryVideo: () => ({
    mutateAsync: vi.fn(async () => undefined),
  }),
  useDeleteProjectStoryboardGroupHistoryVideo: () => ({
    mutateAsync: vi.fn(async () => undefined),
  }),
  useSelectProjectStoryboardGroupVideo: () => ({
    mutateAsync: vi.fn(async () => ({ videoUrl: '' })),
  }),
  useUploadProjectPanelVideo: () => ({
    mutateAsync: vi.fn(async () => ({ videoUrl: 'https://example.com/uploaded.mp4' })),
    isPending: false,
  }),
}))

function createRuntime(overrides: Partial<VideoPanelRuntime> = {}): VideoPanelRuntime {
  const translate = (key: string, values?: Record<string, unknown>) => {
    if (key === 'firstLastFrame.asLastFrameFor') {
      return `作为镜头 ${String(values?.number ?? '')} 的尾帧`
    }
    if (key === 'firstLastFrame.asFirstFrameFor') {
      return `作为镜头 ${String(values?.number ?? '')} 的首帧`
    }
    if (key === 'firstLastFrame.generate') return '生成首尾帧视频'
    if (key === 'firstLastFrame.generated') return '首尾帧视频已生成'
    if (key === 'promptModal.promptLabel') return '视频提示词'
    if (key === 'promptModal.placeholder') return '输入首尾帧视频提示词...'
    if (key === 'panelCard.clickToEditPrompt') return '点击编辑提示词...'
    if (key === 'panelCard.selectModel') return '选择模型'
    if (key === 'panelCard.generateVideo') return '生成视频'
    if (key === 'panelCard.download') return '下载'
    if (key === 'panelCard.deleteCurrentVideo') return '删除当前视频'
    if (key === 'panelCard.uploadLocalVideo') return '上传本地视频'
    if (key === 'panelCard.uploadingVideo') return '上传中'
    if (key === 'panelCard.uploadVideoFailed') return '上传视频失败'
    if (key === 'panelCard.unknownShotType') return '未知镜头'
    if (key === 'stage.hasSynced') return '已生成'
    if (key === 'promptModal.duration') return '秒'
    return key
  }

  const runtime = {
    t: translate,
    tCommon: (key: string) => key,
    panel: {
      storyboardId: 'sb-1',
      panelIndex: 2,
      panelId: 'panel-2',
      imageUrl: 'https://example.com/frame-2.jpg',
      videoUrl: null,
      videoGenerationMode: null,
      lipSyncVideoUrl: null,
      textPanel: {
        shot_type: '平视中景',
        description: '谢俞站在宴席中央',
        duration: 3,
      },
    },
    panelIndex: 2,
    panelKey: 'sb-1-2',
    media: {
      showLipSyncVideo: true,
      onToggleLipSyncVideo: () => undefined,
      onPreviewImage: () => undefined,
      baseVideoUrl: undefined,
      currentVideoUrl: undefined,
    },
    taskStatus: {
      isVideoTaskRunning: false,
      isLipSyncTaskRunning: false,
      taskRunningVideoLabel: '生成中',
      lipSyncInlineState: null,
    },
    videoModel: {
      selectedModel: 'veo-3.1',
      setSelectedModel: () => undefined,
      capabilityFields: [],
      generationOptions: {},
      setCapabilityValue: () => undefined,
      missingCapabilityFields: [],
      videoModelOptions: [],
    },
    player: {
      isPlaying: false,
    },
    promptEditor: {
      isEditing: false,
      editingPrompt: '',
      setEditingPrompt: () => undefined,
      handleStartEdit: () => undefined,
      handleSave: () => undefined,
      handleCancelEdit: () => undefined,
      isSavingPrompt: false,
      localPrompt: '人物从席间回身，接到下一镜头',
    },
    voiceManager: {
      hasMatchedAudio: false,
      hasMatchedVoiceLines: false,
      audioGenerateError: null,
      localVoiceLines: [],
      isVoiceLineTaskRunning: () => false,
      handlePlayVoiceLine: () => undefined,
      handleGenerateAudio: async () => undefined,
      playingVoiceLineId: null,
    },
    lipSync: {
      handleStartLipSync: () => undefined,
      executingLipSync: false,
    },
    layout: {
      isLinked: true,
      isLastFrame: true,
      nextPanel: {
        storyboardId: 'sb-1',
        panelIndex: 3,
        imageUrl: 'https://example.com/frame-3.jpg',
      },
      prevPanel: {
        storyboardId: 'sb-1',
        panelIndex: 1,
        imageUrl: 'https://example.com/frame-1.jpg',
      },
      hasNext: true,
      flModel: 'veo-3.1',
      flModelOptions: [],
      flGenerationOptions: {},
      flCapabilityFields: [],
      flMissingCapabilityFields: [],
      flCustomPrompt: '',
      defaultFlPrompt: '',
      videoRatio: '9:16',
      frameCaptureTargets: [],
    },
    actions: {
      onGenerateVideo: () => undefined,
      onUpdatePanelVideoModel: () => undefined,
      onToggleLink: () => undefined,
      onFlModelChange: () => undefined,
      onFlCapabilityChange: () => undefined,
      onFlCustomPromptChange: () => undefined,
      onResetFlPrompt: () => undefined,
      onGenerateFirstLastFrame: () => undefined,
    },
    computed: {
      showLipSyncSection: false,
      canLipSync: false,
      hasVisibleBaseVideo: false,
    },
  }

  return {
    ...runtime,
    ...overrides,
  } as unknown as VideoPanelRuntime
}

describe('VideoPanelCardBody', () => {
  it('renders incoming and outgoing first-last-frame UI for chained panel', () => {
    const markup = renderToStaticMarkup(
      React.createElement(VideoPanelCardBody, {
        runtime: createRuntime(),
      }),
    )

    expect(markup).toContain('作为镜头 2 的尾帧')
    expect(markup).toContain('作为镜头 4 的首帧')
    expect(markup).toContain('视频提示词')
    expect(markup).toContain('生成首尾帧视频')
  })

  it('renders a current video delete action even without video history', () => {
    const markup = renderToStaticMarkup(
      React.createElement(VideoPanelCardBody, {
        runtime: createRuntime({
          panel: {
            ...createRuntime().panel,
            videoUrl: 'https://example.com/current.mp4',
            videoHistory: [],
          },
          layout: {
            ...createRuntime().layout,
            isLinked: false,
            isLastFrame: false,
            nextPanel: null,
            prevPanel: null,
          },
        }),
      }),
    )

    expect(markup).toContain('title="删除当前视频"')
    expect(markup).not.toContain('历史视频')
  })

  it('renders local video upload action for single panel cards', () => {
    const markup = renderToStaticMarkup(
      React.createElement(VideoPanelCardBody, {
        runtime: createRuntime({
          layout: {
            ...createRuntime().layout,
            isLinked: false,
            isLastFrame: false,
            nextPanel: null,
            prevPanel: null,
          },
        }),
      }),
    )

    expect(markup).toContain('title="上传本地视频"')
    expect(markup).toContain('accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v"')
  })
})

describe('VideoPanelCardHeader', () => {
  it('renders a download action for the currently visible video', () => {
    const markup = renderToStaticMarkup(
      React.createElement(VideoPanelCardHeader, {
        runtime: createRuntime({
          panel: {
            ...createRuntime().panel,
            videoUrl: 'https://example.com/current.mp4',
          },
          media: {
            ...createRuntime().media,
            baseVideoUrl: 'https://example.com/current.mp4',
            currentVideoUrl: 'https://example.com/current.mp4',
          },
          player: {
            ...createRuntime().player,
            cssAspectRatio: '16/9',
          },
          download: {
            isDownloading: false,
            handleDownload: vi.fn(async () => undefined),
          },
          layout: {
            ...createRuntime().layout,
            isLinked: false,
            isLastFrame: false,
          },
        }),
      }),
    )

    expect(markup).toContain('title="下载"')
    expect(markup).toContain('download')
  })

  it('renders the frame capture action when panel image targets are available', () => {
    const markup = renderToStaticMarkup(
      React.createElement(VideoPanelCardHeader, {
        runtime: createRuntime({
          media: {
            ...createRuntime().media,
            baseVideoUrl: 'https://example.com/current.mp4',
            currentVideoUrl: 'https://example.com/current.mp4',
          },
          player: {
            ...createRuntime().player,
            cssAspectRatio: '16/9',
          },
          download: {
            isDownloading: false,
            handleDownload: vi.fn(async () => undefined),
          },
          layout: {
            ...createRuntime().layout,
            frameCaptureTargets: [{
              panelId: 'panel-2',
              panelNumber: 2,
              position: 'current',
              hasImage: true,
            }],
          },
          actions: {
            ...createRuntime().actions,
            onCaptureFrameAsImage: vi.fn(async () => undefined),
          },
        }),
      }),
    )

    expect(markup).toContain('title="frameCapture.buttonTitle"')
    expect(markup).toContain('film')
  })
})
