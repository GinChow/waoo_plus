import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
/**
 * Vidu 视频生成器
 */

import { BaseVideoGenerator, VideoGenerateParams, GenerateResult, resolveCustomBaseUrl, readCustomEndpoint } from './base'
import { getProviderConfig } from '@/lib/api-config'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'

export const VIDU_BASE_URL = 'https://api.vidu.cn/ent/v2'
const VIDU_STANDARD_RATIOS = new Set(['16:9', '9:16', '1:1'])
const VIDU_Q2_EXTRA_RATIOS = new Set(['4:3', '3:4', '21:9', '2:3', '3:2', 'auto'])
const VIDU_AUDIO_TYPES = new Set(['all', 'speech_only', 'sound_effect_only'])
const VIDU_MOVEMENT_AMPLITUDES = new Set(['auto', 'small', 'medium', 'large'])
const VIDU_RATIO_PATTERN = /^(\d{1,4}):(\d{1,4})$/

const MAX_PROMPT_LENGTH = 5000
const MAX_PAYLOAD_LENGTH = 1048576

type ViduGenerationMode = 'normal' | 'firstlastframe'
type ViduAudioType = 'all' | 'speech_only' | 'sound_effect_only'
type ViduMovementAmplitude = 'auto' | 'small' | 'medium' | 'large'
type ViduAspectRatioProfile = 'standard' | 'q2-flex'

type ViduResolutionRule = {
    defaultResolution: string
    resolutionOptions: readonly string[]
}

type ViduModeSpec = {
    defaultDuration: number
    durationOptions: readonly number[]
    resolutionRulesByDuration: Readonly<Record<number, ViduResolutionRule>>
}

export interface ViduModelSpec {
    aspectRatioProfile: ViduAspectRatioProfile
    supportsFirstLastFrame: boolean
    supportsGenerateAudio: boolean
    defaultAudioByMode: Record<ViduGenerationMode, boolean>
    normalMode: ViduModeSpec
    firstLastMode?: ViduModeSpec
}

interface ViduVideoOptions {
    modelId?: string
    duration?: number
    resolution?: string
    aspectRatio?: string
    aspect_ratio?: string
    generateAudio?: boolean
    audio?: boolean
    audioType?: ViduAudioType
    audio_type?: ViduAudioType
    generationMode?: ViduGenerationMode
    lastFrameImageUrl?: string
    seed?: number
    movementAmplitude?: ViduMovementAmplitude
    movement_amplitude?: ViduMovementAmplitude
    bgm?: boolean
    isRec?: boolean
    is_rec?: boolean
    voiceId?: string
    voice_id?: string
    payload?: string
    offPeak?: boolean
    off_peak?: boolean
    watermark?: boolean
    wmPosition?: number
    wm_position?: number
    wmUrl?: string
    wm_url?: string
    metaData?: string
    meta_data?: string
    callbackUrl?: string
    callback_url?: string
}

export interface ViduRequestBody {
    model: string
    images: string[]
    prompt?: string
    duration: number
    resolution: string
    aspect_ratio?: string
    seed?: number
    audio?: boolean
    audio_type?: ViduAudioType
    voice_id?: string
    is_rec?: boolean
    movement_amplitude?: ViduMovementAmplitude
    bgm?: boolean
    payload?: string
    off_peak?: boolean
    watermark?: boolean
    wm_position?: number
    wm_url?: string
    meta_data?: string
    callback_url?: string
}

function isInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value)
}

function isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean'
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function range(start: number, end: number): number[] {
    const out: number[] = []
    for (let value = start; value <= end; value += 1) {
        out.push(value)
    }
    return out
}

function pickFirstDefined<T>(...values: Array<T | undefined>): T | undefined {
    for (const value of values) {
        if (value !== undefined) return value
    }
    return undefined
}

