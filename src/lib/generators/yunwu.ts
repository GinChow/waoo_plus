/**
 * Yunwu（云雾中转）视频生成器
 *
 * 复用 ViduVideoGenerator 的参数校验和请求体构造逻辑，
 * 仅覆盖认证头和 externalId 前缀：
 * - 认证：Bearer（Vidu 官方用 Token）
 * - externalId: YUNWU:VIDEO:... 便于轮询时识别
 */

import sharp from 'sharp'
import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { getProviderConfig } from '@/lib/api-config'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { ensureOutboundImageUrl, isOutboundCosConfigured } from '@/lib/media/outbound-cos'
import {
    GenerateResult,
    VideoGenerateParams,
    readCustomEndpoint,
} from './base'
import { ViduVideoGenerator, ViduModelSpec, VIDU_MODEL_SPECS } from './vidu'

const PROVIDER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// 提交 POST 的超时：正常情况下 body 已是几百字节的 URL，应秒回 task_id；
// 卡住时快速失败而非吊死，交给上层重试（重试已用 external_task_id 幂等）。
const YUNWU_OMNI_SUBMIT_TIMEOUT_MS = 180_000

/**
 * 把 provider id 编码进 externalId，便于轮询时用「创建任务的那个 provider」
 * 解析 apiKey/baseUrl —— 与 async-poll.ts 的 decodeProviderId 对称。
 */
function encodeYunwuProviderToken(providerId: string): string {
    const value = providerId.trim()
    const prefix = 'openai-compatible:'
    if (value.startsWith(prefix)) {
        const uuid = value.slice(prefix.length).trim()
        if (PROVIDER_UUID_PATTERN.test(uuid)) {
            return `u_${uuid.toLowerCase()}`
        }
    }
    return `b64_${Buffer.from(value, 'utf8').toString('base64url')}`
}

export const YUNWU_DEFAULT_BASE_URL = 'https://yunwu.ai/ent/v2'
export const YUNWU_OMNI_DEFAULT_BASE_URL = 'https://yunwu.ai/kling/v1'
const YUNWU_OMNI_ENDPOINT = '/videos/omni-video'
const YUNWU_OMNI_MODELS = new Set(['kling-video-o1', 'kling-v3-omni'])
const YUNWU_OMNI_RATIOS = new Set(['16:9', '9:16', '1:1'])
const YUNWU_OMNI_MODES = new Set(['std', 'pro'])
const YUNWU_OMNI_SOUNDS = new Set(['on', 'off'])
const YUNWU_OMNI_SHOT_TYPES = new Set(['customize', 'intelligence'])

type YunwuOmniModelName = 'kling-video-o1' | 'kling-v3-omni'
type YunwuOmniMode = 'std' | 'pro'
type YunwuOmniSound = 'on' | 'off'
type YunwuOmniShotType = 'customize' | 'intelligence'

interface YunwuOmniImageItem {
    image_url: string
    type?: 'first_frame' | 'end_frame'
}

interface YunwuOmniVideoItem {
    video_url: string
    refer_type?: 'feature' | 'base'
    keep_original_sound?: 'yes' | 'no'
}

interface YunwuOmniElementItem {
    element_id: string | number
}

interface YunwuOmniMultiPromptItem {
    index: number
    prompt: string
    duration: string
}

interface YunwuOmniRequestBody {
    model_name: YunwuOmniModelName
    multi_shot: boolean
    shot_type?: YunwuOmniShotType
    prompt?: string
    multi_prompt?: YunwuOmniMultiPromptItem[]
    negative_prompt?: string
    sound?: YunwuOmniSound
    image_list?: YunwuOmniImageItem[]
    video_list?: YunwuOmniVideoItem[]
    element_list?: YunwuOmniElementItem[]
    mode: YunwuOmniMode
    aspect_ratio?: '16:9' | '9:16' | '1:1'
    duration: string
    watermark_info?: { enabled: boolean }
    callback_url?: string
    external_task_id?: string
}

