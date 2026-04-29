import { getProviderConfig } from '@/lib/api-config'
import {
  BaseImageGenerator,
  readCustomEndpoint,
  resolveCustomBaseUrl,
  type GenerateResult,
  type ImageGenerateParams,
} from '../base'
import { getInternalBaseUrl } from '@/lib/env'
import { getImageBase64Cached } from '@/lib/image-cache'
import { parseDataUrl, readStringOption } from '@/lib/model-gateway/openai-compat/common'

type YunwuImageSize =
  | '1024x1024'
  | '1536x1024'
  | '1024x1536'
  | '2048x2048'
  | '2048x1152'
  | '3840x2160'
  | '2160x3840'
  | 'auto'
  | (string & {})

type YunwuImageQuality = 'low' | 'medium' | 'high' | 'auto'
type YunwuImageResponseFormat = 'url' | 'b64_json'

interface YunwuImageOptions {
  provider?: string
  modelId?: string
  modelKey?: string
  size?: string
  resolution?: string
  quality?: string
  responseFormat?: string
  outputFormat?: string
  aspectRatio?: string
  keepOriginalAspectRatio?: unknown
  customEndpoint?: string
  n?: unknown
}

interface ExtractedImage {
  url?: string
  b64Json?: string
}

const YUNWU_IMAGE_DEFAULT_BASE_URL = 'https://yunwu.ai/v1'
const YUNWU_IMAGE_ENDPOINT_PATH = '/images/edits'
const ALLOWED_OPTION_KEYS = new Set([
  'provider',
  'modelId',
  'modelKey',
  'size',
  'resolution',
  'quality',
  'responseFormat',
  'outputFormat',
  'aspectRatio',
  'keepOriginalAspectRatio',
  'customEndpoint',
  'n',
])
const ALLOWED_SIZES = new Set([
  '1024x1024',
  '1536x1024',
  '1024x1536',
  '2048x2048',
  '2048x1152',
  '3840x2160',
  '2160x3840',
  'auto',
])
const ALLOWED_QUALITIES = new Set(['low', 'medium', 'high', 'auto'])
const ALLOWED_RESPONSE_FORMATS = new Set(['url', 'b64_json'])
const ASPECT_RATIO_SIZE_MAP: Record<string, YunwuImageSize> = {
  '1:1': '1024x1024',
  '16:9': '2048x1152',
  '9:16': '1152x2048',
  '4:3': '1536x1152',
  '3:4': '1152x1536',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
}

function toAbsoluteUrlIfNeeded(value: string): string {
  if (!value.startsWith('/')) return value
  return `${getInternalBaseUrl()}${value}`
}

export function normalizeYunwuImageBaseUrl(rawBaseUrl: string | undefined): string {
  const raw = (rawBaseUrl || YUNWU_IMAGE_DEFAULT_BASE_URL).trim().replace(/\/+$/, '')
  if (!raw) return YUNWU_IMAGE_DEFAULT_BASE_URL

  const parsed = new URL(raw)
  parsed.search = ''
  parsed.hash = ''
  parsed.pathname = parsed.pathname
    .replace(/\/+$/, '')
    .replace(/\/images\/edits$/, '')

  const segments = parsed.pathname.split('/').filter(Boolean)
  const v1Index = segments.indexOf('v1')
  if (v1Index !== -1) {
    parsed.pathname = `/${segments.slice(0, v1Index + 1).join('/')}`
    return parsed.toString().replace(/\/+$/, '')
  }

  parsed.pathname = `${parsed.pathname === '/' ? '' : parsed.pathname}/v1`
  return parsed.toString().replace(/\/+$/, '')
}

