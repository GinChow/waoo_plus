'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { logError as _ulogError } from '@/lib/logging/core'
import type { NovelPromotionStoryboard } from '@/types/project'
import type { StoryboardPanel } from './useStoryboardState'

export const PANEL_LINK_GROUP_MAX = 6

interface OrderedPanel {
  panelKey: string
  storyboardId: string
  panelIndex: number
  linkedToNextPanel: boolean
}

interface MutationLike {
  mutateAsync: (input: { storyboardId: string; panelIndex: number; linked: boolean }) => Promise<unknown>
}

interface UseStoryboardPanelLinkingParams {
  sortedStoryboards: NovelPromotionStoryboard[]
  getTextPanels: (storyboard: NovelPromotionStoryboard) => StoryboardPanel[]
  updatePanelLinkMutation: MutationLike
  onPersisted?: () => void
}

function panelKeyOf(storyboardId: string, panelIndex: number): string {
  return `${storyboardId}-${panelIndex}`
}

export function useStoryboardPanelLinking({
  sortedStoryboards,
  getTextPanels,
  updatePanelLinkMutation,
  onPersisted,
}: UseStoryboardPanelLinkingParams) {
  const orderedPanels = useMemo<OrderedPanel[]>(() => {
    const list: OrderedPanel[] = []
    sortedStoryboards.forEach((storyboard) => {
      getTextPanels(storyboard).forEach((panel) => {
        list.push({
          panelKey: panelKeyOf(storyboard.id, panel.panelIndex),
          storyboardId: storyboard.id,
          panelIndex: panel.panelIndex,
          linkedToNextPanel: panel.linkedToNextPanel ?? false,
        })
      })
    })
    return list
  }, [sortedStoryboards, getTextPanels])

  const baseLinkedPanels = useMemo(() => {
    const map = new Map<string, boolean>()
    orderedPanels.forEach((panel) => {
      if (panel.linkedToNextPanel) map.set(panel.panelKey, true)
    })
    return map
  }, [orderedPanels])

  const panelKeys = useMemo(() => new Set(orderedPanels.map((panel) => panel.panelKey)), [orderedPanels])

  const [linkedOverrides, setLinkedOverrides] = useState<Map<string, boolean>>(new Map())

  useEffect(() => {
    setLinkedOverrides((previous) => {
      if (previous.size === 0) return previous
      const next = new Map(previous)
      let changed = false
      previous.forEach((value, key) => {
        if (!panelKeys.has(key)) {
          next.delete(key)
          changed = true
          return
        }
        const baseValue = baseLinkedPanels.get(key) === true
        if (baseValue === value) {
          next.delete(key)
          changed = true
        }
      })
      return changed ? next : previous
    })
  }, [baseLinkedPanels, panelKeys])

  const linkedPanels = useMemo(() => {
    const merged = new Map(baseLinkedPanels)
    linkedOverrides.forEach((value, key) => {
      if (value) merged.set(key, true)
      else merged.delete(key)
    })
    return merged
  }, [baseLinkedPanels, linkedOverrides])

  const lastPanelKey = orderedPanels[orderedPanels.length - 1]?.panelKey ?? null

  const isLastPanel = useCallback((panelKey: string) => panelKey === lastPanelKey, [lastPanelKey])

  const indexByKey = useMemo(() => {
    const map = new Map<string, number>()
    orderedPanels.forEach((panel, index) => map.set(panel.panelKey, index))
    return map
  }, [orderedPanels])

  // 计算 panelIndex 所在的连续链接组长度（在 candidate linkedPanels 下）
  const computeGroupSize = useCallback(
    (panelIndex: number, candidateLinks: Map<string, boolean>): number => {
      if (panelIndex < 0 || panelIndex >= orderedPanels.length) return 0
      let start = panelIndex
      while (start > 0 && candidateLinks.get(orderedPanels[start - 1].panelKey)) {
        start -= 1
      }
      let end = panelIndex
      while (end < orderedPanels.length - 1 && candidateLinks.get(orderedPanels[end].panelKey)) {
        end += 1
      }
      return end - start + 1
    },
    [orderedPanels],
  )

  const groupSizeIfLinked = useCallback(
    (panelKey: string): number => {
      const index = indexByKey.get(panelKey)
      if (index === undefined || index >= orderedPanels.length - 1) return 0
      const candidate = new Map(linkedPanels)
      candidate.set(panelKey, true)
      // 连接后组的长度 = 以 index 为起点的组 ∪ 以 index+1 为起点的组
      // 直接计算 index 所在合并组的长度
      return computeGroupSize(index, candidate)
    },
    [computeGroupSize, indexByKey, linkedPanels, orderedPanels.length],
  )

  const canEnableLink = useCallback(
    (panelKey: string): boolean => {
      const size = groupSizeIfLinked(panelKey)
      return size > 0 && size <= PANEL_LINK_GROUP_MAX
    },
    [groupSizeIfLinked],
  )

  const applyOverride = useCallback(
    (panelKey: string, value: boolean) => {
      setLinkedOverrides((previous) => {
        const next = new Map(previous)
        const baseValue = baseLinkedPanels.get(panelKey) === true
        if (baseValue === value) next.delete(panelKey)
        else next.set(panelKey, value)
        return next
      })
    },
    [baseLinkedPanels],
  )

  const handleToggleLink = useCallback(
    async (panelKey: string, storyboardId: string, panelIndex: number) => {
      const currentLinked = linkedPanels.get(panelKey) === true
      const nextLinked = !currentLinked

      if (nextLinked) {
        const sizeAfter = groupSizeIfLinked(panelKey)
        if (sizeAfter > PANEL_LINK_GROUP_MAX) {
          return { rejected: true as const, reason: 'max-group-size' as const, max: PANEL_LINK_GROUP_MAX }
        }
      }

      applyOverride(panelKey, nextLinked)
      try {
        await updatePanelLinkMutation.mutateAsync({ storyboardId, panelIndex, linked: nextLinked })
        onPersisted?.()
        return { rejected: false as const }
      } catch (error) {
        _ulogError('[useStoryboardPanelLinking] persist failed:', error)
        applyOverride(panelKey, currentLinked)
        return { rejected: true as const, reason: 'persist-failed' as const }
      }
    },
    [applyOverride, groupSizeIfLinked, linkedPanels, onPersisted, updatePanelLinkMutation],
  )

  return {
    linkedPanels,
    isLastPanel,
    canEnableLink,
    handleToggleLink,
  }
}
