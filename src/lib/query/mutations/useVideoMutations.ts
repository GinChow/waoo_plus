import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import { apiFetch } from '@/lib/api-fetch'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import { invalidateQueryTemplates, requestJsonWithError } from './mutation-shared'
import { logInfo as _ulogInfo, logWarn as _ulogWarn } from '@/lib/logging/core'

type EpisodeCache = {
  storyboards?: Array<Record<string, unknown>>
}

function summarizeVideoUrl(value: string | null | undefined): string {
  if (!value) return ''
  return value.length > 96 ? `${value.slice(0, 48)}...${value.slice(-24)}` : value
}

function readMutationVideoUrl(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && typeof (data as { videoUrl?: unknown }).videoUrl === 'string') {
    return (data as { videoUrl: string }).videoUrl
  }
  return fallback
}

function patchEpisodeCoarseGroupVideo(
  previous: unknown,
  params: { storyboardId: string; groupNumber: number; videoUrl: string | null },
): unknown {
  if (!previous || typeof previous !== 'object' || Array.isArray(previous)) {
    _ulogWarn('[VideoHistoryTrace][cache patch group] skip: invalid episode cache', {
      storyboardId: params.storyboardId,
      groupNumber: params.groupNumber,
      videoUrl: summarizeVideoUrl(params.videoUrl),
      previousType: typeof previous,
    })
    return previous
  }
  const episode = previous as EpisodeCache
  if (!Array.isArray(episode.storyboards)) {
    _ulogWarn('[VideoHistoryTrace][cache patch group] skip: no storyboards in episode cache', {
      storyboardId: params.storyboardId,
      groupNumber: params.groupNumber,
      videoUrl: summarizeVideoUrl(params.videoUrl),
      episodeKeys: Object.keys(episode),
    })
    return previous
  }

  return {
    ...episode,
    storyboards: episode.storyboards.map((storyboard) => {
      if (storyboard.id !== params.storyboardId || typeof storyboard.coarseGroupsJson !== 'string') return storyboard
      try {
        const groups = JSON.parse(storyboard.coarseGroupsJson)
        if (!Array.isArray(groups)) {
          _ulogWarn('[VideoHistoryTrace][cache patch group] skip: coarseGroupsJson is not array', {
            storyboardId: params.storyboardId,
            groupNumber: params.groupNumber,
          })
          return storyboard
        }
        const before = groups.find((group) =>
          group && typeof group === 'object' && (group as { groupNumber?: unknown }).groupNumber === params.groupNumber
        ) as { videoUrl?: string; videoHistory?: unknown[] } | undefined
        let matched = false
        const nextGroups = groups.map((group) => {
          if (!group || typeof group !== 'object') return group
          if ((group as { groupNumber?: unknown }).groupNumber !== params.groupNumber) return group
          matched = true
          return { ...group, videoUrl: params.videoUrl }
        })
        _ulogInfo('[VideoHistoryTrace][cache patch group] patched episode coarse group', {
          storyboardId: params.storyboardId,
          groupNumber: params.groupNumber,
          matched,
          beforeVideoUrl: summarizeVideoUrl(before?.videoUrl),
          nextVideoUrl: summarizeVideoUrl(params.videoUrl),
          historyCount: before?.videoHistory?.length ?? 0,
        })
        return {
          ...storyboard,
          coarseGroupsJson: JSON.stringify(nextGroups),
        }
      } catch {
        _ulogWarn('[VideoHistoryTrace][cache patch group] skip: coarseGroupsJson parse failed', {
          storyboardId: params.storyboardId,
          groupNumber: params.groupNumber,
        })
        return storyboard
      }
    }),
  }
}

function patchEpisodePanelVideo(
  previous: unknown,
  params: { panelId: string; videoUrl: string | null; videoStorageKey?: string | null; videoHistory?: unknown[] },
): unknown {
  if (!previous || typeof previous !== 'object' || Array.isArray(previous)) return previous
  const episode = previous as EpisodeCache
  if (!Array.isArray(episode.storyboards)) return previous

  return {
    ...episode,
    storyboards: episode.storyboards.map((storyboard) => {
      const panels = Array.isArray(storyboard.panels) ? storyboard.panels : null
      if (!panels) return storyboard
      return {
        ...storyboard,
        panels: panels.map((panel) => {
          if (!panel || typeof panel !== 'object') return panel
          if ((panel as { id?: unknown }).id !== params.panelId) return panel
          return {
            ...panel,
            videoUrl: params.videoUrl,
            ...(params.videoStorageKey !== undefined ? { videoStorageKey: params.videoStorageKey } : {}),
            ...(params.videoHistory !== undefined ? { videoHistory: JSON.stringify(params.videoHistory) } : {}),
          }
        }),
      }
    }),
  }
}