function sanitizeRequestBodyForLog(value: unknown): unknown {
    if (typeof value === 'string') {
        const dataUrlMatch = value.match(/^(data:[^,]+,)([\s\S]*)$/)
        if (dataUrlMatch) {
            return `${dataUrlMatch[1]}[base64 omitted length=${dataUrlMatch[2].length}]`
        }
        return value
    }

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeRequestBodyForLog(item))
    }

    if (value && typeof value === 'object') {
        const next: Record<string, unknown> = {}
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            next[key] = sanitizeRequestBodyForLog(item)
        }
        return next
    }

    return value
}

function buildUniformModeSpec(input: {
    durationOptions: readonly number[]
    defaultDuration: number
    resolutionOptions: readonly string[]
    defaultResolution: string
}): ViduModeSpec {
    const resolutionRulesByDuration: Record<number, ViduResolutionRule> = {}
    for (const duration of input.durationOptions) {
        resolutionRulesByDuration[duration] = {
            defaultResolution: input.defaultResolution,
            resolutionOptions: input.resolutionOptions,
        }
    }

    return {
        defaultDuration: input.defaultDuration,
        durationOptions: input.durationOptions,
        resolutionRulesByDuration,
    }
}

function buildVidu20ModeSpec(): ViduModeSpec {
    return {
        defaultDuration: 4,
        durationOptions: [4, 8],
        resolutionRulesByDuration: {
            4: {
                defaultResolution: '360p',
                resolutionOptions: ['360p', '720p', '1080p'],
            },
            8: {
                defaultResolution: '720p',
                resolutionOptions: ['720p'],
            },
        },
    }
}

const Q3_DURATIONS = range(1, 16)
const Q2_NORMAL_DURATIONS = range(1, 10)
const Q2_FIRSTLAST_DURATIONS = range(1, 8)

