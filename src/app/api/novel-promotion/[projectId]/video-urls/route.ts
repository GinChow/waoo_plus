import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

interface PanelData {
    id: string
    panelIndex: number | null
    description: string | null
    duration: number | null
    videoUrl: string | null
    lipSyncVideoUrl: string | null
}

interface PanelGroupData {
    id: string
    anchorPanelId: string
    memberPanelIdsJson: string | null
    videoUrl: string | null
    duration: number | null
}

interface StoryboardData {
    id: string
    clipId: string
    panels?: PanelData[]
    panelGroups?: PanelGroupData[]
}

interface ClipData {
    id: string
}

interface EpisodeData {
    storyboards?: StoryboardData[]
    clips?: ClipData[]
}

function resolveVideoExtension(videoKey: string): string {
    const path = videoKey.split(/[?#]/, 1)[0]
    const match = path.match(/\.([a-zA-Z0-9]+)$/)
    const extension = match?.[1]?.toLowerCase()
    return extension && ['mp4', 'mov', 'webm', 'm4v'].includes(extension) ? extension : 'mp4'
}

/**
 * 获取视频下载链接列表（不在服务端下载打包）
 * 适用于客户端直接下载场景，避免大文件传输问题
 */
export const POST = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 解析请求体
    const body = await request.json()
    const { episodeId, panelPreferences } = body as {
        episodeId?: string
        panelPreferences?: Record<string, boolean>  // key: panelKey, value: true=口型同步, false=原始
    }

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult
    const project = authResult.project
    const projectConfig = await prisma.novelPromotionProject.findUnique({
        where: { projectId },
        select: { videoRatio: true }
    })

    // 根据是否指定 episodeId 来获取数据
    let episodes: EpisodeData[] = []

    if (episodeId) {
        // 只获取指定剧集的数据
        const episode = await prisma.novelPromotionEpisode.findUnique({
            where: { id: episodeId },
            include: {
                storyboards: {
                    include: {
                        panels: { orderBy: { panelIndex: 'asc' } },
                        panelGroups: true
                    },
                    orderBy: { createdAt: 'asc' }
                },
                clips: {
                    orderBy: { createdAt: 'asc' }
                }
            }
        })
        if (episode) {
            episodes = [episode]
        }
    } else {
        // 获取所有剧集的数据
        const npData = await prisma.novelPromotionProject.findFirst({
            where: { projectId },
            include: {
                episodes: {
                    include: {
                        storyboards: {
                            include: {
                                panels: { orderBy: { panelIndex: 'asc' } },
                                panelGroups: true
                            },
                            orderBy: { createdAt: 'asc' }
                        },
                        clips: {
                            orderBy: { createdAt: 'asc' }
                        }
                    }
                }
            }
        })
        episodes = npData?.episodes || []
    }

    if (episodes.length === 0) {
        throw new ApiError('NOT_FOUND')
    }

    // 收集所有有视频的 panel
    interface VideoItem {
        fileName: string
        videoUrl: string  // 签名后的完整URL
        clipIndex: number
        panelIndex: number
        panelId: string
        storyboardId: string
        description: string
        durationSeconds: number
        sourceType: 'original' | 'lip-sync'
    }

    // 从 episodes 中获取所有 storyboards 和 clips
    const allStoryboards: StoryboardData[] = []
    const allClips: ClipData[] = []
    for (const episode of episodes) {
        allStoryboards.push(...(episode.storyboards || []))
        allClips.push(...(episode.clips || []))
    }

    interface VideoCandidate extends VideoItem {
        videoKey: string
        desc: string
    }
    const videoCandidates: VideoCandidate[] = []

    // 遍历所有 storyboard 和 panel
    for (const storyboard of allStoryboards) {
        const clipIndex = allClips.findIndex((clip) => clip.id === storyboard.clipId)

        // 组合分镜（linkedToNextPanel 组）的合成视频：在锚点位置输出一次，跳过组内其余成员的个体视频。
        const groups = storyboard.panelGroups || []
        const groupVideoByAnchor = new Map<string, PanelGroupData>()
        const groupedMemberPanelIds = new Set<string>()
        for (const group of groups) {
            let memberIds: string[] = []
            try {
                const parsed = group.memberPanelIdsJson ? JSON.parse(group.memberPanelIdsJson) : []
                if (Array.isArray(parsed)) memberIds = parsed.filter((id): id is string => typeof id === 'string')
            } catch {
                memberIds = []
            }
            if (group.videoUrl) groupVideoByAnchor.set(group.anchorPanelId, group)
            // 非锚点成员在下方循环中跳过（其个体视频不计入，由组合视频覆盖）
            memberIds.filter((id) => id !== group.anchorPanelId).forEach((id) => groupedMemberPanelIds.add(id))
        }

        const panels = storyboard.panels || []
        for (const panel of panels) {
            // 组合视频：锚点 panel 输出组合视频；其余成员跳过
            const anchorGroup = groupVideoByAnchor.get(panel.id)
            if (anchorGroup?.videoUrl) {
                const safeDesc = (panel.description || '镜头').slice(0, 50).replace(/[\\/:*?"<>|]/g, '_')
                videoCandidates.push({
                    fileName: '',
                    videoUrl: '',
                    clipIndex: clipIndex >= 0 ? clipIndex : 999,
                    panelIndex: panel.panelIndex || 0,
                    panelId: panel.id,
                    storyboardId: storyboard.id,
                    description: panel.description || '镜头',
                    durationSeconds: anchorGroup.duration && anchorGroup.duration > 0 ? anchorGroup.duration : 3,
                    sourceType: 'original',
                    videoKey: anchorGroup.videoUrl,
                    desc: safeDesc,
                })
                continue
            }
            if (groupedMemberPanelIds.has(panel.id)) continue

            // 构建 panelKey 用于查找偏好
            const panelKey = `${storyboard.id}-${panel.panelIndex || 0}`
            const preferLipSync = panelPreferences?.[panelKey] ?? true

            // 根据用户偏好选择视频类型
            let videoKey: string | null = null
            let sourceType: 'original' | 'lip-sync' = 'original'

            if (preferLipSync) {
                videoKey = panel.lipSyncVideoUrl || panel.videoUrl
                sourceType = panel.lipSyncVideoUrl ? 'lip-sync' : 'original'
            } else {
                videoKey = panel.videoUrl || panel.lipSyncVideoUrl
                sourceType = panel.videoUrl ? 'original' : 'lip-sync'
            }

            if (videoKey) {
                // 文件名使用描述，清理非法字符
                const safeDesc = (panel.description || '镜头').slice(0, 50).replace(/[\\/:*?"<>|]/g, '_')

                videoCandidates.push({
                    fileName: '',
                    videoUrl: '',
                    clipIndex: clipIndex >= 0 ? clipIndex : 999,
                    panelIndex: panel.panelIndex || 0,
                    panelId: panel.id,
                    storyboardId: storyboard.id,
                    description: panel.description || '镜头',
                    durationSeconds: panel.duration && panel.duration > 0 ? panel.duration : 3,
                    sourceType,
                    videoKey,
                    desc: safeDesc
                })
            }
        }
    }

    // 按 clipIndex 和 panelIndex 排序
    videoCandidates.sort((a, b) => {
        if (a.clipIndex !== b.clipIndex) {
            return a.clipIndex - b.clipIndex
        }
        return a.panelIndex - b.panelIndex
    })

    // 重新分配连续的全局索引并生成代理URL
    const result = videoCandidates.map((video, idx) => {
        const videoKey = video.videoKey
        const safeDesc = video.desc
        const index = idx + 1
        const extension = resolveVideoExtension(videoKey)
        const fileName = `${String(index).padStart(3, '0')}_${safeDesc}.${extension}`

        // 使用代理 URL，避免 CORS 问题
        const proxyUrl = `/api/novel-promotion/${projectId}/video-proxy?key=${encodeURIComponent(videoKey)}`

        return {
            index,
            fileName,
            videoUrl: proxyUrl,
            panelId: video.panelId,
            storyboardId: video.storyboardId,
            panelIndex: video.panelIndex,
            description: video.description,
            durationSeconds: video.durationSeconds,
            sourceType: video.sourceType
        }
    })

    if (result.length === 0) {
        throw new ApiError('INVALID_PARAMS')
    }

    return NextResponse.json({
        projectName: project.name,
        videoRatio: projectConfig?.videoRatio || '16:9',
        videos: result
    })
})
