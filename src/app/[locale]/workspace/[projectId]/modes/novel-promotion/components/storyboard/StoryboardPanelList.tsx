'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { NovelPromotionPanel } from '@/types/project'
import { StoryboardPanel } from './hooks/useStoryboardState'
import { PanelEditData } from '../PanelEditForm'
import { ASPECT_RATIO_CONFIGS } from '@/lib/constants'
import PanelCard from './PanelCard'
import GroupPanelCard from './GroupPanelCard'
import { AppIcon } from '@/components/ui/icons'
import type { PanelSaveState } from './hooks/usePanelCrudActions'

interface PanelGroup {
  groupKey: string
  panelIndices: number[] // indexes into textPanels array
}

interface StoryboardPanelListProps {
  storyboardId: string
  textPanels: StoryboardPanel[]
  storyboardStartIndex: number
  videoRatio: string
  isSubmittingStoryboardTextTask: boolean
  savingPanels: Set<string>
  deletingPanelIds: Set<string>
  saveStateByPanel: Record<string, PanelSaveState>
  hasUnsavedByPanel: Set<string>
  modifyingPanels: Set<string>
  panelTaskErrorMap: Map<string, { taskId: string; message: string }>
  isPanelTaskRunning: (panel: StoryboardPanel) => boolean
  getPanelEditData: (panel: StoryboardPanel) => PanelEditData
  getPanelCandidates: (panel: NovelPromotionPanel) => { candidates: string[]; selectedIndex: number } | null
  onPanelUpdate: (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => void
  onPanelDelete: (panelId: string) => void
  onOpenCharacterPicker: (panelId: string) => void
  onOpenLocationPicker: (panelId: string) => void
  onRemoveCharacter: (panel: StoryboardPanel, index: number) => void
  onRemoveLocation: (panel: StoryboardPanel) => void
  onRetryPanelSave: (panelId: string) => void
  onRegeneratePanelImage: (panelId: string, count?: number, force?: boolean) => void
  onBatchGenerateNextPanels?: (startPanelId: string, count?: number) => Promise<void> | void
  linkedPanels: Map<string, boolean>
  isLastLinkablePanel: (panelKey: string) => boolean
  canEnableLink: (panelKey: string) => boolean
  onToggleLink: (panelKey: string, storyboardId: string, panelIndex: number) => Promise<{ rejected: boolean; reason?: string; max?: number }>
  onOpenEditModal: (panelIndex: number) => void
  onOpenAIDataModal: (panelIndex: number) => void
  onSelectPanelCandidateIndex: (panelId: string, index: number) => void
  onConfirmPanelCandidate: (panelId: string, imageUrl: string) => Promise<void>
  onCancelPanelCandidate: (panelId: string) => void
  onClearPanelTaskError: (panelId: string) => void
  onDeletePanelImage: (panelId: string) => void
  onUploadPanelImage: (panelId: string, file: File) => void
  onSelectPanelHistoryImage: (panelId: string, imageUrl: string) => Promise<void>
  onDeletePanelHistoryImage: (panelId: string, imageUrl: string) => Promise<void>
  uploadingPanelIds: Set<string>
  onPreviewImage: (url: string) => void
  onInsertAfter: (panelIndex: number) => void
  onVariant: (panelIndex: number) => void
  isInsertDisabled: (panelId: string) => boolean
}

export default function StoryboardPanelList({
  storyboardId,
  textPanels,
  storyboardStartIndex,
  videoRatio,
  isSubmittingStoryboardTextTask,
  savingPanels,
  deletingPanelIds,
  saveStateByPanel,
  hasUnsavedByPanel,
  modifyingPanels,
  panelTaskErrorMap,
  isPanelTaskRunning,
  getPanelEditData,
  getPanelCandidates,
  onPanelUpdate,
  onPanelDelete,
  onOpenCharacterPicker,
  onOpenLocationPicker,
  onRemoveCharacter,
  onRemoveLocation,
  onRetryPanelSave,
  onRegeneratePanelImage,
  onBatchGenerateNextPanels,
  linkedPanels,
  isLastLinkablePanel,
  canEnableLink,
  onToggleLink,
  onOpenEditModal,
  onOpenAIDataModal,
  onSelectPanelCandidateIndex,
  onConfirmPanelCandidate,
  onCancelPanelCandidate,
  onClearPanelTaskError,
  onDeletePanelImage,
  onUploadPanelImage,
  onSelectPanelHistoryImage,
  onDeletePanelHistoryImage,
  uploadingPanelIds,
  onPreviewImage,
  onInsertAfter,
  onVariant,
  isInsertDisabled,
}: StoryboardPanelListProps) {
  const t = useTranslations('storyboard')
  const displayImages = useMemo(() => textPanels.map((panel) => panel.imageUrl || null), [textPanels])
  const isVertical = ASPECT_RATIO_CONFIGS[videoRatio]?.isVertical ?? false

  // 计算 storyboard 内的连续链接组
  const groups: PanelGroup[] = useMemo(() => {
    const result: PanelGroup[] = []
    let cursor = 0
    while (cursor < textPanels.length) {
      const indices: number[] = [cursor]
      while (cursor < textPanels.length - 1) {
        const panel = textPanels[cursor]
        const linkKey = `${storyboardId}-${panel.panelIndex}`
        if (!linkedPanels.get(linkKey)) break
        cursor += 1
        indices.push(cursor)
      }
      const firstPanel = textPanels[indices[0]]
      const groupKey = `${storyboardId}-grp-${firstPanel.panelIndex}-${indices.length}`
      result.push({ groupKey, panelIndices: indices })
      cursor += 1
    }
    return result
  }, [linkedPanels, storyboardId, textPanels])

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // 当组结构变化时，剪除不存在的组 key（避免无效 key 堆积）
  useEffect(() => {
    setExpandedGroups((previous) => {
      if (previous.size === 0) return previous
      const validKeys = new Set(groups.map((group) => group.groupKey))
      let changed = false
      const next = new Set<string>()
      previous.forEach((key) => {
        if (validKeys.has(key)) next.add(key)
        else changed = true
      })
      return changed ? next : previous
    })
  }, [groups])

  const toggleExpand = useCallback((groupKey: string) => {
    setExpandedGroups((previous) => {
      const next = new Set(previous)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }, [])

  const handleUnlinkGroup = useCallback(async (group: PanelGroup) => {
    // 解除组内所有 linkedToNextPanel（组内 panel 之间的 N-1 条链接）
    for (let i = 0; i < group.panelIndices.length - 1; i += 1) {
      const panel = textPanels[group.panelIndices[i]]
      const linkKey = `${storyboardId}-${panel.panelIndex}`
      if (linkedPanels.get(linkKey)) {
        await onToggleLink(linkKey, storyboardId, panel.panelIndex)
      }
    }
  }, [linkedPanels, onToggleLink, storyboardId, textPanels])

  const renderPanelCard = (index: number, groupContext?: { isInGroup: boolean; isGroupStart: boolean; isGroupEnd: boolean; onCollapse?: () => void }) => {
    const panel = textPanels[index]
    const imageUrl = displayImages[index]
    const globalPanelNumber = storyboardStartIndex + panel.panelIndex + 1
    const isPanelModifying =
      modifyingPanels.has(panel.id) ||
      Boolean(
        (panel as StoryboardPanel & { imageTaskRunning?: boolean; imageTaskIntent?: string }).imageTaskRunning &&
        (panel as StoryboardPanel & { imageTaskIntent?: string }).imageTaskIntent === 'modify',
      )
    const isPanelDeleting = deletingPanelIds.has(panel.id)
    const panelSaveState = saveStateByPanel[panel.id]
    const isPanelSaving = savingPanels.has(panel.id) || panelSaveState?.status === 'saving'
    const hasUnsavedChanges = hasUnsavedByPanel.has(panel.id) || panelSaveState?.status === 'error'
    const panelSaveError = panelSaveState?.errorMessage || null
    const panelTaskRunning = isPanelTaskRunning(panel)
    const taskError = panelTaskErrorMap.get(panel.id)
    const panelFailedError = taskError?.message || null
    const panelData = getPanelEditData(panel)
    const panelCandidateData = getPanelCandidates(panel as unknown as NovelPromotionPanel)
    const linkPanelKey = `${storyboardId}-${panel.panelIndex}`
    const isLinkedToNext = linkedPanels.get(linkPanelKey) === true
    const isPanelLastLinkable = isLastLinkablePanel(linkPanelKey)
    const linkable = !isPanelLastLinkable
    const linkEnableAllowed = isLinkedToNext || canEnableLink(linkPanelKey)
    const inGroup = !!groupContext?.isInGroup
    const groupBorderClasses = inGroup
      ? `relative ${groupContext?.isGroupStart ? 'rounded-l-2xl' : ''} ${groupContext?.isGroupEnd ? 'rounded-r-2xl' : ''}`
      : ''

    return (
      <div
        key={panel.id || index}
        className={`relative group/panel h-full ${groupBorderClasses}`}
        style={{ zIndex: textPanels.length - index }}
      >
        {inGroup && groupContext?.isGroupStart && (
          <div className="absolute -top-2 left-2 right-2 z-20 flex items-center gap-2 pointer-events-none">
            <div className="flex items-center gap-1.5 rounded-full bg-[var(--glass-accent-from)] px-2 py-0.5 text-[10px] font-semibold text-white shadow-[var(--glass-shadow-sm)] pointer-events-auto">
              <AppIcon name="unplug" className="h-2.5 w-2.5" />
              <span>{t('panelGroup.badge')}</span>
            </div>
            {groupContext.onCollapse && (
              <button
                type="button"
                onClick={groupContext.onCollapse}
                className="ml-auto pointer-events-auto rounded-full bg-[var(--glass-bg-surface)] border border-[var(--glass-accent-from)] px-2 py-0.5 text-[10px] text-[var(--glass-accent-from)] hover:bg-[var(--glass-tone-info-bg)]"
                title={t('panelGroup.collapseTitle')}
              >
                {t('panelGroup.collapse')}
              </button>
            )}
          </div>
        )}
        <div className={inGroup ? 'ring-2 ring-[var(--glass-accent-from)] rounded-2xl overflow-visible' : ''}>
          <PanelCard
            panel={panel}
            panelData={panelData}
            imageUrl={imageUrl}
            globalPanelNumber={globalPanelNumber}
            storyboardId={storyboardId}
            videoRatio={videoRatio}
            isSaving={isPanelSaving}
            hasUnsavedChanges={hasUnsavedChanges}
            saveErrorMessage={panelSaveError}
            isDeleting={isPanelDeleting}
            isModifying={isPanelModifying}
            isSubmittingPanelImageTask={panelTaskRunning}
            failedError={panelFailedError}
            candidateData={panelCandidateData}
            onUpdate={(updates) => onPanelUpdate(panel.id, panel, updates)}
            onDelete={() => onPanelDelete(panel.id)}
            onOpenCharacterPicker={() => onOpenCharacterPicker(panel.id)}
            onOpenLocationPicker={() => onOpenLocationPicker(panel.id)}
            onRetrySave={() => onRetryPanelSave(panel.id)}
            onRemoveCharacter={(characterIndex) => onRemoveCharacter(panel, characterIndex)}
            onRemoveLocation={() => onRemoveLocation(panel)}
            onRegeneratePanelImage={onRegeneratePanelImage}
            onBatchGenerateNextPanels={onBatchGenerateNextPanels}
            onOpenEditModal={() => onOpenEditModal(panel.panelIndex)}
            onOpenAIDataModal={() => onOpenAIDataModal(panel.panelIndex)}
            onSelectCandidateIndex={onSelectPanelCandidateIndex}
            onConfirmCandidate={onConfirmPanelCandidate}
            onCancelCandidate={onCancelPanelCandidate}
            onClearError={() => onClearPanelTaskError(panel.id)}
            onDeleteImage={onDeletePanelImage}
            onUploadImage={onUploadPanelImage}
            onSelectHistoryImage={onSelectPanelHistoryImage}
            onDeleteHistoryImage={onDeletePanelHistoryImage}
            isUploading={uploadingPanelIds.has(panel.id)}
            onPreviewImage={onPreviewImage}
            onInsertAfter={() => onInsertAfter(panel.panelIndex)}
            onVariant={() => onVariant(panel.panelIndex)}
            isInsertDisabled={isInsertDisabled(panel.id)}
            linkable={linkable}
            linkedToNext={isLinkedToNext}
            linkEnableAllowed={linkEnableAllowed}
            onToggleLink={() => onToggleLink(linkPanelKey, storyboardId, panel.panelIndex)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={`grid gap-4 isolate ${isVertical ? 'grid-cols-5' : 'grid-cols-3'} ${isSubmittingStoryboardTextTask ? 'opacity-50 pointer-events-none' : ''}`}>
      {groups.flatMap((group) => {
        const isCollapsibleGroup = group.panelIndices.length > 1
        const isExpanded = expandedGroups.has(group.groupKey)
        if (isCollapsibleGroup && !isExpanded) {
          const firstPanelIndex = group.panelIndices[0]
          const firstPanel = textPanels[firstPanelIndex]
          const groupStartGlobalNumber = storyboardStartIndex + firstPanel.panelIndex + 1
          const groupPanels = group.panelIndices.map((index) => textPanels[index])
          const lastPanelIndex = group.panelIndices[group.panelIndices.length - 1]
          const lastPanel = textPanels[lastPanelIndex]
          const lastLinkPanelKey = `${storyboardId}-${lastPanel.panelIndex}`
          const groupLinkable = !isLastLinkablePanel(lastLinkPanelKey)
          const groupLinkEnableAllowed = canEnableLink(lastLinkPanelKey)
          return [(
            <div
              key={group.groupKey}
              className="relative h-full"
              style={{ zIndex: textPanels.length - firstPanelIndex }}
            >
              <GroupPanelCard
                groupPanels={groupPanels}
                groupStartGlobalNumber={groupStartGlobalNumber}
                videoRatio={videoRatio}
                onExpand={() => toggleExpand(group.groupKey)}
                onUnlinkAll={() => { void handleUnlinkGroup(group) }}
                onPreviewImage={onPreviewImage}
                linkable={groupLinkable}
                linkEnableAllowed={groupLinkEnableAllowed}
                onToggleLinkToNext={() => onToggleLink(lastLinkPanelKey, storyboardId, lastPanel.panelIndex)}
              />
            </div>
          )]
        }

        // 展开或单 panel：分别为每个 panel 渲染单独的 grid item
        return group.panelIndices.map((index, position) => {
          const groupContext = isCollapsibleGroup
            ? {
              isInGroup: true,
              isGroupStart: position === 0,
              isGroupEnd: position === group.panelIndices.length - 1,
              onCollapse: position === 0 ? () => toggleExpand(group.groupKey) : undefined,
            }
            : undefined
          return renderPanelCard(index, groupContext)
        })
      })}
    </div>
  )
}
