/**
 * 出站媒体中转：把图片上传到腾讯云 COS 的临时桶，返回公网可访问的 URL。
 *
 * 用途：部分外部 provider（如云雾 kling-v3-omni）的提交接口需要传图片 URL，
 * 直接内联 base64 会让请求体高达十几 MB、上传缓慢且容易 `fetch failed`。
 * 这里把图片先落到一个「公有读」的临时桶，提交时只带几百字节的 URL。
 *
 * 桶定位为临时中转，建议在 COS 控制台配置生命周期规则自动清理。
 * 仅服务端使用，不接入 storage 抽象层（那是项目主存储）。
 */

import COS from 'cos-nodejs-sdk-v5'
import { randomUUID } from 'node:crypto'
import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'

const DEFAULT_BUCKET = 'tmp-media-1256938913'
const DEFAULT_REGION = 'ap-shanghai'

let cosSingleton: COS | null = null

export function isOutboundCosConfigured(): boolean {
  return Boolean(process.env.COS_SECRET_ID && process.env.COS_SECRET_KEY)
}

function getCos(): COS {
  if (cosSingleton) return cosSingleton
  const SecretId = process.env.COS_SECRET_ID
  const SecretKey = process.env.COS_SECRET_KEY
  if (!SecretId || !SecretKey) {
    throw new Error('OUTBOUND_COS_NOT_CONFIGURED: COS_SECRET_ID / COS_SECRET_KEY missing')
  }
  cosSingleton = new COS({ SecretId, SecretKey })
  return cosSingleton
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/**
 * 解析 base64 图片来源，支持两种形态：
 * - 完整 data URL：`data:image/jpeg;base64,XXXX`
 * - 裸 base64 串：`XXXX`（无法判断类型时按 image/jpeg 处理）
 */
export function parseBase64Image(source: string): {
  buffer: Buffer
  mimeType: string
  ext: string
} {
  const trimmed = source.trim()
  let mimeType = 'image/jpeg'
  let base64Body = trimmed

  if (trimmed.startsWith('data:')) {
    const marker = ';base64,'
    const markerIndex = trimmed.indexOf(marker)
    if (markerIndex === -1) {
      throw new Error('OUTBOUND_COS_IMAGE_INVALID: data url missing base64 marker')
    }
    const declaredMime = trimmed.slice(5, markerIndex).trim().toLowerCase()
    if (declaredMime) mimeType = declaredMime
    base64Body = trimmed.slice(markerIndex + marker.length)
  }

  const buffer = Buffer.from(base64Body, 'base64')
  if (buffer.length === 0) {
    throw new Error('OUTBOUND_COS_IMAGE_INVALID: empty buffer')
  }
  const ext = MIME_EXT[mimeType] || 'jpg'
  return { buffer, mimeType, ext }
}

/**
 * 上传图片 buffer 到临时桶，返回公网 URL。
 */
export async function uploadOutboundImage(
  buffer: Buffer,
  ext: string = 'jpg',
  contentType?: string,
): Promise<string> {
  const cos = getCos()
  const Bucket = process.env.COS_BUCKET || DEFAULT_BUCKET
  const Region = process.env.COS_REGION || DEFAULT_REGION
  const date = new Date().toISOString().slice(0, 10)
  const Key = `outbound/${date}/${randomUUID()}.${ext}`

  return await new Promise<string>((resolve, reject) => {
    cos.putObject(
      {
        Bucket,
        Region,
        Key,
        Body: buffer,
        // 显式设为公有读：外部 provider（云雾 omni 等）需直接 fetch 该 URL，
        // 否则桶/对象默认私有会让对方拿到 403、报「取不到文件」
        ACL: 'public-read',
        ...(contentType ? { ContentType: contentType } : {}),
      },
      (err, data) => {
        if (err || !data?.Location) {
          _ulogError('[Outbound COS] 上传失败:', err)
          reject(err instanceof Error ? err : new Error(`OUTBOUND_COS_UPLOAD_FAILED: ${String(err)}`))
          return
        }
        const url = `https://${data.Location}`
        _ulogInfo(`[Outbound COS] 上传完成 (${(buffer.length / 1024 / 1024).toFixed(2)}MB) -> ${url}`)
        resolve(url)
      },
    )
  })
}

/**
 * 把一个图片来源（base64 / data url / http url）归一化为公网 URL。
 * - 已经是 http(s) URL：原样返回
 * - base64/data url：上传 COS 后返回 URL
 */
export async function ensureOutboundImageUrl(source: string): Promise<string> {
  const trimmed = source.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  const { buffer, mimeType, ext } = parseBase64Image(trimmed)
  return await uploadOutboundImage(buffer, ext, mimeType)
}
