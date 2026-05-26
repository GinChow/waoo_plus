'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import {
  useAiFirstLastFramePrompt,
  useUpdateProjectPanelVideoPrompt,
} from '@/lib/query/hooks'

/**
 * FirstLastFramePromptSection - 分镜阶段「首尾帧组合分镜」提示词区
 *
 * 当前分镜与下一个分镜链接（组合成首尾帧）后展示。
 * 结合上下两个分镜的视频提示词，AI 合成这个首尾帧分镜的视频提示词；
 * 若填写了修改指令则以指令为主改写。结果持久化到当前分镜的 firstLastFramePrompt。
 */
interface FirstLastFramePromptSectionProps {
  projectId: string
  storyboardId: string
  panelIndex: number
  panelId: string
  firstVideoPrompt?: string
  lastVideoPrompt?: string
  initialPrompt?: string
}

export default function FirstLastFramePromptSection({
  projectId,
  storyboardId,
  panelIndex,
  panelId,
  firstVideoPrompt,
  lastVideoPrompt,
  initialPrompt = '',
}: FirstLastFramePromptSectionProps) {
  const t = useTranslations('storyboard')
  const aiFlPromptMutation = useAiFirstLastFramePrompt(projectId)
  const updatePromptMutation = useUpdateProjectPanelVideoPrompt(projectId)

  const [userInstruction, setUserInstruction] = useState('')
  const [draftPrompt, setDraftPrompt] = useState(initialPrompt)
  const [isGenerating, setIsGenerating] = useState(false)

  // 外部数据刷新时同步草稿（仅在与已保存值一致时跟随，避免覆盖用户正在编辑的内容）
  useEffect(() => {
    setDraftPrompt(initialPrompt)
  }, [initialPrompt])

  const persistPrompt = useCallback(async (value: string) => {
    await updatePromptMutation.mutateAsync({
      storyboardId,
      panelIndex,
      value,
      field: 'firstLastFramePrompt',
    })
  }, [panelIndex, storyboardId, updatePromptMutation])

  const handleAiGenerate = useCallback(async () => {
    setIsGenerating(true)
    try {
      const result = await aiFlPromptMutation.mutateAsync({
        firstVideoPrompt: firstVideoPrompt || '',
        lastVideoPrompt: lastVideoPrompt || '',
        userInput: userInstruction.trim() || undefined,
        panelId,
      })
      if (result?.firstLastFramePrompt) {
        setDraftPrompt(result.firstLastFramePrompt)
        await persistPrompt(result.firstLastFramePrompt)
      }
    } finally {
      setIsGenerating(false)
    }
  }, [aiFlPromptMutation, firstVideoPrompt, lastVideoPrompt, panelId, persistPrompt, userInstruction])

  const handleBlur = useCallback(() => {
    if (draftPrompt !== initialPrompt) {
      void persistPrompt(draftPrompt)
    }
  }, [draftPrompt, initialPrompt, persistPrompt])

  return (
    <div className="mt-3 p-2 rounded-lg bg-[var(--glass-tone-info-bg)] border border-[var(--glass-stroke-focus)] space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--glass-tone-info-fg)] inline-flex items-center gap-1">
          <AppIcon name="unplug" className="w-3.5 h-3.5" />
          {t('firstLastFrame.label')}
        </span>
        <button
          type="button"
          onClick={handleAiGenerate}
          disabled={isGenerating}
          className="inline-flex items-center gap-1 text-xs text-[var(--glass-tone-info-fg)] hover:text-[var(--glass-text-primary)] disabled:opacity-50"
        >
          <AppIcon name="sparkles" className="w-3.5 h-3.5" />
          {isGenerating ? t('firstLastFrame.aiGenerating') : t('firstLastFrame.aiGenerate')}
        </button>
      </div>
      <input
        type="text"
        value={userInstruction}
        onChange={(event) => setUserInstruction(event.target.value)}
        className="w-full text-xs p-2 border border-[var(--glass-stroke-base)] rounded bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--glass-tone-info-fg)]"
        placeholder={t('firstLastFrame.userInstructionPlaceholder')}
      />
      <textarea
        value={draftPrompt}
        onChange={(event) => setDraftPrompt(event.target.value)}
        onBlur={handleBlur}
        rows={3}
        className="w-full text-xs p-2 border border-[var(--glass-stroke-focus)] rounded bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--glass-tone-info-fg)] resize-none"
        placeholder={t('firstLastFrame.placeholder')}
      />
    </div>
  )
}
