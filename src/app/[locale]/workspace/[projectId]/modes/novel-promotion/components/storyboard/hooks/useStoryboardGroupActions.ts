'use client'
import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { useCallback, useRef, useState } from 'react'
import type { NovelPromotionClip, NovelPromotionPanel, NovelPromotionStoryboard } from '@/types/project'
import {
  useCreateProjectStoryboardGroup,
  useDeleteProjectStoryboardGroup,
  useMoveProjectStoryboardGroup,
  useRegenerateProjectStoryboardText,
} from '@/lib/query/hooks'
import { queryKeys } from '@/lib/query/keys'
import { getErrorMessage, isAbortError } from './panel-operations-shared'

export type StoryboardRegenerateStartPhase = 'phase1' | 'phase2' | 'phase3' | 'phase4'

type AddStoryboardGroupOptions = {
  showGlobalPending?: boolean
}

type EpisodeCachePayload = {
  clips?: NovelPromotionClip[]
  storyboards?: NovelPromotionStoryboard[]
}

type CreateStoryboardGroupResult = {
  clip: NovelPromotionClip
  storyboard: NovelPromotionStoryboard
  panel: NovelPromotionPanel
}

interface UseStoryboardGroupActionsProps {
  projectId: string
  episodeId: string
  onRefresh: () => Promise<void> | void
}

