import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveStorageKeyFromMediaValueMock = vi.hoisted(() => vi.fn())
const getSignedObjectUrlMock = vi.hoisted(() => vi.fn())
const toFetchableUrlMock = vi.hoisted(() => vi.fn((value: string) => `fetchable:${value}`))

vi.mock('@/lib/media/service', () => ({
  resolveStorageKeyFromMediaValue: resolveStorageKeyFromMediaValueMock,
}))

vi.mock('@/lib/storage', () => ({
  getSignedObjectUrl: getSignedObjectUrlMock,
  toFetchableUrl: toFetchableUrlMock,
}))

vi.mock('@/lib/api-auth', () => ({
  requireProjectAuthLight: vi.fn(),
  isErrorResponse: (value: unknown) => value instanceof Response,
}))

describe('resolveVideoProxyFetchUrl', () => {
  beforeEach(() => {
    resolveStorageKeyFromMediaValueMock.mockReset()
    getSignedObjectUrlMock.mockReset()
    toFetchableUrlMock.mockClear()
  })

  it('resolves a media route before signing the storage object', async () => {
    resolveStorageKeyFromMediaValueMock.mockResolvedValue('videos/panel-1.mp4')
    getSignedObjectUrlMock.mockResolvedValue('https://storage.example/signed-video')
    const { resolveVideoProxyFetchUrl } = await import('@/lib/video-proxy')

    await expect(resolveVideoProxyFetchUrl('/m/m_0605ceb5b9931cf2e1c1d791da2a4c9965f874d1'))
      .resolves.toBe('fetchable:https://storage.example/signed-video')
    expect(resolveStorageKeyFromMediaValueMock).toHaveBeenCalledWith('/m/m_0605ceb5b9931cf2e1c1d791da2a4c9965f874d1')
    expect(getSignedObjectUrlMock).toHaveBeenCalledWith('videos/panel-1.mp4', 3600)
  })

  it('keeps external video urls unchanged', async () => {
    const { resolveVideoProxyFetchUrl } = await import('@/lib/video-proxy')

    await expect(resolveVideoProxyFetchUrl('https://provider.example/video.mp4'))
      .resolves.toBe('https://provider.example/video.mp4')
    expect(resolveStorageKeyFromMediaValueMock).not.toHaveBeenCalled()
    expect(getSignedObjectUrlMock).not.toHaveBeenCalled()
  })
})
