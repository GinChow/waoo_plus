'use client'

import { useTranslations } from 'next-intl'
import PanelEditForm, { PanelEditData } from '../PanelEditForm'
import ImageSection from './ImageSection'
import { StoryboardPanel } from './hooks/useStoryboardState'
import { GlassSurface } from '@/components/ui/primitives'
import { AppIcon } from '@/components/ui/icons'

interface PanelCandidateData {
  candidates: string[]
  selectedIndex: number
}

interface PanelCardProps {
  embedded?: boolean
  panel: StoryboardPanel
  panelData: PanelEditData
  imageUrl: string | null
  globalPanelNumber: number
  storyboardId: string
  videoRatio: string
  isSaving: boolean
  hasUnsavedChanges?: boolean
  saveErrorMessage?: string | null
  isDeleting: boolean
  isModifying: boolean
  isSubmittingPanelImageTask: boolean
  failedError: string | null
  candidateData: PanelCandidateData | null
  previousImageUrl?: string | null  // 支持撤回
  onUpdate: (updates: Partial<PanelEditData>) => void
  onDelete: () => void
  onOpenCharacterPicker: () => void
  onOpenLocationPicker: () => void
  onRetrySave?: () => void
  onRemoveCharacter: (index: number) => void
  onRemoveLocation: () => void
  onRegeneratePanelImage: (panelId: string, count?: number, force?: boolean) => void
  onBatchGenerateNextPanels?: (startPanelId: string, count?: number) => Promise<void> | void
  onOpenEditModal: () => void
  onOpenAIDataModal: () => void
  onSelectCandidateIndex: (panelId: string, index: number) => void
  onConfirmCandidate: (panelId: string, imageUrl: string) => Promise<void>
  onCancelCandidate: (panelId: string) => void
  onClearError: () => void
  onUndo?: (panelId: string) => void  // 撤回到上一版本
  onDeleteImage?: (panelId: string) => void  // 删除分镜图片
  onUploadImage?: (panelId: string, file: File) => void  // 上传本地图片
  onSelectHistoryImage?: (panelId: string, imageUrl: string) => Promise<void>
  onDeleteHistoryImage?: (panelId: string, imageUrl: string) => Promise<void>
  isUploading?: boolean
  onPreviewImage?: (url: string) => void  // 放大预览图片
}

export default function PanelCard({
  embedded = false,
  panel,
  panelData,
  imageUrl,
  globalPanelNumber,
  storyboardId,
  videoRatio,
  isSaving,
  hasUnsavedChanges = false,
  saveErrorMessage = null,
  isDeleting,
  isModifying,
  isSubmittingPanelImageTask,
  failedError,
  candidateData,
  previousImageUrl,
  onUpdate,
  onDelete,
  onOpenCharacterPicker,
  onOpenLocationPicker,
  onRetrySave,
  onRemoveCharacter,
  onRemoveLocation,
  onRegeneratePanelImage,
  onBatchGenerateNextPanels,
  onOpenEditModal,
  onOpenAIDataModal,
  onSelectCandidateIndex,
  onConfirmCandidate,
  onCancelCandidate,
  onClearError,
  onUndo,
  onDeleteImage,
  onUploadImage,
  onSelectHistoryImage,
  onDeleteHistoryImage,
  isUploading,
  onPreviewImage,
}: PanelCardProps) {
  const t = useTranslations('storyboard')
  const content = (
    <>
      {/* 删除按钮 - 右上角外部 */}
      {!isModifying && !isDeleting && (
        <button
          onClick={onDelete}
          className="absolute -top-2 -right-2 z-10 opacity-0 group-hover/card:opacity-100 transition-opacity bg-[var(--glass-tone-danger-fg)] hover:bg-[var(--glass-tone-danger-fg)] text-white w-5 h-5 rounded-full flex items-center justify-center text-xs shadow-md"
          title={t('panelActions.deleteShot')}
        >
          <AppIcon name="closeMd" className="h-3 w-3" />
        </button>
      )}

      <div className="relative">
        <ImageSection
          panelId={panel.id}
          imageUrl={imageUrl}
          globalPanelNumber={globalPanelNumber}
          shotType={panel.shot_type}
          duration={panel.duration}
          videoRatio={videoRatio}
          isDeleting={isDeleting}
          isModifying={isModifying}
          isSubmittingPanelImageTask={isSubmittingPanelImageTask}
          failedError={failedError}
          candidateData={candidateData}
          previousImageUrl={previousImageUrl}
          imageHistoryRaw={panel.imageHistory ?? null}
          onRegeneratePanelImage={onRegeneratePanelImage}
          onBatchGenerateNextPanels={onBatchGenerateNextPanels}
          onOpenEditModal={onOpenEditModal}
          onOpenAIDataModal={onOpenAIDataModal}
          onSelectCandidateIndex={onSelectCandidateIndex}
          onConfirmCandidate={onConfirmCandidate}
          onCancelCandidate={onCancelCandidate}
          onClearError={onClearError}
          onUndo={onUndo}
          onDeleteImage={onDeleteImage}
          onUploadImage={onUploadImage}
          onSelectHistoryImage={onSelectHistoryImage}
          onDeleteHistoryImage={onDeleteHistoryImage}
          isUploading={isUploading}
          onPreviewImage={onPreviewImage}
        />
      </div>

      <div className="p-3">
        <PanelEditForm
          panelData={panelData}
          isSaving={isSaving}
          saveStatus={hasUnsavedChanges ? 'error' : (isSaving ? 'saving' : 'idle')}
          saveErrorMessage={saveErrorMessage}
          onRetrySave={onRetrySave}
          onUpdate={onUpdate}
          onOpenCharacterPicker={onOpenCharacterPicker}
          onOpenLocationPicker={onOpenLocationPicker}
          onRemoveCharacter={onRemoveCharacter}
          onRemoveLocation={onRemoveLocation}
        />
      </div>
    </>
  )

  if (embedded) {
    return (
      <div className="relative h-full overflow-visible group/card" data-storyboard-id={storyboardId}>
        {content}
      </div>
    )
  }

  return (
    <GlassSurface
      variant="elevated"
      padded={false}
      className="relative h-full overflow-visible transition-all hover:shadow-[var(--glass-shadow-md)] group/card"
      data-storyboard-id={storyboardId}
    >
      {content}
    </GlassSurface>
  )
}
