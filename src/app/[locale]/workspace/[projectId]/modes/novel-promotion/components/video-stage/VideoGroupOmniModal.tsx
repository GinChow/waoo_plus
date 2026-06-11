'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import type { MultiPromptShot, VideoPanel } from '../video'

// kling-omni-video multi_prompt 接口约束
const MAX_SHOTS = 6
const MIN_TOTAL_DURATION = 3
const MAX_TOTAL_DURATION = 15
// 接口按 UTF-8 字节计上限 512（中文每字 3 字节，并非字符数）；
// worker 会在每个子 prompt 前注入 <<<image_N>>> 引用标记（最多 13 字节），预留余量。
const MAX_PROMPT_BYTES = 512 - 16
// 首尾帧模式使用单条融合提示词，上限按 omni 文档为 2500 字符
const FL_MAX_PROMPT_CHARS = 2500

// 按 UTF-8 字节计长度
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

// 在不切断多字节字符的前提下，把文本截断到不超过 maxBytes 个 UTF-8 字节
function truncateToBytes(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) return text
  let result = ''
  let used = 0
  for (const char of text) {
    const charBytes = byteLength(char)
    if (used + charBytes > maxBytes) break
    result += char
    used += charBytes
  }
  return result
}

interface ShotDraft {
  panelIndex: number
  prompt: string
  duration: number
}

interface VideoGroupOmniModalProps {
  groupPanels: VideoPanel[]
  startNumber: number
  videoRatio: string
  submitting: boolean
  // 首尾帧模式：使用单条融合提示词（首帧 + 尾帧）而非每个分镜独立提示词
  firstLastFrameMode?: boolean
  initialFirstLastFramePrompt?: string
  onClose: () => void
  onConfirm: (shots: MultiPromptShot[], totalDuration: number, fusedPrompt?: string) => void | Promise<void>
}

function buildInitialShots(groupPanels: VideoPanel[]): ShotDraft[] {
  return groupPanels.map((panel) => {
    const rawPrompt = panel.textPanel?.video_prompt || panel.textPanel?.description || ''
    const rawDuration = panel.textPanel?.duration
    const rounded = typeof rawDuration === 'number' && Number.isFinite(rawDuration)
      ? Math.round(rawDuration)
      : 0
    return {
      panelIndex: panel.panelIndex,
      prompt: truncateToBytes(rawPrompt, MAX_PROMPT_BYTES),
      duration: Math.max(1, rounded || 3),
    }
  })
}