export const VIDU_MODEL_SPECS: Record<string, ViduModelSpec> = {
    'viduq3-pro': {
        aspectRatioProfile: 'standard',
        supportsFirstLastFrame: true,
        supportsGenerateAudio: true,
        defaultAudioByMode: {
            normal: true,
            firstlastframe: true,
        },
        normalMode: buildUniformModeSpec({
            durationOptions: Q3_DURATIONS,
            defaultDuration: 5,
            resolutionOptions: ['540p', '720p', '1080p'],
            defaultResolution: '720p',
        }),
        firstLastMode: buildUniformModeSpec({
            durationOptions: Q3_DURATIONS,
            defaultDuration: 5,
            resolutionOptions: ['540p', '720p', '1080p'],
            defaultResolution: '720p',
        }),
    },
    'viduq3-turbo': {
        aspectRatioProfile: 'standard',
        supportsFirstLastFrame: true,
        supportsGenerateAudio: true,
        defaultAudioByMode: {
            normal: true,
            firstlastframe: true,
        },
        normalMode: buildUniformModeSpec({
            durationOptions: Q3_DURATIONS,
            defaultDuration: 5,
            resolutionOptions: ['540p', '720p', '1080p'],
            defaultResolution: '720p',
        }),
        firstLastMode: buildUniformModeSpec({
            durationOptions: Q3_DURATIONS,
            defaultDuration: 5,
            resolutionOptions: ['540p', '720p', '1080p'],
            defaultResolution: '720p',
        }),
    },
    'viduq2-pro-fast': {
        aspectRatioProfile: 'q2-flex',
        supportsFirstLastFrame: true,
        supportsGenerateAudio: true,
        defaultAudioByMode: {
            normal: false,
            firstlastframe: false,
        },
        normalMode: buildUniformModeSpec({
            durationOptions: Q2_NORMAL_DURATIONS,
            defaultDuration: 5,
            resolutionOptions: ['720p', '1080p'],
            defaultResolution: '720p',
        }),
        firstLastMode: buildUniformModeSpec({
            durationOptions: Q2_FIRSTLAST_DURATIONS,
            defaultDuration: 5,
            resolutionOptions: ['720p', '1080p'],
            defaultResolution: '720p',
        }),
    },
    'viduq2-pro': {
        aspectRatioProfile: 'q2-flex',
        supportsFirstLastFrame: true,
        supportsGenerateAudio: true,
        defaultAudioByMode: {
            normal: false,
            firstlastframe: false,
        },
        normalMode: buildUniformModeSpec({
            durationOptions: Q2_NORMAL_DURATIONS,
            defaultDuration: 5,
            resolutionOptions: ['540p', '720p', '1080p'],
            defaultResolution: '720p',
        }),
        firstLastMode: buildUniformModeSpec({
            durationOptions: Q2_FIRSTLAST_DURATIONS,
            defaultDuration: 5,
            resolutionOptions: ['540p', '720p', '1080p'],
            defaultResolution: '720p',
        }),
    },
    'viduq2-turbo': {
        aspectRatioProfile: 'q2-flex',
        supportsFirstLastFrame: true,
        supportsGenerateAudio: true,
        defaultAudioByMode: {
            normal: false,
            firstlastframe: false,
        },
        normalMode: buildUniformModeSpec({
            durationOptions: Q2_NORMAL_DURATIONS,
            defaultDuration: 5,
            resolutionOptions: ['540p', '720p', '1080p'],
            defaultResolution: '720p',
        }),
        firstLastMode: buildUniformModeSpec({
            durationOptions: Q2_FIRSTLAST_DURATIONS,
            defaultDuration: 5,
            resolutionOptions: ['540p', '720p', '1080p'],
            defaultResolution: '720p',
        }),
    },
    'viduq1': {
        aspectRatioProfile: 'standard',
        supportsFirstLastFrame: true,
        supportsGenerateAudio: false,
        defaultAudioByMode: {
            normal: false,
            firstlastframe: false,
        },
        normalMode: buildUniformModeSpec({
            durationOptions: [5],
            defaultDuration: 5,
            resolutionOptions: ['1080p'],
            defaultResolution: '1080p',
        }),
        firstLastMode: buildUniformModeSpec({
            durationOptions: [5],
            defaultDuration: 5,
            resolutionOptions: ['1080p'],
            defaultResolution: '1080p',
        }),
    },
    'viduq1-classic': {
        aspectRatioProfile: 'standard',
        supportsFirstLastFrame: true,
        supportsGenerateAudio: false,
        defaultAudioByMode: {
            normal: false,
            firstlastframe: false,
        },
        normalMode: buildUniformModeSpec({
            durationOptions: [5],
            defaultDuration: 5,
            resolutionOptions: ['1080p'],
            defaultResolution: '1080p',
        }),
        firstLastMode: buildUniformModeSpec({
            durationOptions: [5],
            defaultDuration: 5,
            resolutionOptions: ['1080p'],
            defaultResolution: '1080p',
        }),
    },
    'vidu2.0': {
        aspectRatioProfile: 'standard',
        supportsFirstLastFrame: true,
        supportsGenerateAudio: false,
        defaultAudioByMode: {
            normal: false,
            firstlastframe: false,
        },
        normalMode: buildVidu20ModeSpec(),
        firstLastMode: buildVidu20ModeSpec(),
    },
}

function isQ3Model(modelId: string): boolean {
    return modelId.startsWith('viduq3')
}

function resolveGenerationMode(lastFrameImageUrl: string | undefined): ViduGenerationMode {
    return lastFrameImageUrl ? 'firstlastframe' : 'normal'
}

