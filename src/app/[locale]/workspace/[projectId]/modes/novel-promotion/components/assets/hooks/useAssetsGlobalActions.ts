'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { useAnalyzeProjectGlobalAssets } from '@/lib/query/hooks'
import { useTaskTargetStateMap, type TaskTargetState } from '@/lib/query/hooks/useTaskTargetStateMap'
import { clearTaskTargetOverlay, upsertTaskTargetOverlay } from '@/lib/query/task-target-overlay'
import { waitForTaskResult } from '@/lib/task/client'
import { useQueryClient } from '@tanstack/react-query'

type ToastType = 'success' | 'warning' | 'error'

type ShowToast = (message: string, type?: ToastType, duration?: number) => void
type TranslateValues = Record<string, string | number | Date>
type Translate = (key: string, values?: TranslateValues) => string
type GlobalAnalyzeMode = 'all' | 'characters' | 'locations'

interface UseAssetsGlobalActionsParams {
  projectId: string
  triggerGlobalAnalyze?: boolean
  onGlobalAnalyzeComplete?: () => void
  onRefresh: () => void | Promise<void>
  showToast: ShowToast
  t: Translate
}

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

type GlobalAnalyzeTaskSnapshot = Pick<TaskTargetState, 'phase' | 'runningTaskId' | 'lastError'> | null

function isRunningPhase(phase: TaskTargetState['phase'] | null | undefined): boolean {
  return phase === 'queued' || phase === 'processing'
}

export function isGlobalAnalyzeTaskRunning(taskState: GlobalAnalyzeTaskSnapshot): boolean {
  return isRunningPhase(taskState?.phase)
}

export function resolveGlobalAnalyzeCompletion(
  previousRunningTaskId: string | null,
  taskState: GlobalAnalyzeTaskSnapshot,
) {
  const isRunning = isGlobalAnalyzeTaskRunning(taskState)
  if (isRunning) {
    return {
      status: 'running' as const,
      finishedTaskId: null,
      errorMessage: null,
    }
  }

  if (!previousRunningTaskId) {
    return {
      status: 'idle' as const,
      finishedTaskId: null,
      errorMessage: null,
    }
  }

  if (taskState?.phase === 'failed' || taskState?.lastError) {
    return {
      status: 'failed' as const,
      finishedTaskId: previousRunningTaskId,
      errorMessage: taskState?.lastError?.message ?? null,
    }
  }

  return {
    status: 'succeeded' as const,
    finishedTaskId: previousRunningTaskId,
    errorMessage: null,
  }
}