interface YunwuOmniOptions {
    provider?: string
    modelId?: string
    modelKey?: string
    customEndpoint?: string
    duration?: number | string
    aspectRatio?: string
    aspect_ratio?: string
    mode?: string
    sound?: string
    generateAudio?: boolean
    negativePrompt?: string
    negative_prompt?: string
    watermark?: boolean
    watermarkInfo?: { enabled?: boolean }
    watermark_info?: { enabled?: boolean }
    callbackUrl?: string
    callback_url?: string
    externalTaskId?: string
    external_task_id?: string
    multiShot?: boolean
    multi_shot?: boolean
    shotType?: string
    shot_type?: string
    multiPrompt?: YunwuOmniMultiPromptItem[]
    multi_prompt?: YunwuOmniMultiPromptItem[]
    imageList?: YunwuOmniImageItem[]
    image_list?: YunwuOmniImageItem[]
    videoList?: YunwuOmniVideoItem[]
    video_list?: YunwuOmniVideoItem[]
    elementList?: YunwuOmniElementItem[]
    element_list?: YunwuOmniElementItem[]
    lastFrameImageUrl?: string
    omniUseInputImage?: boolean
}

/**
 * 将任意 yunwu baseUrl 规范化为 Vidu 兼容路径：
 * - 若已包含 /ent/v2，原样返回
 * - 否则去除末尾斜杠后追加 /ent/v2
 */
export function normalizeYunwuBaseUrl(rawBaseUrl: string): string {
    let normalized = rawBaseUrl.replace(/\/+$/, '')
    normalized = normalized.replace(/\/(?:img2video|start-end2video)(?:\/ent\/v\d+)?$/i, '')
    normalized = normalized.replace(/\/+$/, '')
    if (/\/ent\/v\d+$/i.test(normalized)) return normalized
    return `${normalized}/ent/v2`
}

/**
 * 将 yunwu baseUrl 规范化为 Omni Video API 前缀：
 * - 允许用户填 https://yunwu.ai/kling/v1、/v1/kling、/ent/v2 或完整 /videos/omni-video
 * - 最终统一拼接 YUNWU_OMNI_ENDPOINT
 */
export function normalizeYunwuOmniBaseUrl(rawBaseUrl: string): string {
    let normalized = (rawBaseUrl || YUNWU_OMNI_DEFAULT_BASE_URL).trim().replace(/\/+$/, '')
    normalized = normalized.replace(/\/videos\/omni-video(?:\/.*)?$/i, '')
    normalized = normalized.replace(/\/v(\d+(?:beta)?)\/kling(?:\/.*)?$/i, '/kling/v$1')
    normalized = normalized.replace(/(\/v\d+(?:beta)?)\/(?:openai|chat|completions)(?:\/.*)?$/i, '$1')
    normalized = normalized.replace(/\/ent\/v\d+$/i, '')
    normalized = normalized.replace(/\/+$/, '')
    if (/^https?:\/\/[^/]+$/i.test(normalized)) {
        return `${normalized}/kling/v1`
    }
    return normalized || YUNWU_OMNI_DEFAULT_BASE_URL
}

function stripTrailingOpenAICompatVersion(rawBaseUrl: string): string {
    return rawBaseUrl.replace(/\/v\d+(?:beta)?$/i, '')
}

function joinBaseUrlAndEndpoint(baseUrl: string, endpoint: string): string {
    const normalizedBase = baseUrl.replace(/\/+$/, '')
    const normalizedEndpoint = endpoint.replace(/^\/+/, '').replace(/\/+$/, '')
    return `${normalizedBase}/${normalizedEndpoint}`
}

