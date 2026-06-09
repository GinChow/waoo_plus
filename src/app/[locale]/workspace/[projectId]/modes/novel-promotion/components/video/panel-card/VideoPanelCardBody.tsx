import React, { useState, useCallback, useRef, useEffect } from 'react'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { ModelCapabilityDropdown } from '@/components/ui/config-modals/ModelCapabilityDropdown'
import { AppIcon } from '@/components/ui/icons'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import {
  useAiFirstLastFramePrompt,
  useDeleteProjectPanelHistoryVideo,
  useDeleteProjectStoryboardGroupHistoryVideo,
  useSelectProjectStoryboardGroupVideo,
  useUploadProjectPanelVideo,
} from '@/lib/query/hooks'
import type { VideoPanelRuntime } from './hooks/useVideoPanelActions'
import { HistoryVideoThumbnail, PanelVideoHistoryDropdown } from './PanelVideoHistoryDropdown'

function summarizeVideoUrl(value: string | null | undefined): string {
  if (!value) return ''
  return value.length > 96 ? `${value.slice(0, 48)}...${value.slice(-24)}` : value
}

interface VideoPanelCardBodyProps {
  runtime: VideoPanelRuntime
  onUpdateDuration?: (storyboardId: string, panelIndex: number, duration: number | null, groupNumber?: number) => void
}

