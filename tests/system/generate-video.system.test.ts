import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callRoute } from '../integration/api/helpers/call-route'
import { installAuthMocks, mockAuthenticated, resetAuthMockState } from '../helpers/auth'
import { resetSystemState } from '../helpers/db-reset'
import { prisma } from '../helpers/prisma'
import { seedMinimalDomainState } from './helpers/seed'
import { expectLifecycleEvents, listTaskEventTypes, waitForTaskTerminalState } from './helpers/tasks'
import { startSystemWorkers, stopSystemWorkers, type SystemWorkers } from './helpers/workers'

type PollState = {
  status: 'processing' | 'completed'
  resultUrl?: string
}

const videoState = vi.hoisted(() => ({
  pollResponses: new Map<string, PollState[]>(),
  uploadedCosKey: 'video/system-video.mp4',
}))

vi.mock('@/lib/generator-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/generator-api')>('@/lib/generator-api')
  return {
    ...actual,
    generateVideo: vi.fn(async () => ({
      success: true,
      async: true,
      externalId: 'video-ext-1',
    })),
  }
})

vi.mock('@/lib/async-poll', async () => {
  const actual = await vi.importActual<typeof import('@/lib/async-poll')>('@/lib/async-poll')
  return {
    ...actual,
    pollAsyncTask: vi.fn(async (externalId: string) => {
      const queue = videoState.pollResponses.get(externalId) || []
      const next = queue.shift()
      if (!next) {
        return { status: 'completed', resultUrl: 'https://provider.example/video-final.mp4' }
      }
      videoState.pollResponses.set(externalId, queue)
      return next
    }),
  }
})

vi.mock('@/lib/media/outbound-image', async () => {
  const actual = await vi.importActual<typeof import('@/lib/media/outbound-image')>('@/lib/media/outbound-image')
  return {
    ...actual,
    normalizeToBase64ForGeneration: vi.fn(async (input: string) => input),
  }
})

vi.mock('@/lib/workers/utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/utils')>('@/lib/workers/utils')
  return {
    ...actual,
    uploadVideoSourceToCos: vi.fn(async () => videoState.uploadedCosKey),
  }
})

describe('system - generate video', () => {
  let workers: SystemWorkers = {}

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    videoState.uploadedCosKey = 'video/system-video.mp4'
    videoState.pollResponses.clear()
    videoState.pollResponses.set('video-ext-1', [
      { status: 'processing' },
      { status: 'completed', resultUrl: 'https://provider.example/video-final.mp4' },
    ])
    await resetSystemState()
    installAuthMocks()
  })

  afterEach(async () => {
    await stopSystemWorkers(workers)
    workers = {}
    resetAuthMockState()
  })

  it('queued external generation -> polling -> videoUrl persisted', async () => {
    const seeded = await seedMinimalDomainState()
    mockAuthenticated(seeded.user.id)
    workers = await startSystemWorkers(['video'])

    const mod = await import('@/app/api/novel-promotion/[projectId]/generate-video/route')
    const response = await callRoute(
      mod.POST,
      'POST',
      {
        locale: 'zh',
        storyboardId: seeded.storyboard.id,
        panelIndex: 0,
        videoModel: 'fal::seedance/video',
      },
      { params: { projectId: seeded.project.id } },
    )

    expect(response.status).toBe(200)
    const json = await response.json() as { async: boolean; taskId: string }
    const task = await waitForTaskTerminalState(json.taskId)

    expect(task.status).toBe('completed')
    expect(task.type).toBe('video_panel')
    expect(task.externalId).toBe('video-ext-1')

    const panel = await prisma.novelPromotionPanel.findUnique({
      where: { id: seeded.panel.id },
      select: { videoUrl: true },
    })
    expect(panel?.videoUrl).toBe(videoState.uploadedCosKey)

    const eventTypes = await listTaskEventTypes(json.taskId)
    expectLifecycleEvents(eventTypes, 'completed')
  })

  it('batch route creates one video task per coarse shot group', async () => {
    const seeded = await seedMinimalDomainState()
    mockAuthenticated(seeded.user.id)

    await prisma.novelPromotionPanel.update({
      where: { id: seeded.secondaryPanel.id },
      data: { imageUrl: 'https://provider.example/panel-2.jpg' },
    })
    await prisma.novelPromotionStoryboard.update({
      where: { id: seeded.storyboard.id },
      data: {
        storyboardTextJson: JSON.stringify([
          { panel_number: 1, parent_group_number: 1 },
          { panel_number: 2, parent_group_number: 1 },
        ]),
        coarseGroupsJson: JSON.stringify([
          {
            groupNumber: 1,
            imageUrl: 'https://provider.example/coarse-group-1.jpg',
            videoPrompt: 'coarse group prompt',
          },
        ]),
      },
    })

    const mod = await import('@/app/api/novel-promotion/[projectId]/generate-video/route')
    const response = await callRoute(
      mod.POST,
      'POST',
      {
        locale: 'zh',
        all: true,
        episodeId: seeded.episode.id,
        videoModel: 'fal::seedance/video',
      },
      { params: { projectId: seeded.project.id } },
    )

    expect(response.status).toBe(200)
    const json = await response.json() as { total: number; tasks: Array<{ taskId?: string; id?: string }> }
    expect(json.total).toBe(1)
    expect(json.tasks).toHaveLength(1)
  })
})