function normalizeGenerationMode(raw: unknown): ViduGenerationMode | undefined {
    if (raw === undefined) return undefined
    if (raw === 'normal' || raw === 'firstlastframe') return raw
    throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: generationMode=${String(raw)}`)
}

function resolveViduEndpoint(mode: ViduGenerationMode): string {
    return mode === 'firstlastframe' ? '/start-end2video' : '/img2video'
}

function resolveModeSpec(modelSpec: ViduModelSpec, mode: ViduGenerationMode): ViduModeSpec {
    if (mode === 'normal') return modelSpec.normalMode
    const firstLastMode = modelSpec.firstLastMode
    if (!firstLastMode) {
        throw new Error('VIDU_VIDEO_OPTION_UNSUPPORTED: firstlastframe')
    }
    return firstLastMode
}

function resolveResolutionRule(modeSpec: ViduModeSpec, duration: number): ViduResolutionRule {
    const rule = modeSpec.resolutionRulesByDuration[duration]
    if (!rule) {
        throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: duration=${duration}`)
    }
    return rule
}

function isRatioAllowedByProfile(profile: ViduAspectRatioProfile, ratio: string): boolean {
    if (VIDU_STANDARD_RATIOS.has(ratio)) return true
    if (profile !== 'q2-flex') return false

    if (VIDU_Q2_EXTRA_RATIOS.has(ratio)) return true
    const match = ratio.match(VIDU_RATIO_PATTERN)
    if (!match) return false
    const width = Number(match[1])
    const height = Number(match[2])
    return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
}

function normalizeOptionalString(raw: unknown): string | undefined {
    if (raw === undefined) return undefined
    if (!isNonEmptyString(raw)) {
        throw new Error(`VIDU_VIDEO_OPTION_INVALID: expected non-empty string, got ${String(raw)}`)
    }
    return raw.trim()
}

function normalizeOptionalBoolean(raw: unknown, field: string): boolean | undefined {
    if (raw === undefined) return undefined
    if (!isBoolean(raw)) {
        throw new Error(`VIDU_VIDEO_OPTION_INVALID: ${field} must be boolean`)
    }
    return raw
}

export class ViduVideoGenerator extends BaseVideoGenerator {
    /** 子类可覆盖：默认 provider id（用于读取 provider 配置） */
    protected readonly defaultProviderId: string = 'vidu'
    /** 子类可覆盖：默认 base URL（当 provider 未配置 baseUrl 时使用） */
    protected readonly defaultBaseUrl: string = VIDU_BASE_URL
    /** 子类可覆盖：日志前缀标签 */
    protected readonly flavorTag: string = 'Vidu'

    /** 子类可覆盖：认证头格式（Vidu 官方用 Token，yunwu 用 Bearer） */
    protected buildAuthHeader(apiKey: string): string {
        return `Token ${apiKey}`
    }

    /** 子类可覆盖：请求体序列化转换（yunwu 需要把布尔值转成字符串） */
    protected serializeRequestBody(body: ViduRequestBody): unknown {
        return body
    }

    /** 子类可覆盖：构造 externalId 前缀（便于轮询时识别 flavor） */
    protected buildExternalIdPrefix(): string {
        return 'VIDU:VIDEO'
    }

    /** 子类可覆盖：根据 provider 的 baseUrl 推导真正的 API 根（yunwu 需要补 /ent/v2） */
    protected resolveFlavorBaseUrl(rawBaseUrl: string): string {
        return rawBaseUrl
    }

    /**
     * 子类可覆盖：根据 modelId 解析参数 spec
     * - Vidu 官方：严格查表，未知 modelId 抛错
     * - 中转网关（yunwu 等）：未知 modelId 可回退到相近 spec，以支持官方未公开的新型号
     */
    protected resolveModelSpec(modelId: string): ViduModelSpec {
        const spec = VIDU_MODEL_SPECS[modelId]
        if (!spec) {
            throw new Error(`VIDU_VIDEO_MODEL_UNSUPPORTED: ${modelId}`)
        }
        return spec
    }

    protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
        const { userId, imageUrl, prompt = '', options = {} } = params

        const rawOptions = options as ViduVideoOptions
        const providerId = (options as Record<string, unknown>).provider as string | undefined || this.defaultProviderId

        const { apiKey, baseUrl: providerBaseUrl } = await getProviderConfig(userId, providerId)
        const customEndpoint = readCustomEndpoint(options as Record<string, unknown>)