export default function VideoPanelCardBody({ runtime, onUpdateDuration }: VideoPanelCardBodyProps) {
  const {
    t,
    tCommon,
    projectId,
    episodeId,
    panel,
    panelIndex,
    panelKey,
    layout,
    actions,
    taskStatus,
    videoModel,
    promptEditor,
    voiceManager,
    lipSync,
    computed,
  } = runtime
  const safeTranslate = (key: string | undefined, fallback = ''): string => {
    if (!key) return fallback
    try {
      return t(key as never)
    } catch {
      return fallback
    }
  }

  const renderCapabilityLabel = (field: {
    field: string
    label: string
    labelKey?: string
    unitKey?: string
  }): string => {
    const labelText = safeTranslate(field.labelKey, safeTranslate(`capability.${field.field}`, field.label))
    const unitText = safeTranslate(field.unitKey)
    return unitText ? `${labelText} (${unitText})` : labelText
  }

  const isFirstLastFrameGenerated = panel.videoGenerationMode === 'firstlastframe' && !!panel.videoUrl
  const showsIncomingLinkBadge = layout.isLastFrame && !!layout.prevPanel
  const showsOutgoingLinkBadge = layout.isLinked && !!layout.nextPanel
  const showsPromptEditor = !layout.isLastFrame || layout.isLinked
  const showsFirstLastFrameActions = layout.isLinked && !!layout.nextPanel
  const videoHistory = panel.coarseGroupVideoHistory || []
  const panelVideoHistory = panel.videoHistory || []
  const isCoarseGroupPanel = !!panel.videoTargetGroupNumber
  const deletePanelVideoMutation = useDeleteProjectPanelHistoryVideo(projectId, episodeId)
  const deleteGroupVideoMutation = useDeleteProjectStoryboardGroupHistoryVideo(projectId, episodeId)
  const uploadPanelVideoMutation = useUploadProjectPanelVideo(projectId, episodeId)
  const [isDeletingCurrentVideo, setIsDeletingCurrentVideo] = useState(false)
  const uploadVideoInputRef = useRef<HTMLInputElement>(null)

  // 首尾帧组合分镜：结合相邻两个分镜的视频提示词，AI 合成首尾帧视频提示词
  const aiFlPromptMutation = useAiFirstLastFramePrompt(projectId)
  const [isAiGeneratingFlPrompt, setIsAiGeneratingFlPrompt] = useState(false)
  const [flUserInstruction, setFlUserInstruction] = useState('')
  const handleAiGenerateFlPrompt = useCallback(async () => {
    const nextLinkedPanel = layout.nextPanel
    if (!nextLinkedPanel) return
    setIsAiGeneratingFlPrompt(true)
    try {
      const result = await aiFlPromptMutation.mutateAsync({
        firstVideoPrompt: panel.textPanel?.video_prompt || promptEditor.localPrompt || '',
        lastVideoPrompt: nextLinkedPanel.textPanel?.video_prompt || '',
        userInput: flUserInstruction.trim() || undefined,
        panelId: panel.panelId,
      })
      if (result?.firstLastFramePrompt) {
        actions.onFlCustomPromptChange(panelKey, result.firstLastFramePrompt)
      }
    } finally {
      setIsAiGeneratingFlPrompt(false)
    }
  }, [actions, aiFlPromptMutation, flUserInstruction, layout.nextPanel, panel.panelId, panel.textPanel?.video_prompt, panelKey, promptEditor.localPrompt])

  const handleDeleteCurrentVideo = useCallback(async () => {
    if (!panel.videoUrl) return
    if (typeof window !== 'undefined' && !window.confirm(t('panelCard.deleteCurrentVideoConfirm'))) return
    const deleteTargetVideoUrl = panel.videoStorageKey || panel.videoUrl
    setIsDeletingCurrentVideo(true)
    try {
      if (isCoarseGroupPanel) {
        if (!panel.videoTargetGroupNumber) return
        await deleteGroupVideoMutation.mutateAsync({
          storyboardId: panel.storyboardId,
          groupNumber: panel.videoTargetGroupNumber,
          videoUrl: deleteTargetVideoUrl,
          clearCurrent: true,
        })
        return
      }
      if (!panel.panelId) return
      await deletePanelVideoMutation.mutateAsync({
        panelId: panel.panelId,
        videoUrl: deleteTargetVideoUrl,
        clearCurrent: true,
      })
    } finally {
      setIsDeletingCurrentVideo(false)
    }
  }, [
    deleteGroupVideoMutation,
    deletePanelVideoMutation,
    isCoarseGroupPanel,
    panel.panelId,
    panel.storyboardId,
    panel.videoStorageKey,
    panel.videoTargetGroupNumber,
    panel.videoUrl,
    t,
  ])

  const handleUploadVideoFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !panel.panelId || isCoarseGroupPanel) return
    try {
      await uploadPanelVideoMutation.mutateAsync({
        panelId: panel.panelId,
        file,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : t('panelCard.uploadVideoFailed')
      if (typeof window !== 'undefined') {
        window.alert(message)
      }
    }
  }, [isCoarseGroupPanel, panel.panelId, t, uploadPanelVideoMutation])

  const uploadVideoButton = !isCoarseGroupPanel && panel.panelId ? (
    <>
      <input
        ref={uploadVideoInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v"
        className="hidden"
        onChange={(event) => { void handleUploadVideoFile(event) }}
      />
      <button
        type="button"
        onClick={() => uploadVideoInputRef.current?.click()}
        disabled={taskStatus.isVideoTaskRunning || uploadPanelVideoMutation.isPending}
        className="glass-btn-base glass-btn-secondary flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg disabled:opacity-60"
        title={t('panelCard.uploadLocalVideo')}
      >
        {uploadPanelVideoMutation.isPending ? (
          <span className="text-[10px]">{t('panelCard.uploadingVideo')}</span>
        ) : (
          <AppIcon name="upload" className="h-4 w-4" />
        )}
      </button>
    </>
  ) : null

  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="px-2 py-0.5 bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] rounded font-medium">{panel.textPanel?.shot_type || t('panelCard.unknownShotType')}</span>
        <DurationEditor
          duration={panel.textPanel?.duration ?? null}
          unit={t('promptModal.duration')}
          onChange={onUpdateDuration ? (val) => onUpdateDuration(panel.storyboardId, panel.panelIndex, val, panel.videoTargetGroupNumber) : undefined}
        />
      </div>

      <p className="text-sm text-[var(--glass-text-secondary)] line-clamp-2">{panel.textPanel?.description}</p>

      <div className="mt-3 pt-3 border-t border-[var(--glass-stroke-base)]">
        {(showsIncomingLinkBadge || showsOutgoingLinkBadge) && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {showsIncomingLinkBadge && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${showsOutgoingLinkBadge
                    ? 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'
                    : 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-tertiary)] border border-[var(--glass-stroke-base)]'
                  }`}
              >
                <AppIcon name={showsOutgoingLinkBadge ? 'link' : 'unplug'} className="w-3 h-3" />
                {t('firstLastFrame.asLastFrameFor', { number: panelIndex })}
              </span>
            )}
            {showsOutgoingLinkBadge && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]">
                <AppIcon name="link" className="w-3 h-3" />
                {t('firstLastFrame.asFirstFrameFor', { number: panelIndex + 2 })}
              </span>
            )}
          </div>
        )}

        {showsPromptEditor && (
          <>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-[var(--glass-text-tertiary)]">{t('promptModal.promptLabel')}</span>
              {!promptEditor.isEditing && (
                <button onClick={promptEditor.handleStartEdit} className="text-[var(--glass-text-tertiary)] hover:text-[var(--glass-tone-info-fg)] transition-colors p-0.5">
                  <AppIcon name="edit" className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {promptEditor.isEditing ? (
              <div className="relative mb-3">
                <textarea
                  value={promptEditor.editingPrompt}
                  onChange={(event) => promptEditor.setEditingPrompt(event.target.value)}
                  autoFocus
                  className="w-full text-xs p-2 pr-16 border border-[var(--glass-stroke-focus)] rounded-lg bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--glass-tone-info-fg)] resize-none"
                  rows={3}
                  placeholder={t('promptModal.placeholder')}
                />
                <div className="absolute right-1 top-1 flex flex-col gap-1">
                  <button onClick={promptEditor.handleSave} disabled={promptEditor.isSavingPrompt} className="px-2 py-1 text-[10px] bg-[var(--glass-accent-from)] text-white rounded">{promptEditor.isSavingPrompt ? '...' : t('panelCard.save')}</button>
                  <button onClick={promptEditor.handleCancelEdit} disabled={promptEditor.isSavingPrompt} className="px-2 py-1 text-[10px] bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] rounded">{t('panelCard.cancel')}</button>
                </div>
              </div>
            ) : (
              <div onClick={promptEditor.handleStartEdit} className="text-xs p-2 border border-[var(--glass-stroke-base)] rounded-lg bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] cursor-pointer whitespace-pre-wrap break-words">
                {promptEditor.localPrompt || <span className="text-[var(--glass-text-tertiary)] italic">{t('panelCard.clickToEditPrompt')}</span>}
              </div>
            )}

            {showsFirstLastFrameActions ? (() => {
              const linkedNextPanel = layout.nextPanel!
              const flPromptValue = layout.flCustomPrompt || layout.defaultFlPrompt || ''
              return (
                <>
                <div className="mt-2 p-2 rounded-lg bg-[var(--glass-tone-info-bg)] border border-[var(--glass-stroke-focus)] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--glass-tone-info-fg)]">{t('firstLastFrame.combinedPromptLabel')}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleAiGenerateFlPrompt}
                        disabled={isAiGeneratingFlPrompt}
                        className="inline-flex items-center gap-1 text-xs text-[var(--glass-tone-info-fg)] hover:text-[var(--glass-text-primary)] disabled:opacity-50"
                      >
                        <AppIcon name="sparkles" className="w-3.5 h-3.5" />
                        {isAiGeneratingFlPrompt ? t('firstLastFrame.aiGenerating') : t('firstLastFrame.aiGenerate')}
                      </button>
                      {layout.flCustomPrompt && (
                        <button
                          onClick={() => actions.onResetFlPrompt(panelKey)}
                          className="text-xs text-[var(--glass-tone-info-fg)] hover:text-[var(--glass-text-primary)] underline"
                        >
                          {t('firstLastFrame.useDefault')}
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={flUserInstruction}
                    onChange={(event) => setFlUserInstruction(event.target.value)}
                    className="w-full text-xs p-2 border border-[var(--glass-stroke-base)] rounded bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--glass-tone-info-fg)]"
                    placeholder={t('firstLastFrame.userInstructionPlaceholder')}
                  />
                  <textarea
                    value={flPromptValue}
                    onChange={(event) => actions.onFlCustomPromptChange(panelKey, event.target.value)}
                    className="w-full text-xs p-2 border border-[var(--glass-stroke-focus)] rounded bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--glass-tone-info-fg)] resize-none"
                    rows={3}
                    placeholder={t('firstLastFrame.promptPlaceholder')}
                  />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => actions.onGenerateFirstLastFrame(
                      panel.storyboardId,
                      panel.panelIndex,
                      linkedNextPanel.storyboardId,
                      linkedNextPanel.panelIndex,
                      panelKey,
                      layout.flGenerationOptions,
                      panel.panelId,
                    )}
                    disabled={
                      taskStatus.isVideoTaskRunning
                      || !panel.imageUrl
                      || !linkedNextPanel.imageUrl
                      || !layout.flModel
                      || layout.flMissingCapabilityFields.length > 0
                    }
                    className="flex-shrink-0 min-w-[120px] py-2 px-3 text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 bg-[var(--glass-accent-from)] text-white"
                  >
                    {isFirstLastFrameGenerated ? t('firstLastFrame.generated') : taskStatus.isVideoTaskRunning ? taskStatus.taskRunningVideoLabel : t('firstLastFrame.generate')}
                  </button>
                  {panel.videoUrl && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteCurrentVideo()}
                      disabled={taskStatus.isVideoTaskRunning || isDeletingCurrentVideo}
                      className="glass-btn-base glass-btn-danger flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg disabled:opacity-60"
                      title={t('panelCard.deleteCurrentVideo')}
                    >
                      {isDeletingCurrentVideo ? (
                        <span className="text-xs">{t('panelCard.deleting')}</span>
                      ) : (
                        <AppIcon name="trashAlt" className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <ModelCapabilityDropdown
                      compact
                      models={layout.flModelOptions}
                      value={layout.flModel || undefined}
                      onModelChange={actions.onFlModelChange}
                      capabilityFields={layout.flCapabilityFields.map((field) => ({
                        field: field.field,
                        label: field.label,
                        options: field.options,
                        disabledOptions: field.disabledOptions,
                      }))}
                      capabilityOverrides={layout.flGenerationOptions}
                      onCapabilityChange={(field, rawValue) => actions.onFlCapabilityChange(field, rawValue)}
                      placeholder={t('panelCard.selectModel')}
                    />
                  </div>
                </div>
                </>
              )
            })() : (
              <>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      actions.onGenerateVideo(
                        panel.storyboardId,
                        panel.panelIndex,
                        videoModel.selectedModel,
                        undefined,
                        videoModel.generationOptions,
                        panel.panelId,
                        panel.videoTargetGroupNumber,
                        promptEditor.localPrompt,
                      )}
                    disabled={
                      taskStatus.isVideoTaskRunning
                      || !panel.imageUrl
                      || !videoModel.selectedModel
                      || videoModel.missingCapabilityFields.length > 0
                    }
                    className="flex-shrink-0 min-w-[90px] py-2 px-3 text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 bg-[var(--glass-accent-from)] text-white"
                  >
                    {panel.videoUrl ? t('stage.hasSynced') : taskStatus.isVideoTaskRunning ? taskStatus.taskRunningVideoLabel : t('panelCard.generateVideo')}
                  </button>
                  {uploadVideoButton}
                  {panel.videoUrl && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteCurrentVideo()}
                      disabled={taskStatus.isVideoTaskRunning || isDeletingCurrentVideo}
                      className="glass-btn-base glass-btn-danger flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg disabled:opacity-60"
                      title={t('panelCard.deleteCurrentVideo')}
                    >
                      {isDeletingCurrentVideo ? (
                        <span className="text-xs">{t('panelCard.deleting')}</span>
                      ) : (
                        <AppIcon name="trashAlt" className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <ModelCapabilityDropdown
                      compact
                      models={videoModel.videoModelOptions}
                      value={videoModel.selectedModel || undefined}
                      onModelChange={(modelKey) => {
                        videoModel.setSelectedModel(modelKey)
                      }}
                      capabilityFields={videoModel.capabilityFields.map((field) => ({
                        field: field.field,
                        label: renderCapabilityLabel(field),
                        options: field.options,
                        disabledOptions: field.disabledOptions,
                      }))}
                      capabilityOverrides={videoModel.generationOptions}
                      onCapabilityChange={(field, rawValue) => videoModel.setCapabilityValue(field, rawValue)}
                      placeholder={t('panelCard.selectModel')}
                    />
                  </div>
                </div>

                {isCoarseGroupPanel && videoHistory.length > 0 && (
                  <CoarseGroupVideoHistoryDropdown
                    projectId={projectId}
                    episodeId={episodeId}
                    storyboardId={panel.storyboardId}
                    groupNumber={panel.videoTargetGroupNumber}
                    currentVideoUrl={panel.videoUrl || ''}
                    videoHistory={videoHistory}
                    t={t}
                  />
                )}

                {!isCoarseGroupPanel && panelVideoHistory.length > 0 && panel.panelId && (
                  <PanelVideoHistoryDropdown
                    projectId={projectId}
                    episodeId={episodeId}
                    panelId={panel.panelId}
                    currentVideoUrl={panel.videoUrl || ''}
                    videoHistory={panelVideoHistory}
                  />
                )}

                {computed.showLipSyncSection && (
                  <div className="mt-2">
                    <div className="flex gap-2">
                      <button
                        onClick={computed.canLipSync ? lipSync.handleStartLipSync : undefined}
                        disabled={!computed.canLipSync || taskStatus.isLipSyncTaskRunning || lipSync.executingLipSync}
                        className="flex-1 py-1.5 text-xs rounded-lg transition-all flex items-center justify-center gap-1 bg-[var(--glass-accent-from)] text-white disabled:opacity-50"
                      >
                        {taskStatus.isLipSyncTaskRunning || lipSync.executingLipSync ? (
                          <TaskStatusInline state={taskStatus.lipSyncInlineState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                        ) : (
                          <>{t('panelCard.lipSync')}</>
                        )}
                      </button>

                      {(taskStatus.isLipSyncTaskRunning || panel.lipSyncVideoUrl) && voiceManager.hasMatchedAudio && (
                        <button onClick={lipSync.handleStartLipSync} disabled={lipSync.executingLipSync} className="flex-shrink-0 px-3 py-1.5 text-xs rounded-lg bg-[var(--glass-tone-warning-fg)] text-white">
                          {t('panelCard.redo')}
                        </button>
                      )}
                    </div>

                    {voiceManager.audioGenerateError && (
                      <div className="mt-1 p-1.5 bg-[var(--glass-tone-danger-bg)] border border-[var(--glass-stroke-danger)] rounded text-[10px] text-[var(--glass-tone-danger-fg)]">
                        {voiceManager.audioGenerateError}
                      </div>
                    )}

                    {voiceManager.localVoiceLines.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {voiceManager.localVoiceLines.map((voiceLine) => {
                          const isVoiceTaskRunning = voiceManager.isVoiceLineTaskRunning(voiceLine.id)
                          const voiceAudioRunningState = isVoiceTaskRunning
                            ? resolveTaskPresentationState({ phase: 'processing', intent: 'generate', resource: 'audio', hasOutput: !!voiceLine.audioUrl })
                            : null

                          return (
                            <div key={voiceLine.id} className="flex items-start gap-1.5 p-1.5 bg-[var(--glass-bg-muted)] rounded text-[10px]">
                              {voiceLine.audioUrl ? (
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    voiceManager.handlePlayVoiceLine(voiceLine)
                                  }}
                                  className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors bg-[var(--glass-bg-muted)]"
                                  title={voiceManager.playingVoiceLineId === voiceLine.id ? t('panelCard.stopVoice') : t('panelCard.play')}
                                >
                                  <AppIcon name="play" className="w-3 h-3" />
                                </button>
                              ) : (
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void voiceManager.handleGenerateAudio(voiceLine)
                                  }}
                                  disabled={isVoiceTaskRunning}
                                  className="flex-shrink-0 px-1.5 py-0.5 bg-[var(--glass-accent-from)] text-white rounded disabled:opacity-50"
                                  title={t('panelCard.generateAudio')}
                                >
                                  {isVoiceTaskRunning ? (
                                    <TaskStatusInline state={voiceAudioRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                                  ) : (
                                    tCommon('generate')
                                  )}
                                </button>
                              )}
                              <div className="flex-1 min-w-0">
                                <span className="text-[var(--glass-text-tertiary)]">{voiceLine.speaker}: </span>
                                <span className="text-[var(--glass-text-secondary)]">&ldquo;{voiceLine.content}&rdquo;</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CoarseGroupVideoHistoryDropdown({
  projectId,
  episodeId,
  storyboardId,
  groupNumber,
  currentVideoUrl,
  videoHistory,
  t,
}: {
  projectId: string
  episodeId?: string
  storyboardId: string
  groupNumber?: number
  currentVideoUrl: string
  videoHistory: NonNullable<VideoPanelRuntime['panel']['coarseGroupVideoHistory']>
  t: (key: string, values?: Record<string, number>) => string
}) {
  const [openVideoHistory, setOpenVideoHistory] = useState(false)
  const selectHistoryVideoMutation = useSelectProjectStoryboardGroupVideo(projectId, episodeId)
  const deleteHistoryVideoMutation = useDeleteProjectStoryboardGroupHistoryVideo(projectId, episodeId)
  const [selectingHistoryVideoUrl, setSelectingHistoryVideoUrl] = useState<string | null>(null)
  const [deletingHistoryVideoUrl, setDeletingHistoryVideoUrl] = useState<string | null>(null)

  const formatHistoryTime = useCallback((value: string) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString()
  }, [])

  const handleSelectHistoryVideo = useCallback(async (videoUrl: string) => {
    if (!groupNumber) return
    _ulogInfo('[VideoHistoryTrace][UI group history] click use history video', {
      projectId,
      episodeId,
      storyboardId,
      groupNumber,
      currentVideoUrl: summarizeVideoUrl(currentVideoUrl),
      selectedVideoUrl: summarizeVideoUrl(videoUrl),
      historyCount: videoHistory.length,
    })
    setSelectingHistoryVideoUrl(videoUrl)
    try {
      const result = await selectHistoryVideoMutation.mutateAsync({
        storyboardId,
        groupNumber,
        videoUrl,
      })
      _ulogInfo('[VideoHistoryTrace][UI group history] use history video completed', {
        projectId,
        episodeId,
        storyboardId,
        groupNumber,
        selectedVideoUrl: summarizeVideoUrl(videoUrl),
        responseVideoUrl: summarizeVideoUrl(
          result && typeof result === 'object' && typeof (result as { videoUrl?: unknown }).videoUrl === 'string'
            ? (result as { videoUrl: string }).videoUrl
            : '',
        ),
      })
    } finally {
      setSelectingHistoryVideoUrl(null)
    }
  }, [currentVideoUrl, episodeId, groupNumber, projectId, selectHistoryVideoMutation, storyboardId, videoHistory.length])

  const handleDeleteHistoryVideo = useCallback(async (videoUrl: string) => {
    if (!groupNumber) return
    setDeletingHistoryVideoUrl(videoUrl)
    try {
      await deleteHistoryVideoMutation.mutateAsync({
        storyboardId,
        groupNumber,
        videoUrl,
      })
    } finally {
      setDeletingHistoryVideoUrl(null)
    }
  }, [deleteHistoryVideoMutation, groupNumber, storyboardId])

  return (
    <div className="relative mt-2">
      <button
        type="button"
        className="flex h-8 w-full items-center justify-between rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-2 text-xs text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-surface-hover)]"
        onClick={() => setOpenVideoHistory((current) => !current)}
      >
        <span>{t('panelCard.videoHistoryCount', { count: videoHistory.length })}</span>
        <AppIcon
          name="chevronDown"
          className={`h-3.5 w-3.5 transition-transform ${openVideoHistory ? 'rotate-180' : ''}`}
        />
      </button>
      {openVideoHistory && (
        <div className="absolute left-0 right-0 top-9 z-20 max-h-80 overflow-y-auto rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-2 shadow-xl">
          <div className="grid gap-2">
            {[...videoHistory].reverse().map((entry, historyIndex) => {
              const isCurrent = entry.videoUrl === currentVideoUrl
              const isSelecting = selectingHistoryVideoUrl === entry.videoUrl
              const isDeleting = deletingHistoryVideoUrl === entry.videoUrl
              return (
                <div
                  key={`${entry.videoUrl}-${historyIndex}`}
                  className={`grid grid-cols-[112px_1fr_auto_auto] items-center gap-2 rounded-md border p-1.5 ${
                    isCurrent
                      ? 'border-[var(--glass-accent-from)] bg-[var(--glass-bg-muted)]'
                      : 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/60'
                  }`}
                >
                  <HistoryVideoThumbnail
                    videoUrl={entry.videoUrl}
                    title={isCurrent ? t('panelCard.currentVideo') : t('panelCard.historyVideo', { number: videoHistory.length - historyIndex })}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-xs text-[var(--glass-text-primary)]">
                      {isCurrent ? t('panelCard.currentVideo') : t('panelCard.historyVideo', { number: videoHistory.length - historyIndex })}
                    </div>
                    <div className="truncate text-[11px] text-[var(--glass-text-tertiary)]">
                      {formatHistoryTime(entry.generatedAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="glass-btn-base glass-btn-soft rounded-md px-2 py-1 text-xs disabled:opacity-60"
                    disabled={isCurrent || isSelecting || isDeleting}
                    onClick={() => handleSelectHistoryVideo(entry.videoUrl)}
                  >
                    {isCurrent ? (
                      <AppIcon name="check" className="h-3.5 w-3.5" />
                    ) : (
                      <span>{isSelecting ? t('panelCard.saving') : t('panelCard.useHistoryVideo')}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="glass-btn-base glass-btn-danger rounded-md px-2 py-1 text-xs disabled:opacity-60"
                    disabled={isSelecting || isDeleting}
                    onClick={() => handleDeleteHistoryVideo(entry.videoUrl)}
                    title={t('panelCard.deleteHistoryVideo')}
                  >
                    {isDeleting ? (
                      <span>{t('panelCard.deleting')}</span>
                    ) : (
                      <AppIcon name="trashAlt" className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function DurationEditor({
  duration,
  unit,
  onChange,
}: {
  duration: number | null
  unit: string
  onChange?: (value: number | null) => void
}) {
  const [localValue, setLocalValue] = useState<string>(duration != null ? String(duration) : '')
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setLocalValue(duration != null ? String(duration) : '')
  }, [duration])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setLocalValue(raw)
    if (!onChange) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const parsed = parseFloat(raw)
      onChange(raw && !isNaN(parsed) && parsed > 0 ? parsed : null)
    }, 600)
  }, [onChange])

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  if (!onChange) {
    return duration != null ? (
      <span className="text-[var(--glass-text-tertiary)]">{duration}{unit}</span>
    ) : null
  }

  return (
    <span className="inline-flex items-center gap-0.5 text-[var(--glass-text-tertiary)]">
      <input
        type="number"
        min={1}
        max={30}
        step={0.5}
        value={localValue}
        onChange={handleChange}
        className="w-10 text-center bg-transparent border-b border-[var(--glass-stroke-base)] focus:border-[var(--glass-tone-info-fg)] outline-none text-xs tabular-nums"
        placeholder="3"
      />
      {unit}
    </span>
  )
}