function resolveYunwuOmniRequestLocation(
    providerBaseUrl: string | undefined,
    customEndpoint: string | undefined,
): { baseUrl: string; requestUrl: string } {
    const trimmedEndpoint = customEndpoint?.trim()
    if (trimmedEndpoint) {
        const endpointUrl = /^https?:\/\//i.test(trimmedEndpoint)
            ? trimmedEndpoint.replace(/\/+$/, '')
            : joinBaseUrlAndEndpoint(
                trimmedEndpoint.startsWith('/kling/')
                    ? stripTrailingOpenAICompatVersion(providerBaseUrl || YUNWU_OMNI_DEFAULT_BASE_URL)
                    : (providerBaseUrl || YUNWU_OMNI_DEFAULT_BASE_URL),
                trimmedEndpoint,
            )
        const baseUrl = normalizeYunwuOmniBaseUrl(endpointUrl)
        return {
            baseUrl,
            requestUrl: /\/videos\/omni-video$/i.test(endpointUrl)
                ? endpointUrl
                : `${baseUrl}${YUNWU_OMNI_ENDPOINT}`,
        }
    }

    const baseUrl = normalizeYunwuOmniBaseUrl(providerBaseUrl || YUNWU_OMNI_DEFAULT_BASE_URL)
    return {
        baseUrl,
        requestUrl: `${baseUrl}${YUNWU_OMNI_ENDPOINT}`,
    }
}

function isYunwuOmniModel(modelId: string): modelId is YunwuOmniModelName {
    return YUNWU_OMNI_MODELS.has(modelId)
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined
}

function normalizeOmniImageSource(value: string): string {
    const trimmed = value.trim()
    const marker = ';base64,'
    const markerIndex = trimmed.indexOf(marker)
    return markerIndex === -1 ? trimmed : trimmed.slice(markerIndex + marker.length)
}

// kling-omni-video 单图上限 10MB，留足余量压到 ~6MB 以内
const OMNI_IMAGE_MAX_BYTES = 6 * 1024 * 1024

/**
 * 把（纯）base64 图压缩到 omni 单图上限内：超限则用 sharp 限制最大边 + 降质重编码，
 * 逐档尝试直到落在上限内。解码/压缩失败时回退原图，不阻断提交。
 */
async function compressOmniImageBase64(pureBase64: string): Promise<string> {
    let buffer: Buffer
    try {
        buffer = Buffer.from(pureBase64, 'base64')
    } catch {
        return pureBase64
    }
    if (buffer.length <= OMNI_IMAGE_MAX_BYTES) return pureBase64

    const attempts: Array<{ width: number; quality: number }> = [
        { width: 2048, quality: 82 },
        { width: 1600, quality: 78 },
        { width: 1280, quality: 72 },
        { width: 1024, quality: 65 },
    ]
    let best: Buffer | null = null
    for (const { width, quality } of attempts) {
        try {
            const out = await sharp(buffer)
                .rotate()
                .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality })
                .toBuffer()
            best = out
            if (out.length <= OMNI_IMAGE_MAX_BYTES) break
        } catch (error) {
            _ulogError('[Yunwu Omni] 图片压缩失败，回退原图:', error)
            return pureBase64
        }
    }
    return (best ?? buffer).toString('base64')
}

async function toOmniImageItem(imageUrl: string, type?: YunwuOmniImageItem['type']): Promise<YunwuOmniImageItem> {
    const normalized = imageUrl.startsWith('data:')
        ? normalizeOmniImageSource(imageUrl)
        : normalizeOmniImageSource(await normalizeToBase64ForGeneration(imageUrl))
    return type ? { image_url: normalized, type } : { image_url: normalized }
}

/**
 * 归一化 image_list 出站图片：统一去掉 data URL 前缀、压缩到 omni 单图上限内，
 * COS 已配置时再落临时桶换成公网 URL。
 * - 已经是 http(s) URL：原样保留
 * - COS 未配置（如本地开发）：返回压缩后的纯 base64 内联
 * - 单张上传失败：回退该张压缩后的 base64，不阻断整体提交
 */