function assertAllowedOptions(options: Record<string, unknown>) {
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!ALLOWED_OPTION_KEYS.has(key)) {
      throw new Error(`YUNWU_IMAGE_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

function normalizeResponseFormat(value: unknown): YunwuImageResponseFormat | undefined {
  const normalized = readStringOption(value, 'responseFormat')
  if (!normalized) return undefined
  if (ALLOWED_RESPONSE_FORMATS.has(normalized)) return normalized as YunwuImageResponseFormat
  throw new Error(`YUNWU_IMAGE_OPTION_UNSUPPORTED: responseFormat=${normalized}`)
}

function normalizeQuality(value: unknown): YunwuImageQuality {
  const normalized = readStringOption(value, 'quality')
  if (!normalized) return 'auto'
  if (ALLOWED_QUALITIES.has(normalized)) return normalized as YunwuImageQuality
  throw new Error(`YUNWU_IMAGE_OPTION_UNSUPPORTED: quality=${normalized}`)
}

function normalizeSize(value: string | undefined, aspectRatio: string | undefined): YunwuImageSize {
  if (!value && aspectRatio) {
    const mapped = ASPECT_RATIO_SIZE_MAP[aspectRatio.trim()]
    if (mapped) return mapped
    throw new Error(`YUNWU_IMAGE_OPTION_UNSUPPORTED: aspectRatio=${aspectRatio}`)
  }
  if (!value) return '1024x1024'
  if (ALLOWED_SIZES.has(value)) return value as YunwuImageSize
  validateCustomSize(value)
  return value as YunwuImageSize
}

function resolveRawSize(options: YunwuImageOptions): string | undefined {
  const size = readStringOption(options.size, 'size')
  const resolution = readStringOption(options.resolution, 'resolution')
  if (size && resolution && size !== resolution) {
    throw new Error('YUNWU_IMAGE_OPTION_CONFLICT: size and resolution must match')
  }
  return size || resolution
}

function normalizeN(value: unknown): number {
  if (value === undefined || value === null) return 1
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error('YUNWU_IMAGE_OPTION_UNSUPPORTED: n must be an integer from 1 to 10')
  }
  return value
}

function validateCustomSize(size: string): void {
  const match = /^(\d+)x(\d+)$/.exec(size)
  if (!match) {
    throw new Error(`YUNWU_IMAGE_OPTION_UNSUPPORTED: size=${size}`)
  }

  const width = Number(match[1])
  const height = Number(match[2])
  const longSide = Math.max(width, height)
  const shortSide = Math.min(width, height)
  const totalPixels = width * height

  if (longSide > 3840) {
    throw new Error('YUNWU_IMAGE_OPTION_UNSUPPORTED: size long side must be <= 3840px')
  }
  if (width % 16 !== 0 || height % 16 !== 0) {
    throw new Error('YUNWU_IMAGE_OPTION_UNSUPPORTED: size width and height must be multiples of 16px')
  }
  if (longSide / shortSide > 3) {
    throw new Error('YUNWU_IMAGE_OPTION_UNSUPPORTED: size aspect ratio must be <= 3:1')
  }
  if (totalPixels < 655360 || totalPixels > 8294400) {
    throw new Error('YUNWU_IMAGE_OPTION_UNSUPPORTED: size total pixels must be 655360..8294400')
  }
}

function stripDataUrlPrefix(value: string): string {
  const marker = ';base64,'
  const markerIndex = value.indexOf(marker)
  if (value.startsWith('data:') && markerIndex !== -1) {
    return value.slice(markerIndex + marker.length)
  }
  return value
}

function collectImagesFromUnknown(payload: unknown): ExtractedImage[] {
  const images: ExtractedImage[] = []
  const queue: unknown[] = [payload]
  const seen = new Set<unknown>()

  while (queue.length > 0) {
    const cur = queue.shift()
    if (!cur || typeof cur !== 'object' || seen.has(cur)) continue
    seen.add(cur)

    if (Array.isArray(cur)) {
      queue.push(...cur)
      continue
    }

    const obj = cur as Record<string, unknown>
    const url = obj.url ?? obj.image_url ?? obj.imageUrl
    const b64 = obj.b64_json ?? obj.b64Json ?? obj.base64 ?? obj.image_base64 ?? obj.imageBase64
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      images.push({ url })
    }
    if (typeof b64 === 'string' && b64.trim()) {
      images.push({ b64Json: stripDataUrlPrefix(b64.trim()) })
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') queue.push(value)
    }
  }

  return images
}

function extractImagesFromText(content: string): ExtractedImage[] {
  const images: ExtractedImage[] = []
  try {
    images.push(...collectImagesFromUnknown(JSON.parse(content) as unknown))
  } catch {
    // yunwu 有时把 JSON、URL 或 base64 作为纯文本放在 choices[].message.content。
  }

  const urlMatches = content.match(/https?:\/\/[^\s"'<>)]*/g) ?? []
  for (const url of urlMatches) {
    images.push({ url })
  }

  const dataUrlMatches = content.match(/data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+/g) ?? []
  for (const dataUrl of dataUrlMatches) {
    images.push({ b64Json: stripDataUrlPrefix(dataUrl) })
  }

  const trimmed = content.trim()
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 1000) {
    images.push({ b64Json: trimmed.replace(/\s/g, '') })
  }

  return images
}

function extractImages(response: unknown): ExtractedImage[] {
  const images: ExtractedImage[] = []
  if (!response || typeof response !== 'object') return images

  const data = (response as { data?: unknown }).data
  if (Array.isArray(data)) {
    images.push(...collectImagesFromUnknown(data))
  }

  const choices = (response as { choices?: unknown }).choices
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      const content = (choice as { message?: { content?: unknown } })?.message?.content
      if (typeof content === 'string' && content.trim()) {
        images.push(...extractImagesFromText(content))
      }
    }
  }

  const unique = new Map<string, ExtractedImage>()
  for (const image of images) {
    const key = image.url ? `url:${image.url}` : `b64:${image.b64Json?.slice(0, 80)}`
    unique.set(key, image)
  }
  return [...unique.values()]
}

async function buildImageBlob(imageSource: string, index: number): Promise<{ blob: Blob; fileName: string }> {
  const parsedDataUrl = parseDataUrl(imageSource)
  if (parsedDataUrl) {
    return {
      blob: new Blob([Buffer.from(parsedDataUrl.base64, 'base64')], { type: parsedDataUrl.mimeType }),
      fileName: `reference-${index}.png`,
    }
  }

  if (imageSource.startsWith('http://') || imageSource.startsWith('https://') || imageSource.startsWith('/')) {
    const cachedDataUrl = await getImageBase64Cached(toAbsoluteUrlIfNeeded(imageSource))
    const parsedCached = parseDataUrl(cachedDataUrl)
    if (!parsedCached) {
      throw new Error(`YUNWU_IMAGE_REFERENCE_INVALID: failed to parse image source ${index}`)
    }
    return {
      blob: new Blob([Buffer.from(parsedCached.base64, 'base64')], { type: parsedCached.mimeType }),
      fileName: `reference-${index}.png`,
    }
  }

  return {
    blob: new Blob([Buffer.from(imageSource, 'base64')], { type: 'image/png' }),
    fileName: `reference-${index}.png`,
  }
}

function toImageResult(images: ExtractedImage[]): GenerateResult {
  const firstB64 = images.find((item) => item.b64Json)?.b64Json
  if (firstB64) {
    return {
      success: true,
      imageBase64: firstB64,
      imageUrl: `data:image/png;base64,${firstB64}`,
    }
  }

  const urls = images.map((item) => item.url).filter((url): url is string => !!url)
  if (urls.length > 0) {
    return {
      success: true,
      imageUrl: urls[0],
      ...(urls.length > 1 ? { imageUrls: urls } : {}),
    }
  }

  throw new Error('YUNWU_IMAGE_EMPTY_RESPONSE: no image data returned')
}

export class YunwuImageGenerator extends BaseImageGenerator {
  private readonly modelId?: string
  private readonly providerId?: string

  constructor(modelId?: string, providerId?: string) {
    super()
    this.modelId = modelId
    this.providerId = providerId
  }

  protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
    const { userId, prompt, referenceImages = [], options = {} } = params
    const typedOptions = options as YunwuImageOptions
    assertAllowedOptions(options)

    if (referenceImages.length === 0) {
      throw new Error('YUNWU_IMAGE_REFERENCE_REQUIRED: gpt-image-2 requires at least one image')
    }

    const providerId = typedOptions.provider || this.providerId || 'yunwu'
    const providerConfig = await getProviderConfig(userId, providerId)
    if (!providerConfig.apiKey) {
      throw new Error(`PROVIDER_API_KEY_MISSING: ${providerConfig.id}`)
    }

    const model = this.modelId || typedOptions.modelId || 'gpt-image-2'
    const customEndpoint = readCustomEndpoint(options)
    const baseUrl = normalizeYunwuImageBaseUrl(resolveCustomBaseUrl(providerConfig.baseUrl, customEndpoint))
    const endpoint = `${baseUrl}${YUNWU_IMAGE_ENDPOINT_PATH}`
    const responseFormat = normalizeResponseFormat(typedOptions.responseFormat)
    const quality = normalizeQuality(typedOptions.quality)
    const size = normalizeSize(resolveRawSize(typedOptions), typedOptions.aspectRatio)
    const n = normalizeN(typedOptions.n)

    const form = new FormData()
    form.append('model', model)
    form.append('prompt', prompt)
    form.append('n', String(n))
    form.append('quality', quality)
    form.append('size', size)
    if (responseFormat) form.append('response_format', responseFormat)

    const imageFiles = await Promise.all(referenceImages.map((image, index) => buildImageBlob(image, index)))
    for (const image of imageFiles) {
      form.append('image', image.blob, image.fileName)
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
      body: form,
    })
    const json = await res.json() as unknown
    if (!res.ok) {
      const errorObj = json as { error?: { message?: string }; message?: string }
      const message = errorObj.error?.message ?? errorObj.message ?? 'unknown error'
      throw new Error(`YUNWU_IMAGE_REQUEST_FAILED: HTTP ${res.status} - ${message}`)
    }

    return toImageResult(extractImages(json))
  }
}
