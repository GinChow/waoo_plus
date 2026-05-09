import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  task: {
    findUnique: vi.fn(),
  },
}))

const taskServiceMock = vi.hoisted(() => ({
  isTaskActive: vi.fn(async () => true),
  trySetTaskExternalId: vi.fn(async () => true),
}))

const asyncPollMock = vi.hoisted(() => ({
  pollAsyncTask: vi.fn(),
}))

const generatorApiMock = vi.hoisted(() => ({
  generateImage: vi.fn(),
  generateVideo: vi.fn(),
}))

const fsPromisesMock = vi.hoisted(() => ({
  appendFile: vi.fn(async (_file: string, _data: string, _encoding: string) => undefined),
}))

const configServiceMock = vi.hoisted(() => ({
  getProjectModelConfig: vi.fn(),
  getUserModelConfig: vi.fn(),
  resolveProjectModelCapabilityGenerationOptions: vi.fn(async () => ({})),
}))

vi.mock('node:fs/promises', () => fsPromisesMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/task/service', () => taskServiceMock)
vi.mock('@/lib/async-poll', () => asyncPollMock)
vi.mock('@/lib/generator-api', () => generatorApiMock)
vi.mock('@/lib/lipsync', () => ({ generateLipSync: vi.fn() }))
vi.mock('@/lib/storage', () => ({
  getSignedUrl: vi.fn((value: string) => value),
  toFetchableUrl: vi.fn((value: string) => value),
}))
vi.mock('@/lib/fonts', () => ({ initializeFonts: vi.fn(), createLabelSVG: vi.fn() }))
vi.mock('@/lib/media-process', () => ({ processMediaResult: vi.fn() }))
vi.mock('@/lib/config-service', () => configServiceMock)

import { resolveImageSourceFromGeneration, resolveVideoSourceFromGeneration } from '@/lib/workers/utils'

function buildJob(): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-1',
      type: 'VIDEO_PANEL',
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'NovelPromotionPanel',
      targetId: 'panel-1',
      payload: {},
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker utils video generation resume', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.task.findUnique.mockReset()
    asyncPollMock.pollAsyncTask.mockReset()
    generatorApiMock.generateImage.mockReset()
    generatorApiMock.generateVideo.mockReset()
    fsPromisesMock.appendFile.mockReset()
    taskServiceMock.isTaskActive.mockResolvedValue(true)
    taskServiceMock.trySetTaskExternalId.mockResolvedValue(true)
    fsPromisesMock.appendFile.mockResolvedValue(undefined)
    configServiceMock.resolveProjectModelCapabilityGenerationOptions.mockResolvedValue({})
  })

  it('continues polling from existing externalId without re-submitting generation', async () => {
    const externalId = 'OPENAI:VIDEO:b3BlbmFpLWNvbXBhdGlibGU6b2EtMQ:vid_123'
    prismaMock.task.findUnique.mockResolvedValueOnce({ externalId })
    asyncPollMock.pollAsyncTask.mockResolvedValueOnce({
      status: 'completed',
      resultUrl: 'https://oa.test/v1/videos/vid_123/content',
      downloadHeaders: {
        Authorization: 'Bearer oa-key',
      },
    })

    const result = await resolveVideoSourceFromGeneration(buildJob(), {
      userId: 'user-1',
      modelId: 'openai-compatible:oa-1::sora-2',
      imageUrl: 'data:image/png;base64,QQ==',
      options: {
        prompt: 'animate this frame',
      },
    })

    expect(result).toEqual({
      url: 'https://oa.test/v1/videos/vid_123/content',
      downloadHeaders: {
        Authorization: 'Bearer oa-key',
      },
    })
    expect(asyncPollMock.pollAsyncTask).toHaveBeenCalledWith(externalId, 'user-1')
    expect(generatorApiMock.generateVideo).not.toHaveBeenCalled()
  })

  it('prevents duplicate panel candidates by skipping task externalId resume when requested', async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({ externalId: 'FAL:IMAGE:fal-ai/nano-banana-pro:req_1' })
    generatorApiMock.generateImage.mockResolvedValueOnce({
      success: true,
      imageUrl: 'https://fal.test/new-image.png',
    })

    const result = await resolveImageSourceFromGeneration(buildJob(), {
      userId: 'user-1',
      modelId: 'fal::banana',
      prompt: 'a cinematic portrait',
      options: {
        aspectRatio: '16:9',
      },
      allowTaskExternalIdResume: false,
    })

    expect(result).toBe('https://fal.test/new-image.png')
    expect(prismaMock.task.findUnique).not.toHaveBeenCalled()
    expect(asyncPollMock.pollAsyncTask).not.toHaveBeenCalled()
    expect(generatorApiMock.generateImage).toHaveBeenCalledTimes(1)
  })

  it('logs video generation params to a temp file without full base64 image payloads', async () => {
    prismaMock.task.findUnique.mockResolvedValue({ externalId: null })
    configServiceMock.resolveProjectModelCapabilityGenerationOptions.mockResolvedValueOnce({
      resolution: '720p',
    })
    generatorApiMock.generateVideo.mockResolvedValueOnce({
      success: true,
      async: false,
      videoUrl: 'https://provider.test/video.mp4',
    })

    const imageUrl = `data:image/png;base64,${'A'.repeat(640)}`
    const lastFrameImageUrl = `data:image/png;base64,${'B'.repeat(768)}`
    const result = await resolveVideoSourceFromGeneration(buildJob(), {
      userId: 'user-1',
      modelId: 'vidu::viduq3-pro',
      imageUrl,
      options: {
        prompt: 'animate this frame',
        duration: 5.8,
        generationMode: 'firstlastframe',
        lastFrameImageUrl,
      },
    })

    expect(result).toEqual({ url: 'https://provider.test/video.mp4' })
    expect(generatorApiMock.generateVideo).toHaveBeenCalledWith(
      'user-1',
      'vidu::viduq3-pro',
      imageUrl,
      expect.objectContaining({
        prompt: 'animate this frame',
        duration: 5,
        lastFrameImageUrl,
        resolution: '720p',
      }),
    )

    expect(fsPromisesMock.appendFile).toHaveBeenCalledWith(
      '/tmp/wao-panel-video-outbound-requests.ndjson',
      expect.any(String),
      'utf8',
    )
    const videoDebugWrite = fsPromisesMock.appendFile.mock.calls.find(([file]) => file === '/tmp/wao-panel-video-outbound-requests.ndjson')
    expect(videoDebugWrite).toBeTruthy()
    const line = String(videoDebugWrite?.[1] || '')
    expect(line).toContain('data:image/png;base64,[base64 omitted length=640]')
    expect(line).toContain('data:image/png;base64,[base64 omitted length=768]')
    expect(line).not.toContain('A'.repeat(120))
    expect(line).not.toContain('B'.repeat(120))
  })

  it('clamps yunwu omni duration before logging and submitting generation', async () => {
    prismaMock.task.findUnique.mockResolvedValue({ externalId: null })
    generatorApiMock.generateVideo.mockResolvedValueOnce({
      success: true,
      async: false,
      videoUrl: 'https://provider.test/omni.mp4',
    })

    await resolveVideoSourceFromGeneration(buildJob(), {
      userId: 'user-1',
      modelId: 'openai-compatible:yunwu-1::kling-omni-video',
      imageUrl: 'data:image/png;base64,ZmFrZQ==',
      options: {
        prompt: 'animate this frame',
        duration: 19,
      },
    })

    expect(generatorApiMock.generateVideo).toHaveBeenCalledWith(
      'user-1',
      'openai-compatible:yunwu-1::kling-omni-video',
      'data:image/png;base64,ZmFrZQ==',
      expect.objectContaining({
        duration: 15,
      }),
    )
    const videoDebugWrite = fsPromisesMock.appendFile.mock.calls.find(([file]) => file === '/tmp/wao-panel-video-outbound-requests.ndjson')
    const line = String(videoDebugWrite?.[1] || '')
    expect(line).toContain('"duration":15')
    expect(line).not.toContain('"duration":19')
  })
})
