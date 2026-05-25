'use client'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GlassButton, GlassModalShell } from '@/components/ui/primitives'
import { AppIcon } from '@/components/ui/icons'
import { resolveOriginalImageUrl } from '@/lib/media/image-url'
import {
  type CinematicPresetId,
  type CropRect,
  type EditorState,
  DEFAULT_EDITOR_STATE,
  applyRatioToCrop,
  canvasToFile,
  clampCrop,
  loadImage,
  parseRatio,
  renderGeometry,
  renderToCanvas,
} from '@/lib/image-editor/transforms'

interface StoryboardImageEditorModalProps {
  open: boolean
  panelId: string
  imageUrl: string | null
  videoRatio: string
  onApply: (panelId: string, file: File) => void | Promise<void>
  onClose: () => void
}

const PRESET_IDS: CinematicPresetId[] = ['none', 'warm', 'cool', 'faded', 'noir']

type RatioOption = { key: string; label: string; ratio: number | null }

export default function StoryboardImageEditorModal({
  open,
  panelId,
  imageUrl,
  videoRatio,
  onApply,
  onClose,
}: StoryboardImageEditorModalProps) {
  const t = useTranslations('storyboard')

  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [state, setState] = useState<EditorState>({ ...DEFAULT_EDITOR_STATE, filters: { ...DEFAULT_EDITOR_STATE.filters } })
  const [applying, setApplying] = useState(false)
  const [ratioKey, setRatioKey] = useState<string>('free')

  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // 基础图（几何变换后）尺寸，用于裁剪框换算
  const baseSizeRef = useRef<{ w: number; h: number }>({ w: 1, h: 1 })
  const dragRef = useRef<{ startX: number; startY: number; rect: DOMRect } | null>(null)

  const resolvedUrl = useMemo(() => resolveOriginalImageUrl(imageUrl), [imageUrl])

  const ratioOptions: RatioOption[] = useMemo(() => {
    const videoR = parseRatio(videoRatio)
    return [
      { key: 'free', label: t('image.localEditor.ratioFree'), ratio: null },
      ...(videoR ? [{ key: 'video', label: t('image.localEditor.ratioVideo', { ratio: videoRatio }), ratio: videoR }] : []),
      { key: '16:9', label: '16:9', ratio: 16 / 9 },
      { key: '9:16', label: '9:16', ratio: 9 / 16 },
      { key: '1:1', label: '1:1', ratio: 1 },
    ]
  }, [videoRatio, t])

  // 打开时加载图片并重置状态
  useEffect(() => {
    if (!open || !resolvedUrl) return
    let cancelled = false
    setImage(null)
    setLoadError(false)
    setState({ ...DEFAULT_EDITOR_STATE, filters: { ...DEFAULT_EDITOR_STATE.filters } })
    setRatioKey('free')
    loadImage(resolvedUrl)
      .then((img) => {
        if (!cancelled) setImage(img)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, resolvedUrl])

  // 重绘预览（几何 + 滤镜 + 叠加，不应用裁剪；裁剪由 overlay 表示）
  useEffect(() => {
    if (!image || !previewCanvasRef.current) return
    const base = renderGeometry(image, state)
    baseSizeRef.current = { w: base.width, h: base.height }
    const rendered = renderToCanvas(image, state, { applyCrop: false, maxSize: 1280 })
    const canvas = previewCanvasRef.current
    canvas.width = rendered.width
    canvas.height = rendered.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(rendered, 0, 0)
  }, [image, state])

  const updateFilters = useCallback((patch: Partial<EditorState['filters']>) => {
    setState((prev) => ({ ...prev, filters: { ...prev.filters, ...patch } }))
  }, [])

  const baseAspect = baseSizeRef.current.w / baseSizeRef.current.h

  const handleSelectRatio = useCallback(
    (option: RatioOption) => {
      setRatioKey(option.key)
      setState((prev) => {
        const current = prev.crop ?? { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }
        const next = option.ratio === null ? clampCrop(current) : applyRatioToCrop(current, baseAspect, option.ratio)
        return { ...prev, crop: next }
      })
    },
    [baseAspect],
  )

  // 在画布上拖拽绘制裁剪框
  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      dragRef.current = { startX: e.clientX, startY: e.clientY, rect }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [],
  )

  const onCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      const { rect } = drag
      const x1 = (drag.startX - rect.left) / rect.width
      const y1 = (drag.startY - rect.top) / rect.height
      const x2 = (e.clientX - rect.left) / rect.width
      const y2 = (e.clientY - rect.top) / rect.height
      let raw: CropRect = {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1),
        h: Math.abs(y2 - y1),
      }
      raw = clampCrop(raw)
      if (raw.w < 0.02 || raw.h < 0.02) return
      const option = ratioOptions.find((o) => o.key === ratioKey)
      const next = option && option.ratio !== null ? applyRatioToCrop(raw, baseAspect, option.ratio) : raw
      setState((prev) => ({ ...prev, crop: next }))
    },
    [ratioKey, ratioOptions, baseAspect],
  )

  const onCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }, [])

  const handleApply = useCallback(async () => {
    if (!image) return
    setApplying(true)
    try {
      const canvas = renderToCanvas(image, state, { applyCrop: true })
      const file = await canvasToFile(canvas, `panel-edit-${panelId}.jpg`)
      await onApply(panelId, file)
      onClose()
    } catch {
      setApplying(false)
    }
  }, [image, state, panelId, onApply, onClose])

  const rotate = useCallback((dir: 1 | -1) => {
    setState((prev) => ({ ...prev, rotate90: (((prev.rotate90 + dir) % 4) + 4) % 4 }))
  }, [])

  const reset = useCallback(() => {
    setState({ ...DEFAULT_EDITOR_STATE, filters: { ...DEFAULT_EDITOR_STATE.filters } })
    setRatioKey('free')
  }, [])

  const crop = state.crop

  return (
    <GlassModalShell
      open={open}
      onClose={applying ? () => {} : onClose}
      size="xl"
      title={t('image.localEditor.title')}
      closeOnBackdrop={!applying}
      closeOnEsc={!applying}
      footer={
        <div className="flex items-center justify-between gap-3">
          <GlassButton variant="ghost" size="sm" onClick={reset} disabled={applying}>
            {t('image.localEditor.reset')}
          </GlassButton>
          <div className="flex items-center gap-2">
            <GlassButton variant="secondary" size="sm" onClick={onClose} disabled={applying}>
              {t('image.localEditor.cancel')}
            </GlassButton>
            <GlassButton variant="primary" size="sm" onClick={handleApply} disabled={applying || !image}>
              {applying ? t('image.localEditor.applying') : t('image.localEditor.apply')}
            </GlassButton>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* 预览画布 */}
        <div className="flex flex-1 items-center justify-center rounded-xl bg-[var(--glass-bg-muted)] p-3 min-h-[280px]">
          {loadError ? (
            <span className="text-sm text-[var(--glass-tone-danger-fg)]">{t('image.localEditor.loadError')}</span>
          ) : !image ? (
            <span className="text-sm text-[var(--glass-text-secondary)]">{t('image.localEditor.loading')}</span>
          ) : (
            <div
              ref={containerRef}
              className="relative inline-block max-h-[60vh] cursor-crosshair select-none touch-none"
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
            >
              <canvas ref={previewCanvasRef} className="block max-h-[60vh] max-w-full rounded-lg" />
              {crop && (
                <>
                  {/* 四周遮罩 */}
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute left-0 top-0 w-full bg-black/55" style={{ height: `${crop.y * 100}%` }} />
                    <div className="absolute left-0 bg-black/55" style={{ top: `${crop.y * 100}%`, height: `${crop.h * 100}%`, width: `${crop.x * 100}%` }} />
                    <div className="absolute right-0 bg-black/55" style={{ top: `${crop.y * 100}%`, height: `${crop.h * 100}%`, width: `${(1 - crop.x - crop.w) * 100}%` }} />
                    <div className="absolute left-0 bottom-0 w-full bg-black/55" style={{ height: `${(1 - crop.y - crop.h) * 100}%` }} />
                  </div>
                  {/* 选框 */}
                  <div
                    className="pointer-events-none absolute border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                    style={{
                      left: `${crop.x * 100}%`,
                      top: `${crop.y * 100}%`,
                      width: `${crop.w * 100}%`,
                      height: `${crop.h * 100}%`,
                    }}
                  />
                </>
              )}
            </div>
          )}
        </div>

        {/* 控制面板 */}
        <div className="w-full shrink-0 space-y-4 lg:w-72">
          {/* 几何 */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--glass-text-secondary)]">
              {t('image.localEditor.geometry')}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              <GlassButton variant="secondary" size="sm" onClick={() => setState((p) => ({ ...p, flipH: !p.flipH }))}>
                {t('image.localEditor.flipH')}
              </GlassButton>
              <GlassButton variant="secondary" size="sm" onClick={() => setState((p) => ({ ...p, flipV: !p.flipV }))}>
                {t('image.localEditor.flipV')}
              </GlassButton>
              <GlassButton variant="secondary" size="sm" onClick={() => rotate(-1)}>
                <AppIcon name="refresh" className="h-3.5 w-3.5 -scale-x-100" />
                {t('image.localEditor.rotateLeft')}
              </GlassButton>
              <GlassButton variant="secondary" size="sm" onClick={() => rotate(1)}>
                <AppIcon name="refresh" className="h-3.5 w-3.5" />
                {t('image.localEditor.rotateRight')}
              </GlassButton>
            </div>
            <SliderRow
              label={t('image.localEditor.straighten')}
              min={-15}
              max={15}
              step={0.5}
              value={state.straightenDeg}
              suffix="°"
              onChange={(v) => setState((p) => ({ ...p, straightenDeg: v }))}
            />
          </section>

          {/* 裁剪 / 比例 */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--glass-text-secondary)]">
              {t('image.localEditor.crop')}
            </h3>
            <p className="text-[11px] text-[var(--glass-text-tertiary)]">{t('image.localEditor.cropHint')}</p>
            <div className="flex flex-wrap gap-1.5">
              {ratioOptions.map((option) => (
                <button
                  key={option.key}
                  onClick={() => handleSelectRatio(option)}
                  className={`glass-btn-base px-2 py-1 text-[11px] rounded-md transition-all active:scale-95 ${
                    ratioKey === option.key ? 'glass-btn-primary' : 'glass-btn-secondary'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {crop && (
              <GlassButton variant="ghost" size="sm" onClick={() => { setState((p) => ({ ...p, crop: null })); setRatioKey('free') }}>
                {t('image.localEditor.cropClear')}
              </GlassButton>
            )}
          </section>

          {/* 滤镜 */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--glass-text-secondary)]">
              {t('image.localEditor.filters')}
            </h3>
            <SliderRow label={t('image.localEditor.brightness')} min={0.5} max={1.5} step={0.01} value={state.filters.brightness} onChange={(v) => updateFilters({ brightness: v })} percent />
            <SliderRow label={t('image.localEditor.contrast')} min={0.5} max={1.5} step={0.01} value={state.filters.contrast} onChange={(v) => updateFilters({ contrast: v })} percent />
            <SliderRow label={t('image.localEditor.saturate')} min={0} max={2} step={0.01} value={state.filters.saturate} onChange={(v) => updateFilters({ saturate: v })} percent />
            <SliderRow label={t('image.localEditor.vignette')} min={0} max={1} step={0.01} value={state.filters.vignette} onChange={(v) => updateFilters({ vignette: v })} percent />
            <label className="flex items-center gap-2 text-xs text-[var(--glass-text-primary)]">
              <input
                type="checkbox"
                checked={state.filters.grayscale >= 1}
                onChange={(e) => updateFilters({ grayscale: e.target.checked ? 1 : 0 })}
              />
              {t('image.localEditor.grayscale')}
            </label>
          </section>

          {/* 电影预设 */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--glass-text-secondary)]">
              {t('image.localEditor.preset')}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => updateFilters({ preset: id })}
                  className={`glass-btn-base px-2 py-1 text-[11px] rounded-md transition-all active:scale-95 ${
                    state.filters.preset === id ? 'glass-btn-primary' : 'glass-btn-secondary'
                  }`}
                >
                  {t(`image.localEditor.presets.${id}`)}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </GlassModalShell>
  )
}

interface SliderRowProps {
  label: string
  min: number
  max: number
  step: number
  value: number
  suffix?: string
  percent?: boolean
  onChange: (value: number) => void
}

function SliderRow({ label, min, max, step, value, suffix, percent, onChange }: SliderRowProps) {
  const display = percent ? `${Math.round(value * 100)}%` : `${value}${suffix ?? ''}`
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[11px] text-[var(--glass-text-secondary)]">
        <span>{label}</span>
        <span className="tabular-nums">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--glass-accent,#6366f1)]"
      />
    </div>
  )
}
