/**
 * Yunwu（云雾中转）视频生成器
 *
 * 复用 ViduVideoGenerator 的参数校验和请求体构造逻辑，
 * 仅覆盖认证头和 externalId 前缀：
 * - 认证：Bearer（Vidu 官方用 Token）
 * - externalId: YUNWU:VIDEO:... 便于轮询时识别
 */

import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { ViduVideoGenerator, ViduModelSpec, VIDU_MODEL_SPECS } from './vidu'

export const YUNWU_DEFAULT_BASE_URL = 'https://yunwu.ai/ent/v2'

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