async function normalizeOmniImageItemsForOutbound(
    items: YunwuOmniImageItem[],
): Promise<YunwuOmniImageItem[]> {
    if (items.length === 0) {
        return items
    }
    const cosConfigured = isOutboundCosConfigured()
    // 临时诊断：用 _ulogError 确保在 LOG_LEVEL=ERROR 下也可见
    _ulogError(`[Yunwu Omni DIAG] 归一化 image_list: ${items.length} 张, cosConfigured=${cosConfigured}`)
    return await Promise.all(
        items.map(async (item, index) => {
            const src = item.image_url?.trim()
            if (!src || /^https?:\/\//i.test(src)) {
                _ulogError(`[Yunwu Omni DIAG] image[${index}] 跳过归一化（空或已是 URL）: ${String(src).slice(0, 80)}`)
                return item
            }
            // omni 要求纯 base64（不带 data: 前缀），并需控制在单图上限内
            const pureBase64 = normalizeOmniImageSource(src)
            const compressed = await compressOmniImageBase64(pureBase64)
            _ulogError(
                `[Yunwu Omni DIAG] image[${index}] 原始≈${Math.round(Buffer.from(pureBase64, 'base64').length / 1024)}KB`
                + ` 压缩后≈${Math.round(Buffer.from(compressed, 'base64').length / 1024)}KB`,
            )
            if (!cosConfigured) {
                _ulogError(`[Yunwu Omni DIAG] image[${index}] COS 未配置，回退内联 base64`)
                return { ...item, image_url: compressed }
            }
            try {
                const url = await ensureOutboundImageUrl(compressed)
                _ulogError(`[Yunwu Omni DIAG] image[${index}] 已上传 COS: ${url}`)
                return { ...item, image_url: url }
            } catch (error) {
                _ulogError('[Yunwu Omni DIAG] 出站图片上传 COS 失败，回退 base64:', error)
                return { ...item, image_url: compressed }
            }
        }),
    )
}

function assertOmniAllowedOptions(options: Record<string, unknown>) {
    const allowed = new Set([
        'provider',
        'modelId',
        'modelKey',
        'customEndpoint',
        'duration',
        'aspectRatio',
        'aspect_ratio',
        'mode',
        'sound',
        'generateAudio',
        'negativePrompt',
        'negative_prompt',
        'watermark',
        'watermarkInfo',
        'watermark_info',
        'callbackUrl',
        'callback_url',
        'externalTaskId',
        'external_task_id',
        'multiShot',
        'multi_shot',
        'shotType',
        'shot_type',
        'multiPrompt',
        'multi_prompt',
        'imageList',
        'image_list',
        'videoList',
        'video_list',
        'elementList',
        'element_list',
        'lastFrameImageUrl',
        'omniUseInputImage',
        'generationMode',
        'resolution',
    ])

    for (const [key, value] of Object.entries(options)) {
        if (value === undefined) continue
        if (!allowed.has(key)) {
            throw new Error(`YUNWU_OMNI_VIDEO_OPTION_UNSUPPORTED: ${key}`)
        }
    }
}

function normalizeOmniDuration(value: unknown): string {
    const raw = value === undefined ? '5' : String(value).trim()
    const duration = Math.floor(Number(raw))
    if (!Number.isFinite(duration)) {
        throw new Error(`YUNWU_OMNI_VIDEO_OPTION_UNSUPPORTED: duration=${String(value)}`)
    }
    return String(Math.min(15, Math.max(3, duration)))
}

function normalizeOmniMode(value: unknown): YunwuOmniMode {
    const raw = readString(value) || 'pro'
    if (!YUNWU_OMNI_MODES.has(raw)) {
        throw new Error(`YUNWU_OMNI_VIDEO_OPTION_UNSUPPORTED: mode=${raw}`)
    }
    return raw as YunwuOmniMode
}

