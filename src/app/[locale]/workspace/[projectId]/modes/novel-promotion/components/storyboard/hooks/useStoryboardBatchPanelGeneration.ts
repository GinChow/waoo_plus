'use client'

import { useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import type { NovelPromotionStoryboard } from '@/types/project'
import type { StoryboardPanel } from './useStoryboardState'
import { getErrorMessage } from './storyboard-panel-asset-utils'

interface UseStoryboardBatchPanelGenerationProps {
  sortedStoryboards: NovelPromotionStoryboard[]
  submittingPanelImageIds: Set<string>
  getTextPanels: (storyboard: NovelPromotionStoryboard) => StoryboardPanel[]
  regenerateStoryboardGroupImage: (storyboardId: string, groupNumber: number, count?: number) => Promise<void>
  setIsEpisodeBatchSubmitting: (value: boolean) => void
}

function parseGeneratedCoarseGroupNumbers(raw: string | null | undefined): Set<number> {
  if (!raw) return new Set()
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.flatMap((item): number[] => {
      if (
        item
        && typeof item === 'object'
        && typeof (item as { groupNumber?: unknown }).groupNumber === 'number'
        && typeof (item as { imageUrl?: unknown }).imageUrl === 'string'
        && (item as { imageUrl: string }).imageUrl.trim().length > 0
      ) {
        return [(item as { groupNumber: number }).groupNumber]
      }
      return []
    }))
  } catch {
    return new Set()
  }
}

function collectCoarseGroupNumbers(panels: StoryboardPanel[]): number[] {
  const groupNumbers = new Set<number>()
  for (const panel of panels) {
    groupNumbers.add(panel.parent_group_number ?? 1)
  }
  return Array.from(groupNumbers).sort((left, right) => left - right)
}

export function useStoryboardBatchPanelGeneration({
  sortedStoryboards,
  submittingPanelImageIds,
  getTextPanels,
  regenerateStoryboardGroupImage,
  setIsEpisodeBatchSubmitting,
}: UseStoryboardBatchPanelGenerationProps) {
  const t = useTranslations('storyboard')
  const runningCount = useMemo(() => {
    return sortedStoryboards.reduce((count, storyboard) => {
      const panels = getTextPanels(storyboard)
      return count + panels.filter((panel) => panel.imageTaskRunning || submittingPanelImageIds.has(panel.id)).length
    }, 0)
  }, [getTextPanels, sortedStoryboards, submittingPanelImageIds])

  const pendingPanelCount = useMemo(() => {
    return sortedStoryboards.reduce((count, storyboard) => {
      const panels = getTextPanels(storyboard)
      const generatedGroups = parseGeneratedCoarseGroupNumbers(storyboard.coarseGroupsJson)
      const pendingGroups = collectCoarseGroupNumbers(panels).filter((groupNumber) => !generatedGroups.has(groupNumber))
      return count + pendingGroups.length
    }, 0)
  }, [getTextPanels, sortedStoryboards])

  const handleGenerateAllPanels = useCallback(async () => {
    setIsEpisodeBatchSubmitting(true)
    try {
      const groupsToGenerate: Array<{ storyboardId: string; groupNumber: number }> = []
      sortedStoryboards.forEach((storyboard) => {
        const panels = getTextPanels(storyboard)
        const generatedGroups = parseGeneratedCoarseGroupNumbers(storyboard.coarseGroupsJson)
        collectCoarseGroupNumbers(panels).forEach((groupNumber) => {
          if (!generatedGroups.has(groupNumber)) {
            groupsToGenerate.push({ storyboardId: storyboard.id, groupNumber })
          }
        })
      })

      if (groupsToGenerate.length === 0) {
        _ulogInfo('[批量生成] 没有需要生成的粗镜头多宫格图片')
        return
      }

      _ulogInfo(`[批量生成] 开始生成 ${groupsToGenerate.length} 个粗镜头多宫格分镜图片`)

      const concurrencyLimit = 4
      const results: Array<PromiseSettledResult<unknown>> = []
      for (let index = 0; index < groupsToGenerate.length; index += concurrencyLimit) {
        const batch = groupsToGenerate.slice(index, index + concurrencyLimit)
        const currentBatch = Math.floor(index / concurrencyLimit) + 1
        const totalBatches = Math.ceil(groupsToGenerate.length / concurrencyLimit)
        _ulogInfo(`[批量生成] 处理第 ${currentBatch}/${totalBatches} 批 (${batch.length} 个)`)

        const batchResults = await Promise.allSettled(
          batch.map((item) => regenerateStoryboardGroupImage(item.storyboardId, item.groupNumber, 1)),
        )
        results.push(...batchResults)

        const completed = Math.min(index + concurrencyLimit, groupsToGenerate.length)
        _ulogInfo(`[批量生成] 已完成 ${completed}/${groupsToGenerate.length}`)
      }

      const succeeded = results.filter((result) => result.status === 'fulfilled').length
      const failed = results.filter((result) => result.status === 'rejected').length
      _ulogInfo(`[批量生成] 完成: 成功 ${succeeded}, 失败 ${failed}`)

      if (failed > 0) {
        const failedReasons = results
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result) => result.reason?.message || result.reason)
          .slice(0, 3)
          .join('; ')
        alert(
          t('messages.batchGenerateCompleted', {
            succeeded,
            failed,
            errors: failedReasons || t('common.none'),
          }),
        )
      } else if (succeeded > 0) {
        _ulogInfo(`[批量生成] 全部成功提交 ${succeeded} 个粗镜头多宫格分镜图片`)
      }
    } catch (error: unknown) {
      _ulogError('[批量生成] 发生意外错误:', error)
      alert(
        t('messages.batchGenerateFailed', {
          error: getErrorMessage(error, t('common.unknownError')),
        }),
      )
    } finally {
      setIsEpisodeBatchSubmitting(false)
    }
  }, [getTextPanels, regenerateStoryboardGroupImage, setIsEpisodeBatchSubmitting, sortedStoryboards, t])

  return {
    runningCount,
    pendingPanelCount,
    handleGenerateAllPanels,
  }
}
