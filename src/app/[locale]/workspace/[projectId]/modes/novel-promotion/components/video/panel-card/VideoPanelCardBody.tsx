import React, { useState, useCallback, useRef, useEffect } from 'react'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { ModelCapabilityDropdown } from '@/components/ui/config-modals/ModelCapabilityDropdown'
import { AppIcon } from '@/components/ui/icons'
import {
  useDeleteProjectPanelHistoryVideo,
  useDeleteProjectStoryboardGroupHistoryVideo,
  useSelectProjectPanelHistoryVideo,
  useSelectProjectStoryboardGroupVideo,
} from '@/lib/query/hooks'
import type { VideoPanelRuntime } from './hooks/useVideoPanelActions'

interface VideoPanelCardBodyProps {
  runtime: VideoPanelRuntime
  onUpdateDuration?: (storyboardId: string, panelIndex: number, duration: number | null, groupNumber?: number) => void
}

export default function VideoPanelCardBody({ runtime, onUpdateDuration }: VideoPanelCardBodyProps) {
  const {
    t,
    tCommon,
    projectId,
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
              return (
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
                    panelId={panel.panelId}
                    currentVideoUrl={panel.videoUrl || ''}
                    videoHistory={panelVideoHistory}
                    t={t}
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
  storyboardId,
  groupNumber,
  currentVideoUrl,
  videoHistory,
  t,
}: {
  projectId: string
  storyboardId: string
  groupNumber?: number
  currentVideoUrl: string
  videoHistory: NonNullable<VideoPanelRuntime['panel']['coarseGroupVideoHistory']>
  t: (key: string, values?: Record<string, number>) => string
}) {
  const [openVideoHistory, setOpenVideoHistory] = useState(false)
  const selectHistoryVideoMutation = useSelectProjectStoryboardGroupVideo(projectId)
  const deleteHistoryVideoMutation = useDeleteProjectStoryboardGroupHistoryVideo(projectId)
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
    setSelectingHistoryVideoUrl(videoUrl)
    try {
      await selectHistoryVideoMutation.mutateAsync({
        storyboardId,
        groupNumber,
        videoUrl,
      })
    } finally {
      setSelectingHistoryVideoUrl(null)
    }
  }, [groupNumber, selectHistoryVideoMutation, storyboardId])

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

function HistoryVideoThumbnail({ videoUrl, title }: { videoUrl: string; title: string }) {
  const handleSeekToFirstFrame = useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    const el = event.currentTarget
    try {
      if (el.currentTime === 0 && el.duration > 0) {
        el.currentTime = Math.min(0.1, el.duration / 10)
      }
    } catch {
      // ignore seek errors
    }
  }, [])

  const handleOpenPreview = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.open(videoUrl, '_blank', 'noopener,noreferrer')
    }
  }, [videoUrl])

  return (
    <button
      type="button"
      onClick={handleOpenPreview}
      title={title}
      className="group relative h-16 w-[112px] overflow-hidden rounded border border-[var(--glass-stroke-base)] bg-black"
    >
      <video
        src={videoUrl}
        className="h-full w-full object-cover pointer-events-none"
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={handleSeekToFirstFrame}
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
        <AppIcon name="play" className="h-5 w-5 text-white" />
      </span>
    </button>
  )
}

function PanelVideoHistoryDropdown({
  projectId,
  panelId,
  currentVideoUrl,
  videoHistory,
  t,
}: {
  projectId: string
  panelId: string
  currentVideoUrl: string
  videoHistory: NonNullable<VideoPanelRuntime['panel']['videoHistory']>
  t: (key: string, values?: Record<string, number>) => string
}) {
  const [open, setOpen] = useState(false)
  const selectMutation = useSelectProjectPanelHistoryVideo(projectId)
  const deleteMutation = useDeleteProjectPanelHistoryVideo(projectId)
  const [selectingUrl, setSelectingUrl] = useState<string | null>(null)
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null)

  const formatHistoryTime = useCallback((value: string) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString()
  }, [])

  const handleSelect = useCallback(async (videoUrl: string) => {
    setSelectingUrl(videoUrl)
    try {
      await selectMutation.mutateAsync({ panelId, videoUrl })
    } finally {
      setSelectingUrl(null)
    }
  }, [panelId, selectMutation])

  const handleDelete = useCallback(async (videoUrl: string) => {
    if (typeof window !== 'undefined' && !window.confirm(t('panelCard.deleteHistoryVideo'))) return
    setDeletingUrl(videoUrl)
    try {
      await deleteMutation.mutateAsync({ panelId, videoUrl })
    } finally {
      setDeletingUrl(null)
    }
  }, [deleteMutation, panelId, t])

  return (
    <div className="relative mt-2">
      <button
        type="button"
        className="flex h-8 w-full items-center justify-between rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-2 text-xs text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-surface-hover)]"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{t('panelCard.videoHistoryCount', { count: videoHistory.length })}</span>
        <AppIcon
          name="chevronDown"
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-9 z-20 max-h-80 overflow-y-auto rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-2 shadow-xl">
          <div className="grid gap-2">
            {[...videoHistory].reverse().map((entry, historyIndex) => {
              const isCurrent = entry.videoUrl === currentVideoUrl
              const isSelecting = selectingUrl === entry.videoUrl
              const isDeleting = deletingUrl === entry.videoUrl
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
                    onClick={() => handleSelect(entry.videoUrl)}
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
                    disabled={isCurrent || isSelecting || isDeleting}
                    onClick={() => handleDelete(entry.videoUrl)}
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
