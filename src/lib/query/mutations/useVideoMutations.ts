import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
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