function readUploadPanelVideoResponse(data: unknown, fallback: { videoUrl: string | null; cosKey: string | null; videoHistory: unknown[] | undefined }) {
  if (!data || typeof data !== 'object') return fallback
  const record = data as { videoUrl?: unknown; cosKey?: unknown; videoHistory?: unknown }
  return {
    videoUrl: typeof record.videoUrl === 'string' ? record.videoUrl : fallback.videoUrl,
    cosKey: typeof record.cosKey === 'string' ? record.cosKey : fallback.cosKey,
    videoHistory: Array.isArray(record.videoHistory) ? record.videoHistory : fallback.videoHistory,
  }
}

/**
 * 获取剧集可下载视频列表（项目）
 */
export function useListProjectEpisodeVideoUrls(projectId: string) {
  return useMutation({
    mutationFn: async (payload: {
      episodeId: string
      panelPreferences: Record<string, boolean>
    }) =>
      await requestJsonWithError(
        `/api/novel-promotion/${projectId}/video-urls`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        '获取视频列表失败',
      ),
  })
}

/**
 * 更新 panel 首尾帧链接状态（项目）
 */
export function useUpdateProjectPanelLink(projectId: string) {
  return useMutation({
    mutationFn: async (payload: {
      storyboardId: string
      panelIndex: number
      linked: boolean
    }) =>
      await requestJsonWithError(
        `/api/novel-promotion/${projectId}/panel-link`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        '保存链接状态失败',
      ),
  })
}

/**
 * 更新两张图组合分镜的「首尾帧模式」开关
 */
export function useUpdateProjectPanelFirstLastFrameMode(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      storyboardId: string
      panelIndex: number
      enabled: boolean
    }) =>
      await requestJsonWithError(
        `/api/novel-promotion/${projectId}/panel-flframe-mode`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        '保存首尾帧模式失败',
      ),
    onSettled: () => {
      invalidateQueryTemplates(queryClient, [queryKeys.projectData(projectId)])
    },
  })
}

/**
 * 更新 Panel 视频提示词
 */
export function useUpdateProjectPanelVideoPrompt(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      storyboardId,
      panelIndex,
      groupNumber,
      value,
      field = 'videoPrompt',
    }: {
      storyboardId: string
      panelIndex: number
      groupNumber?: number
      value: string
      field?: 'videoPrompt' | 'firstLastFramePrompt'
    }) =>
      await requestJsonWithError(
        `/api/novel-promotion/${projectId}/panel`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storyboardId,
            panelIndex,
            ...(groupNumber !== undefined ? { groupNumber } : {}),
            ...(field === 'firstLastFramePrompt'
              ? { firstLastFramePrompt: value }
              : { videoPrompt: value }),
          }),
        },
        'update failed',
      ),
    onSettled: () => {
      invalidateQueryTemplates(queryClient, [queryKeys.projectData(projectId)])
    },
  })
}

/**
 * 更新 Panel 时长（秒）
 */
export function useUpdateProjectPanelDuration(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      storyboardId,
      panelIndex,
      groupNumber,
      duration,
    }: {
      storyboardId: string
      panelIndex: number
      groupNumber?: number
      duration: number | null
    }) =>
      await requestJsonWithError(
        `/api/novel-promotion/${projectId}/panel`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storyboardId,
            panelIndex,
            ...(groupNumber !== undefined ? { groupNumber } : {}),
            duration,
          }),
        },
        'update duration failed',
      ),
    onSettled: () => {
      invalidateQueryTemplates(queryClient, [queryKeys.projectData(projectId)])
    },
  })
}

/**
 * 选择粗镜头历史视频
 */
