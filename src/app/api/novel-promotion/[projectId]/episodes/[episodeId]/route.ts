import { logError as _ulogError } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { attachMediaFieldsToProject } from '@/lib/media/attach'
import { resolveMediaRefFromLegacyValue } from '@/lib/media/service'

function extractPanelsFromArtifactPayload(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  if (Array.isArray(record.panels)) return record.panels
  const nested = record.output
  if (nested && typeof nested === 'object') {
    const nestedPanels = (nested as Record<string, unknown>).panels
    if (Array.isArray(nestedPanels)) return nestedPanels
  }
  return []
}

function toCompactParentGroupMappingJson(panels: unknown[]): string | null {
  const mapping: Array<[number, number]> = []
  for (let index = 0; index < panels.length; index += 1) {
    const panel = panels[index]
    if (!panel || typeof panel !== 'object') continue
    const row = panel as Record<string, unknown>
    const panelNumberRaw = row.panel_number
    const parentGroupRaw = row.parent_group_number
    if (typeof panelNumberRaw !== 'number' || typeof parentGroupRaw !== 'number') continue
    mapping.push([panelNumberRaw, parentGroupRaw])
  }
  if (mapping.length === 0) return null
  return JSON.stringify(mapping)
}

async function backfillStoryboardTextJsonFromArtifacts(params: {
  projectId: string
  episodeId: string
  storyboards: Array<{ id: string; clipId: string; storyboardTextJson: string | null }>
}) {
  const missing = params.storyboards.filter((item) => !item.storyboardTextJson)
  if (missing.length === 0) return

  const latestRun = await prisma.graphRun.findFirst({
    where: {
      projectId: params.projectId,
      workflowType: 'script_to_storyboard_run',
      targetId: params.episodeId,
      status: 'completed',
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (!latestRun) return

  await Promise.all(
    missing.map(async (storyboard) => {
      const phase3Artifact = await prisma.graphArtifact.findFirst({
        where: {
          runId: latestRun.id,
          refId: storyboard.clipId,
          artifactType: 'storyboard.clip.phase3',
        },
        select: { payload: true },
      })
      const phase2Artifact = phase3Artifact
        ? null
        : await prisma.graphArtifact.findFirst({
          where: {
            runId: latestRun.id,
            refId: storyboard.clipId,
            artifactType: 'storyboard.clip.phase2.cine',
          },
          select: { payload: true },
        })

      const panels = extractPanelsFromArtifactPayload(phase3Artifact?.payload ?? phase2Artifact?.payload)
      const compactMapping = toCompactParentGroupMappingJson(panels)
      if (!compactMapping) return
      await prisma.novelPromotionStoryboard.update({
        where: { id: storyboard.id },
        data: { storyboardTextJson: compactMapping },
      })
      storyboard.storyboardTextJson = compactMapping
    }),
  )
}

/**
 * GET - 获取单个剧集的完整数据
 */
export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  // 获取剧集及其关联数据
  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId },
    include: {
      clips: {
        orderBy: { createdAt: 'asc' }
      },
      storyboards: {
        include: {
          clip: true,
          panels: { orderBy: { panelIndex: 'asc' } }
        },
        orderBy: { createdAt: 'asc' }
      },
      shots: {
        orderBy: { shotId: 'asc' }
      },
      voiceLines: {
        orderBy: { lineIndex: 'asc' }
      }
    }
  })

  if (!episode) {
    throw new ApiError('NOT_FOUND')
  }

  await backfillStoryboardTextJsonFromArtifacts({
    projectId,
    episodeId,
    storyboards: episode.storyboards,
  })

  // 更新最后编辑的剧集ID（异步，不阻塞响应）
  prisma.novelPromotionProject.update({
    where: { projectId },
    data: { lastEpisodeId: episodeId }
  }).catch(err => _ulogError('更新 lastEpisodeId 失败:', err))

  // 转换为稳定媒体 URL（并保留兼容字段）
  const episodeWithSignedUrls = await attachMediaFieldsToProject(episode)

  return NextResponse.json({ episode: episodeWithSignedUrls })
})

/**
 * PATCH - 更新剧集信息
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { name, description, novelText, audioUrl, srtContent } = body

  const updateData: Prisma.NovelPromotionEpisodeUncheckedUpdateInput = {}
  if (name !== undefined) updateData.name = name.trim()
  if (description !== undefined) updateData.description = description?.trim() || null
  if (novelText !== undefined) updateData.novelText = novelText
  if (audioUrl !== undefined) {
    updateData.audioUrl = audioUrl
    const media = await resolveMediaRefFromLegacyValue(audioUrl)
    updateData.audioMediaId = media?.id || null
  }
  if (srtContent !== undefined) updateData.srtContent = srtContent

  const episode = await prisma.novelPromotionEpisode.update({
    where: { id: episodeId },
    data: updateData
  })

  return NextResponse.json({ episode })
})

/**
 * DELETE - 删除剧集
 */
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  // 删除剧集（关联数据会级联删除）
  await prisma.novelPromotionEpisode.delete({
    where: { id: episodeId }
  })

  // 如果删除的是最后编辑的剧集，更新 lastEpisodeId
  const novelPromotionProject = await prisma.novelPromotionProject.findUnique({
    where: { projectId }
  })

  if (novelPromotionProject?.lastEpisodeId === episodeId) {
    // 找到另一个剧集作为默认
    const anotherEpisode = await prisma.novelPromotionEpisode.findFirst({
      where: { novelPromotionProjectId: novelPromotionProject.id },
      orderBy: { episodeNumber: 'asc' }
    })

    await prisma.novelPromotionProject.update({
      where: { id: novelPromotionProject.id },
      data: { lastEpisodeId: anotherEpisode?.id || null }
    })
  }

  return NextResponse.json({ success: true })
})
