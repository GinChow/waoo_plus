import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../helpers/request'

const prismaMock = vi.hoisted(() => ({
  novelPromotionPanel: {
    findUnique: vi.fn(),
    update: vi.fn(async () => ({})),
  },
}))

vi.mock('@/lib/api-auth', () => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
    project: { id: 'project-1', userId: 'user-1' },
  })),
  isErrorResponse: (value: unknown) => value instanceof Response,
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

vi.mock('@/lib/media/service', () => ({
  resolveStorageKeyFromMediaValue: vi.fn(async (value: string) => {
    if (value === '/m/m_current') return 'videos/current.mp4'
    return value.replace(/^signed:/, '')
  }),
}))

vi.mock('@/lib/storage', () => ({
  getSignedUrl: vi.fn((key: string) => `signed:${key}`),
}))

async function deletePanelHistoryVideo(body: Record<string, unknown>): Promise<Response> {
  const mod = await import('@/app/api/novel-promotion/[projectId]/panel/select-video-history/route')
  const request = buildMockRequest({
    path: '/api/novel-promotion/project-1/panel/select-video-history',
    method: 'DELETE',
    body,
  })
  return await mod.DELETE(request, { params: Promise.resolve({ projectId: 'project-1' }) })
}

describe('panel video history route', () => {
  beforeEach(() => {
    prismaMock.novelPromotionPanel.findUnique.mockReset()
    prismaMock.novelPromotionPanel.update.mockClear()
  })

  it('clears panel video output when deleting the current video history entry', async () => {
    prismaMock.novelPromotionPanel.findUnique.mockResolvedValue({
      id: 'panel-1',
      videoUrl: 'videos/current.mp4',
      videoHistory: JSON.stringify([
        { videoUrl: 'videos/current.mp4', generatedAt: '2026-06-09T00:00:00.000Z' },
        { videoUrl: 'videos/old.mp4', generatedAt: '2026-06-08T00:00:00.000Z' },
      ]),
    })

    const response = await deletePanelHistoryVideo({
      panelId: 'panel-1',
      videoUrl: 'signed:videos/current.mp4',
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true, deletedCurrent: true, videoUrl: null })
    expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: {
        videoHistory: JSON.stringify([
          { videoUrl: 'videos/old.mp4', generatedAt: '2026-06-08T00:00:00.000Z' },
        ]),
        videoUrl: null,
        videoMediaId: null,
        videoGenerationMode: null,
        lipSyncTaskId: null,
        lipSyncVideoUrl: null,
        lipSyncVideoMediaId: null,
      },
    })
  })

  it('clears current panel video even when there is no history entry', async () => {
    prismaMock.novelPromotionPanel.findUnique.mockResolvedValue({
      id: 'panel-1',
      videoUrl: 'videos/current.mp4',
      videoHistory: null,
    })

    const response = await deletePanelHistoryVideo({
      panelId: 'panel-1',
      videoUrl: 'signed:videos/current.mp4',
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true, deletedCurrent: true, videoUrl: null })
    expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: {
        videoHistory: null,
        videoUrl: null,
        videoMediaId: null,
        videoGenerationMode: null,
        lipSyncTaskId: null,
        lipSyncVideoUrl: null,
        lipSyncVideoMediaId: null,
      },
    })
  })

  it('clears current panel video when the stored current value is a media route', async () => {
    prismaMock.novelPromotionPanel.findUnique.mockResolvedValue({
      id: 'panel-1',
      videoUrl: '/m/m_current',
      videoHistory: null,
    })

    const response = await deletePanelHistoryVideo({
      panelId: 'panel-1',
      videoUrl: 'videos/current.mp4',
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true, deletedCurrent: true, videoUrl: null })
    expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: {
        videoHistory: null,
        videoUrl: null,
        videoMediaId: null,
        videoGenerationMode: null,
        lipSyncTaskId: null,
        lipSyncVideoUrl: null,
        lipSyncVideoMediaId: null,
      },
    })
  })

  it('clears current panel video with explicit clearCurrent even when urls do not match', async () => {
    prismaMock.novelPromotionPanel.findUnique.mockResolvedValue({
      id: 'panel-1',
      videoUrl: '/m/m_current',
      videoHistory: null,
    })

    const response = await deletePanelHistoryVideo({
      panelId: 'panel-1',
      videoUrl: 'videos/request-url-that-does-not-match.mp4',
      clearCurrent: true,
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true, deletedCurrent: true, videoUrl: null })
    expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: {
        videoHistory: null,
        videoUrl: null,
        videoMediaId: null,
        videoGenerationMode: null,
        lipSyncTaskId: null,
        lipSyncVideoUrl: null,
        lipSyncVideoMediaId: null,
      },
    })
  })
})
