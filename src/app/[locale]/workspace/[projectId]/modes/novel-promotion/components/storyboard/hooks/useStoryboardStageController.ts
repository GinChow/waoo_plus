'use client'

import { useCallback, useMemo } from 'react'
import {
  NovelPromotionStoryboard,
  NovelPromotionClip,
  Character,
  Location,
} from '@/types/project'
import { useProjectAssets } from '@/lib/query/hooks/useProjectAssets'
import {
  useUpdateProjectPhotographyPlan,
  useUpdateProjectPanelActingNotes,
  useUpdateProjectPanelLink,
  useRefreshEpisodeData,
  useRefreshStoryboards,
} from '@/lib/query/hooks'
import { useStoryboardPanelLinking } from './useStoryboardPanelLinking'
import { useStoryboardState } from './useStoryboardState'
import { usePanelOperations } from './usePanelOperations'
import { useStoryboardImageGeneration } from './useImageGeneration'
import { usePanelVariant } from './usePanelVariant'
import { useStoryboardTaskAwareStoryboards } from './useStoryboardTaskAwareStoryboards'
import { useStoryboardPanelAssetActions } from './useStoryboardPanelAssetActions'
import { useStoryboardStageUiState } from './useStoryboardStageUiState'
import { useStoryboardStageStatus } from './useStoryboardStageStatus'

interface UseStoryboardStageControllerProps {
  projectId: string
  episodeId: string
  initialStoryboards: NovelPromotionStoryboard[]
  clips: NovelPromotionClip[]
  isTransitioning: boolean
}