export default function VideoGroupOmniModal({
  groupPanels,
  startNumber,
  videoRatio,
  submitting,
  firstLastFrameMode = false,
  initialFirstLastFramePrompt,
  onClose,
  onConfirm,
}: VideoGroupOmniModalProps) {
  const t = useTranslations('storyboard')
  const cssAspectRatio = videoRatio.replace(':', '/')
  const [shots, setShots] = useState<ShotDraft[]>(() => buildInitialShots(groupPanels))

  // 首尾帧模式：单条融合提示词 + 单个总时长
  const [flPrompt, setFlPrompt] = useState<string>(
    () => initialFirstLastFramePrompt?.trim()
      || groupPanels.map((panel) => panel.textPanel?.video_prompt || '').filter(Boolean).join(' '),
  )
  const [flDuration, setFlDuration] = useState<number>(() => {
    const sum = groupPanels.reduce((acc, panel) => {
      const raw = panel.textPanel?.duration
      return acc + Math.max(1, typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : 0)
    }, 0)
    return Math.min(MAX_TOTAL_DURATION, Math.max(MIN_TOTAL_DURATION, sum || 5))
  })

  const flError = useMemo<string | null>(() => {
    if (!firstLastFrameMode) return null
    if (!flPrompt.trim()) return t('panelGroup.omni.errorPromptEmpty')
    if (flPrompt.length > FL_MAX_PROMPT_CHARS) {
      return t('panelGroup.omni.errorPromptTooLong', { max: FL_MAX_PROMPT_CHARS })
    }
    if (!Number.isInteger(flDuration) || flDuration < MIN_TOTAL_DURATION || flDuration > MAX_TOTAL_DURATION) {
      return t('panelGroup.omni.errorTotalRange', { min: MIN_TOTAL_DURATION, max: MAX_TOTAL_DURATION })
    }
    return null
  }, [firstLastFrameMode, flPrompt, flDuration, t])

  const totalDuration = useMemo(
    () => shots.reduce((sum, shot) => sum + (Number.isFinite(shot.duration) ? shot.duration : 0), 0),
    [shots],
  )

  const error = useMemo<string | null>(() => {
    if (firstLastFrameMode) return flError
    if (shots.length === 0) return t('panelGroup.omni.errorEmpty')
    if (shots.length > MAX_SHOTS) return t('panelGroup.omni.errorTooManyShots', { max: MAX_SHOTS })
    for (const shot of shots) {
      if (!shot.prompt.trim()) return t('panelGroup.omni.errorPromptEmpty')
      if (byteLength(shot.prompt) > MAX_PROMPT_BYTES) {
        return t('panelGroup.omni.errorPromptTooLong', { max: MAX_PROMPT_BYTES })
      }
      if (!Number.isInteger(shot.duration) || shot.duration < 1) {
        return t('panelGroup.omni.errorDurationInvalid')
      }
    }
    if (totalDuration < MIN_TOTAL_DURATION || totalDuration > MAX_TOTAL_DURATION) {
      return t('panelGroup.omni.errorTotalRange', { min: MIN_TOTAL_DURATION, max: MAX_TOTAL_DURATION })
    }
    return null
  }, [firstLastFrameMode, flError, shots, totalDuration, t])

  const updateShot = (index: number, patch: Partial<ShotDraft>) => {
    setShots((previous) => previous.map((shot, i) => (i === index ? { ...shot, ...patch } : shot)))
  }

  const handleConfirm = async () => {
    if (error || submitting) return
    if (firstLastFrameMode) {
      // 首尾帧模式：融合提示词单独回传；multiPrompt 仅用于承载总时长（其内容不会下发给 provider）
      const trimmedFl = flPrompt.trim()
      const multiPrompt: MultiPromptShot[] = [{
        index: 1,
        prompt: truncateToBytes(trimmedFl, MAX_PROMPT_BYTES) || '-',
        duration: String(flDuration),
      }]
      await onConfirm(multiPrompt, flDuration, trimmedFl)
      return
    }
    const multiPrompt: MultiPromptShot[] = shots.map((shot, index) => ({
      index: index + 1,
      prompt: shot.prompt.trim(),
      duration: String(shot.duration),
    }))
    await onConfirm(multiPrompt, totalDuration)
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[var(--glass-overlay)]"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="relative z-10 bg-[var(--glass-bg-surface)] rounded-lg max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="border-b border-[var(--glass-stroke-base)] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-[var(--glass-text-primary)]">
              {t('panelGroup.omni.title', { start: startNumber, end: startNumber + groupPanels.length - 1 })}
            </h3>
            <p className="text-xs text-[var(--glass-text-tertiary)] mt-0.5">
              {t('panelGroup.omni.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)] disabled:opacity-50"
          >
            <AppIcon name="close" className="w-6 h-6" />
          </button>
        </div>

        {/* 首尾帧模式：首帧 / 尾帧缩略图 + 单条融合提示词 + 总时长 */}
        {firstLastFrameMode ? (
          <div className="p-6 space-y-3 overflow-y-auto app-scrollbar flex-1 min-h-0">
            <div className="flex items-center gap-2">
              {[groupPanels[0], groupPanels[groupPanels.length - 1]].map((panel, index) => (
                <div key={`fl-${panel?.storyboardId}-${panel?.panelIndex}`} className="flex items-center gap-2">
                  <div
                    className="relative w-28 shrink-0 overflow-hidden rounded-md bg-[var(--glass-bg-muted)]"
                    style={{ aspectRatio: cssAspectRatio }}
                  >
                    {panel?.imageUrl ? (
                      <MediaImageWithLoading
                        src={panel.imageUrl}
                        alt={index === 0 ? 'first-frame' : 'last-frame'}
                        containerClassName="h-full w-full"
                        className="h-full w-full object-cover"
                        sizes="112px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[var(--glass-text-tertiary)]">
                        <AppIcon name="imagePreview" className="h-5 w-5" />
                      </div>
                    )}
                    <span className="absolute left-1 top-1 glass-chip glass-chip-neutral px-1.5 py-0.5 text-[10px] font-medium">
                      {index === 0 ? t('firstLastFrame.firstFrame') : t('firstLastFrame.lastFrame')}
                    </span>
                  </div>
                  {index === 0 && <AppIcon name="arrowRight" className="h-4 w-4 text-[var(--glass-text-tertiary)]" />}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <span className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('firstLastFrame.combinedPromptLabel')}</span>
              <textarea
                value={flPrompt}
                onChange={(event) => setFlPrompt(event.target.value.slice(0, FL_MAX_PROMPT_CHARS))}
                rows={6}
                placeholder={t('firstLastFrame.placeholder')}
                className="w-full resize-none rounded-md border border-[var(--glass-stroke-strong)] px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-[var(--glass-tone-info-fg)] focus:border-[var(--glass-stroke-focus)]"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-[var(--glass-text-tertiary)]">{flPrompt.length}/{FL_MAX_PROMPT_CHARS}</span>
                <label className="flex items-center gap-1.5 text-xs text-[var(--glass-text-secondary)]">
                  <AppIcon name="clock" className="h-3 w-3" />
                  <span>{t('panelGroup.omni.durationLabel')}</span>
                  <input
                    type="number"
                    min={MIN_TOTAL_DURATION}
                    max={MAX_TOTAL_DURATION}
                    step={1}
                    value={flDuration}
                    onChange={(event) => {
                      const next = Math.floor(Number(event.target.value))
                      setFlDuration(Number.isFinite(next) ? next : 0)
                    }}
                    className="w-16 rounded-md border border-[var(--glass-stroke-strong)] px-2 py-1 text-sm"
                  />
                  <span>{t('panel.duration')}</span>
                </label>
              </div>
            </div>
          </div>
        ) : (
        /* 分镜列表 */
        <div className="p-6 space-y-3 overflow-y-auto app-scrollbar flex-1 min-h-0">
          {shots.map((shot, index) => {
            const panel = groupPanels[index]
            return (
              <div
                key={`${panel.storyboardId}-${shot.panelIndex}`}
                className="flex gap-3 rounded-lg border border-[var(--glass-stroke-base)] p-3"
              >
                <div
                  className="relative w-24 shrink-0 overflow-hidden rounded-md bg-[var(--glass-bg-muted)]"
                  style={{ aspectRatio: cssAspectRatio }}
                >
                  {panel.imageUrl ? (
                    <MediaImageWithLoading
                      src={panel.imageUrl}
                      alt={`shot-${startNumber + index}`}
                      containerClassName="h-full w-full"
                      className="h-full w-full object-cover"
                      sizes="96px"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[var(--glass-text-tertiary)]">
                      <AppIcon name="imagePreview" className="h-5 w-5" />
                    </div>
                  )}
                  <span className="absolute left-1 top-1 glass-chip glass-chip-neutral px-1.5 py-0.5 text-[10px] font-medium">
                    {startNumber + index}
                  </span>
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <textarea
                    value={shot.prompt}
                    onChange={(event) => updateShot(index, { prompt: truncateToBytes(event.target.value, MAX_PROMPT_BYTES) })}
                    rows={3}
                    placeholder={t('panelGroup.omni.promptPlaceholder')}
                    className="w-full resize-none rounded-md border border-[var(--glass-stroke-strong)] px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-[var(--glass-tone-info-fg)] focus:border-[var(--glass-stroke-focus)]"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-[var(--glass-text-tertiary)]">
                      {byteLength(shot.prompt)}/{MAX_PROMPT_BYTES}
                    </span>
                    <label className="flex items-center gap-1.5 text-xs text-[var(--glass-text-secondary)]">
                      <AppIcon name="clock" className="h-3 w-3" />
                      <span>{t('panelGroup.omni.durationLabel')}</span>
                      <input
                        type="number"
                        min={1}
                        max={MAX_TOTAL_DURATION}
                        step={1}
                        value={shot.duration}
                        onChange={(event) => {
                          const next = Math.floor(Number(event.target.value))
                          updateShot(index, { duration: Number.isFinite(next) ? next : 0 })
                        }}
                        className="w-16 rounded-md border border-[var(--glass-stroke-strong)] px-2 py-1 text-sm"
                      />
                      <span>{t('panel.duration')}</span>
                    </label>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        )}

        {/* 底部 */}
        <div className="border-t border-[var(--glass-stroke-base)] px-6 py-4 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs">
              <span className="text-[var(--glass-text-tertiary)]">{t('panelGroup.omni.totalDuration')}</span>
              <span className="ml-1 font-semibold text-[var(--glass-text-primary)]">
                {totalDuration}
                {t('panel.duration')}
              </span>
              {error && <span className="ml-3 text-[var(--glass-tone-danger-fg)]">{error}</span>}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="glass-btn-base px-4 py-2 bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] disabled:opacity-50"
              >
                {t('panelGroup.omni.cancel')}
              </button>
              <button
                type="button"
                onClick={() => { void handleConfirm() }}
                disabled={!!error || submitting}
                className="glass-btn-base px-4 py-2 bg-[var(--glass-accent-from)] text-white hover:bg-[var(--glass-accent-to)] disabled:opacity-50"
              >
                {submitting ? t('panelGroup.omni.submitting') : t('panelGroup.omni.confirm')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
