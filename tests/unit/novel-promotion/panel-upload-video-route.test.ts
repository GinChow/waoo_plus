import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const prismaMock = vi.hoisted(() => ({
  novelPromotionPanel: {
    findUnique: vi.fn(),
    update: vi.fn(async () => ({})),
  },
}))

const storageMock = vi.hoisted(() => ({
  generateUniqueKey: vi.fn(() => 'videos/uploaded.mp4'),
  uploadObject: vi.fn(async () => 'videos/uploaded.mp4'),
  getSignedUrl: vi.fn((key: string) => `signed:${key}`),
}))

vi.mock('@/lib/api-auth', () => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
    project: { id: 'project-1', userId: 'user-1' },
  })),
  isErrorResponse: (value: unknown) => value instanceof Response,
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/storage', () => storageMock)

async function uploadPanelVideo(file: File): Promise<Response> {
  const mod = await import('@/app/api/novel-promotion/[projectId]/panel/upload-video/route')
  const formData = new FormData()
  formData.append('panelId', 'panel-1')
  formData.append('file', file)

  const request = new NextRequest('http://localhost:3000/api/novel-promotion/project-1/panel/upload-video', {
    method: 'POST',
    body: formData,
  })
  return await mod.POST(request, { params: Promise.resolve({ projectId: 'project-1' }) })
}

describe('panel upload video route', () => {
  beforeEach(() => {
    prismaMock.novelPromotionPanel.findUnique.mockReset()
    prismaMock.novelPromotionPanel.update.mockClear()
    storageMock.generateUniqueKey.mockClear()
    storageMock.uploadObject.mockClear()
    storageMock.getSignedUrl.mockClear()
  })

  it('uploads a local video and appends upload history', async () => {
    prismaMock.novelPromotionPanel.findUnique.mockResolvedValue({
      id: 'panel-1',
      videoHistory: JSON.stringify([
        { videoUrl: 'videos/old.mp4', generatedAt: '2026-06-08T00:00:00.000Z', source: 'generate' },
      ]),
      videoPrompt: 'camera stays low',
    })

    const response = await uploadPanelVideo(new File(['video-bytes'], 'local.mp4', { type: 'video/mp4' }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(storageMock.generateUniqueKey).toHaveBeenCalledWith('panel-video-upload-panel-1', 'mp4')
    expect(storageMock.uploadObject).toHaveBeenCalledWith(expect.any(Buffer), 'videos/uploaded.mp4', 1, 'video/mp4')
    expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: expect.objectContaining({
        videoUrl: 'videos/uploaded.mp4',
        videoGenerationMode: 'normal',
        lipSyncVideoUrl: null,
      }),
    })
    const updateCall = prismaMock.novelPromotionPanel.update.mock.calls[0] as unknown as [{ data: { videoHistory: string } }]
    const updateData = updateCall[0].data
    expect(JSON.parse(updateData.videoHistory)).toEqual([
      { videoUrl: 'videos/old.mp4', generatedAt: '2026-06-08T00:00:00.000Z', source: 'generate' },
      expect.objectContaining({
        videoUrl: 'videos/uploaded.mp4',
        source: 'upload',
        videoPrompt: 'camera stays low',
        generationMode: 'upload',
      }),
    ])
    expect(json).toMatchObject({
      success: true,
      videoUrl: 'signed:videos/uploaded.mp4',
      cosKey: 'videos/uploaded.mp4',
    })
    expect(json.videoHistory).toEqual([
      expect.objectContaining({ videoUrl: 'signed:videos/old.mp4', source: 'generate' }),
      expect.objectContaining({ videoUrl: 'signed:videos/uploaded.mp4', source: 'upload' }),
    ])
  })

  it('rejects unsupported video files', async () => {
    prismaMock.novelPromotionPanel.findUnique.mockResolvedValue({
      id: 'panel-1',
      videoHistory: null,
      videoPrompt: null,
    })

    const response = await uploadPanelVideo(new File(['text'], 'notes.txt', { type: 'text/plain' }))

    expect(response.status).toBe(400)
    expect(storageMock.uploadObject).not.toHaveBeenCalled()
    expect(prismaMock.novelPromotionPanel.update).not.toHaveBeenCalled()
  })
})
