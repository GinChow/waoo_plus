'use client'

import { useState, useCallback } from 'react'
import { NovelPromotionStoryboard, NovelPromotionClip } from '@/types/project'
import { CharacterPickerModal, LocationPickerModal } from '../PanelEditForm'
import ImageEditModal from './ImageEditModal'
import AIDataModal from './AIDataModal'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import StoryboardStageShell from './StoryboardStageShell'
import StoryboardToolbar from './StoryboardToolbar'
import StoryboardCanvas from './StoryboardCanvas'
import { useStoryboardStageController } from './hooks/useStoryboardStageController'
import { useStoryboardModalRuntime } from './hooks/useStoryboardModalRuntime'
import {
  useRefreshProjectAssets,
  useRefreshEpisodeData,
  useRefreshStoryboards,
  useSelectProjectPanelHistoryImage,
  useDeleteProjectPanelHistoryImage,
} from '@/lib/query/hooks'
import { usePanelEpisodeCachePatch } from './hooks/usePanelEpisodeCachePatch'
import {
  parsePanelImageHistory,
  removePanelImageHistoryEntry,
  serializePanelImageHistory,
} from '@/lib/novel-promotion/panel-image-state'

interface StoryboardStageProps {
  projectId: string
  episodeId: string
  storyboards: NovelPromotionStoryboard[]
  clips: NovelPromotionClip[]
  videoRatio: string
  onBack: () => void
  onNext: () => void
  isTransitioning?: boolean
}

