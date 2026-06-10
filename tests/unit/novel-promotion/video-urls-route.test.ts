import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const prismaMock = vi.hoisted(() => ({
  novelPromotionProject: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  novelPromotionEpisode: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireProjectAuthLight: vi.fn(async () => ({
    project: { id: 'project-1', name: '演示项目' },
    session: { user: { id: 'user-1' } },
  })),
}))

async function postVideoUrls(body: unknown): Promise<Response> {
  const mod = await import('@/app/api/novel-promotion/[projectId]/video-urls/route')
  const request = new NextRequest('http://localhost/api/novel-promotion/project-1/video-urls', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return mod.POST(request, { params: Promise.resolve({ projectId: 'project-1' }) })
}

describe('video urls route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.novelPromotionProject.findUnique.mockResolvedValue({ videoRatio: '9:16' })
    prismaMock.novelPromotionEpisode.findUnique.mockResolvedValue({
      clips: [{ id: 'clip-a' }, { id: 'clip-b' }],
      storyboards: [
        {
          id: 'storyboard-b',
          clipId: 'clip-b',
          panels: [{
            id: 'panel-b',
            panelIndex: 0,
            description: '后一个镜头',
            duration: null,
            videoUrl: 'videos/original-b.webm',
            lipSyncVideoUrl: null,
          }],
        },
        {
          id: 'storyboard-a',
          clipId: 'clip-a',
          panels: [{
            id: 'panel-a',
            panelIndex: 2,
            description: '开场/对白',
            duration: 2.5,
            videoUrl: 'videos/original-a.mp4',
            lipSyncVideoUrl: 'videos/lip-a.mp4',
          }],
        },
      ],
    })
  })

  it('returns ordered editing metadata and honors selected source preference', async () => {
    const response = await postVideoUrls({
      episodeId: 'episode-1',
      panelPreferences: { 'storyboard-a-2': true },
    })
    const body = await response.json() as {
      projectName: string
      videoRatio: string
      videos: Array<Record<string, unknown>>
    }

    expect(response.status).toBe(200)
    expect(body.projectName).toBe('演示项目')
    expect(body.videoRatio).toBe('9:16')
    expect(body.videos).toEqual([
      expect.objectContaining({
        index: 1,
        fileName: '001_开场_对白.mp4',
        panelId: 'panel-a',
        storyboardId: 'storyboard-a',
        panelIndex: 2,
        durationSeconds: 2.5,
        sourceType: 'lip-sync',
        videoUrl: expect.stringContaining('videos%2Flip-a.mp4'),
      }),
      expect.objectContaining({
        index: 2,
        fileName: '002_后一个镜头.webm',
        panelId: 'panel-b',
        durationSeconds: 3,
        sourceType: 'original',
      }),
    ])
  })
})