export function useStoryboardGroupActions({
  projectId,
  episodeId,
  onRefresh,
}: UseStoryboardGroupActionsProps) {
  const t = useTranslations('storyboard')
  const queryClient = useQueryClient()
  const [submittingStoryboardTextIds, setSubmittingStoryboardTextIds] = useState<Set<string>>(new Set())
  const [addingStoryboardGroup, setAddingStoryboardGroup] = useState(false)
  const [movingClipId, setMovingClipId] = useState<string | null>(null)
  const addingStoryboardGroupRef = useRef(false)

  const deleteStoryboardMutation = useDeleteProjectStoryboardGroup(projectId)
  const regenerateStoryboardTextMutation = useRegenerateProjectStoryboardText(projectId)
  const addStoryboardGroupMutation = useCreateProjectStoryboardGroup(projectId)
  const moveStoryboardGroupMutation = useMoveProjectStoryboardGroup(projectId)

  const refreshStoryboardGroupData = useCallback(() => {
    void Promise.resolve(onRefresh()).catch((error: unknown) => {
      _ulogError('刷新分镜组关联数据失败:', error)
    })
    void queryClient.invalidateQueries({
      queryKey: queryKeys.episodeData(projectId, episodeId),
    })
  }, [episodeId, onRefresh, projectId, queryClient])

  const patchCreatedStoryboardGroup = useCallback((insertIndex: number, result: CreateStoryboardGroupResult) => {
    queryClient.setQueryData(queryKeys.episodeData(projectId, episodeId), (previous: unknown) => {
      if (!previous || typeof previous !== 'object') return previous
      const episode = previous as EpisodeCachePayload
      const previousClips = Array.isArray(episode.clips) ? episode.clips : []
      const previousStoryboards = Array.isArray(episode.storyboards) ? episode.storyboards : []
      const normalizedInsertIndex = Math.max(0, Math.min(insertIndex, previousClips.length))
      const nextClipIds = new Set(previousClips.map((clip) => clip.id))
      const nextStoryboardIds = new Set(previousStoryboards.map((storyboard) => storyboard.id))
      const nextClip = result.clip
      const nextStoryboard = {
        ...result.storyboard,
        panels: [result.panel],
      }

      return {
        ...previous,
        clips: nextClipIds.has(nextClip.id)
          ? previousClips.map((clip) => clip.id === nextClip.id ? nextClip : clip)
          : [
            ...previousClips.slice(0, normalizedInsertIndex),
            nextClip,
            ...previousClips.slice(normalizedInsertIndex),
          ],
        storyboards: nextStoryboardIds.has(nextStoryboard.id)
          ? previousStoryboards.map((storyboard) => storyboard.id === nextStoryboard.id ? nextStoryboard : storyboard)
          : [
            ...previousStoryboards.slice(0, normalizedInsertIndex),
            nextStoryboard,
            ...previousStoryboards.slice(normalizedInsertIndex),
          ],
      }
    })
  }, [episodeId, projectId, queryClient])

  const patchDeletedStoryboardGroup = useCallback((storyboardId: string) => {
    queryClient.setQueryData(queryKeys.episodeData(projectId, episodeId), (previous: unknown) => {
      if (!previous || typeof previous !== 'object') return previous
      const episode = previous as EpisodeCachePayload
      const previousStoryboards = Array.isArray(episode.storyboards) ? episode.storyboards : []
      const targetStoryboard = previousStoryboards.find((storyboard) => storyboard.id === storyboardId)
      if (!targetStoryboard) return previous
      const previousClips = Array.isArray(episode.clips) ? episode.clips : []

      return {
        ...previous,
        storyboards: previousStoryboards.filter((storyboard) => storyboard.id !== storyboardId),
        clips: previousClips.filter((clip) => clip.id !== targetStoryboard.clipId),
      }
    })
  }, [episodeId, projectId, queryClient])

  const deleteStoryboard = useCallback(async (storyboardId: string, panelCount: number) => {
    if (!confirm(t('confirm.deleteGroup', { count: panelCount }))) {
      return
    }
    try {
      await deleteStoryboardMutation.mutateAsync({ storyboardId })
      patchDeletedStoryboardGroup(storyboardId)
      refreshStoryboardGroupData()
    } catch (error: unknown) {
      _ulogError('删除分镜组失败:', error)
      alert(
        t('messages.deleteGroupFailed', {
          error: getErrorMessage(error, t('common.unknownError')),
        }),
      )
    }
  }, [deleteStoryboardMutation, patchDeletedStoryboardGroup, refreshStoryboardGroupData, t])

  const regenerateStoryboardText = useCallback(async (
    storyboardId: string,
    startPhase: StoryboardRegenerateStartPhase = 'phase1',
  ) => {
    if (submittingStoryboardTextIds.has(storyboardId)) return
    setSubmittingStoryboardTextIds((previous) => new Set(previous).add(storyboardId))

    try {
      await regenerateStoryboardTextMutation.mutateAsync({ storyboardId, startPhase })
      _ulogInfo('[重新生成分镜] 任务完成')
      await onRefresh()
    } catch (error: unknown) {
      if (isAbortError(error)) {
        _ulogInfo('请求被中断（可能是页面刷新），后端仍在执行')
        return
      }
      _ulogError('重新生成分镜失败:', error)
      alert(
        t('messages.regenerateGroupFailed', {
          error: getErrorMessage(error, t('common.unknownError')),
        }),
      )
    } finally {
      setSubmittingStoryboardTextIds((previous) => {
        const next = new Set(previous)
        next.delete(storyboardId)
        return next
      })
    }
  }, [onRefresh, regenerateStoryboardTextMutation, submittingStoryboardTextIds, t])

  const addStoryboardGroup = useCallback(async (
    insertIndex: number,
    options: AddStoryboardGroupOptions = {},
  ) => {
    if (addingStoryboardGroupRef.current) return
    addingStoryboardGroupRef.current = true
    if (options.showGlobalPending) {
      setAddingStoryboardGroup(true)
    }
    try {
      const result = await addStoryboardGroupMutation.mutateAsync({ episodeId, insertIndex }) as CreateStoryboardGroupResult
      patchCreatedStoryboardGroup(insertIndex, result)
      refreshStoryboardGroupData()
    } catch (error: unknown) {
      _ulogError('添加分镜组失败:', error)
      alert(
        t('messages.addGroupFailed', {
          error: getErrorMessage(error, t('common.unknownError')),
        }),
      )
    } finally {
      addingStoryboardGroupRef.current = false
      if (options.showGlobalPending) {
        setAddingStoryboardGroup(false)
      }
    }
  }, [addStoryboardGroupMutation, episodeId, patchCreatedStoryboardGroup, refreshStoryboardGroupData, t])

  const moveStoryboardGroup = useCallback(async (clipId: string, direction: 'up' | 'down') => {
    if (movingClipId) return
    setMovingClipId(clipId)
    try {
      await moveStoryboardGroupMutation.mutateAsync({ episodeId, clipId, direction })
      refreshStoryboardGroupData()
    } catch (error: unknown) {
      _ulogError('移动分镜组失败:', error)
      alert(
        t('messages.moveGroupFailed', {
          error: getErrorMessage(error, t('common.unknownError')),
        }),
      )
    } finally {
      setMovingClipId(null)
    }
  }, [episodeId, moveStoryboardGroupMutation, movingClipId, refreshStoryboardGroupData, t])

  return {
    submittingStoryboardTextIds,
    addingStoryboardGroup,
    movingClipId,
    deleteStoryboard,
    regenerateStoryboardText,
    addStoryboardGroup,
    moveStoryboardGroup,
  }
}