export default function StoryboardStage({
  projectId,
  episodeId,
  storyboards: initialStoryboards,
  clips,
  videoRatio,
  onBack,
  onNext,
  isTransitioning = false,
}: StoryboardStageProps) {
  const controller = useStoryboardStageController({
    projectId,
    episodeId,
    initialStoryboards,
    clips,
    isTransitioning,
  })

  const {
    localStoryboards,
    setLocalStoryboards,
    sortedStoryboards,
    expandedClips,
    toggleExpandedClip,
    getClipInfo,
    getTextPanels,
    getPanelEditData,
    updatePanelEdit,
    formatClipTitle,
    totalPanels,
    storyboardStartIndex,

    savingPanels,
    deletingPanelIds,
    saveStateByPanel,
    hasUnsavedByPanel,
    submittingStoryboardTextIds,
    addingStoryboardGroup,
    movingClipId,
    insertingAfterPanelId,
    savePanelWithData,
    addPanel,
    deletePanel,
    deleteStoryboard,
    regenerateStoryboardText,
    addStoryboardGroup,
    moveStoryboardGroup,
    insertPanel,

    submittingVariantPanelId,
    generatePanelVariant,

    submittingStoryboardIds,
    submittingPanelImageIds,
    selectingCandidateIds,

    editingPanel,
    setEditingPanel,
    modifyingPanels,
    isDownloadingImages,
    previewImage,
    setPreviewImage,
    regeneratePanelImage,
    regenerateAllPanelsIndividually,
    regenerateStoryboardGroupImage,
    selectStoryboardGroupImage,
    deleteStoryboardGroupHistoryImage,
    selectPanelCandidate,
    selectPanelCandidateIndex,
    cancelPanelCandidate,
    getPanelCandidates,
    downloadAllImages,
    clearStoryboardError,

    assetPickerPanel,
    setAssetPickerPanel,
    aiDataPanel,
    setAIDataPanel,
    isEpisodeBatchSubmitting,

    getDefaultAssetsForClip,
    handleEditSubmit,
    handlePanelUpdate,
    handleAddCharacter,
    handleSetLocation,
    handleRemoveCharacter,
    handleRemoveLocation,
    retrySave,

    updatePhotographyPlanMutation,
    updatePanelActingNotesMutation,

    addingStoryboardGroupState,
    transitioningState,
    runningCount,
    pendingPanelCount,
    handleGenerateAllPanels,
    regenerateNextNPanels,
    linkedPanels,
    isLastLinkablePanel,
    canEnableLink,
    handleToggleLink,
  } = controller

  const modalRuntime = useStoryboardModalRuntime({
    projectId,
    videoRatio,
    localStoryboards,
    editingPanel,
    setEditingPanel,
    assetPickerPanel,
    setAssetPickerPanel,
    aiDataPanel,
    setAIDataPanel,
    previewImage,
    setPreviewImage,
    getTextPanels,
    getPanelEditData,
    updatePanelEdit,
    savePanelWithData,
    getDefaultAssetsForClip,
    handleEditSubmit,
    handleAddCharacter,
    handleSetLocation,
    updatePhotographyPlanMutation,
    updatePanelActingNotesMutation,
  })

  const onRefresh = useRefreshProjectAssets(projectId)
  const [uploadingPanelIds, setUploadingPanelIds] = useState<Set<string>>(new Set())

  const handleDeletePanelImage = useCallback(async (panelId: string) => {
    try {
      await fetch(`/api/novel-promotion/${projectId}/panel/update-image?panelId=${panelId}`, {
        method: 'DELETE',
      })
      onRefresh()
    } catch {
      // ignore
    }
  }, [projectId, onRefresh])

  const selectPanelHistoryImageMutation = useSelectProjectPanelHistoryImage(projectId)
  const deletePanelHistoryImageMutation = useDeleteProjectPanelHistoryImage(projectId)
  const refreshEpisodeData = useRefreshEpisodeData(projectId, episodeId)
  const refreshStoryboards = useRefreshStoryboards(episodeId)
  const patchPanelInEpisodeCache = usePanelEpisodeCachePatch({ projectId, episodeId })

  const handleSelectPanelHistoryImage = useCallback(async (panelId: string, imageUrl: string) => {
    const result = await selectPanelHistoryImageMutation.mutateAsync({ panelId, imageUrl }) as { imageUrl?: string; cosKey?: string }
    const nextImageUrl = result?.imageUrl || imageUrl
    setLocalStoryboards((previous) => previous.map((storyboard) => {
      const panels = storyboard.panels || []
      let changed = false
      const nextPanels = panels.map((panel) => {
        if (panel.id !== panelId) return panel
        changed = true
        return { ...panel, imageUrl: nextImageUrl, candidateImages: null }
      })
      return changed ? { ...storyboard, panels: nextPanels } : storyboard
    }))
    patchPanelInEpisodeCache(panelId, {
      imageUrl: nextImageUrl,
      candidateImages: null,
    })
    onRefresh()
    refreshEpisodeData()
    refreshStoryboards()
  }, [selectPanelHistoryImageMutation, onRefresh, refreshEpisodeData, refreshStoryboards, patchPanelInEpisodeCache, setLocalStoryboards])

  const handleDeletePanelHistoryImage = useCallback(async (panelId: string, imageUrl: string) => {
    let optimisticHistoryRaw: string | null | undefined
    setLocalStoryboards((previous) => previous.map((storyboard) => {
      const panels = storyboard.panels || []
      let changed = false
      const nextPanels = panels.map((panel) => {
        if (panel.id !== panelId) return panel
        if (!panel.imageHistory) return panel
        const nextHistory = serializePanelImageHistory(
          removePanelImageHistoryEntry(parsePanelImageHistory(panel.imageHistory), imageUrl),
        )
        optimisticHistoryRaw = nextHistory
        changed = true
        return { ...panel, imageHistory: nextHistory }
      })
      return changed ? { ...storyboard, panels: nextPanels } : storyboard
    }))
    if (optimisticHistoryRaw !== undefined) {
      patchPanelInEpisodeCache(panelId, { imageHistory: optimisticHistoryRaw })
    }
    await deletePanelHistoryImageMutation.mutateAsync({ panelId, imageUrl })
    onRefresh()
    refreshEpisodeData()
    refreshStoryboards()
  }, [deletePanelHistoryImageMutation, onRefresh, refreshEpisodeData, refreshStoryboards, patchPanelInEpisodeCache, setLocalStoryboards])

  const handleUploadPanelImage = useCallback(async (panelId: string, file: File) => {
    setUploadingPanelIds((prev) => new Set(prev).add(panelId))
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('panelId', panelId)
      await fetch(`/api/novel-promotion/${projectId}/panel/update-image`, {
        method: 'POST',
        body: formData,
      })
      onRefresh()
    } catch {
      // ignore
    } finally {
      setUploadingPanelIds((prev) => {
        const next = new Set(prev)
        next.delete(panelId)
        return next
      })
    }
  }, [projectId, onRefresh])

  return (
      <StoryboardStageShell
        isTransitioning={isTransitioning}
        isNextDisabled={isTransitioning || localStoryboards.length === 0}
        transitioningState={transitioningState}
        onNext={onNext}
      >
        <StoryboardToolbar
          totalSegments={sortedStoryboards.length}
          totalPanels={totalPanels}
          isDownloadingImages={isDownloadingImages}
          runningCount={runningCount}
          pendingPanelCount={pendingPanelCount}
          isBatchSubmitting={isEpisodeBatchSubmitting}
          addingStoryboardGroup={addingStoryboardGroup}
          addingStoryboardGroupState={addingStoryboardGroupState}
          onDownloadAllImages={downloadAllImages}
          onGenerateAllPanels={handleGenerateAllPanels}
          onAddStoryboardGroupAtStart={() => addStoryboardGroup(0)}
          onBack={onBack}
        />

        <StoryboardCanvas
          sortedStoryboards={sortedStoryboards}
          videoRatio={videoRatio}
          expandedClips={expandedClips}
          submittingStoryboardIds={submittingStoryboardIds}
          selectingCandidateIds={selectingCandidateIds}
          submittingStoryboardTextIds={submittingStoryboardTextIds}
          savingPanels={savingPanels}
          deletingPanelIds={deletingPanelIds}
          saveStateByPanel={saveStateByPanel}
          hasUnsavedByPanel={hasUnsavedByPanel}
          modifyingPanels={modifyingPanels}
          submittingPanelImageIds={submittingPanelImageIds}

          movingClipId={movingClipId}
          insertingAfterPanelId={insertingAfterPanelId}
          submittingVariantPanelId={submittingVariantPanelId}
          projectId={projectId}
          episodeId={episodeId}
          storyboardStartIndex={storyboardStartIndex}
          getClipInfo={getClipInfo}
          getTextPanels={getTextPanels}
          getPanelEditData={getPanelEditData}
          formatClipTitle={formatClipTitle}
          onToggleExpandedClip={toggleExpandedClip}
          onMoveStoryboardGroup={moveStoryboardGroup}
          onRegenerateStoryboardText={regenerateStoryboardText}
          onAddPanel={addPanel}
          onDeleteStoryboard={deleteStoryboard}
          onGenerateAllIndividually={regenerateAllPanelsIndividually}
          onPreviewImage={setPreviewImage}
          onCloseStoryboardError={clearStoryboardError}
          onPanelUpdate={handlePanelUpdate}
          onPanelDelete={deletePanel}
          onOpenCharacterPicker={(panelId) => setAssetPickerPanel({ panelId, type: 'character' })}
          onOpenLocationPicker={(panelId) => setAssetPickerPanel({ panelId, type: 'location' })}
          onRemoveCharacter={handleRemoveCharacter}
          onRemoveLocation={handleRemoveLocation}
          onRetryPanelSave={retrySave}
          onRegeneratePanelImage={regeneratePanelImage}
          onBatchGenerateNextPanels={regenerateNextNPanels}
          linkedPanels={linkedPanels}
          isLastLinkablePanel={isLastLinkablePanel}
          canEnableLink={canEnableLink}
          onToggleLink={handleToggleLink}
          onRegenerateStoryboardGroupImage={regenerateStoryboardGroupImage}
          onSelectStoryboardGroupImage={selectStoryboardGroupImage}
          onDeleteStoryboardGroupHistoryImage={deleteStoryboardGroupHistoryImage}
          onOpenEditModal={(storyboardId, panelIndex) => setEditingPanel({ storyboardId, panelIndex })}
          onOpenAIDataModal={(storyboardId, panelIndex) => setAIDataPanel({ storyboardId, panelIndex })}
          getPanelCandidates={getPanelCandidates}
          onSelectPanelCandidateIndex={selectPanelCandidateIndex}
          onConfirmPanelCandidate={selectPanelCandidate}
          onCancelPanelCandidate={cancelPanelCandidate}
          onDeletePanelImage={handleDeletePanelImage}
          onUploadPanelImage={handleUploadPanelImage}
          onSelectPanelHistoryImage={handleSelectPanelHistoryImage}
          onDeletePanelHistoryImage={handleDeletePanelHistoryImage}
          uploadingPanelIds={uploadingPanelIds}

          onInsertPanel={insertPanel}
          onPanelVariant={generatePanelVariant}
          addStoryboardGroup={addStoryboardGroup}
          addingStoryboardGroup={addingStoryboardGroup}
          setLocalStoryboards={setLocalStoryboards}
        />

        {modalRuntime.editingPanel && (
          <ImageEditModal
            projectId={modalRuntime.projectId}
            defaultAssets={modalRuntime.imageEditDefaults}
            onSubmit={modalRuntime.handleEditSubmit}
            onClose={modalRuntime.closeImageEditModal}
          />
        )}

        {modalRuntime.aiDataPanel && modalRuntime.aiDataRuntime && (
          <AIDataModal
            isOpen={true}
            onClose={modalRuntime.closeAIDataModal}
            syncKey={modalRuntime.aiDataRuntime.panel.id}
            panelNumber={modalRuntime.aiDataRuntime.panelData.panelNumber || modalRuntime.aiDataPanel.panelIndex + 1}
            shotType={modalRuntime.aiDataRuntime.panelData.shotType}
            cameraMove={modalRuntime.aiDataRuntime.panelData.cameraMove}
            description={modalRuntime.aiDataRuntime.panelData.description}
            sceneType={modalRuntime.aiDataRuntime.panelData.sceneType}
            sourceText={modalRuntime.aiDataRuntime.panelData.sourceText}
            duration={modalRuntime.aiDataRuntime.panelData.duration}
            location={modalRuntime.aiDataRuntime.panelData.location}
            characters={modalRuntime.aiDataRuntime.characters}
            videoPrompt={modalRuntime.aiDataRuntime.panelData.videoPrompt}
            firstFrameImagePrompt={modalRuntime.aiDataRuntime.panelData.firstLastFramePrompt || null}
            photographyRules={modalRuntime.aiDataRuntime.photographyRules}
            actingNotes={modalRuntime.aiDataRuntime.actingNotes}
            videoRatio={modalRuntime.videoRatio}
            onSave={modalRuntime.handleSaveAIData}
          />
        )}

        {modalRuntime.previewImage && (
          <ImagePreviewModal imageUrl={modalRuntime.previewImage} onClose={modalRuntime.closePreviewImage} />
        )}

        {modalRuntime.hasCharacterPicker && (
          <CharacterPickerModal
            projectId={projectId}
            currentCharacters={modalRuntime.pickerPanelRuntime ? getPanelEditData(modalRuntime.pickerPanelRuntime.panel).characters : []}
            onSelect={modalRuntime.handleAddCharacter}
            onClose={modalRuntime.closeAssetPicker}
          />
        )}

        {modalRuntime.hasLocationPicker && (
          <LocationPickerModal
            projectId={projectId}
            currentLocation={modalRuntime.pickerPanelRuntime ? getPanelEditData(modalRuntime.pickerPanelRuntime.panel).location || null : null}
            onSelect={modalRuntime.handleSetLocation}
            onClose={modalRuntime.closeAssetPicker}
          />
        )}
      </StoryboardStageShell>
  )
}
