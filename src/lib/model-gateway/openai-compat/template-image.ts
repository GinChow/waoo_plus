import { logInfo as _ulogInfo } from '@/lib/logging/core'
import type { GenerateResult } from '@/lib/generators/base'
import type { OpenAICompatImageRequest } from '../types'
import {
  buildRenderedTemplateRequest,
  buildTemplateVariables,
  extractTemplateError,
  normalizeResponseJson,
  readJsonPath,
} from '@/lib/openai-compat-template-runtime'
import { parseModelKeyStrict } from '@/lib/model-config-contract'
import { resolveOpenAICompatClientConfig } from './common'

const OPENAI_COMPAT_PROVIDER_PREFIX = 'openai-compatible:'
const PROVIDER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function encodeProviderToken(providerId: string): string {
  const value = providerId.trim()
  if (value.startsWith(OPENAI_COMPAT_PROVIDER_PREFIX)) {
    const uuid = value.slice(OPENAI_COMPAT_PROVIDER_PREFIX.length).trim()
    if (PROVIDER_UUID_PATTERN.test(uuid)) {
      return `u_${uuid.toLowerCase()}`
    }
  }
  return `b64_${Buffer.from(value, 'utf8').toString('base64url')}`
}

function encodeModelRef(modelRef: string): string {
  return Buffer.from(modelRef, 'utf8').toString('base64url')
}

function resolveModelRef(request: OpenAICompatImageRequest): string {
  const modelId = typeof request.modelId === 'string' ? request.modelId.trim() : ''
  if (modelId) return modelId
  const parsed = typeof request.modelKey === 'string' ? parseModelKeyStrict(request.modelKey) : null
  if (parsed?.modelId) return parsed.modelId
  throw new Error('OPENAI_COMPAT_IMAGE_MODEL_REF_REQUIRED')
}

function readTemplateOutputUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const urls: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      urls.push(item.trim())
      continue
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const url = (item as { url?: unknown }).url
    if (typeof url === 'string' && url.trim()) {
      urls.push(url.trim())
    }
  }
  return urls
}

export async function generateImageViaOpenAICompatTemplate(
  request: OpenAICompatImageRequest,
): Promise<GenerateResult> {
  if (!request.template) {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_REQUIRED')
  }
  if (request.template.mediaType !== 'image') {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_MEDIA_TYPE_INVALID')
  }

  const config = await resolveOpenAICompatClientConfig(request.userId, request.providerId)
  const firstReference = Array.isArray(request.referenceImages) && request.referenceImages.length > 0
    ? request.referenceImages[0]
    : ''
  const refImages = request.referenceImages || []
  const variables = buildTemplateVariables({
    model: request.modelId || 'gpt-image-1',
    prompt: request.prompt,
    image: firstReference,
    images: refImages,
    aspectRatio: typeof request.options?.aspectRatio === 'string' ? request.options.aspectRatio : undefined,
    resolution: typeof request.options?.resolution === 'string' ? request.options.resolution : undefined,
    size: typeof request.options?.size === 'string' ? request.options.size : undefined,
    extra: request.options,
  })
  // 图片生成场景：大多数 API 的 image 字段期望数组（如 huobao），
  // 将 image 变量也设为数组，使模板中 {{ image }} 和 {{ images }} 等效
  if (refImages.length > 0) {
    variables.image = refImages
  }

  _ulogInfo(`[OpenAICompatTemplate:Image] referenceImageCount=${refImages.length}, templateBodyTemplate=${JSON.stringify(request.template.create.bodyTemplate)?.substring(0, 500)}`)

  const createRequest = await buildRenderedTemplateRequest({
    baseUrl: config.baseUrl,
    endpoint: request.template.create,
    variables,
    defaultAuthHeader: `Bearer ${config.apiKey}`,
  })

  // 自动补全：模板 bodyTemplate 缺少 image/size 字段时，注入到 JSON 请求体中
  if (typeof createRequest.body === 'string') {
    try {
      const bodyObj = JSON.parse(createRequest.body)
      if (bodyObj && typeof bodyObj === 'object' && !Array.isArray(bodyObj)) {
        let injected = false
        if (refImages.length > 0 && !('image' in bodyObj) && !('images' in bodyObj)) {
          bodyObj.image = refImages
          injected = true
        }
        if (!('size' in bodyObj)) {
          const ar = typeof request.options?.aspectRatio === 'string' ? request.options.aspectRatio.trim() : ''
          if (ar) {
            bodyObj.size = ar.replace(':', 'x')
            injected = true
          }
        }
        if (injected) {
          createRequest.body = JSON.stringify(bodyObj)
          _ulogInfo(`[OpenAICompatTemplate:Image] auto-injected fields into request body, imageCount=${refImages.length}, size=${bodyObj.size || 'none'}`)
        }
      }
    } catch {
      // body 不是 JSON，跳过注入
    }
  }

  // 打印实际发送的请求体（截断 base64 避免日志过大）
  let bodySnippet = ''
  if (typeof createRequest.body === 'string') {
    bodySnippet = createRequest.body.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]{50,}/g, 'data:image/...BASE64_TRUNCATED...').substring(0, 1000)
  }
  _ulogInfo(`[OpenAICompatTemplate:Image] requestUrl=${createRequest.endpointUrl}, method=${createRequest.method}, bodySnippet=${bodySnippet}`)

  if (['POST', 'PUT', 'PATCH'].includes(createRequest.method) && !createRequest.body) {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_CREATE_BODY_REQUIRED')
  }
  const response = await fetch(createRequest.endpointUrl, {
    method: createRequest.method,
    headers: createRequest.headers,
    ...(createRequest.body ? { body: createRequest.body } : {}),
  })
  const rawText = await response.text().catch(() => '')
  const payload = normalizeResponseJson(rawText)
  if (!response.ok) {
    throw new Error(extractTemplateError(request.template, payload, response.status))
  }

  if (request.template.mode === 'sync') {
    const outputUrls = readTemplateOutputUrls(
      readJsonPath(payload, request.template.response.outputUrlsPath),
    )
    if (outputUrls.length > 0) {
      const first = outputUrls[0]
      return {
        success: true,
        imageUrl: first,
        ...(outputUrls.length > 1 ? { imageUrls: outputUrls } : {}),
      }
    }

    const outputUrl = readJsonPath(payload, request.template.response.outputUrlPath)
    if (typeof outputUrl === 'string' && outputUrl.trim().length > 0) {
      return {
        success: true,
        imageUrl: outputUrl.trim(),
      }
    }
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_OUTPUT_NOT_FOUND')
  }

  const taskIdRaw = readJsonPath(payload, request.template.response.taskIdPath)
  const taskId = typeof taskIdRaw === 'string' ? taskIdRaw.trim() : ''
  if (!taskId) {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_TASK_ID_NOT_FOUND')
  }
  const providerToken = encodeProviderToken(config.providerId)
  const modelRefToken = encodeModelRef(resolveModelRef(request))
  return {
    success: true,
    async: true,
    requestId: taskId,
    externalId: `OCOMPAT:IMAGE:${providerToken}:${modelRefToken}:${taskId}`,
  }
}
