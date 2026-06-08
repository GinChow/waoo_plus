'use client'
import { useTranslations } from 'next-intl'
import { useState, useRef, useCallback } from 'react'
import { Character, Location } from '@/types/project'
import { useProjectAssets } from '@/lib/query/hooks/useProjectAssets'
import { SelectedAsset } from './hooks/useImageGeneration'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import ImageEditModalSelectedAssets from './ImageEditModalSelectedAssets'
import ImageEditModalAssetPicker from './ImageEditModalAssetPicker'
import { AppIcon } from '@/components/ui/icons'
import type { AdjacentPanelImage } from './hooks/useStoryboardModalRuntime'

interface ImageEditModalProps {
  projectId: string
  defaultAssets: SelectedAsset[]
  baseImageUrl?: string | null
  adjacentImages?: AdjacentPanelImage[]
  onSubmit: (prompt: string, images: string[], assets: SelectedAsset[], options?: { ignoreBaseImage?: boolean }) => void
  onClose: () => void
}

export default function ImageEditModal({
  projectId,
  defaultAssets,
  baseImageUrl,
  adjacentImages = [],
  onSubmit,
  onClose,
}: ImageEditModalProps) {
  const t = useTranslations('storyboard')

  const { data: assets } = useProjectAssets(projectId)
  const characters: Character[] = assets?.characters ?? []
  const locations: Location[] = assets?.locations ?? []

  const [editPrompt, setEditPrompt] = useState('')
  const [editImages, setEditImages] = useState<string[]>([])
  const [keepBaseImage, setKeepBaseImage] = useState(true)
  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>(defaultAssets)
  const [showAssetPicker, setShowAssetPicker] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return

    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = (readerEvent) => {
        const base64 = readerEvent.target?.result as string
        setEditImages((previous) => [...previous, base64])
      }
      reader.readAsDataURL(file)
    })

    event.target.value = ''
  }, [])

  const handlePaste = useCallback((event: React.ClipboardEvent) => {
    const items = event.clipboardData.items
    for (let index = 0; index < items.length; index++) {
      if (items[index].type.startsWith('image/')) {
        const file = items[index].getAsFile()
        if (file) {
          const reader = new FileReader()
          reader.onload = (readerEvent) => {
            const base64 = readerEvent.target?.result as string
            setEditImages((previous) => [...previous, base64])
          }
          reader.readAsDataURL(file)
        }
      }
    }
  }, [])

  const removeImage = (index: number) => {
    setEditImages((previous) => previous.filter((_, imageIndex) => imageIndex !== index))
  }

  const toggleImageUrl = (url: string) => {
    setEditImages((previous) =>
      previous.includes(url) ? previous.filter((item) => item !== url) : [...previous, url],
    )
  }

  const handleAddAsset = (asset: SelectedAsset) => {
    setSelectedAssets((previous) => {
      if (previous.some((item) => item.id === asset.id && item.type === asset.type)) return previous
      return [...previous, asset]
    })
  }

  const handleRemoveAsset = (assetId: string, assetType: string) => {
    setSelectedAssets((previous) => previous.filter((item) => !(item.id === assetId && item.type === assetType)))
  }

  const showBaseImage = Boolean(baseImageUrl) && keepBaseImage
  const hasReferences = editImages.length > 0 || selectedAssets.length > 0 || showBaseImage

  const handleClearReferences = () => {
    setEditImages([])
    setSelectedAssets([])
    setKeepBaseImage(false)
  }

  const handleSubmit = () => {
    if (!editPrompt.trim()) {
      alert(t('prompts.enterInstruction'))
      return
    }
    onSubmit(editPrompt, editImages, selectedAssets, {
      ignoreBaseImage: Boolean(baseImageUrl) && !keepBaseImage,
    })
  }

  return (
    <div className="fixed inset-0 bg-[var(--glass-overlay)] z-50 flex items-center justify-center p-4">
      <div
        className="bg-[var(--glass-bg-surface)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onPaste={handlePaste}
      >
        <div className="p-6 border-b shrink-0">
          <h3 className="text-lg font-bold text-[var(--glass-text-primary)]">{t('imageEdit.title')}</h3>
          <p className="text-sm text-[var(--glass-text-tertiary)] mt-1">{t('imageEdit.subtitle')}</p>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto app-scrollbar flex-1 min-h-0">
          <div>
            <label className="block text-sm font-medium text-[var(--glass-text-secondary)] mb-2">{t('prompts.aiInstruction')}</label>
            <textarea
              value={editPrompt}
              onChange={(event) => setEditPrompt(event.target.value)}
              placeholder={t('imageEdit.promptPlaceholder')}
              className="w-full h-24 px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg focus:ring-2 focus:ring-[var(--glass-tone-info-fg)] focus:border-[var(--glass-stroke-focus)] resize-none"
              autoFocus
            />
          </div>

          <ImageEditModalSelectedAssets
            selectedAssets={selectedAssets}
            onOpenAssetPicker={() => setShowAssetPicker(true)}
            onPreviewImage={setPreviewImage}
            onRemoveAsset={handleRemoveAsset}
          />

          <div>
            <label className="block text-sm font-medium text-[var(--glass-text-secondary)] mb-2">
              {t('imageEdit.referenceImagesLabel')} <span className="text-[var(--glass-text-tertiary)] font-normal">{t('imageEdit.referenceImagesHint')}</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />
            <div className="flex flex-wrap gap-2">
              {showBaseImage && baseImageUrl && (
                <div className="relative w-16 h-16">
                  <button
                    type="button"
                    onClick={() => setPreviewImage(baseImageUrl)}
                    className="w-full h-full block"
                  >
                    <MediaImageWithLoading
                      src={baseImageUrl}
                      alt=""
                      containerClassName="w-full h-full rounded-lg ring-2 ring-[var(--glass-tone-info-fg)]"
                      className="w-full h-full object-cover rounded-lg"
                    />
                  </button>
                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] leading-4 text-center rounded-b-lg">
                    {t('imageEdit.baseImage')}
                  </span>
                  <button
                    onClick={() => setKeepBaseImage(false)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--glass-tone-danger-fg)] text-white rounded-full text-xs flex items-center justify-center hover:bg-[var(--glass-tone-danger-fg)]"
                  >
                    <AppIcon name="closeSm" className="h-3 w-3" />
                  </button>
                </div>
              )}
              {editImages.map((image, index) => (
                <div key={index} className="relative w-16 h-16">
                  <MediaImageWithLoading
                    src={image}
                    alt=""
                    containerClassName="w-full h-full rounded-lg"
                    className="w-full h-full object-cover rounded-lg"
                  />
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--glass-tone-danger-fg)] text-white rounded-full text-xs flex items-center justify-center hover:bg-[var(--glass-tone-danger-fg)]"
                  >
                    <AppIcon name="closeSm" className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 border-2 border-dashed border-[var(--glass-stroke-strong)] rounded-lg flex items-center justify-center text-[var(--glass-text-tertiary)] hover:border-[var(--glass-stroke-focus)] hover:text-[var(--glass-tone-info-fg)] transition-colors"
              >
                <AppIcon name="plus" className="w-6 h-6" />
              </button>
            </div>

            {adjacentImages.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-[var(--glass-text-tertiary)] mb-2">{t('imageEdit.adjacentPanelsHint')}</p>
                <div className="flex flex-wrap gap-2">
                  {adjacentImages.map((item) => {
                    const selected = editImages.includes(item.imageUrl)
                    return (
                      <button
                        key={item.position}
                        type="button"
                        onClick={() => toggleImageUrl(item.imageUrl)}
                        className={`relative w-16 h-16 rounded-lg overflow-hidden transition-all ${selected ? 'ring-2 ring-[var(--glass-accent-from)]' : 'ring-1 ring-[var(--glass-stroke-strong)] hover:ring-[var(--glass-stroke-focus)]'}`}
                      >
                        <MediaImageWithLoading
                          src={item.imageUrl}
                          alt=""
                          containerClassName="w-full h-full"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] leading-4 text-center">
                          {t(`imageEdit.adjacentLabel.${item.position}`)}
                        </span>
                        {selected && (
                          <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-[var(--glass-accent-from)] text-white rounded-full flex items-center justify-center">
                            <AppIcon name="check" className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t flex justify-between items-center gap-3">
          <button
            onClick={handleClearReferences}
            disabled={!hasReferences}
            className="px-4 py-2 text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('imageEdit.clearReferences')}
          </button>
          <div className="flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)] rounded-lg transition-colors"
          >
            {t('candidate.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!editPrompt.trim()}
            className="px-4 py-2 bg-[var(--glass-accent-from)] text-white rounded-lg hover:bg-[var(--glass-accent-to)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t('imageEdit.start')}
          </button>
          </div>
        </div>
      </div>

      <ImageEditModalAssetPicker
        isOpen={showAssetPicker}
        characters={characters}
        locations={locations}
        selectedAssets={selectedAssets}
        onClose={() => setShowAssetPicker(false)}
        onAddAsset={handleAddAsset}
        onRemoveAsset={handleRemoveAsset}
        onPreviewImage={setPreviewImage}
      />

      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  )
}
