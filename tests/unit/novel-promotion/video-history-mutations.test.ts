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

interface GroupDeleteMutation extends SettledMutation {
  onSuccess: (
    data: { deletedCurrent?: boolean; videoUrl?: string | null },
    variables: { storyboardId: string; groupNumber: number; videoUrl: string; clearCurrent?: boolean },
  ) => void
}

interface PanelDeleteMutation extends SettledMutation {
  onSuccess: (
    data: { deletedCurrent?: boolean; videoUrl?: string | null },
    variables: { panelId: string; videoUrl: string },
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

  it('clears current panel video in episode cache after deleting the active history video', () => {
    const projectId = 'project-1'
    const episodeId = 'episode-1'
    const mutation = useDeleteProjectPanelHistoryVideo(projectId, episodeId) as unknown as PanelDeleteMutation

    mutation.onSuccess(
      { deletedCurrent: true, videoUrl: null },
      { panelId: 'panel-1', videoUrl: '/m/current-video' },
    )

    expect(queryClient.setQueryData).toHaveBeenCalledTimes(1)
    const [queryKey, updater] = queryClient.setQueryData.mock.calls[0]
    expect(queryKey).toEqual(queryKeys.episodeData(projectId, episodeId))
    expect(typeof updater).toBe('function')

    const next = (updater as (previous: unknown) => unknown)({
      storyboards: [{
        id: 'storyboard-1',
        panels: [
          { id: 'panel-1', videoUrl: '/m/current-video' },
          { id: 'panel-2', videoUrl: '/m/other-video' },
        ],
      }],
    }) as { storyboards: Array<{ panels: Array<{ id: string; videoUrl: string | null }> }> }

    expect(next.storyboards[0].panels[0].videoUrl).toBeNull()
    expect(next.storyboards[0].panels[1].videoUrl).toBe('/m/other-video')
  })

  it('clears current coarse group video in episode cache after deleting the active group video', () => {
    const projectId = 'project-1'
    const episodeId = 'episode-1'
    const mutation = useDeleteProjectStoryboardGroupHistoryVideo(projectId, episodeId) as unknown as GroupDeleteMutation

    mutation.onSuccess(
      { deletedCurrent: true, videoUrl: null },
      { storyboardId: 'storyboard-1', groupNumber: 7, videoUrl: '/m/current-video', clearCurrent: true },
    )

    expect(queryClient.setQueryData).toHaveBeenCalledTimes(1)
    const [queryKey, updater] = queryClient.setQueryData.mock.calls[0]
    expect(queryKey).toEqual(queryKeys.episodeData(projectId, episodeId))
    expect(typeof updater).toBe('function')

    const next = (updater as (previous: unknown) => unknown)({
      storyboards: [{
        id: 'storyboard-1',
        coarseGroupsJson: JSON.stringify([
          { groupNumber: 7, videoUrl: '/m/current-video', videoHistory: [{ videoUrl: '/m/old-video' }] },
          { groupNumber: 8, videoUrl: '/m/other-video', videoHistory: [] },
        ]),
        panels: [],
      }],
    }) as { storyboards: Array<{ coarseGroupsJson: string }> }

    const groups = JSON.parse(next.storyboards[0].coarseGroupsJson) as Array<{ groupNumber: number; videoUrl: string | null }>
    expect(groups.find((group) => group.groupNumber === 7)?.videoUrl).toBeNull()
    expect(groups.find((group) => group.groupNumber === 8)?.videoUrl).toBe('/m/other-video')
  })
})