export function useStoryboardStageController({
  projectId,
  episodeId,
  initialStoryboards,
  clips,
  isTransitioning,
}: UseStoryboardStageControllerProps) {
  const isRunningPhase = useCallback((phase: string | null | undefined) => {
    return phase === 'queued' || phase === 'processing'
  }, [])

  const { data: assets } = useProjectAssets(projectId)
  const characters: Character[] = useMemo(() => assets?.characters ?? [], [assets?.characters])
  const locations: Location[] = useMemo(() => assets?.locations ?? [], [assets?.locations])

  const { taskAwareStoryboards } = useStoryboardTaskAwareStoryboards({
    projectId,
    initialStoryboards,
    isRunningPhase,
  })

  const storyboardState = useStoryboardState({
    projectId,
    episodeId,
    initialStoryboards: taskAwareStoryboards,
    clips,
  })

  const {
    localStoryboards,
    setLocalStoryboards,
    sortedStoryboards,
    expandedClips,
    toggleExpandedClip,
    panelEditsRef,
    getClipInfo,
    getTextPanels,
    getPanelEditData,
    updatePanelEdit,
    formatClipTitle,
    totalPanels,
    storyboardStartIndex,
  } = storyboardState

  const panelOps = usePanelOperations({
    projectId,
    episodeId,
    panelEditsRef,
  })

  const {
    savingPanels,
    deletingPanelIds,
    saveStateByPanel,
    hasUnsavedByPanel,
    submittingStoryboardTextIds,
    addingStoryboardGroup,
    movingClipId,
    insertingAfterPanelId,
    savePanelWithData,
    debouncedSave,
    retrySave,
    addPanel,
    deletePanel,
    deleteStoryboard,
    regenerateStoryboardText,
    addStoryboardGroup,
    moveStoryboardGroup,
    addCharacterToPanel,
    removeCharacterFromPanel,
    setPanelLocation,
    insertPanel,
  } = panelOps

  const variantOps = usePanelVariant({
    projectId,
    episodeId,
    setLocalStoryboards,
  })

  const { submittingVariantPanelId, generatePanelVariant } = variantOps

  const imageOps = useStoryboardImageGeneration({
    projectId,
    episodeId,
    localStoryboards,
    setLocalStoryboards,
  })

  const {
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
    modifyPanelImage,
    downloadAllImages,
    clearStoryboardError,
  } = imageOps

  const updatePhotographyPlanMutation = useUpdateProjectPhotographyPlan(projectId)
  const updatePanelActingNotesMutation = useUpdateProjectPanelActingNotes(projectId)

  const {
    assetPickerPanel,
    setAssetPickerPanel,
    aiDataPanel,
    setAIDataPanel,
    isEpisodeBatchSubmitting,
    setIsEpisodeBatchSubmitting,
  } = useStoryboardStageUiState()

  const {
    getDefaultAssetsForClip,
    handleEditSubmit,
    handlePanelUpdate,
    handleAddCharacter,
    handleSetLocation,
    handleRemoveCharacter,
    handleRemoveLocation,
    runningCount,
    pendingPanelCount,
    handleGenerateAllPanels,
  } = useStoryboardPanelAssetActions({
    clips,
    characters,
    locations,
    localStoryboards,
    sortedStoryboards,
    submittingPanelImageIds,
    editingPanel,
    setEditingPanel,
    setIsEpisodeBatchSubmitting,
    getTextPanels,
    getPanelEditData,
    updatePanelEdit,
    debouncedSave,
    regenerateStoryboardGroupImage,
    modifyPanelImage,
    addCharacterToPanel,
    removeCharacterFromPanel,
    setPanelLocation,
    assetPickerPanel,
    setAssetPickerPanel,
  })

  const { addingStoryboardGroupState, transitioningState } = useStoryboardStageStatus({
    addingStoryboardGroup,
    isTransitioning,
  })

  const updatePanelLinkMutation = useUpdateProjectPanelLink(projectId)
  const refreshEpisodeData = useRefreshEpisodeData(projectId, episodeId)
  const refreshStoryboards = useRefreshStoryboards(episodeId)

  const {
    linkedPanels,
    isLastPanel: isLastLinkablePanel,
    canEnableLink,
    handleToggleLink,
  } = useStoryboardPanelLinking({
    sortedStoryboards,
    getTextPanels,
    updatePanelLinkMutation,
    onPersisted: () => {
      refreshEpisodeData()
      refreshStoryboards()
    },
  })

  const regenerateNextNPanels = useCallback(
    async (startPanelId: string, count: number = 10) => {
      const orderedPanels = sortedStoryboards.flatMap((storyboard) => getTextPanels(storyboard))
      const startIndex = orderedPanels.findIndex((panel) => panel.id === startPanelId)
      if (startIndex < 0) return

      const eligible: string[] = []
      for (let index = startIndex; index < orderedPanels.length && eligible.length < count; index += 1) {
        const panel = orderedPanels[index]
        if (panel.imageUrl) continue
        if (panel.imageTaskRunning) continue
        if (submittingPanelImageIds.has(panel.id)) continue
        eligible.push(panel.id)
      }

      if (eligible.length === 0) return
      await Promise.all(eligible.map((panelId) => regeneratePanelImage(panelId, 1, false)))
    },
    [sortedStoryboards, getTextPanels, submittingPanelImageIds, regeneratePanelImage],
  )

  return {
    localStoryboards, setLocalStoryboards, sortedStoryboards, expandedClips, toggleExpandedClip,
    getClipInfo, getTextPanels, getPanelEditData, updatePanelEdit, formatClipTitle, totalPanels, storyboardStartIndex,
    savingPanels, deletingPanelIds, saveStateByPanel, hasUnsavedByPanel, submittingStoryboardTextIds, addingStoryboardGroup, movingClipId, insertingAfterPanelId,
    savePanelWithData, addPanel, deletePanel, deleteStoryboard, regenerateStoryboardText, addStoryboardGroup, moveStoryboardGroup, insertPanel,
    submittingVariantPanelId, generatePanelVariant,
    submittingStoryboardIds, submittingPanelImageIds, selectingCandidateIds,
    editingPanel, setEditingPanel, modifyingPanels, isDownloadingImages, previewImage, setPreviewImage,
    regeneratePanelImage, regenerateAllPanelsIndividually, regenerateStoryboardGroupImage, selectStoryboardGroupImage, deleteStoryboardGroupHistoryImage, selectPanelCandidate, selectPanelCandidateIndex,
    cancelPanelCandidate, getPanelCandidates, modifyPanelImage, downloadAllImages, clearStoryboardError,
    assetPickerPanel, setAssetPickerPanel, aiDataPanel, setAIDataPanel, isEpisodeBatchSubmitting,
    getDefaultAssetsForClip, handleEditSubmit, handlePanelUpdate, handleAddCharacter, handleSetLocation, handleRemoveCharacter, handleRemoveLocation,
    retrySave,
    updatePhotographyPlanMutation, updatePanelActingNotesMutation,
    addingStoryboardGroupState, transitioningState, runningCount, pendingPanelCount, handleGenerateAllPanels,
    regenerateNextNPanels,
    linkedPanels, isLastLinkablePanel, canEnableLink, handleToggleLink,
  }
}
