import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  novelPromotionPanel: {
    findUnique: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  novelPromotionStoryboard: {
    findUnique: vi.fn(),
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
}))

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  getProjectModels: vi.fn(async () => ({ storyboardModel: 'storyboard-model-1', artStyle: 'realistic' })),
  resolveImageSourceFromGeneration: vi.fn(),
  uploadImageSourceToCos: vi.fn(),
}))

const sharedMock = vi.hoisted(() => ({
  collectPanelReferenceImages: vi.fn(async () => ['https://signed.example/ref-1.png']),
  resolveNovelData: vi.fn(async () => ({
    videoRatio: '16:9',
    characters: [],
    locations: [
      {
        name: 'Old Town',
        images: [
          {
            isSelected: true,
            description: '雨夜街道',
            availableSlots: JSON.stringify([
              '街道左侧靠墙的留白位置',
            ]),
          },
        ],
      },
    ],
  })),
}))

const outboundMock = vi.hoisted(() => ({
  normalizeReferenceImagesForGeneration: vi.fn(async () => ['normalized-ref-1']),
}))

const promptMock = vi.hoisted(() => ({
  buildPrompt: vi.fn((_args: {
    promptId: string
    variables: Record<string, unknown>
  }) => 'panel-image-prompt'),
}))

function buildGroupPanels(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `panel-${index + 1}`,
    storyboardId: 'storyboard-1',
    panelIndex: index,
    panelNumber: index + 1,
    shotType: index === 0 ? 'close-up' : 'wide',
    cameraMove: index === 0 ? 'static' : 'push',
    description: `group panel ${index + 1}`,
    imagePrompt: index === 0 ? 'panel anchor prompt' : null,
    videoPrompt: `video ${index + 1}`,
    firstLastFramePrompt: index === 1 ? 'wide rain frame' : null,
    location: 'Old Town',
    characters: index === 0
      ? JSON.stringify([{ name: 'Hero', appearance: 'default', slot: '街道左侧靠墙的留白位置' }])
      : '[]',
    srtSegment: index === 0 ? '台词片段' : null,
    photographyRules: null,
    actingNotes: null,
    sketchImageUrl: null,
    imageUrl: null,
    duration: index === 0 ? 0.5 : 1,
  }))
}

function buildGroupMapping(count: number) {
  return JSON.stringify(Array.from({ length: count }, (_, index) => [index + 1, 1]))
}

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/media/outbound-image', () => outboundMock)
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: vi.fn(async () => undefined) }))
vi.mock('@/lib/logging/core', () => ({
  logInfo: vi.fn(),
  createScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
    child: vi.fn(),
  })),
}))
vi.mock('@/lib/workers/handlers/image-task-handler-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/image-task-handler-shared')>(
    '@/lib/workers/handlers/image-task-handler-shared',
  )
  return {
    ...actual,
    collectPanelReferenceImages: sharedMock.collectPanelReferenceImages,
    resolveNovelData: sharedMock.resolveNovelData,
  }
})
vi.mock('@/lib/prompt-i18n', () => ({
  PROMPT_IDS: {
    NP_SINGLE_PANEL_IMAGE: 'np_single_panel_image',
    NP_SINGLE_PANEL_IMAGE_V2: 'np_single_panel_image_v2',
    NP_SINGLE_PANEL_IMAGE_V3: 'np_single_panel_image_v3',
  },
  buildPrompt: promptMock.buildPrompt,
}))

import {
  handlePanelImageTask,
  handleStoryboardGroupImageTask,
  resolveStoryboardGroupImageSize,
} from '@/lib/workers/handlers/panel-image-task-handler'