export function useSelectProjectStoryboardGroupVideo(projectId: string, episodeId?: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { storyboardId: string; groupNumber: number; videoUrl: string }) => {
      _ulogInfo('[VideoHistoryTrace][mutation group select] request', {
        projectId,
        episodeId,
        storyboardId: payload.storyboardId,
        groupNumber: payload.groupNumber,
        requestedVideoUrl: summarizeVideoUrl(payload.videoUrl),
      })
      const res = await apiFetch(`/api/novel-promotion/${projectId}/storyboard-group/select-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      _ulogInfo('[VideoHistoryTrace][mutation group select] response status', {
        projectId,
        episodeId,
        storyboardId: payload.storyboardId,
        groupNumber: payload.groupNumber,
        ok: res.ok,
        status: res.status,
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        _ulogWarn('[VideoHistoryTrace][mutation group select] response error', {
          projectId,
          episodeId,
          storyboardId: payload.storyboardId,
          groupNumber: payload.groupNumber,
          error,
        })
        throw new Error(resolveTaskErrorMessage(error, '选择粗镜头历史视频失败'))
      }
      const data = await res.json()
      _ulogInfo('[VideoHistoryTrace][mutation group select] response data', {
        projectId,
        episodeId,
        storyboardId: payload.storyboardId,
        groupNumber: payload.groupNumber,
        responseVideoUrl: summarizeVideoUrl(typeof data?.videoUrl === 'string' ? data.videoUrl : ''),
        responseCosKey: typeof data?.cosKey === 'string' ? data.cosKey : '',
      })
      return data
    },
    onSuccess: (data, variables) => {
      _ulogInfo('[VideoHistoryTrace][mutation group select] onSuccess', {
        projectId,
        episodeId,
        storyboardId: variables.storyboardId,
        groupNumber: variables.groupNumber,
        requestedVideoUrl: summarizeVideoUrl(variables.videoUrl),
        selectedVideoUrl: summarizeVideoUrl(readMutationVideoUrl(data, variables.videoUrl)),
      })
      if (!episodeId) {
        _ulogWarn('[VideoHistoryTrace][mutation group select] skip cache patch: no episodeId', {
          projectId,
          storyboardId: variables.storyboardId,
          groupNumber: variables.groupNumber,
        })
        return
      }
      queryClient.setQueryData(
        queryKeys.episodeData(projectId, episodeId),
        (previous: unknown) => patchEpisodeCoarseGroupVideo(previous, {
          storyboardId: variables.storyboardId,
          groupNumber: variables.groupNumber,
          videoUrl: readMutationVideoUrl(data, variables.videoUrl),
        }),
      )
    },
    onSettled: () => {
      invalidateQueryTemplates(queryClient, [
        queryKeys.projectAssets.all(projectId),
        queryKeys.projectData(projectId),
        ...(episodeId ? [queryKeys.episodeData(projectId, episodeId)] : []),
      ])
    },
  })
}

/**
 * 删除粗镜头历史视频
 */
export function useDeleteProjectStoryboardGroupHistoryVideo(projectId: string, episodeId?: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { storyboardId: string; groupNumber: number; videoUrl: string; clearCurrent?: boolean }) => {
      const res = await apiFetch(`/api/novel-promotion/${projectId}/storyboard-group/select-video`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(resolveTaskErrorMessage(error, '删除粗镜头历史视频失败'))
      }
      return res.json()
    },
    onSuccess: (data, variables) => {
      const deletedCurrent = !!(
        data
        && typeof data === 'object'
        && (data as { deletedCurrent?: unknown }).deletedCurrent === true
      )
      if (!deletedCurrent || !episodeId) return
      queryClient.setQueryData(
        queryKeys.episodeData(projectId, episodeId),
        (previous: unknown) => patchEpisodeCoarseGroupVideo(previous, {
          storyboardId: variables.storyboardId,
          groupNumber: variables.groupNumber,
          videoUrl: null,
        }),
      )
    },
    onSettled: () => {
      invalidateQueryTemplates(queryClient, [
        queryKeys.projectAssets.all(projectId),
        queryKeys.projectData(projectId),
        ...(episodeId ? [queryKeys.episodeData(projectId, episodeId)] : []),
      ])
    },
  })
}

/**
 * 切换单分镜历史视频为当前视频
 */
export function useSelectProjectPanelHistoryVideo(projectId: string, episodeId?: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { panelId: string; videoUrl: string }) => {
      _ulogInfo('[VideoHistoryTrace][mutation panel select] request', {
        projectId,
        episodeId,
        panelId: payload.panelId,
        requestedVideoUrl: summarizeVideoUrl(payload.videoUrl),
      })
      const res = await apiFetch(`/api/novel-promotion/${projectId}/panel/select-video-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      _ulogInfo('[VideoHistoryTrace][mutation panel select] response status', {
        projectId,
        episodeId,
        panelId: payload.panelId,
        ok: res.ok,
        status: res.status,
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        _ulogWarn('[VideoHistoryTrace][mutation panel select] response error', {
          projectId,
          episodeId,
          panelId: payload.panelId,
          error,
        })
        throw new Error(resolveTaskErrorMessage(error, '切换历史视频失败'))
      }
      const data = await res.json()
      _ulogInfo('[VideoHistoryTrace][mutation panel select] response data', {
        projectId,
        episodeId,
        panelId: payload.panelId,
        responseVideoUrl: summarizeVideoUrl(typeof data?.videoUrl === 'string' ? data.videoUrl : ''),
        responseCosKey: typeof data?.cosKey === 'string' ? data.cosKey : '',
      })
      return data
    },
    onSuccess: (data, variables) => {
      _ulogInfo('[VideoHistoryTrace][mutation panel select] onSuccess', {
        projectId,
        episodeId,
        panelId: variables.panelId,
        requestedVideoUrl: summarizeVideoUrl(variables.videoUrl),
        selectedVideoUrl: summarizeVideoUrl(readMutationVideoUrl(data, variables.videoUrl)),
      })
      if (!episodeId) return
      queryClient.setQueryData(
        queryKeys.episodeData(projectId, episodeId),
        (previous: unknown) => patchEpisodePanelVideo(previous, {
          panelId: variables.panelId,
          videoUrl: readMutationVideoUrl(data, variables.videoUrl),
        }),
      )
    },
    onSettled: () => {
      invalidateQueryTemplates(queryClient, [
        queryKeys.projectAssets.all(projectId),
        queryKeys.projectData(projectId),
        ...(episodeId ? [queryKeys.episodeData(projectId, episodeId)] : []),
      ])
    },
  })
}

