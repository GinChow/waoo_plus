import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'yunwu',
  apiKey: 'yunwu-key',
  baseUrl: 'https://yunwu.ai/ent/v2',
})))

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
  getUserModels: vi.fn(async () => []),
}))

import { pollAsyncTask } from '@/lib/async-poll'

describe('async poll Yunwu Omni video status mapping', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    getProviderConfigMock.mockResolvedValue({
      id: 'yunwu',
      apiKey: 'yunwu-key',
      baseUrl: 'https://yunwu.ai/ent/v2',
    })
    fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
  })

  it('maps succeeding response to completed video url', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          task_status: 'succeed',
          task_result: {
            videos: [{ url: 'https://cdn.example/omni.mp4' }],
          },
        },
      }),
    })

    const result = await pollAsyncTask('YUNWUOMNI:VIDEO:task-1', 'user-1')

    expect(fetchSpy).toHaveBeenCalledWith('https://yunwu.ai/videos/omni-video/task-1', {
      headers: { Authorization: 'Bearer yunwu-key' },
    })
    expect(result).toEqual({
      status: 'completed',
      videoUrl: 'https://cdn.example/omni.mp4',
      resultUrl: 'https://cdn.example/omni.mp4',
      error: undefined,
    })
  })

  it('maps failed response to provider error', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'failed',
        message: 'bad prompt',
      }),
    })

    const result = await pollAsyncTask('YUNWUOMNI:VIDEO:task-2', 'user-1')

    expect(result).toEqual({
      status: 'failed',
      videoUrl: undefined,
      resultUrl: undefined,
      error: 'Yunwu Omni: bad prompt',
    })
  })
})
