import type { NovelPromotionStoryboard, NovelPromotionClip, NovelPromotionPanel } from '@/types/project'
import type { StoryboardPanel } from './hooks/useStoryboardState'
import type { PanelEditData } from '../PanelEditForm'
import type { VariantData, VariantOptions } from './hooks/usePanelVariant'
import type { PanelSaveState } from './hooks/usePanelCrudActions'
import type { StoryboardRegenerateStartPhase } from './hooks/useStoryboardGroupActions'

export interface StoryboardGroupProps {
  storyboard: NovelPromotionStoryboard
  clip: NovelPromotionClip | undefined
  sbIndex: number
  totalStoryboards: number
  textPanels: StoryboardPanel[]
  storyboardStartIndex: number
  videoRatio: string
  isExpanded: boolean
  isSubmittingStoryboardTask: boolean
  isSelectingCandidate: boolean
  isSubmittingStoryboardTextTask: boolean
  hasAnyImage: boolean
  failedError: string | null
  savingPanels: Set<string>
  deletingPanelIds: Set<string>
  saveStateByPanel: Record<string, PanelSaveState>
  hasUnsavedByPanel: Set<string>
  modifyingPanels: Set<string>
  submittingPanelImageIds: Set<string>

  onToggleExpand: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRegenerateText: (startPhase?: StoryboardRegenerateStartPhase) => void
  onAddPanel: () => void
  onDeleteStoryboard: () => void
  onGenerateAllIndividually: () => void
  onPreviewImage: (url: string) => void
  onCloseError: () => void
  getPanelEditData: (panel: StoryboardPanel) => PanelEditData
  onPanelUpdate: (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => void
  onSavePanelData: (storyboardId: string, panelData: PanelEditData) => void | Promise<void>
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
  onRegenerateStoryboardGroupImage: (groupNumber: number, count?: number) => void
  onSelectStoryboardGroupImage: (groupNumber: number, imageUrl: string) => Promise<void>
  onDeleteStoryboardGroupHistoryImage: (groupNumber: number, imageUrl: string) => Promise<void>
  onOpenEditModal: (panelIndex: number) => void
  onOpenAIDataModal: (panelIndex: number) => void
  getPanelCandidates: (panel: NovelPromotionPanel) => { candidates: string[]; selectedIndex: number } | null
  onSelectPanelCandidateIndex: (panelId: string, index: number) => void
  onConfirmPanelCandidate: (panelId: string, imageUrl: string) => Promise<void>
  onCancelPanelCandidate: (panelId: string) => void
  onDeletePanelImage: (panelId: string) => void
  onUploadPanelImage: (panelId: string, file: File) => void
  onSelectPanelHistoryImage: (panelId: string, imageUrl: string) => Promise<void>
  onDeletePanelHistoryImage: (panelId: string, imageUrl: string) => Promise<void>
  uploadingPanelIds: Set<string>

  formatClipTitle: (clip: NovelPromotionClip | undefined) => string
  movingClipId: string | null
  onInsertPanel: (storyboardId: string, insertAfterPanelId: string, userInput: string) => Promise<void>
  insertingAfterPanelId: string | null
  projectId: string
  episodeId: string
  onPanelVariant: (
    sourcePanelId: string,
    storyboardId: string,
    insertAfterPanelId: string,
    variant: VariantData,
    options: VariantOptions,
  ) => Promise<void>
  submittingVariantPanelId: string | null
}
