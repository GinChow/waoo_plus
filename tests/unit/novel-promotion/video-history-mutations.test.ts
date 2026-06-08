import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query/keys'

const {
  queryClient,
  useQueryClientMock,
  useMutationMock,
  invalidateQueryTemplatesMock,
} = vi.hoisted(() => ({
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn() },
  useQueryClientMock: vi.fn(),
  useMutationMock: vi.fn((options: unknown) => options),
  invalidateQueryTemplatesMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => useQueryClientMock(),
  useMutation: (options: unknown) => useMutationMock(options),
}))

vi.mock('@/lib/query/mutations/mutation-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/query/mutations/mutation-shared')>(
    '@/lib/query/mutations/mutation-shared',
  )
  return {
    ...actual,
    invalidateQueryTemplates: invalidateQueryTemplatesMock,
  }
})

import {
  useDeleteProjectPanelHistoryVideo,
  useDeleteProjectStoryboardGroupHistoryVideo,
  useSelectProjectPanelHistoryVideo,
  useSelectProjectStoryboardGroupVideo,
} from '@/lib/query/mutations/useVideoMutations'

interface SettledMutation {
  onSettled: () => void
}

interface GroupSelectMutation extends SettledMutation {
  onSuccess: (
    data: { videoUrl: string },
    variables: { storyboardId: string; groupNumber: number; videoUrl: string },
  ) => void
}

describe('video history mutations', () => {
  beforeEach(() => {
    queryClient.invalidateQueries.mockClear()
    queryClient.setQueryData.mockClear()
    useQueryClientMock.mockReset()
    useQueryClientMock.mockReturnValue(queryClient)
    useMutationMock.mockClear()
    invalidateQueryTemplatesMock.mockClear()
  })

  it('refreshes project and episode data after selecting or deleting history videos', () => {
    const projectId = 'project-1'
    const episodeId = 'episode-1'
    const mutations = [
      useSelectProjectStoryboardGroupVideo(projectId, episodeId),
      useDeleteProjectStoryboardGroupHistoryVideo(projectId, episodeId),
      useSelectProjectPanelHistoryVideo(projectId, episodeId),
      useDeleteProjectPanelHistoryVideo(projectId, episodeId),
    ] as unknown as SettledMutation[]

    mutations.forEach((mutation) => mutation.onSettled())

    expect(invalidateQueryTemplatesMock).toHaveBeenCalledTimes(4)
    for (const call of invalidateQueryTemplatesMock.mock.calls) {
      expect(call[0]).toBe(queryClient)
      expect(call[1]).toEqual([
        queryKeys.projectAssets.all(projectId),
        queryKeys.projectData(projectId),
        queryKeys.episodeData(projectId, episodeId),
      ])
    }
  })

  it('patches current episode cache immediately when selecting a coarse group history video', () => {
    const projectId = 'project-1'
    const episodeId = 'episode-1'
    const mutation = useSelectProjectStoryboardGroupVideo(projectId, episodeId) as unknown as GroupSelectMutation

    mutation.onSuccess(
      { videoUrl: '/m/new-video' },
      { storyboardId: 'storyboard-1', groupNumber: 7, videoUrl: '/m/old-history-entry' },
    )

    expect(queryClient.setQueryData).toHaveBeenCalledTimes(1)
    const [queryKey, updater] = queryClient.setQueryData.mock.calls[0]
    expect(queryKey).toEqual(queryKeys.episodeData(projectId, episodeId))
    expect(typeof updater).toBe('function')

    const next = (updater as (previous: unknown) => unknown)({
      storyboards: [{
        id: 'storyboard-1',
        coarseGroupsJson: JSON.stringify([
          { groupNumber: 7, videoUrl: '/m/old-video', videoHistory: [] },
        ]),
        panels: [],
      }],
    }) as { storyboards: Array<{ coarseGroupsJson: string }> }
    const [group] = JSON.parse(next.storyboards[0].coarseGroupsJson)
    expect(group.videoUrl).toBe('/m/new-video')
  })
})
