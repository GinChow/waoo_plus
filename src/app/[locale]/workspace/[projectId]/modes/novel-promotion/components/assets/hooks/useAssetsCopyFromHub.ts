'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { isAbortError } from '@/lib/error-utils'
import { useCopyProjectAssetFromGlobal, useUploadProjectAssetToGlobal } from '@/lib/query/hooks'

type ToastType = 'success' | 'warning' | 'error'

type ShowToast = (message: string, type?: ToastType, duration?: number) => void

export type GlobalCopyTarget = {
  type: 'character' | 'location' | 'prop' | 'voice'
  targetId: string
}

interface UseAssetsCopyFromHubParams {
  projectId: string
  onRefresh: () => void | Promise<void>
  showToast: ShowToast
}

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

export function useAssetsCopyFromHub({ projectId, onRefresh, showToast }: UseAssetsCopyFromHubParams) {
  const t = useTranslations('assets')
  const copyFromGlobalAsset = useCopyProjectAssetFromGlobal(projectId)
  const uploadToGlobalAsset = useUploadProjectAssetToGlobal(projectId)
  const [copyFromGlobalTarget, setCopyFromGlobalTarget] = useState<GlobalCopyTarget | null>(null)
  const [isGlobalCopyInFlight, setIsGlobalCopyInFlight] = useState(false)
  const [uploadingToGlobalTarget, setUploadingToGlobalTarget] = useState<GlobalCopyTarget | null>(null)

  const handleCopyFromGlobal = useCallback((characterId: string) => {
    setCopyFromGlobalTarget({ type: 'character', targetId: characterId })
  }, [])

  const handleCopyLocationFromGlobal = useCallback((locationId: string) => {
    setCopyFromGlobalTarget({ type: 'location', targetId: locationId })
  }, [])

  const handleCopyPropFromGlobal = useCallback((propId: string) => {
    setCopyFromGlobalTarget({ type: 'prop', targetId: propId })
  }, [])

  const handleVoiceSelectFromHub = useCallback((characterId: string) => {
    setCopyFromGlobalTarget({ type: 'voice', targetId: characterId })
  }, [])

  const handleCloseCopyPicker = useCallback(() => {
    setCopyFromGlobalTarget(null)
  }, [])

  const handleUploadCharacterToGlobal = useCallback(async (characterId: string) => {
    setUploadingToGlobalTarget({ type: 'character', targetId: characterId })
    try {
      await uploadToGlobalAsset.mutateAsync({
        type: 'character',
        targetId: characterId,
      })
      showToast(t('assetLibrary.uploadSuccessCharacter'), 'success')
    } catch (error: unknown) {
      if (!isAbortError(error)) {
        showToast(t('assetLibrary.uploadFailed', { error: getErrorMessage(error) }), 'error')
      }
    } finally {
      setUploadingToGlobalTarget(null)
    }
  }, [showToast, t, uploadToGlobalAsset])

  const handleUploadLocationToGlobal = useCallback(async (locationId: string) => {
    setUploadingToGlobalTarget({ type: 'location', targetId: locationId })
    try {
      await uploadToGlobalAsset.mutateAsync({
        type: 'location',
        targetId: locationId,
      })
      showToast(t('assetLibrary.uploadSuccessLocation'), 'success')
    } catch (error: unknown) {
      if (!isAbortError(error)) {
        showToast(t('assetLibrary.uploadFailed', { error: getErrorMessage(error) }), 'error')
      }
    } finally {
      setUploadingToGlobalTarget(null)
    }
  }, [showToast, t, uploadToGlobalAsset])

  const handleConfirmCopyFromGlobal = useCallback(async (globalAssetId: string) => {
    if (!copyFromGlobalTarget) return

    setIsGlobalCopyInFlight(true)
    try {
      await copyFromGlobalAsset.mutateAsync({
        type: copyFromGlobalTarget.type,
        targetId: copyFromGlobalTarget.targetId,
        globalAssetId,
      })

      const successMsg = copyFromGlobalTarget.type === 'character'
        ? t('assetLibrary.copySuccessCharacter')
        : copyFromGlobalTarget.type === 'location'
          ? t('assetLibrary.copySuccessLocation')
          : copyFromGlobalTarget.type === 'prop'
            ? t('assetLibrary.copySuccessProp')
          : t('assetLibrary.copySuccessVoice')
      showToast(successMsg, 'success')
      setCopyFromGlobalTarget(null)
      await Promise.resolve(onRefresh())
    } catch (error: unknown) {
      if (!isAbortError(error)) {
        showToast(t('assetLibrary.copyFailed', { error: getErrorMessage(error) }), 'error')
      }
    } finally {
      setIsGlobalCopyInFlight(false)
    }
  }, [copyFromGlobalAsset, copyFromGlobalTarget, onRefresh, showToast, t])

  return {
    copyFromGlobalTarget,
    isGlobalCopyInFlight,
    isGlobalUploadInFlight: uploadToGlobalAsset.isPending,
    uploadingToGlobalTarget,
    handleCopyFromGlobal,
    handleCopyLocationFromGlobal,
    handleCopyPropFromGlobal,
    handleUploadCharacterToGlobal,
    handleUploadLocationToGlobal,
    handleVoiceSelectFromHub,
    handleConfirmCopyFromGlobal,
    handleCloseCopyPicker,
  }
}
