import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 模拟腾讯云 COS SDK：捕获 putObject 调用，按需返回成功 / 失败
const putObjectMock = vi.hoisted(() => vi.fn())
const cosConstructorMock = vi.hoisted(() => vi.fn())

vi.mock('cos-nodejs-sdk-v5', () => ({
  default: cosConstructorMock.mockImplementation(() => ({
    putObject: putObjectMock,
  })),
}))

import {
  ensureOutboundImageUrl,
  isOutboundCosConfigured,
  parseBase64Image,
  uploadOutboundImage,
} from '@/lib/media/outbound-cos'

// "hello" 的 base64，解码后是非空 buffer（parseBase64Image 只校验非空，不校验是否真图）
const SAMPLE_BASE64 = Buffer.from('hello-image-bytes').toString('base64')

type PutObjectCallback = (err: Error | null, data?: { Location?: string }) => void

function mockPutObjectSuccess(location: string) {
  putObjectMock.mockImplementation((_params: unknown, cb: PutObjectCallback) => {
    cb(null, { Location: location })
  })
}

describe('outbound-cos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('COS_SECRET_ID', 'test-secret-id')
    vi.stubEnv('COS_SECRET_KEY', 'test-secret-key')
    vi.stubEnv('COS_BUCKET', 'tmp-media-1256938913')
    vi.stubEnv('COS_REGION', 'ap-shanghai')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('isOutboundCosConfigured', () => {
    it('两个密钥都存在时返回 true', () => {
      expect(isOutboundCosConfigured()).toBe(true)
    })

    it('缺少 COS_SECRET_ID 时返回 false', () => {
      vi.stubEnv('COS_SECRET_ID', '')
      expect(isOutboundCosConfigured()).toBe(false)
    })

    it('缺少 COS_SECRET_KEY 时返回 false', () => {
      vi.stubEnv('COS_SECRET_KEY', '')
      expect(isOutboundCosConfigured()).toBe(false)
    })
  })

  describe('parseBase64Image', () => {
    it('解析 data URL 并提取 mime / ext', () => {
      const result = parseBase64Image(`data:image/png;base64,${SAMPLE_BASE64}`)
      expect(result.mimeType).toBe('image/png')
      expect(result.ext).toBe('png')
      expect(result.buffer.length).toBeGreaterThan(0)
    })

    it('裸 base64 串按 image/jpeg 处理', () => {
      const result = parseBase64Image(SAMPLE_BASE64)
      expect(result.mimeType).toBe('image/jpeg')
      expect(result.ext).toBe('jpg')
      expect(result.buffer.length).toBeGreaterThan(0)
    })

    it('空内容抛出 OUTBOUND_COS_IMAGE_INVALID', () => {
      expect(() => parseBase64Image('')).toThrow(/OUTBOUND_COS_IMAGE_INVALID/)
    })

    it('data URL 缺少 base64 标记时抛错', () => {
      expect(() => parseBase64Image('data:image/png,not-base64')).toThrow(/OUTBOUND_COS_IMAGE_INVALID/)
    })
  })

  describe('uploadOutboundImage', () => {
    it('上传 buffer 并返回 https 公网 URL', async () => {
      mockPutObjectSuccess('tmp-media-1256938913.cos.ap-shanghai.myqcloud.com/outbound/2026-05-15/abc.jpg')

      const url = await uploadOutboundImage(Buffer.from('hello-image-bytes'), 'jpg', 'image/jpeg')

      expect(url).toBe(
        'https://tmp-media-1256938913.cos.ap-shanghai.myqcloud.com/outbound/2026-05-15/abc.jpg',
      )
      expect(putObjectMock).toHaveBeenCalledTimes(1)
      const [params] = putObjectMock.mock.calls[0] as [Record<string, unknown>, PutObjectCallback]
      expect(params).toMatchObject({
        Bucket: 'tmp-media-1256938913',
        Region: 'ap-shanghai',
        ContentType: 'image/jpeg',
        // 必须公有读，外部 provider 才能直接 fetch
        ACL: 'public-read',
      })
      // Key 形如 outbound/YYYY-MM-DD/<uuid>.jpg
      expect(String(params.Key)).toMatch(/^outbound\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.jpg$/)
      expect(Buffer.isBuffer(params.Body)).toBe(true)
    })

    it('putObject 报错时 reject', async () => {
      putObjectMock.mockImplementation((_params: unknown, cb: PutObjectCallback) => {
        cb(new Error('AccessDenied'))
      })

      await expect(uploadOutboundImage(Buffer.from('x'))).rejects.toThrow('AccessDenied')
    })

    it('putObject 未返回 Location 时 reject', async () => {
      putObjectMock.mockImplementation((_params: unknown, cb: PutObjectCallback) => {
        cb(null, {})
      })

      await expect(uploadOutboundImage(Buffer.from('x'))).rejects.toThrow()
    })
  })

  describe('ensureOutboundImageUrl', () => {
    it('已是 http(s) URL 时原样返回，不触发上传', async () => {
      const url = await ensureOutboundImageUrl('https://example.com/already-public.jpg')
      expect(url).toBe('https://example.com/already-public.jpg')
      expect(putObjectMock).not.toHaveBeenCalled()
    })

    it('base64 / data URL 会上传 COS 并返回公网 URL', async () => {
      mockPutObjectSuccess('tmp-media-1256938913.cos.ap-shanghai.myqcloud.com/outbound/2026-05-15/x.jpg')

      const url = await ensureOutboundImageUrl(`data:image/jpeg;base64,${SAMPLE_BASE64}`)

      expect(url).toBe(
        'https://tmp-media-1256938913.cos.ap-shanghai.myqcloud.com/outbound/2026-05-15/x.jpg',
      )
      expect(putObjectMock).toHaveBeenCalledTimes(1)
    })
  })
})