function normalizeOmniSound(options: YunwuOmniOptions): YunwuOmniSound {
    if (typeof options.sound === 'string') {
        const raw = options.sound.trim()
        if (!YUNWU_OMNI_SOUNDS.has(raw)) {
            throw new Error(`YUNWU_OMNI_VIDEO_OPTION_UNSUPPORTED: sound=${raw}`)
        }
        return raw as YunwuOmniSound
    }
    return 'on'
}

function normalizeOmniAspectRatio(options: YunwuOmniOptions): YunwuOmniRequestBody['aspect_ratio'] {
    const raw = readString(options.aspectRatio) || readString(options.aspect_ratio)
    if (!raw) return undefined
    if (!YUNWU_OMNI_RATIOS.has(raw)) {
        throw new Error(`YUNWU_OMNI_VIDEO_OPTION_UNSUPPORTED: aspectRatio=${raw}`)
    }
    return raw as YunwuOmniRequestBody['aspect_ratio']
}

function normalizeOmniShotType(value: unknown): YunwuOmniShotType {
    const raw = readString(value) || 'customize'
    if (!YUNWU_OMNI_SHOT_TYPES.has(raw)) {
        throw new Error(`YUNWU_OMNI_VIDEO_OPTION_UNSUPPORTED: shotType=${raw}`)
    }
    return raw as YunwuOmniShotType
}

function normalizeOmniMultiPrompt(value: unknown): YunwuOmniMultiPromptItem[] | undefined {
    if (value === undefined) return undefined
    if (!Array.isArray(value)) {
        throw new Error('YUNWU_OMNI_VIDEO_OPTION_INVALID: multiPrompt must be array')
    }
    return value.map((item, index) => {
        if (!item || typeof item !== 'object') {
            throw new Error(`YUNWU_OMNI_VIDEO_OPTION_INVALID: multiPrompt[${index}]`)
        }
        const obj = item as Record<string, unknown>
        const itemIndex = Number(obj.index)
        const itemPrompt = readString(obj.prompt)
        const duration = readString(obj.duration)
        if (!Number.isFinite(itemIndex) || itemIndex <= 0 || !itemPrompt || !duration || !/^\d+$/.test(duration)) {
            throw new Error(`YUNWU_OMNI_VIDEO_OPTION_INVALID: multiPrompt[${index}]`)
        }
        return { index: itemIndex, prompt: itemPrompt, duration }
    })
}

