import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'yunwu',
  apiKey: 'yunwu-key',
  baseUrl: 'https://yunwu.ai',
})))
const getImageBase64CachedMock = vi.hoisted(() => vi.fn(async () => 'data:image/webp;base64,UkVG'))

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

vi.mock('@/lib/image-cache', () => ({
  getImageBase64Cached: getImageBase64CachedMock,
}))

import { normalizeYunwuImageBaseUrl, YunwuImageGenerator } from '@/lib/generators/image/yunwu'

describe('YunwuImageGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    getProviderConfigMock.mockResolvedValue({
      id: 'yunwu',
      apiKey: 'yunwu-key',
      baseUrl: 'https://yunwu.ai',
    })
  })

  it('normalizes image edit base URLs to /v1', () => {
    expect(normalizeYunwuImageBaseUrl('https://yunwu.ai')).toBe('https://yunwu.ai/v1')
    expect(normalizeYunwuImageBaseUrl('https://yunwu.ai/v1')).toBe('https://yunwu.ai/v1')
    expect(normalizeYunwuImageBaseUrl('https://yunwu.ai/v1/images/edits')).toBe('https://yunwu.ai/v1')
    expect(normalizeYunwuImageBaseUrl('https://yunwu.ai/v1/v1/images/edits')).toBe('https://yunwu.ai/v1')
  })

  it('posts gpt-image-2 edits as multipart form data and reads choices content URLs', async () => {
    const fetchMock = vi.fn<(...args: [string | URL | Request, RequestInit?]) => Promise<{
      ok: boolean
      status: number
      json: () => Promise<unknown>
    }>>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ image_url: 'https://yunwu.test/output.png' }),
            },
          },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const generator = new YunwuImageGenerator('gpt-image-2', 'yunwu')
    const result = await generator.generate({
      userId: 'user-1',
      prompt: '将图片改成儿童绘本插画风格，保留主体构图。',
      referenceImages: ['https://example.com/ref.webp'],
      options: {
        aspectRatio: '16:9',
        quality: 'auto',
        customEndpoint: '/v1/images/edits',
      },
    })

    expect(result).toEqual({
      success: true,
      imageUrl: 'https://yunwu.test/output.png',
    })
    expect(getImageBase64CachedMock).toHaveBeenCalledWith('https://example.com/ref.webp')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [endpoint, init] = fetchMock.mock.calls[0]
    if (!init) {
      throw new Error('fetch init should be provided')
    }
    expect(endpoint).toBe('https://yunwu.ai/v1/images/edits')
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer yunwu-key',
      },
    })

    const form = init.body as FormData
    expect(form.get('model')).toBe('gpt-image-2')
    expect(form.get('prompt')).toBe('将图片改成儿童绘本插画风格，保留主体构图。')
    expect(form.get('n')).toBe('1')
    expect(form.get('quality')).toBe('auto')
    expect(form.get('size')).toBe('2048x1152')
    expect(form.getAll('image')).toHaveLength(1)
  })

  it('reads base64 images from nested choices JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ data: [{ b64_json: 'UkVTVUxU' }] }),
            },
          },
        ],
      }),
    })))

    const generator = new YunwuImageGenerator('gpt-image-2', 'yunwu')
    const result = await generator.generate({
      userId: 'user-1',
      prompt: 'edit',
      referenceImages: ['data:image/png;base64,QQ=='],
      options: { responseFormat: 'b64_json' },
    })

    expect(result).toEqual({
      success: true,
      imageBase64: 'UkVTVUxU',
      imageUrl: 'data:image/png;base64,UkVTVUxU',
    })
  })

  it('posts gemini image models to generateContent JSON endpoint and reads inline_data images', async () => {
    const fetchMock = vi.fn<(...args: [string | URL | Request, RequestInit?]) => Promise<{
      ok: boolean
      status: number
      json: () => Promise<unknown>
    }>>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { text: 'done' },
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: 'SlBFRw==',
                  },
                },
              ],
            },
          },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const generator = new YunwuImageGenerator('gemini-3-pro-image-preview', 'yunwu')
    const result = await generator.generate({
      userId: 'user-1',
      prompt: '请生成一张赛博朋克风格的城市夜景海报。',
      options: {
        aspectRatio: '9:16',
        resolution: '1K',
      },
    })

    expect(result).toEqual({
      success: true,
      imageBase64: 'SlBFRw==',
      imageUrl: 'data:image/jpeg;base64,SlBFRw==',
    })
    expect(getImageBase64CachedMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [endpoint, init] = fetchMock.mock.calls[0]
    if (!init) {
      throw new Error('fetch init should be provided')
    }
    expect(endpoint).toBe('https://yunwu.ai/v1beta/models/gemini-3-pro-image-preview:generateContent?key=yunwu-key')
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer yunwu-key',
      },
    })
    expect(JSON.parse(init.body as string)).toEqual({
      contents: [
        {
          role: 'user',
          parts: [
            { text: '请生成一张赛博朋克风格的城市夜景海报。' },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: '9:16',
          imageSize: '1K',
        },
      },
    })
  })

  it('sends gemini image references as inline_data after text prompt', async () => {
    const fetchMock = vi.fn<(...args: [string | URL | Request, RequestInit?]) => Promise<{
      ok: boolean
      status: number
      json: () => Promise<unknown>
    }>>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: 'UkVTVUxU',
                  },
                },
              ],
            },
          },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const generator = new YunwuImageGenerator('gemini-3-pro-image-preview', 'yunwu')
    await generator.generate({
      userId: 'user-1',
      prompt: '参考图片生成新海报',
      referenceImages: ['https://example.com/ref.webp'],
      options: {
        aspectRatio: '1:1',
        resolution: '2K',
      },
    })

    expect(getImageBase64CachedMock).toHaveBeenCalledWith('https://example.com/ref.webp')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.contents[0].parts).toEqual([
      { text: '参考图片生成新海报' },
      {
        inline_data: {
          mime_type: 'image/webp',
          data: 'UkVG',
        },
      },
    ])
    expect(body.generationConfig.imageConfig).toEqual({
      aspectRatio: '1:1',
      imageSize: '2K',
    })
  })

  it('maps storyboard pixel sizes to supported gemini imageSize values', async () => {
    const fetchMock = vi.fn<(...args: [string | URL | Request, RequestInit?]) => Promise<{
      ok: boolean
      status: number
      json: () => Promise<unknown>
    }>>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  inline_data: {
                    mime_type: 'image/png',
                    data: 'UkVTVUxU',
                  },
                },
              ],
            },
          },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const generator = new YunwuImageGenerator('gemini-3-pro-image-preview', 'yunwu')
    await generator.generate({
      userId: 'user-1',
      prompt: '生成多宫格分镜图',
      options: {
        aspectRatio: '16:9',
        size: '3104x1760',
      },
    })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.generationConfig.imageConfig).toEqual({
      aspectRatio: '16:9',
      imageSize: '4K',
    })
  })

  it('uses explicit gemini imageSize and does not send quality', async () => {
    const fetchMock = vi.fn<(...args: [string | URL | Request, RequestInit?]) => Promise<{
      ok: boolean
      status: number
      json: () => Promise<unknown>
    }>>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  inline_data: {
                    mime_type: 'image/png',
                    data: 'UkVTVUxU',
                  },
                },
              ],
            },
          },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const generator = new YunwuImageGenerator('gemini-3-pro-image-preview', 'yunwu')
    await generator.generate({
      userId: 'user-1',
      prompt: '生成图片',
      options: {
        aspectRatio: '4:3',
        imageSize: '2K',
        resolution: '1K',
        size: '3104x1760',
        quality: 'high',
      },
    })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.generationConfig.imageConfig).toEqual({
      aspectRatio: '4:3',
      imageSize: '2K',
    })
    expect(JSON.stringify(body)).not.toContain('quality')
  })

  it('normalizes gemini custom endpoints without keeping stale /v1 prefix', async () => {
    getProviderConfigMock.mockResolvedValueOnce({
      id: 'yunwu',
      apiKey: 'yunwu-key',
      baseUrl: 'https://yunwu.ai/v1',
    })
    const fetchMock = vi.fn<(...args: [string | URL | Request, RequestInit?]) => Promise<{
      ok: boolean
      status: number
      json: () => Promise<unknown>
    }>>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  inline_data: {
                    mime_type: 'image/png',
                    data: 'UkVTVUxU',
                  },
                },
              ],
            },
          },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const generator = new YunwuImageGenerator('gemini-3.1-flash-image-preview', 'yunwu')
    await generator.generate({
      userId: 'user-1',
      prompt: '生成多宫格分镜图',
      options: {
        aspectRatio: '16:9',
        size: '3104x1760',
        customEndpoint: '/v1beta/models',
      },
    })

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://yunwu.ai/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=yunwu-key',
    )
  })
})
