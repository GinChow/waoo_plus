'use client'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import ImageGenerationInlineCountButton from '@/components/image-generation/ImageGenerationInlineCountButton'
import { getImageGenerationCountOptions } from '@/lib/image-generation/count'
import { useImageGenerationCount } from '@/lib/image-generation/use-image-generation-count'
import { AI_EDIT_BUTTON_CLASS, AI_EDIT_ICON_CLASS } from '@/components/ui/ai-edit-style'
import AISparklesIcon from '@/components/ui/icons/AISparklesIcon'
import PanelImageHistoryPopover from './PanelImageHistoryPopover'

interface ImageSectionActionButtonsProps {
  panelId: string
  imageUrl: string | null
  previousImageUrl?: string | null
  imageHistoryRaw?: string | null
  isSubmittingPanelImageTask: boolean
  isModifying: boolean
  onRegeneratePanelImage: (panelId: string, count?: number, force?: boolean) => void
  onOpenEditModal: () => void
  onOpenLocalEditor?: () => void
  onOpenAIDataModal: () => void
  onUndo?: (panelId: string) => void
  onDeleteImage?: (panelId: string) => void
  onUploadImage?: (panelId: string, file: File) => void
  onSelectHistoryImage?: (panelId: string, imageUrl: string) => Promise<void>
  onDeleteHistoryImage?: (panelId: string, imageUrl: string) => Promise<void>
  onPreviewImage?: (url: string) => void
  isUploading?: boolean
  triggerPulse: () => void
}

export default function ImageSectionActionButtons({
  panelId,
  imageUrl,
  previousImageUrl,
  imageHistoryRaw,
  isSubmittingPanelImageTask,
  isModifying,
  onRegeneratePanelImage,
  onOpenEditModal,
  onOpenLocalEditor,
  onOpenAIDataModal,
  onUndo,
  onDeleteImage,
  onUploadImage,
  onSelectHistoryImage,
  onDeleteHistoryImage,
  onPreviewImage,
  isUploading,
  triggerPulse,
}: ImageSectionActionButtonsProps) {
  const t = useTranslations('storyboard')
  const { count, setCount } = useImageGenerationCount('storyboard-candidates')
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      {/* 限宽在图片范围内并允许换行，窄面板下工具栏不会被裁切 */}
      <div className={`absolute bottom-1.5 inset-x-1.5 z-20 flex justify-center transition-opacity ${isSubmittingPanelImageTask ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <div className="relative max-w-full glass-surface-modal border border-[var(--glass-stroke-base)] rounded-lg p-0.5">
          <div className="flex flex-wrap items-center justify-center gap-0.5">
            <ImageGenerationInlineCountButton
              prefix={
                <>
                  <AppIcon name="refresh" className="w-2.5 h-2.5" />
                  <span>{isSubmittingPanelImageTask ? t('image.forceRegenerate') : t('panel.regenerate')}</span>
                </>
              }
              suffix={<span>{t('image.generateCountSuffix')}</span>}
              value={count}
              options={getImageGenerationCountOptions('storyboard-candidates')}
              onValueChange={setCount}
              onClick={() => {
                _ulogInfo('[ImageSection] 🔄 左下角重新生成按钮被点击')
                _ulogInfo('[ImageSection] isSubmittingPanelImageTask:', isSubmittingPanelImageTask)
                _ulogInfo('[ImageSection] 将传递 force:', isSubmittingPanelImageTask)
                triggerPulse()
                onRegeneratePanelImage(panelId, count, isSubmittingPanelImageTask)
              }}
              disabled={false}
              ariaLabel={t('image.selectCount')}
              className={`glass-btn-base glass-btn-secondary flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 ${isSubmittingPanelImageTask ? 'opacity-75' : ''}`}
              selectClassName="appearance-none bg-transparent border-0 pl-0 pr-3 text-[10px] font-semibold text-[var(--glass-text-primary)] outline-none cursor-pointer leading-none transition-colors"
              labelClassName="inline-flex items-center gap-0.5"
            />

            <div className="w-px h-3 bg-[var(--glass-stroke-base)]" />

            <button
              onClick={onOpenAIDataModal}
              className={`glass-btn-base glass-btn-secondary flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 ${isSubmittingPanelImageTask || isModifying ? 'opacity-75' : ''}`}
              title={t('aiData.viewData')}
            >
              <AppIcon name="chart" className="w-2.5 h-2.5" />
              <span>{t('aiData.viewData')}</span>
            </button>

            {imageHistoryRaw && onSelectHistoryImage && onDeleteHistoryImage && (
              <>
                <div className="w-px h-3 bg-[var(--glass-stroke-base)]" />
                <PanelImageHistoryPopover
                  panelId={panelId}
                  imageHistoryRaw={imageHistoryRaw}
                  currentImageUrl={imageUrl}
                  onSelectHistoryImage={onSelectHistoryImage}
                  onDeleteHistoryImage={onDeleteHistoryImage}
                  onPreviewImage={onPreviewImage}
                />
              </>
            )}
            {imageUrl && (
              <button
                onClick={onOpenEditModal}
                className={`glass-btn-base h-6 w-6 rounded-full flex items-center justify-center transition-all active:scale-95 ${AI_EDIT_BUTTON_CLASS} ${isSubmittingPanelImageTask || isModifying ? 'opacity-75' : ''}`}
                title={t('image.editImage')}
              >
                <AISparklesIcon className={`w-2.5 h-2.5 ${AI_EDIT_ICON_CLASS}`} />
              </button>
            )}

            {imageUrl && onOpenLocalEditor && (
              <button
                onClick={onOpenLocalEditor}
                disabled={isSubmittingPanelImageTask || isModifying}
                className={`glass-btn-base glass-btn-secondary flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 disabled:opacity-50`}
                title={t('image.localEditor.openTitle')}
              >
                <AppIcon name="editSquare" className="w-2.5 h-2.5" />
                <span>{t('image.localEditor.openLabel')}</span>
              </button>
            )}

            {previousImageUrl && onUndo && (
              <>
                <div className="w-px h-3 bg-[var(--glass-stroke-base)]" />
                <button
                  onClick={() => onUndo(panelId)}
                  disabled={isSubmittingPanelImageTask}
                  className="glass-btn-base glass-btn-secondary flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 disabled:opacity-50"
                  title={t('assets.image.undo')}
                >
                  <span>{t('assets.image.undo')}</span>
                </button>
              </>
            )}

            {onUploadImage && (
              <>
                <div className="w-px h-3 bg-[var(--glass-stroke-base)]" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmittingPanelImageTask || isModifying || isUploading}
                  className="glass-btn-base glass-btn-secondary flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 disabled:opacity-50"
                  title={t('image.uploadLocal')}
                >
                  <AppIcon name="upload" className="w-2.5 h-2.5" />
                  <span>{isUploading ? t('image.uploading') : t('image.uploadLocal')}</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      onUploadImage(panelId, file)
                      e.target.value = ''
                    }
                  }}
                />
              </>
            )}

            {imageUrl && onDeleteImage && (
              <>
                <div className="w-px h-3 bg-[var(--glass-stroke-base)]" />
                <button
                  onClick={() => {
                    if (window.confirm(t('image.deleteImageConfirm'))) {
                      onDeleteImage(panelId)
                    }
                  }}
                  disabled={isSubmittingPanelImageTask || isModifying}
                  className="glass-btn-base glass-btn-tone-danger flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 disabled:opacity-50"
                  title={t('image.deleteImage')}
                >
                  <AppIcon name="trash" className="w-2.5 h-2.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