function validateOmniRequest(body: YunwuOmniRequestBody) {
    if (body.prompt && body.prompt.length > 2500) {
        throw new Error('YUNWU_OMNI_VIDEO_OPTION_UNSUPPORTED: prompt length > 2500')
    }
    if (body.multi_shot) {
        if (!body.shot_type) {
            throw new Error('YUNWU_OMNI_VIDEO_OPTION_REQUIRED: shot_type')
        }
        if (body.shot_type === 'customize' && (!body.multi_prompt || body.multi_prompt.length === 0)) {
            throw new Error('YUNWU_OMNI_VIDEO_OPTION_REQUIRED: multi_prompt')
        }
        if (body.shot_type === 'intelligence' && !body.prompt?.trim()) {
            throw new Error('YUNWU_OMNI_VIDEO_OPTION_REQUIRED: prompt')
        }
    } else if (!body.prompt?.trim()) {
        throw new Error('YUNWU_OMNI_VIDEO_OPTION_REQUIRED: prompt')
    }

    if (body.multi_prompt) {
        if (body.multi_prompt.length > 6) {
            throw new Error('YUNWU_OMNI_VIDEO_OPTION_UNSUPPORTED: multi_prompt length > 6')
        }
        const totalDuration = Number(body.duration)
        const sum = body.multi_prompt.reduce((acc, item, index) => {
            if (item.prompt.length > 512) {
                throw new Error(`YUNWU_OMNI_VIDEO_OPTION_UNSUPPORTED: multi_prompt[${index}].prompt length > 512`)
            }
            const duration = Number(item.duration)
            if (!Number.isFinite(duration) || duration < 1) {
                throw new Error(`YUNWU_OMNI_VIDEO_OPTION_INVALID: multi_prompt[${index}].duration`)
            }
            return acc + duration
        }, 0)
        if (Number.isFinite(totalDuration) && sum !== totalDuration) {
            throw new Error('YUNWU_OMNI_VIDEO_OPTION_UNSUPPORTED: multi_prompt duration sum mismatch')
        }
    }

    const videoList = body.video_list ?? []
    const imageList = body.image_list ?? []
    if (videoList.length > 1) {
        throw new Error('YUNWU_OMNI_VIDEO_OPTION_UNSUPPORTED: video_list length > 1')
    }
    if (videoList.length > 0 && body.sound === 'on') {
        throw new Error('YUNWU_OMNI_VIDEO_OPTION_UNSUPPORTED: sound=on with video_list')
    }
    if (videoList.some((video) => video.refer_type === 'base')) {
        const hasFrame = imageList.some((image) => image.type === 'first_frame' || image.type === 'end_frame')
        if (hasFrame) {
            throw new Error('YUNWU_OMNI_VIDEO_OPTION_UNSUPPORTED: base video with frame images')
        }
    }

    const hasFirstFrame = imageList.some((image) => image.type === 'first_frame')
    const hasEndFrame = imageList.some((image) => image.type === 'end_frame')
    if (body.multi_shot && (hasFirstFrame || hasEndFrame)) {
        throw new Error('YUNWU_OMNI_VIDEO_OPTION_UNSUPPORTED: frame images with multi_shot')
    }
    if (hasEndFrame && !hasFirstFrame) {
        throw new Error('YUNWU_OMNI_VIDEO_OPTION_UNSUPPORTED: end_frame without first_frame')
    }
    if (body.model_name === 'kling-video-o1' && imageList.length > 2 && (hasFirstFrame || hasEndFrame)) {
        throw new Error('YUNWU_OMNI_VIDEO_OPTION_UNSUPPORTED: kling-video-o1 frame image count')
    }
    const maxImages = videoList.length > 0 ? 4 : 7
    if (imageList.length > maxImages) {
        throw new Error(`YUNWU_OMNI_VIDEO_OPTION_UNSUPPORTED: image_list length > ${maxImages}`)
    }
}

export class YunwuVideoGenerator extends ViduVideoGenerator {
    protected readonly defaultProviderId = 'yunwu'
    protected readonly defaultBaseUrl = YUNWU_DEFAULT_BASE_URL
    protected readonly flavorTag = 'Yunwu'

    protected buildAuthHeader(apiKey: string): string {
        return `Bearer ${apiKey}`
    }

    protected buildExternalIdPrefix(): string {
        return 'YUNWU:VIDEO'
    }

    protected resolveFlavorBaseUrl(rawBaseUrl: string): string {
        return normalizeYunwuBaseUrl(rawBaseUrl)
    }

    protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
        const options = (params.options || {}) as YunwuOmniOptions & Record<string, unknown>
        const modelId = readString(options.modelId) || 'viduq2-turbo'
        if (isYunwuOmniModel(modelId)) {
            return await this.generateOmniVideo(params, modelId)
        }
        return await super.doGenerate(params)
    }

    private async generateOmniVideo(
        params: VideoGenerateParams,
        modelName: YunwuOmniModelName,
    ): Promise<GenerateResult> {
        const { userId, imageUrl, prompt = '', options = {} } = params
        const rawOptions = options as YunwuOmniOptions & Record<string, unknown>
        assertOmniAllowedOptions(rawOptions)

        const providerId = readString(rawOptions.provider) || this.defaultProviderId
        const { apiKey, baseUrl: providerBaseUrl } = await getProviderConfig(userId, providerId)
        const customEndpoint = readCustomEndpoint(rawOptions)
        const { baseUrl, requestUrl } = resolveYunwuOmniRequestLocation(providerBaseUrl, customEndpoint)

        const duration = normalizeOmniDuration(rawOptions.duration)
        const mode = normalizeOmniMode(rawOptions.mode ?? rawOptions.resolution)
        const sound = normalizeOmniSound(rawOptions)
        const aspectRatio = normalizeOmniAspectRatio(rawOptions)
        const multiShot = readBoolean(rawOptions.multiShot) ?? readBoolean(rawOptions.multi_shot) ?? false
        const shotType = multiShot ? normalizeOmniShotType(rawOptions.shotType ?? rawOptions.shot_type) : undefined
        const multiPrompt = normalizeOmniMultiPrompt(rawOptions.multiPrompt ?? rawOptions.multi_prompt)
        const imageList = [
            ...((rawOptions.imageList || rawOptions.image_list || []) as YunwuOmniImageItem[]),
        ]
        const shouldUseInputImage = rawOptions.omniUseInputImage !== false && !multiShot
        if (shouldUseInputImage) {
            imageList.unshift(await toOmniImageItem(imageUrl, 'first_frame'))
        }
        const lastFrameImageUrl = readString(rawOptions.lastFrameImageUrl)
        if (lastFrameImageUrl) {
            imageList.push(await toOmniImageItem(lastFrameImageUrl, 'end_frame'))
        }
        const outboundImageList = await normalizeOmniImageItemsForOutbound(imageList)

        const body: YunwuOmniRequestBody = {
            model_name: modelName,
            multi_shot: multiShot,
            ...(shotType ? { shot_type: shotType } : {}),
            ...(multiShot && shotType === 'customize' ? { multi_prompt: multiPrompt } : { prompt }),
            ...(multiShot && shotType === 'intelligence' ? { prompt } : {}),
            ...(readString(rawOptions.negativePrompt) || readString(rawOptions.negative_prompt)
                ? { negative_prompt: readString(rawOptions.negativePrompt) || readString(rawOptions.negative_prompt) }
                : {}),
            sound,
            ...(outboundImageList.length > 0 ? { image_list: outboundImageList } : {}),
            ...((rawOptions.videoList || rawOptions.video_list)
                ? { video_list: (rawOptions.videoList || rawOptions.video_list) as YunwuOmniVideoItem[] }
                : {}),
            ...((rawOptions.elementList || rawOptions.element_list)
                ? { element_list: (rawOptions.elementList || rawOptions.element_list) as YunwuOmniElementItem[] }
                : {}),
            mode,
            ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
            duration,
            ...(rawOptions.watermarkInfo || rawOptions.watermark_info
                ? { watermark_info: { enabled: Boolean((rawOptions.watermarkInfo || rawOptions.watermark_info)?.enabled) } }
                : rawOptions.watermark !== undefined
                    ? { watermark_info: { enabled: Boolean(rawOptions.watermark) } }
                    : {}),
            ...(readString(rawOptions.callbackUrl) || readString(rawOptions.callback_url)
                ? { callback_url: readString(rawOptions.callbackUrl) || readString(rawOptions.callback_url) }
                : {}),
            ...(readString(rawOptions.externalTaskId) || readString(rawOptions.external_task_id)
                ? { external_task_id: readString(rawOptions.externalTaskId) || readString(rawOptions.external_task_id) }
                : {}),
        }

        validateOmniRequest(body)

        const logPrefix = `[Yunwu Omni Video ${modelName}]`
        _ulogInfo(`${logPrefix} 提交任务`)
        _ulogInfo(`${logPrefix} - Endpoint: ${requestUrl}`)
        // 临时诊断：确认实际出站的 image_list 是 URL 还是内联 base64、各自多大
        _ulogError(`[Yunwu Omni DIAG] 出站 image_list (${body.image_list?.length ?? 0} 张):`,
            (body.image_list ?? []).map((img, i) => {
                const u = img.image_url || ''
                const isUrl = /^https?:\/\//i.test(u)
                return `image[${i}] type=${img.type ?? 'none'} ${isUrl ? `URL=${u}` : `base64≈${Math.round(u.length / 1024)}KB`}`
            }),
        )
        _ulogInfo(`${logPrefix} - 参数摘要:`, {
            mode,
            sound,
            aspectRatio: aspectRatio || null,
            duration,
            multiShot,
            imageCount: body.image_list?.length ?? 0,
            videoCount: body.video_list?.length ?? 0,
            hasPrompt: Boolean(body.prompt),
        })

        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(YUNWU_OMNI_SUBMIT_TIMEOUT_MS),
        })
        const rawBody = await response.text()
        let data: { data?: { task_id?: string }; task_id?: string; status?: string; error?: string; message?: string }
        try {
            data = JSON.parse(rawBody) as typeof data
        } catch {
            _ulogError(`${logPrefix} JSON 解析失败:`, rawBody.slice(0, 500))
            throw new Error(`YUNWU_OMNI_VIDEO_REQUEST_FAILED: invalid JSON - ${rawBody.slice(0, 300)}`)
        }

        if (!response.ok) {
            const message = data.error || data.message || rawBody.slice(0, 500)
            _ulogError(`${logPrefix} 请求失败:`, { status: response.status, message })
            throw new Error(`YUNWU_OMNI_VIDEO_REQUEST_FAILED: HTTP ${response.status} - ${message}`)
        }

        const taskId = readString(data.data?.task_id) || readString(data.task_id)
        if (!taskId) {
            _ulogError(`${logPrefix} 响应中缺少 task_id:`, data)
            throw new Error('YUNWU_OMNI_VIDEO_TASK_ID_MISSING')
        }

        // externalId 带上 provider token —— 轮询时用「创建任务的同一个 provider」
        // 解析 apiKey/baseUrl，避免硬编码 'yunwu' 导致鉴权用错 key。
        // baseUrl 始终编码进 ep_ token：轮询若回退到 providerBaseUrl，对 openai-compatible
        // provider（baseUrl 形如 .../v1）会拼出错误的查询 URL，必须用提交时解析的同一个 baseUrl。
        const providerToken = encodeYunwuProviderToken(providerId)
        const externalId = `YUNWUOMNI:VIDEO:pr_${providerToken}:ep_${Buffer.from(baseUrl, 'utf8').toString('base64url')}:${taskId}`

        _ulogInfo(`${logPrefix} 任务已提交，task_id=${taskId}`)
        return {
            success: true,
            async: true,
            requestId: taskId,
            externalId,
        }
    }

    /**
     * yunwu 是中转网关，可能支持 Vidu 官方尚未在 VIDU_MODEL_SPECS 登记的新型号
     * （如 viduq3-turbo）。未知 modelId 时按系列前缀回退到相近的 spec，不阻断生成。
     */
    protected resolveModelSpec(modelId: string): ViduModelSpec {
        const direct = VIDU_MODEL_SPECS[modelId]
        if (direct) return direct

        const fallbackKey = pickYunwuFallbackSpecKey(modelId)
        const fallback = VIDU_MODEL_SPECS[fallbackKey]
        if (!fallback) {
            throw new Error(`VIDU_VIDEO_MODEL_UNSUPPORTED: ${modelId}`)
        }
        _ulogInfo(`[Yunwu Video] modelId=${modelId} 未登记，回退到 spec=${fallbackKey}`)
        return fallback
    }
}

function pickYunwuFallbackSpecKey(modelId: string): string {
    if (modelId.startsWith('viduq3')) return 'viduq3-pro'
    if (modelId.startsWith('viduq2')) return 'viduq2-pro'
    if (modelId.startsWith('viduq1')) return 'viduq1'
    if (modelId.startsWith('vidu2')) return 'vidu2.0'
    return 'viduq3-pro'
}