export function useAssetsGlobalActions({
  projectId,
  triggerGlobalAnalyze = false,
  onGlobalAnalyzeComplete,
  onRefresh,
  showToast,
  t,
}: UseAssetsGlobalActionsParams) {
  const queryClient = useQueryClient()
  const analyzeGlobalAssets = useAnalyzeProjectGlobalAssets(projectId)
  const [currentAnalyzeMode, setCurrentAnalyzeMode] = useState<GlobalAnalyzeMode>('all')
  const hasTriggeredGlobalAnalyze = useRef(false)
  const lastRunningTaskIdRef = useRef<string | null>(null)
  const lastHandledTaskIdRef = useRef<string | null>(null)
  const taskModeRef = useRef<Map<string, GlobalAnalyzeMode>>(new Map())
  const isSubmittingRef = useRef(false)
  const globalAnalyzeTaskStateQuery = useTaskTargetStateMap(
    projectId,
    [{
      targetType: 'NovelPromotionProject',
      targetId: projectId,
      types: ['analyze_global'],
    }],
    {
      enabled: projectId.length > 0,
      staleTime: 2_000,
    },
  )
  const globalAnalyzeTaskState = globalAnalyzeTaskStateQuery.getState('NovelPromotionProject', projectId)
  const isGlobalAnalyzing = isGlobalAnalyzeTaskRunning(globalAnalyzeTaskState)

  const globalAnalyzingState = useMemo(() => {
    if (!isGlobalAnalyzing) return null
    return resolveTaskPresentationState({
      phase: globalAnalyzeTaskState?.phase ?? 'processing',
      intent: globalAnalyzeTaskState?.intent ?? 'analyze',
      resource: 'text',
      hasOutput: false,
    })
  }, [globalAnalyzeTaskState?.intent, globalAnalyzeTaskState?.phase, isGlobalAnalyzing])

  const runGlobalAnalyze = useCallback(async (mode: GlobalAnalyzeMode) => {
    if (isGlobalAnalyzing || isSubmittingRef.current) return

    try {
      isSubmittingRef.current = true
      setCurrentAnalyzeMode(mode)
      upsertTaskTargetOverlay(queryClient, {
        projectId,
        targetType: 'NovelPromotionProject',
        targetId: projectId,
        runningTaskType: 'analyze_global',
        intent: 'analyze',
      })
      const analyzingMessage = mode === 'characters'
        ? t('toolbar.globalAnalyzingCharacters')
        : mode === 'locations'
          ? t('toolbar.globalAnalyzingLocations')
          : t('toolbar.globalAnalyzing')
      showToast(analyzingMessage, 'warning', 60000)

      const submission = await analyzeGlobalAssets.mutateAsync({ mode })
      lastRunningTaskIdRef.current = submission.taskId
      taskModeRef.current.set(submission.taskId, mode)
    } catch (error: unknown) {
      clearTaskTargetOverlay(queryClient, {
        projectId,
        targetType: 'NovelPromotionProject',
        targetId: projectId,
      })
      _ulogError('Global analyze error:', error)
      const failedLabel = mode === 'characters'
        ? t('toolbar.globalAnalyzeCharactersFailed')
        : mode === 'locations'
          ? t('toolbar.globalAnalyzeLocationsFailed')
          : t('toolbar.globalAnalyzeFailed')
      showToast(`${failedLabel}: ${getErrorMessage(error)}`, 'error', 5000)
    } finally {
      isSubmittingRef.current = false
    }
  }, [analyzeGlobalAssets, isGlobalAnalyzing, projectId, queryClient, showToast, t])

  const handleGlobalAnalyze = useCallback(async () => {
    await runGlobalAnalyze('all')
  }, [runGlobalAnalyze])

  const handleGlobalAnalyzeCharacters = useCallback(async () => {
    await runGlobalAnalyze('characters')
  }, [runGlobalAnalyze])

  const handleGlobalAnalyzeLocations = useCallback(async () => {
    await runGlobalAnalyze('locations')
  }, [runGlobalAnalyze])

  useEffect(() => {
    if (isGlobalAnalyzing && globalAnalyzeTaskState?.runningTaskId) {
      lastRunningTaskIdRef.current = globalAnalyzeTaskState.runningTaskId
      const runningMode = taskModeRef.current.get(globalAnalyzeTaskState.runningTaskId)
      if (runningMode) setCurrentAnalyzeMode(runningMode)
    }
  }, [globalAnalyzeTaskState?.runningTaskId, isGlobalAnalyzing])

  useEffect(() => {
    const completion = resolveGlobalAnalyzeCompletion(lastRunningTaskIdRef.current, globalAnalyzeTaskState)
    if (completion.status === 'running' || completion.status === 'idle' || !completion.finishedTaskId) {
      return
    }
    if (lastHandledTaskIdRef.current === completion.finishedTaskId) {
      return
    }

    lastHandledTaskIdRef.current = completion.finishedTaskId
    lastRunningTaskIdRef.current = null

    void (async () => {
      const finishedMode = taskModeRef.current.get(completion.finishedTaskId) || 'all'
      taskModeRef.current.delete(completion.finishedTaskId)
      if (completion.status === 'failed') {
        const failedLabel = finishedMode === 'characters'
          ? t('toolbar.globalAnalyzeCharactersFailed')
          : finishedMode === 'locations'
            ? t('toolbar.globalAnalyzeLocationsFailed')
            : t('toolbar.globalAnalyzeFailed')
        showToast(
          `${failedLabel}: ${completion.errorMessage || failedLabel}`,
          'error',
          5000,
        )
        return
      }

      try {
        const result = await waitForTaskResult(completion.finishedTaskId, {
          intervalMs: 100,
          timeoutMs: 2_000,
        }) as { stats?: { newCharacters?: number; newLocations?: number } }
        await Promise.resolve(onRefresh())
        const message = finishedMode === 'characters'
          ? t('toolbar.globalAnalyzeCharactersSuccess', {
            characters: result.stats?.newCharacters || 0,
          })
          : finishedMode === 'locations'
            ? t('toolbar.globalAnalyzeLocationsSuccess', {
              locations: result.stats?.newLocations || 0,
            })
            : t('toolbar.globalAnalyzeSuccess', {
              characters: result.stats?.newCharacters || 0,
              locations: result.stats?.newLocations || 0,
            })
        showToast(message, 'success', 5000)
      } catch (error: unknown) {
        _ulogError('Global analyze finalize error:', error)
        const failedLabel = finishedMode === 'characters'
          ? t('toolbar.globalAnalyzeCharactersFailed')
          : finishedMode === 'locations'
            ? t('toolbar.globalAnalyzeLocationsFailed')
            : t('toolbar.globalAnalyzeFailed')
        showToast(`${failedLabel}: ${getErrorMessage(error)}`, 'error', 5000)
      }
    })()
  }, [globalAnalyzeTaskState, onRefresh, showToast, t])

  useEffect(() => {
    if (!triggerGlobalAnalyze || hasTriggeredGlobalAnalyze.current || isGlobalAnalyzing) {
      return
    }

    hasTriggeredGlobalAnalyze.current = true
    _ulogInfo('[AssetsStage] 通过 props 触发全局分析')

    const timer = window.setTimeout(() => {
      void (async () => {
        await runGlobalAnalyze('all')
        onGlobalAnalyzeComplete?.()
      })()
    }, 500)

    return () => window.clearTimeout(timer)
  }, [isGlobalAnalyzing, onGlobalAnalyzeComplete, runGlobalAnalyze, triggerGlobalAnalyze])

  return {
    isGlobalAnalyzing,
    globalAnalyzingState,
    currentAnalyzeMode,
    handleGlobalAnalyze,
    handleGlobalAnalyzeCharacters,
    handleGlobalAnalyzeLocations,
  }
}