        const modelId = rawOptions.modelId || 'viduq2-turbo'
        const modelSpec = this.resolveModelSpec(modelId)

        const allowedOptionKeys = new Set([
            'provider',
            'modelId',
            'modelKey',
            'duration',
            'resolution',
            'aspectRatio',
            'aspect_ratio',
            'generateAudio',
            'audio',
            'audioType',
            'audio_type',
            'generationMode',
            'lastFrameImageUrl',
            'seed',
            'movementAmplitude',
            'movement_amplitude',
            'bgm',
            'isRec',
            'is_rec',
            'voiceId',
            'voice_id',
            'payload',
            'offPeak',
            'off_peak',
            'watermark',
            'wmPosition',
            'wm_position',
            'wmUrl',
            'wm_url',
            'metaData',
            'meta_data',
            'callbackUrl',
            'callback_url',
            'customEndpoint',
        ])

        for (const [key, value] of Object.entries(options)) {
            if (value === undefined) continue
            if (!allowedOptionKeys.has(key)) {
                throw new Error(`VIDU_VIDEO_OPTION_UNSUPPORTED: ${key}`)
            }
        }

        const lastFrameImageUrl = normalizeOptionalString(rawOptions.lastFrameImageUrl)
        const inferredGenerationMode = resolveGenerationMode(lastFrameImageUrl)
        const requestedGenerationMode = normalizeGenerationMode(rawOptions.generationMode)
        if (requestedGenerationMode && requestedGenerationMode !== inferredGenerationMode) {
            throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: generationMode=${requestedGenerationMode}`)
        }
        const generationMode = requestedGenerationMode || inferredGenerationMode

        if (generationMode === 'firstlastframe' && !modelSpec.supportsFirstLastFrame) {
            throw new Error(`VIDU_VIDEO_OPTION_UNSUPPORTED: firstlastframe for ${modelId}`)
        }

        const modeSpec = resolveModeSpec(modelSpec, generationMode)

        const rawDuration = rawOptions.duration
        if (rawDuration !== undefined) {
            if (!isInteger(rawDuration)) {
                throw new Error('VIDU_VIDEO_OPTION_INVALID: duration must be integer')
            }
        }
        const duration = rawDuration ?? modeSpec.defaultDuration
        if (!modeSpec.durationOptions.includes(duration)) {
            throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: duration=${duration}`)
        }

        const resolutionRule = resolveResolutionRule(modeSpec, duration)
        const rawResolution = rawOptions.resolution
        if (rawResolution !== undefined && !isNonEmptyString(rawResolution)) {
            throw new Error('VIDU_VIDEO_OPTION_INVALID: resolution must be non-empty string')
        }
        const pickedResolution = rawResolution ? rawResolution.trim() : resolutionRule.defaultResolution
        if (!resolutionRule.resolutionOptions.includes(pickedResolution)) {
            throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: resolution=${pickedResolution}`)
        }

        const pickedAspectRatio = pickFirstDefined(rawOptions.aspectRatio, rawOptions.aspect_ratio)
        if (pickedAspectRatio !== undefined) {
            if (!isNonEmptyString(pickedAspectRatio)) {
                throw new Error('VIDU_VIDEO_OPTION_INVALID: aspectRatio must be non-empty string')
            }
            const normalizedRatio = pickedAspectRatio.trim()
            if (!isRatioAllowedByProfile(modelSpec.aspectRatioProfile, normalizedRatio)) {
                throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: aspectRatio=${normalizedRatio}`)
            }
        }

        if (rawOptions.seed !== undefined && !isInteger(rawOptions.seed)) {
            throw new Error('VIDU_VIDEO_OPTION_INVALID: seed must be integer')
        }

        const rawGenerateAudio = pickFirstDefined(rawOptions.generateAudio, rawOptions.audio)
        if (rawGenerateAudio !== undefined && !isBoolean(rawGenerateAudio)) {
            throw new Error('VIDU_VIDEO_OPTION_INVALID: generateAudio must be boolean')
        }
        const resolvedGenerateAudio = rawGenerateAudio ?? modelSpec.defaultAudioByMode[generationMode]
        if (resolvedGenerateAudio && !modelSpec.supportsGenerateAudio) {
            throw new Error(`VIDU_VIDEO_OPTION_UNSUPPORTED: generateAudio for ${modelId}`)
        }

        const rawAudioType = pickFirstDefined(rawOptions.audioType, rawOptions.audio_type)
        if (rawAudioType !== undefined) {
            if (!isNonEmptyString(rawAudioType)) {
                throw new Error('VIDU_VIDEO_OPTION_INVALID: audioType must be non-empty string')
            }
            if (!VIDU_AUDIO_TYPES.has(rawAudioType)) {
                throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: audioType=${rawAudioType}`)
            }
            if (!resolvedGenerateAudio) {
                throw new Error('VIDU_VIDEO_OPTION_UNSUPPORTED: audioType requires generateAudio=true')
            }
        }
        const resolvedAudioType = resolvedGenerateAudio
            ? ((rawAudioType || 'all') as ViduAudioType)
            : undefined

        const movementAmplitude = pickFirstDefined(rawOptions.movementAmplitude, rawOptions.movement_amplitude)
        if (movementAmplitude !== undefined) {
            if (!isNonEmptyString(movementAmplitude)) {
                throw new Error('VIDU_VIDEO_OPTION_INVALID: movementAmplitude must be non-empty string')
            }
            if (!VIDU_MOVEMENT_AMPLITUDES.has(movementAmplitude)) {
                throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: movementAmplitude=${movementAmplitude}`)
            }
        }

        const bgm = normalizeOptionalBoolean(rawOptions.bgm, 'bgm')
        const isRec = normalizeOptionalBoolean(pickFirstDefined(rawOptions.isRec, rawOptions.is_rec), 'isRec')
        const offPeak = normalizeOptionalBoolean(pickFirstDefined(rawOptions.offPeak, rawOptions.off_peak), 'offPeak')
        const watermark = normalizeOptionalBoolean(rawOptions.watermark, 'watermark')

        if (offPeak === true && resolvedGenerateAudio) {
            if (!isQ3Model(modelId)) {
                throw new Error('VIDU_VIDEO_OPTION_UNSUPPORTED: offPeak with generateAudio=true for non-Q3 model')
            }
        }
        if (offPeak === true && isQ3Model(modelId) && !resolvedGenerateAudio) {
            throw new Error('VIDU_VIDEO_OPTION_UNSUPPORTED: offPeak for Q3 requires generateAudio=true')
        }

        const voiceId = normalizeOptionalString(pickFirstDefined(rawOptions.voiceId, rawOptions.voice_id))
        if (voiceId && !resolvedGenerateAudio) {
            throw new Error('VIDU_VIDEO_OPTION_UNSUPPORTED: voiceId requires generateAudio=true')
        }

        const payload = normalizeOptionalString(rawOptions.payload)
        if (payload && payload.length > MAX_PAYLOAD_LENGTH) {
            throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: payload length > ${MAX_PAYLOAD_LENGTH}`)
        }

        const wmPositionRaw = pickFirstDefined(rawOptions.wmPosition, rawOptions.wm_position)
        if (wmPositionRaw !== undefined && !isInteger(wmPositionRaw)) {
            throw new Error('VIDU_VIDEO_OPTION_INVALID: wmPosition must be integer')
        }
        const wmPosition = wmPositionRaw
        if (wmPosition !== undefined && (wmPosition < 1 || wmPosition > 4)) {
            throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: wmPosition=${wmPosition}`)
        }

        const wmUrl = normalizeOptionalString(pickFirstDefined(rawOptions.wmUrl, rawOptions.wm_url))
        const metaData = normalizeOptionalString(pickFirstDefined(rawOptions.metaData, rawOptions.meta_data))
        const callbackUrl = normalizeOptionalString(pickFirstDefined(rawOptions.callbackUrl, rawOptions.callback_url))

        if (prompt.length > MAX_PROMPT_LENGTH) {
            throw new Error(`VIDU_VIDEO_OPTION_VALUE_UNSUPPORTED: prompt length > ${MAX_PROMPT_LENGTH}`)
        }

        const logPrefix = `[${this.flavorTag} Video ${modelId}]`

        const firstFrameDataUrl = imageUrl.startsWith('data:') ? imageUrl : await normalizeToBase64ForGeneration(imageUrl)
        const images: string[] = [firstFrameDataUrl]
        if (generationMode === 'firstlastframe') {
            if (!lastFrameImageUrl) {
                throw new Error('VIDU_VIDEO_OPTION_REQUIRED: lastFrameImageUrl')
            }
            images.push(
                lastFrameImageUrl.startsWith('data:')
                    ? lastFrameImageUrl
                    : await normalizeToBase64ForGeneration(lastFrameImageUrl),
            )
        }

        const requestBody: ViduRequestBody = {
            model: modelId,
            images,
            duration,
            resolution: pickedResolution,
        }

        if (prompt) {
            requestBody.prompt = prompt
        }
        if (pickedAspectRatio) {
            requestBody.aspect_ratio = pickedAspectRatio
        }
        if (rawOptions.seed !== undefined) {
            requestBody.seed = rawOptions.seed
        }
        if (modelSpec.supportsGenerateAudio || rawGenerateAudio !== undefined) {
            requestBody.audio = resolvedGenerateAudio
        }
        if (resolvedAudioType) {
            requestBody.audio_type = resolvedAudioType
        }
        if (voiceId) {
            requestBody.voice_id = voiceId
        }
        if (isRec !== undefined) {
            requestBody.is_rec = isRec
        }
        if (movementAmplitude) {
            requestBody.movement_amplitude = movementAmplitude
        }
        if (bgm !== undefined) {
            requestBody.bgm = bgm
        }
        if (payload) {
            requestBody.payload = payload
        }
        if (offPeak !== undefined) {
            requestBody.off_peak = offPeak
        }
        if (watermark !== undefined) {
            requestBody.watermark = watermark
        }
        if (wmPosition !== undefined) {
            requestBody.wm_position = wmPosition
        }
        if (wmUrl) {
            requestBody.wm_url = wmUrl
        }
        if (metaData) {
            requestBody.meta_data = metaData
        }
        if (callbackUrl) {
            requestBody.callback_url = callbackUrl
        }

        const endpoint = resolveViduEndpoint(generationMode)
        const rawBaseUrl = resolveCustomBaseUrl(providerBaseUrl, customEndpoint) || this.defaultBaseUrl
        const viduBaseUrl = this.resolveFlavorBaseUrl(rawBaseUrl)
        const requestUrl = `${viduBaseUrl}${endpoint}`

        _ulogInfo(`${logPrefix} 提交任务`)
        _ulogInfo(`${logPrefix} - Model: ${modelId}`)
        _ulogInfo(`${logPrefix} - Endpoint: ${requestUrl}`)
        _ulogInfo(`${logPrefix} - Duration: ${duration}s`)
        _ulogInfo(`${logPrefix} - Resolution: ${pickedResolution}`)
        _ulogInfo(`${logPrefix} - Mode: ${generationMode}`)
        _ulogInfo(`${logPrefix} - GenerateAudio: ${resolvedGenerateAudio}`)
        _ulogInfo(`${logPrefix} - 请求路由诊断:`, {
            providerId,
            providerBaseUrl: providerBaseUrl || null,
            customEndpoint: customEndpoint || null,
            rawBaseUrl,
            resolvedBaseUrl: viduBaseUrl,
            endpoint,
            requestUrl,
        })
        _ulogInfo(`${logPrefix} - 参数摘要:`, {
            duration,
            resolution: pickedResolution,
            aspectRatio: pickedAspectRatio || null,
            generationMode,
            generateAudio: resolvedGenerateAudio,
            audioType: resolvedAudioType || null,
            seed: rawOptions.seed ?? null,
            hasPrompt: Boolean(prompt),
            promptLength: prompt.length,
            imagesCount: images.length,
            firstImageIsDataUrl: firstFrameDataUrl.startsWith('data:'),
            hasLastFrameImage: Boolean(lastFrameImageUrl),
            payloadLength: payload?.length ?? 0,
            hasCallbackUrl: Boolean(callbackUrl),
        })
        _ulogInfo(`${logPrefix} - 完整请求体:`, JSON.stringify(sanitizeRequestBodyForLog(requestBody), null, 2))

        try {
            const authHeader = this.buildAuthHeader(apiKey)
            const finalBody = this.serializeRequestBody(requestBody)

            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: {
                    Authorization: authHeader,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(finalBody),
            })

            const rawBody = await response.text()

            if (!response.ok) {
                _ulogError(`${logPrefix} API请求失败:`, {
                    requestUrl,
                    status: response.status,
                    contentType: response.headers.get('content-type') || null,
                    server: response.headers.get('server') || null,
                    via: response.headers.get('via') || null,
                    xRequestId: response.headers.get('x-request-id') || response.headers.get('x-amzn-requestid') || null,
                    cfRay: response.headers.get('cf-ray') || null,
                    date: response.headers.get('date') || null,
                    bodyHead: rawBody.slice(0, 500),
                })
                throw new Error(`Vidu API Error: ${response.status} - ${rawBody.slice(0, 500)}`)
            }

            const trimmedBody = rawBody.trimStart()
            if (!trimmedBody || trimmedBody[0] === '<') {
                _ulogError(
                    `${logPrefix} 响应非 JSON（疑似网关错误页）:`,
                    `url=${requestUrl}`,
                    `status=${response.status}`,
                    `contentType=${response.headers.get('content-type') || 'unknown'}`,
                    `bodyHead=${rawBody.slice(0, 300)}`,
                )
                throw new Error(
                    `Vidu API Error: 服务返回非 JSON 响应（status=${response.status}，可能是中转网关错误页或 URL 路径不正确）。URL=${requestUrl}`,
                )
            }

            let data: { task_id?: string; state?: string }
            try {
                data = JSON.parse(rawBody)
            } catch (parseError) {
                _ulogError(
                    `${logPrefix} JSON 解析失败:`,
                    `url=${requestUrl}`,
                    `status=${response.status}`,
                    `bodyHead=${rawBody.slice(0, 300)}`,
                    parseError,
                )
                throw new Error(`Vidu API Error: 响应 JSON 解析失败 - ${rawBody.slice(0, 300)}`)
            }

            const taskId = data.task_id
            if (!taskId) {
                _ulogError(`${logPrefix} 响应中缺少 task_id:`, data)
                throw new Error('Vidu未返回task_id')
            }

            const state = data.state
            if (state === 'failed') {
                _ulogError(`${logPrefix} 任务提交失败:`, data)
                throw new Error('Vidu: 任务提交失败')
            }

            _ulogInfo(`${logPrefix} 任务已提交，task_id=${taskId}, state=${state}`)

            const idPrefix = this.buildExternalIdPrefix()
            const useCustomBase = viduBaseUrl !== this.defaultBaseUrl
            const externalId = useCustomBase
                ? `${idPrefix}:ep_${Buffer.from(viduBaseUrl, 'utf8').toString('base64url')}:${taskId}`
                : `${idPrefix}:${taskId}`

            return {
                success: true,
                async: true,
                requestId: taskId,
                externalId,
            }
        } catch (error: unknown) {
            _ulogError(`${logPrefix} 生成失败:`, error)
            throw error
        }
    }
}