/**
 * 删除单分镜历史视频条目
 */
export function useDeleteProjectPanelHistoryVideo(projectId: string, episodeId?: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { panelId: string; videoUrl: string; clearCurrent?: boolean }) => {
      const res = await apiFetch(`/api/novel-promotion/${projectId}/panel/select-video-history`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(resolveTaskErrorMessage(error, '删除历史视频失败'))
      }
      return res.json()
    },
    onSuccess: (data, variables) => {
      const deletedCurrent = !!(
        data
        && typeof data === 'object'
        && (data as { deletedCurrent?: unknown }).deletedCurrent === true
      )
      if (!deletedCurrent || !episodeId) return
      queryClient.setQueryData(
        queryKeys.episodeData(projectId, episodeId),
        (previous: unknown) => patchEpisodePanelVideo(previous, {
          panelId: variables.panelId,
          videoUrl: null,
        }),
      )
    },
    onSettled: () => {
      invalidateQueryTemplates(queryClient, [
        queryKeys.projectAssets.all(projectId),
        queryKeys.projectData(projectId),
        ...(episodeId ? [queryKeys.episodeData(projectId, episodeId)] : []),
      ])
    },
  })
}

/**
 * 上传本地视频并设为单分镜当前视频
 */
export function useUploadProjectPanelVideo(projectId: string, episodeId?: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { panelId: string; file: File }) => {
      const formData = new FormData()
      formData.append('panelId', payload.panelId)
      formData.append('file', payload.file)

      const res = await apiFetch(`/api/novel-promotion/${projectId}/panel/upload-video`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(resolveTaskErrorMessage(error, '上传视频失败'))
      }
      return res.json()
    },
    onSuccess: (data, variables) => {
      if (!episodeId) return
      const uploadResult = readUploadPanelVideoResponse(data, {
        videoUrl: null,
        cosKey: null,
        videoHistory: undefined,
      })
      queryClient.setQueryData(
        queryKeys.episodeData(projectId, episodeId),
        (previous: unknown) => patchEpisodePanelVideo(previous, {
          panelId: variables.panelId,
          videoUrl: uploadResult.videoUrl,
          videoStorageKey: uploadResult.cosKey,
          videoHistory: uploadResult.videoHistory,
        }),
      )
    },
    onSettled: () => {
      invalidateQueryTemplates(queryClient, [
        queryKeys.projectAssets.all(projectId),
        queryKeys.projectData(projectId),
        ...(episodeId ? [queryKeys.episodeData(projectId, episodeId)] : []),
      ])
    },
  })
}