function buildJob(payload: Record<string, unknown>, targetId = 'panel-1'): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-panel-image-1',
      type: TASK_TYPE.IMAGE_PANEL,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'NovelPromotionPanel',
      targetId,
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker panel-image-task-handler behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.novelPromotionPanel.findUnique.mockResolvedValue({
      id: 'panel-1',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      shotType: 'close-up',
      cameraMove: 'static',
      description: 'hero close-up',
      imagePrompt: 'panel anchor prompt',
      firstLastFramePrompt: 'fused first frame prompt',
      videoPrompt: 'dramatic',
      location: 'Old Town',
      characters: JSON.stringify([{ name: 'Hero', appearance: 'default', slot: '街道左侧靠墙的留白位置' }]),
      srtSegment: '台词片段',
      photographyRules: null,
      actingNotes: null,
      sketchImageUrl: null,
      imageUrl: null,
    })

    utilsMock.resolveImageSourceFromGeneration
      .mockResolvedValueOnce('generated-source-1')
      .mockResolvedValueOnce('generated-source-2')

    utilsMock.uploadImageSourceToCos
      .mockResolvedValueOnce('cos/panel-candidate-1.png')
      .mockResolvedValueOnce('cos/panel-candidate-2.png')

    prismaMock.novelPromotionStoryboard.findUnique.mockResolvedValue({
      id: 'storyboard-1',
      storyboardTextJson: JSON.stringify([[1, 1], [2, 1], [3, 2]]),
      coarseGroupsJson: null,
      panels: [
        {
          id: 'panel-1',
          storyboardId: 'storyboard-1',
          panelIndex: 0,
          panelNumber: 1,
          shotType: 'close-up',
          cameraMove: 'static',
          description: 'hero close-up',
          imagePrompt: 'panel anchor prompt',
          videoPrompt: 'dramatic',
          firstLastFramePrompt: null,
          location: 'Old Town',
          characters: JSON.stringify([{ name: 'Hero', appearance: 'default', slot: '街道左侧靠墙的留白位置' }]),
          srtSegment: '台词片段',
          photographyRules: null,
          actingNotes: null,
          sketchImageUrl: null,
          imageUrl: null,
          duration: 0.5,
        },
        {
          id: 'panel-2',
          storyboardId: 'storyboard-1',
          panelIndex: 1,
          panelNumber: 2,
          shotType: 'wide',
          cameraMove: 'push',
          description: 'hero walks through rain',
          imagePrompt: null,
          videoPrompt: 'rain walk',
          firstLastFramePrompt: 'wide rain frame',
          location: 'Old Town',
          characters: '[]',
          srtSegment: null,
          photographyRules: null,
          actingNotes: null,
          sketchImageUrl: null,
          imageUrl: null,
          duration: 1,
        },
        {
          id: 'panel-3',
          storyboardId: 'storyboard-1',
          panelIndex: 2,
          panelNumber: 3,
          shotType: 'detail',
          cameraMove: 'static',
          description: 'another group',
          imagePrompt: null,
          videoPrompt: 'another',
          firstLastFramePrompt: null,
          location: 'Old Town',
          characters: '[]',
          srtSegment: null,
          photographyRules: null,
          actingNotes: null,
          sketchImageUrl: null,
          imageUrl: null,
          duration: 0.5,
        },
      ],
    })
  })

  it('missing panelId -> explicit error', async () => {
    const job = buildJob({}, '')
    await expect(handlePanelImageTask(job)).rejects.toThrow('panelId missing')
  })

  it('first generation -> persists main image and candidate list', async () => {
    const job = buildJob({ candidateCount: 2 })
    const result = await handlePanelImageTask(job)

    expect(result).toEqual({
      panelId: 'panel-1',
      candidateCount: 2,
      imageUrl: 'cos/panel-candidate-1.png',
    })

    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        modelId: 'storyboard-model-1',
        prompt: 'fused first frame prompt',
        allowTaskExternalIdResume: false,
        options: expect.objectContaining({
          referenceImages: ['normalized-ref-1'],
          aspectRatio: '16:9',
          quality: 'high',
          size: '3840x2160',
        }),
      }),
    )
    const generationCall = utilsMock.resolveImageSourceFromGeneration.mock.calls[0]
    expect(generationCall[1].options).not.toHaveProperty('first_frame_image_prompt')
    expect(promptMock.buildPrompt).not.toHaveBeenCalled()

    const updateCall = prismaMock.novelPromotionPanel.update.mock.calls.find(
      (call: unknown[]) => (call[0] as { where?: { id?: string } })?.where?.id === 'panel-1',
    ) as unknown[] | undefined
    expect(updateCall).toBeTruthy()
    const updateData = (updateCall![0] as { data: Record<string, unknown> }).data
    expect(updateData.imageUrl).toBe('cos/panel-candidate-1.png')
    expect(updateData.candidateImages).toBe(
      JSON.stringify(['cos/panel-candidate-1.png', 'cos/panel-candidate-2.png']),
    )
    const historyJson = updateData.imageHistory as string | null
    expect(historyJson).toBeTruthy()
    const historyEntries = JSON.parse(historyJson as string)
    expect(historyEntries).toHaveLength(2)
    expect(historyEntries.map((entry: { url: string }) => entry.url)).toEqual([
      'cos/panel-candidate-1.png',
      'cos/panel-candidate-2.png',
    ])
    expect(historyEntries.every((entry: { source?: string }) => entry.source === 'generate')).toBe(true)
  })

  it('passes normalized reference images through to resolveImageSourceFromGeneration', async () => {
    outboundMock.normalizeReferenceImagesForGeneration.mockResolvedValueOnce(['norm-ref-1', 'norm-ref-2'])
    const job = buildJob({ candidateCount: 1 })
    await handlePanelImageTask(job)

    const call = utilsMock.resolveImageSourceFromGeneration.mock.calls[0]
    expect(call).toBeTruthy()
    const params = call[1]
    expect(params.options.referenceImages).toEqual(['norm-ref-1', 'norm-ref-2'])
    expect(params.options.quality).toBe('high')
    expect(params.options.size).toBe('3840x2160')
  })

  it('passes explicit image quality and size through when payload overrides defaults', async () => {
    const job = buildJob({ candidateCount: 1, generationOptions: { quality: 'medium', size: '2048x1152' } })
    await handlePanelImageTask(job)

    const call = utilsMock.resolveImageSourceFromGeneration.mock.calls[0]
    expect(call[1].options.quality).toBe('medium')
    expect(call[1].options.size).toBe('2048x1152')
  })

  it('falls back to default image size when payload size violates size rules', async () => {
    const job = buildJob({ candidateCount: 1, generationOptions: { size: '4096x2160' } })
    await handlePanelImageTask(job)

    const call = utilsMock.resolveImageSourceFromGeneration.mock.calls[0]
    expect(call[1].options.size).toBe('3840x2160')
  })

  it('regeneration branch -> keeps old image in previousImageUrl and stores candidates only', async () => {
    utilsMock.resolveImageSourceFromGeneration.mockReset()
    utilsMock.uploadImageSourceToCos.mockReset()

    prismaMock.novelPromotionPanel.findUnique.mockResolvedValueOnce({
      id: 'panel-1',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      shotType: 'close-up',
      cameraMove: 'static',
      description: 'hero close-up',
      imagePrompt: null,
      firstLastFramePrompt: null,
      videoPrompt: 'dramatic',
      location: 'Old Town',
      characters: '[]',
      srtSegment: null,
      photographyRules: null,
      actingNotes: null,
      sketchImageUrl: null,
      imageUrl: 'cos/panel-old.png',
    })

    utilsMock.resolveImageSourceFromGeneration.mockResolvedValueOnce('generated-source-regen')
    utilsMock.uploadImageSourceToCos.mockResolvedValueOnce('cos/panel-regenerated.png')

    const job = buildJob({ candidateCount: 1 })
    const result = await handlePanelImageTask(job)

    expect(result).toEqual({
      panelId: 'panel-1',
      candidateCount: 1,
      imageUrl: null,
    })

    const regenUpdateCall = prismaMock.novelPromotionPanel.update.mock.calls.find(
      (call: unknown[]) => (call[0] as { where?: { id?: string } })?.where?.id === 'panel-1',
    ) as unknown[] | undefined
    expect(regenUpdateCall).toBeTruthy()
    const regenData = (regenUpdateCall![0] as { data: Record<string, unknown> }).data
    expect(regenData.previousImageUrl).toBe('cos/panel-old.png')
    expect(regenData.candidateImages).toBe(JSON.stringify(['cos/panel-regenerated.png']))
    const regenHistory = JSON.parse(regenData.imageHistory as string)
    expect(regenHistory).toHaveLength(1)
    expect(regenHistory[0].url).toBe('cos/panel-regenerated.png')
    expect(regenHistory[0].source).toBe('generate')
  })

  it('storyboard group generation -> builds grid prompt and stores prompt bundle on storyboard', async () => {
    utilsMock.resolveImageSourceFromGeneration.mockReset()
    utilsMock.uploadImageSourceToCos.mockReset()
    utilsMock.resolveImageSourceFromGeneration.mockResolvedValueOnce('generated-group-source')
    utilsMock.uploadImageSourceToCos.mockResolvedValueOnce('cos/storyboard-group-1.png')

    const job = buildJob({ storyboardId: 'storyboard-1', groupNumber: 1, candidateCount: 1 }, 'storyboard-1')
    const result = await handleStoryboardGroupImageTask(job)

    expect(result).toEqual({
      storyboardId: 'storyboard-1',
      groupNumber: 1,
      candidateCount: 1,
      imageUrl: 'cos/storyboard-group-1.png',
    })
    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      promptId: 'np_single_panel_image_v2',
      variables: expect.objectContaining({
        panel_layout: '1x2',
        multi_panel_image_prompt: expect.stringContaining('多宫格分镜图片'),
      }),
    }))
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          quality: 'high',
          size: '3600x1200',
        }),
      }),
    )
    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({
        multi_panel_image_prompt: expect.not.stringContaining('"group_number"'),
      }),
    }))
    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({
        multi_panel_image_prompt: expect.not.stringContaining('结构化粗镜头数据'),
      }),
    }))
    const updateManyCalls = prismaMock.novelPromotionStoryboard.updateMany.mock.calls as unknown as Array<[{
      where: { id: string; coarseGroupsJson: string | null }
      data: { coarseGroupsJson: string }
    }]>
    const updateCall = updateManyCalls[0][0]
    expect(updateCall.where).toEqual({ id: 'storyboard-1', coarseGroupsJson: null })
    const stored = JSON.parse(updateCall.data.coarseGroupsJson)
    expect(stored[0].groupNumber).toBe(1)
    expect(stored[0].imagePrompt).toContain('panel anchor prompt')
    expect(stored[0].imagePrompt).toContain('wide rain frame')
    expect(stored[0].videoPrompt).toContain('[0.00秒]dramatic')
    expect(stored[0].videoPrompt).toContain('[0.50秒]rain walk')
    expect(stored[0].imageUrl).toBe('cos/storyboard-group-1.png')
    expect(stored[0].imageHistory).toEqual([
      expect.objectContaining({
        imageUrl: 'cos/storyboard-group-1.png',
        imagePrompt: expect.stringContaining('panel anchor prompt'),
      }),
    ])
  })

  it('storyboard group generation -> merges with latest coarseGroupsJson to avoid concurrent stale overwrite', async () => {
    utilsMock.resolveImageSourceFromGeneration.mockReset()
    utilsMock.uploadImageSourceToCos.mockReset()
    utilsMock.resolveImageSourceFromGeneration.mockResolvedValueOnce('generated-group-source')
    utilsMock.uploadImageSourceToCos.mockResolvedValueOnce('cos/storyboard-group-1-new.png')

    const staleStartSnapshot = {
      id: 'storyboard-1',
      storyboardTextJson: JSON.stringify([[1, 1], [2, 1], [3, 2]]),
      coarseGroupsJson: JSON.stringify([
        {
          groupNumber: 1,
          imagePrompt: 'old group 1 prompt',
          videoPrompt: 'old group 1 video',
          imageUrl: 'cos/storyboard-group-1-old.png',
          candidateImages: null,
          updatedAt: '2026-04-29T00:00:00.000Z',
        },
        {
          groupNumber: 2,
          imagePrompt: 'old group 2 prompt',
          videoPrompt: 'old group 2 video',
          imageUrl: 'cos/storyboard-group-2-old.png',
          candidateImages: null,
          updatedAt: '2026-04-29T00:00:00.000Z',
        },
      ]),
      panels: [
        ...buildGroupPanels(2),
        {
          ...buildGroupPanels(1)[0],
          id: 'panel-3',
          panelIndex: 2,
          panelNumber: 3,
          description: 'other group panel',
        },
      ],
    }
    const latestSnapshotAfterAnotherTask = JSON.stringify([
      {
        groupNumber: 1,
        imagePrompt: 'old group 1 prompt',
        videoPrompt: 'old group 1 video',
        imageUrl: 'cos/storyboard-group-1-old.png',
        candidateImages: null,
        updatedAt: '2026-04-29T00:00:00.000Z',
      },
      {
        groupNumber: 2,
        imagePrompt: 'new group 2 prompt',
        videoPrompt: 'new group 2 video',
        imageUrl: 'cos/storyboard-group-2-new.png',
        candidateImages: null,
        updatedAt: '2026-04-29T00:01:00.000Z',
      },
    ])

    prismaMock.novelPromotionStoryboard.findUnique
      .mockResolvedValueOnce(staleStartSnapshot)
      .mockResolvedValueOnce({ coarseGroupsJson: latestSnapshotAfterAnotherTask })

    const job = buildJob({ storyboardId: 'storyboard-1', groupNumber: 1, candidateCount: 1 }, 'storyboard-1')
    await handleStoryboardGroupImageTask(job)

    const updateManyCalls = prismaMock.novelPromotionStoryboard.updateMany.mock.calls as unknown as Array<[{
      where: { id: string; coarseGroupsJson: string | null }
      data: { coarseGroupsJson: string }
    }]>
    const persisted = JSON.parse(updateManyCalls[0][0].data.coarseGroupsJson)
    expect(updateManyCalls[0][0].where).toEqual({
      id: 'storyboard-1',
      coarseGroupsJson: latestSnapshotAfterAnotherTask,
    })
    expect(persisted.find((group: { groupNumber: number }) => group.groupNumber === 1)?.imageUrl)
      .toBe('cos/storyboard-group-1-new.png')
    expect(persisted.find((group: { groupNumber: number }) => group.groupNumber === 1)?.imageHistory.map(
      (entry: { imageUrl: string }) => entry.imageUrl,
    )).toContain('cos/storyboard-group-1-new.png')
    expect(persisted.find((group: { groupNumber: number }) => group.groupNumber === 2)?.imageUrl)
      .toBe('cos/storyboard-group-2-new.png')
  })

  it.each([
    [5, '2x3', '3104x1168'],
    [7, '3x3', '3104x1760'],
    [8, '3x3', '3104x1760'],
  ])('storyboard group generation -> maps %s panels to %s layout and derived size', async (panelCount, expectedLayout, expectedSize) => {
    utilsMock.resolveImageSourceFromGeneration.mockReset()
    utilsMock.uploadImageSourceToCos.mockReset()
    utilsMock.resolveImageSourceFromGeneration.mockResolvedValueOnce('generated-group-source')
    utilsMock.uploadImageSourceToCos.mockResolvedValueOnce('cos/storyboard-group-1.png')
    prismaMock.novelPromotionStoryboard.findUnique.mockResolvedValueOnce({
      id: 'storyboard-1',
      storyboardTextJson: buildGroupMapping(panelCount),
      coarseGroupsJson: null,
      panels: buildGroupPanels(panelCount),
    })

    const job = buildJob({ storyboardId: 'storyboard-1', groupNumber: 1, candidateCount: 1 }, 'storyboard-1')
    await handleStoryboardGroupImageTask(job)

    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      promptId: 'np_single_panel_image_v2',
      variables: expect.objectContaining({
        panel_layout: expectedLayout,
      }),
    }))
    const call = utilsMock.resolveImageSourceFromGeneration.mock.calls[0]
    expect(call[1].options.size).toBe(expectedSize)
  })

  it('storyboard group size calculation -> preserves child aspect ratio and border gaps', () => {
    expect(resolveStoryboardGroupImageSize({
      aspectRatio: '16:9',
      panelLayout: '1x1',
    })).toBe('3840x2160')
    expect(resolveStoryboardGroupImageSize({
      aspectRatio: '16:9',
      panelLayout: '1x2',
    })).toBe('3600x1200')
    expect(resolveStoryboardGroupImageSize({
      aspectRatio: '16:9',
      panelLayout: '2x3',
    })).toBe('3104x1168')
    expect(resolveStoryboardGroupImageSize({
      aspectRatio: '16:9',
      panelLayout: '3x3',
    })).toBe('3104x1760')
  })

  it('storyboard group size calculation -> respects pixel cap for vertical child panels', () => {
    expect(resolveStoryboardGroupImageSize({
      aspectRatio: '9:16',
      panelLayout: '1x2',
    })).toBe('2896x2560')
  })
})
