import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'yunwu',
  apiKey: 'yunwu-key',
  baseUrl: 'https://yunwu.ai',
})))

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

// 生成器单测不应触达 COS：关闭出站 COS，保持 image_list 为内联 base64
vi.mock('@/lib/media/outbound-cos', () => ({
  isOutboundCosConfigured: () => false,
  ensureOutboundImageUrl: async (source: string) => source,
}))

import { YunwuVideoGenerator } from '@/lib/generators/yunwu'

describe('YunwuVideoGenerator omni video', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    getProviderConfigMock.mockResolvedValue({
      id: 'yunwu',
      apiKey: 'yunwu-key',
      baseUrl: 'https://yunwu.ai/ent/v2',
    })
    fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { task_id: 'omni-task-1' }, status: 'submitted' }),
    }))
    globalThis.fetch = fetchSpy as unknown as typeof fetch
  })

  it('submits kling-video-o1 to yunwu omni endpoint with pure base64 first frame', async () => {
    const generator = new YunwuVideoGenerator()

    const result = await generator.generate({
      userId: 'user-1',
      imageUrl: 'data:image/png;base64,ZmFrZS1pbWFnZQ==',
      prompt: '一个人在海边迎着夕阳跳舞',
      options: {
        provider: 'yunwu',
        modelId: 'kling-video-o1',
        modelKey: 'yunwu::kling-video-o1',
        duration: 5.8,
        aspectRatio: '16:9',
        resolution: 'pro',
        generateAudio: false,
        negativePrompt: '模糊',
        watermark: false,
      },
    })

    expect(result).toMatchObject({
      success: true,
      async: true,
      requestId: 'omni-task-1',
    })
    // externalId 始终携带 pr_（provider token）+ ep_（提交时解析的 omni baseUrl），
    // 供轮询复用同一个 provider 与 baseUrl
    expect(result.externalId).toMatch(/^YUNWUOMNI:VIDEO:pr_[^:]+:ep_[^:]+:omni-task-1$/)
    const epToken = String(result.externalId).split(':').find((part) => part.startsWith('ep_'))!.slice(3)
    expect(Buffer.from(epToken, 'base64url').toString('utf8')).toBe('https://yunwu.ai/kling/v1')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [endpoint, request] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(endpoint).toBe('https://yunwu.ai/kling/v1/videos/omni-video')
    expect(request.headers).toMatchObject({
      Authorization: 'Bearer yunwu-key',
      'Content-Type': 'application/json',
    })

    const body = JSON.parse(String(request.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      model_name: 'kling-video-o1',
      multi_shot: false,
      prompt: '一个人在海边迎着夕阳跳舞',
      negative_prompt: '模糊',
      mode: 'pro',
      sound: 'on',
      aspect_ratio: '16:9',
      duration: '5',
      watermark_info: { enabled: false },
    })
    expect(body.image_list).toEqual([
      { image_url: 'ZmFrZS1pbWFnZQ==', type: 'first_frame' },
    ])
  })

  it('supports custom omni base URL in externalId', async () => {
    getProviderConfigMock.mockResolvedValueOnce({
      id: 'yunwu',
      apiKey: 'yunwu-key',
      baseUrl: 'https://proxy.example/yunwu/v1',
    })
    const generator = new YunwuVideoGenerator()

    const result = await generator.generate({
      userId: 'user-1',
      imageUrl: 'data:image/png;base64,ZmFrZQ==',
      prompt: '镜头平稳推进',
      options: {
        provider: 'yunwu',
        modelId: 'kling-v3-omni',
        duration: 6,
        aspect_ratio: '9:16',
      },
    })

    const [endpoint, request] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(endpoint).toBe('https://proxy.example/yunwu/v1/videos/omni-video')
    const body = JSON.parse(String(request.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      mode: 'pro',
      sound: 'on',
    })
    expect(result.externalId).toMatch(/^YUNWUOMNI:VIDEO:pr_[^:]+:ep_[^:]+:omni-task-1$/)
    const epToken = String(result.externalId).split(':').find((part) => part.startsWith('ep_'))!.slice(3)
    expect(Buffer.from(epToken, 'base64url').toString('utf8')).toBe('https://proxy.example/yunwu/v1')
  })

  it('clamps duration to yunwu omni supported range', async () => {
    const generator = new YunwuVideoGenerator()

    await generator.generate({
      userId: 'user-1',
      imageUrl: 'data:image/png;base64,ZmFrZQ==',
      prompt: '镜头平稳推进',
      options: {
        provider: 'yunwu',
        modelId: 'kling-v3-omni',
        duration: 19,
      },
    })

    const [, request] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(request.body)) as Record<string, unknown>
    expect(body.duration).toBe('15')
  })

  it('joins provider base URL and configured omni endpoint path', async () => {
    getProviderConfigMock.mockResolvedValueOnce({
      id: 'yunwu',
      apiKey: 'yunwu-key',
      baseUrl: 'https://yunwu.ai/v1',
    })
    const generator = new YunwuVideoGenerator()

    await generator.generate({
      userId: 'user-1',
      imageUrl: 'data:image/png;base64,ZmFrZQ==',
      prompt: '镜头平稳推进',
      options: {
        provider: 'yunwu',
        modelId: 'kling-v3-omni',
        customEndpoint: '/kling/v1/videos/omni-video',
        duration: 6,
      },
    })

    const [endpoint] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(endpoint).toBe('https://yunwu.ai/kling/v1/videos/omni-video')
  })
})
