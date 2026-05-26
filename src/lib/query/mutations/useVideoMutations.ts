import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import { apiFetch } from '@/lib/api-fetch'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import { invalidateQueryTemplates, requestJsonWithError } from './mutation-shared'

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
export function useSelectProjectStoryboardGroupVideo(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { storyboardId: string; groupNumber: number; videoUrl: string }) => {
      const res = await apiFetch(`/api/novel-promotion/${projectId}/storyboard-group/select-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(resolveTaskErrorMessage(error, '选择粗镜头历史视频失败'))
      }
      return res.json()
    },
    onSettled: () => {
      invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
    },
  })
}

/**
 * 删除粗镜头历史视频
 */
export function useDeleteProjectStoryboardGroupHistoryVideo(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { storyboardId: string; groupNumber: number; videoUrl: string }) => {
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
    onSettled: () => {
      invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
    },
  })
}

/**
 * 切换单分镜历史视频为当前视频
 */
export function useSelectProjectPanelHistoryVideo(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { panelId: string; videoUrl: string }) => {
      const res = await apiFetch(`/api/novel-promotion/${projectId}/panel/select-video-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(resolveTaskErrorMessage(error, '切换历史视频失败'))
      }
      return res.json()
    },
    onSettled: () => {
      invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
    },
  })
}

/**
 * 删除单分镜历史视频条目
 */
export function useDeleteProjectPanelHistoryVideo(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { panelId: string; videoUrl: string }) => {
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
    onSettled: () => {
      invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
    },
  })
}
