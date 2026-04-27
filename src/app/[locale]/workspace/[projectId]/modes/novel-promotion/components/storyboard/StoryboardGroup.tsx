'use client'
import { useTranslations } from 'next-intl'

import { useCallback, useMemo, useState } from 'react'
import ScreenplayDisplay from './ScreenplayDisplay'
import { StoryboardPanel } from './hooks/useStoryboardState'
import StoryboardGroupHeader from './StoryboardGroupHeader'
import StoryboardGroupActions from './StoryboardGroupActions'
import StoryboardPanelList from './StoryboardPanelList'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import TaskStatusOverlay from '@/components/task/TaskStatusOverlay'
import { useStoryboardGroupTaskErrors } from './hooks/useStoryboardGroupTaskErrors'
import { useStoryboardInsertVariantRuntime } from './hooks/useStoryboardInsertVariantRuntime'
import StoryboardGroupFailedAlert from './StoryboardGroupFailedAlert'
import StoryboardGroupDialogs from './StoryboardGroupDialogs'
import type { StoryboardGroupProps } from './StoryboardGroup.types'
import { AppIcon } from '@/components/ui/icons'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'

export default function StoryboardGroup({
  storyboard,
  clip,
  sbIndex,
  totalStoryboards,
  textPanels,
  storyboardStartIndex,
  videoRatio,
  isExpanded,
  isSubmittingStoryboardTask,
  isSelectingCandidate,
  isSubmittingStoryboardTextTask,
  hasAnyImage,
  failedError,
  savingPanels,
  deletingPanelIds,
  saveStateByPanel,
  hasUnsavedByPanel,
  modifyingPanels,
  submittingPanelImageIds,
  onToggleExpand,
  onMoveUp,
  onMoveDown,
  onRegenerateText,
  onAddPanel,
  onDeleteStoryboard,
  onGenerateAllIndividually,
  onPreviewImage,
  onCloseError,
  getPanelEditData,
  onPanelUpdate,
  onPanelDelete,
  onOpenCharacterPicker,
  onOpenLocationPicker,
  onRemoveCharacter,
  onRemoveLocation,
  onRetryPanelSave,
  onRegeneratePanelImage,
  onOpenEditModal,
  onOpenAIDataModal,
  getPanelCandidates,
  onSelectPanelCandidateIndex,
  onConfirmPanelCandidate,
  onCancelPanelCandidate,
  formatClipTitle,
  movingClipId,
  onInsertPanel,
  insertingAfterPanelId,
  projectId,
  episodeId,
  onDeletePanelImage,
  onUploadPanelImage,
  uploadingPanelIds,
  onPanelVariant,
  submittingVariantPanelId,
}: StoryboardGroupProps) {
  const t = useTranslations('storyboard')
  const tProgress = useTranslations('progress')
  const [activeCoarseGroupNumber, setActiveCoarseGroupNumber] = useState<number | null>(null)

  const {
    insertModalOpen,
    insertAfterPanel,
    nextPanelForInsert,
    variantModalPanel,
    handleOpenInsertModal,
    handleCloseInsertModal,
    handleInsert,
    handleOpenVariantModal,
    handleCloseVariantModal,
    handleVariant,
  } = useStoryboardInsertVariantRuntime({
    storyboardId: storyboard.id,
    textPanels,
    onInsertPanel,
    onPanelVariant,
  })

  const {
    panelTaskErrorMap,
    clearPanelTaskError,
  } = useStoryboardGroupTaskErrors({
    projectId,
    episodeId,
  })

  const isPanelTaskRunning = useCallback(
    (panel: StoryboardPanel) => {
      const taskIntent = (panel as StoryboardPanel & { imageTaskIntent?: string }).imageTaskIntent
      if (taskIntent === 'modify') return false

      const isTaskRunning = Boolean((panel as StoryboardPanel & { imageTaskRunning?: boolean }).imageTaskRunning)
      const isSubmitting = submittingPanelImageIds.has(panel.id)
      if (isTaskRunning || isSubmitting) return true

      const taskError = panelTaskErrorMap.get(panel.id)
      if (taskError) return false

      return false
    },
    [panelTaskErrorMap, submittingPanelImageIds],
  )

  const currentRunningCount = textPanels.filter(isPanelTaskRunning).length
  const pendingCount = textPanels.filter((panel) => !panel.imageUrl && !isPanelTaskRunning(panel)).length
  const coarseGroups = useMemo(() => {
    const grouped = new Map<number, StoryboardPanel[]>()
    const sorted = [...textPanels].sort((left, right) => left.panelIndex - right.panelIndex)
    for (const panel of sorted) {
      const groupNumber = panel.parent_group_number ?? 1
      const current = grouped.get(groupNumber) || []
      current.push(panel)
      grouped.set(groupNumber, current)
    }
    return Array.from(grouped.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([groupNumber, panels]) => ({ groupNumber, panels }))
  }, [textPanels])

  const activeFinePanels = useMemo(() => {
    if (activeCoarseGroupNumber === null) return []
    return coarseGroups.find((group) => group.groupNumber === activeCoarseGroupNumber)?.panels || []
  }, [activeCoarseGroupNumber, coarseGroups])

  const groupOverlayState = useMemo(() => {
    if (isSubmittingStoryboardTextTask) {
      return resolveTaskPresentationState({
        phase: 'processing',
        intent: 'regenerate',
        resource: 'text',
        hasOutput: true,
      })
    }
    if (!isSubmittingStoryboardTask && !isSelectingCandidate) return null
    return resolveTaskPresentationState({
      phase: 'processing',
      intent: isSelectingCandidate ? 'process' : hasAnyImage ? 'regenerate' : 'generate',
      resource: 'image',
      hasOutput: hasAnyImage,
    })
  }, [hasAnyImage, isSelectingCandidate, isSubmittingStoryboardTask, isSubmittingStoryboardTextTask])

  const resolveProgressText = useCallback((value: string | null | undefined) => {
    if (!value) return null
    const trimmed = value.trim()
    const key = trimmed.startsWith('progress.') ? trimmed.slice('progress.'.length) : trimmed
    if (!/^[A-Za-z0-9_.-]+$/.test(key) || !key.includes('.')) {
      return value
    }
    try {
      return tProgress(key)
    } catch {
      return value
    }
  }, [tProgress])

  const textTaskDetailLabel = useMemo(() => {
    if (!isSubmittingStoryboardTextTask) return null
    return resolveProgressText(storyboard.storyboardTaskStepTitle)
      || resolveProgressText(storyboard.storyboardTaskMessage)
      || resolveProgressText(storyboard.storyboardTaskStageLabel)
  }, [
    isSubmittingStoryboardTextTask,
    resolveProgressText,
    storyboard.storyboardTaskMessage,
    storyboard.storyboardTaskStageLabel,
    storyboard.storyboardTaskStepTitle,
  ])

  const textTaskProgressLabel = useMemo(() => {
    if (!isSubmittingStoryboardTextTask) return null
    const current = storyboard.storyboardTaskStepIndex
    const total = storyboard.storyboardTaskStepTotal
    if (typeof current === 'number' && typeof total === 'number' && total > 0) {
      return `${current}/${total}`
    }
    if (typeof storyboard.storyboardTaskProgress === 'number') {
      return `${storyboard.storyboardTaskProgress}%`
    }
    return null
  }, [
    isSubmittingStoryboardTextTask,
    storyboard.storyboardTaskProgress,
    storyboard.storyboardTaskStepIndex,
    storyboard.storyboardTaskStepTotal,
  ])

  const handleRegeneratePanelImage = useCallback(
    (panelId: string, count?: number, force?: boolean) => {
      clearPanelTaskError(panelId)
      onRegeneratePanelImage(panelId, count, force)
    },
    [clearPanelTaskError, onRegeneratePanelImage],
  )

  return (
    <div className={`glass-surface-elevated p-6 relative ${failedError ? 'border-2 border-[var(--glass-stroke-danger)] bg-[var(--glass-danger-ring)]' : ''}`}>
      {failedError && (
        <StoryboardGroupFailedAlert
          failedError={failedError}
          title={`警告 ${t('group.failed')}`}
          closeTitle={t('common.cancel')}
          onClose={onCloseError}
        />
      )}

      {(isSubmittingStoryboardTextTask || isSubmittingStoryboardTask || isSelectingCandidate) && (
        <TaskStatusOverlay
          state={groupOverlayState}
          detailLabel={textTaskDetailLabel}
          progress={isSubmittingStoryboardTextTask ? storyboard.storyboardTaskProgress : null}
          progressLabel={textTaskProgressLabel}
          className="z-10 rounded-lg bg-[var(--glass-bg-surface-modal)]/90"
        />
      )}

      <div className="mb-4 pb-2 flex items-start justify-between">
        <StoryboardGroupHeader
          clip={clip}
          sbIndex={sbIndex}
          totalStoryboards={totalStoryboards}
          movingClipId={movingClipId}
          storyboardClipId={storyboard.clipId}
          formatClipTitle={formatClipTitle}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
        <StoryboardGroupActions
          hasAnyImage={hasAnyImage}
          isSubmittingStoryboardTask={isSubmittingStoryboardTask}
          isSubmittingStoryboardTextTask={isSubmittingStoryboardTextTask}
          currentRunningCount={currentRunningCount}
          pendingCount={pendingCount}
          onRegenerateText={onRegenerateText}
          onGenerateAllIndividually={onGenerateAllIndividually}
          onAddPanel={onAddPanel}
          onDeleteStoryboard={onDeleteStoryboard}
        />
      </div>

      {clip && (
        <div className="mb-4">
          <button
            onClick={onToggleExpand}
            className="glass-btn-base glass-btn-soft rounded-xl px-3 py-2 text-sm"
          >
            <AppIcon name="chevronRightMd" className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            <span>{clip.screenplay ? t('panel.stylePrompt') : t('panel.sourceText')}</span>
          </button>
          {isExpanded && (
            <div className="mt-2 glass-surface-soft p-2">
              {clip.screenplay ? (
                <ScreenplayDisplay screenplay={clip.screenplay} originalContent={clip.content} />
              ) : (
                <div className="whitespace-pre-wrap p-3 text-sm text-[var(--glass-text-secondary)]">
                  {clip.content}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeCoarseGroupNumber === null ? (
        <div className="space-y-3">
          <div className="text-xs text-[var(--glass-text-tertiary)]">{t('group.coarseGridPreview')}</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {coarseGroups.map((coarseGroup) => {
              const previewImages = coarseGroup.panels
                .map((panel) => panel.imageUrl)
                .filter((url): url is string => typeof url === 'string' && url.length > 0)
                .slice(0, 4)
              return (
                <button
                  key={`${storyboard.id}-coarse-${coarseGroup.groupNumber}`}
                  type="button"
                  onClick={() => setActiveCoarseGroupNumber(coarseGroup.groupNumber)}
                  className="glass-surface-soft p-3 text-left hover:bg-[var(--glass-bg-muted)] transition-colors"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--glass-text-primary)]">
                      {t('group.coarseShotTitle', { number: coarseGroup.groupNumber })}
                    </span>
                    <span className="text-xs text-[var(--glass-text-tertiary)]">
                      {t('group.fineShotCount', { count: coarseGroup.panels.length })}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: 4 }).map((_, tileIndex) => {
                      const imageUrl = previewImages[tileIndex]
                      return (
                        <div
                          key={`${storyboard.id}-coarse-${coarseGroup.groupNumber}-tile-${tileIndex}`}
                          className="h-20 w-full overflow-hidden rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]"
                        >
                          {imageUrl ? (
                            <MediaImageWithLoading
                              src={imageUrl}
                              alt={`shot-${tileIndex + 1}`}
                              containerClassName="h-full w-full"
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-[var(--glass-text-primary)]">
              {t('group.coarseShotTitle', { number: activeCoarseGroupNumber })}
            </div>
            <div className="text-xs text-[var(--glass-text-tertiary)]">
              {t('group.fineShotCount', { count: activeFinePanels.length })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveCoarseGroupNumber(null)}
            className="glass-btn-base glass-btn-soft rounded-xl px-3 py-2 text-sm"
          >
            <AppIcon name="chevronLeft" className="h-4 w-4" />
            <span>{t('group.backToCoarseList')}</span>
          </button>
          <StoryboardPanelList
            storyboardId={storyboard.id}
            textPanels={activeFinePanels}
            storyboardStartIndex={storyboardStartIndex}
            videoRatio={videoRatio}
            isSubmittingStoryboardTextTask={isSubmittingStoryboardTextTask}
            savingPanels={savingPanels}
            deletingPanelIds={deletingPanelIds}
            saveStateByPanel={saveStateByPanel}
            hasUnsavedByPanel={hasUnsavedByPanel}
            modifyingPanels={modifyingPanels}
            panelTaskErrorMap={panelTaskErrorMap}
            isPanelTaskRunning={isPanelTaskRunning}
            getPanelEditData={getPanelEditData}
            getPanelCandidates={getPanelCandidates}
            onPanelUpdate={onPanelUpdate}
            onPanelDelete={onPanelDelete}
            onOpenCharacterPicker={onOpenCharacterPicker}
            onOpenLocationPicker={onOpenLocationPicker}
            onRemoveCharacter={onRemoveCharacter}
            onRemoveLocation={onRemoveLocation}
            onRetryPanelSave={onRetryPanelSave}
            onRegeneratePanelImage={handleRegeneratePanelImage}
            onOpenEditModal={onOpenEditModal}
            onOpenAIDataModal={onOpenAIDataModal}
            onSelectPanelCandidateIndex={onSelectPanelCandidateIndex}
            onConfirmPanelCandidate={onConfirmPanelCandidate}
            onCancelPanelCandidate={onCancelPanelCandidate}
            onClearPanelTaskError={clearPanelTaskError}
            onDeletePanelImage={onDeletePanelImage}
            onUploadPanelImage={onUploadPanelImage}
            uploadingPanelIds={uploadingPanelIds}
            onPreviewImage={onPreviewImage}
            onInsertAfter={handleOpenInsertModal}
            onVariant={handleOpenVariantModal}
            isInsertDisabled={(panelId) =>
              isSubmittingStoryboardTextTask ||
              insertingAfterPanelId === panelId ||
              submittingVariantPanelId === panelId
            }
          />
        </div>
      )}

      <StoryboardGroupDialogs
        insertAfterPanel={insertAfterPanel}
        nextPanelForInsert={nextPanelForInsert}
        insertModalOpen={insertModalOpen}
        insertingAfterPanelId={insertingAfterPanelId}
        onCloseInsertModal={handleCloseInsertModal}
        onInsert={handleInsert}
        variantModalPanel={variantModalPanel}
        projectId={projectId}
        submittingVariantPanelId={submittingVariantPanelId}
        onCloseVariantModal={handleCloseVariantModal}
        onVariant={handleVariant}
      />
    </div>
  )
}
