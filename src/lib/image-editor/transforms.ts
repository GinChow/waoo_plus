/**
 * 分镜本地图像编辑核心。
 *
 * 设计要点：
 * - 纯计算函数（比例解析、裁剪约束、滤镜字符串、旋转内接矩形）不依赖 DOM，便于单测。
 * - 渲染函数依赖 Canvas/Image，仅在浏览器运行时调用。
 * - 编辑状态 EditorState 与分辨率无关：crop 用归一化坐标 [0,1]，预览与最终输出共用同一状态。
 */

export interface CropRect {
  /** 归一化坐标，相对“几何变换后的基础图” */
  x: number
  y: number
  w: number
  h: number
}

export type CinematicPresetId = 'none' | 'warm' | 'cool' | 'faded' | 'noir'

export interface EditorFilters {
  /** 亮度，1 = 原始 */
  brightness: number
  /** 对比度，1 = 原始 */
  contrast: number
  /** 饱和度，1 = 原始 */
  saturate: number
  /** 黑白 0~1 */
  grayscale: number
  /** 暗角强度 0~1 */
  vignette: number
  preset: CinematicPresetId
}

export interface EditorState {
  flipH: boolean
  flipV: boolean
  /** 90° 步进旋转，取值 0/1/2/3（顺时针） */
  rotate90: number
  /** 拉直微调角度，单位：度（顺时针为正） */
  straightenDeg: number
  /** 裁剪区域；null 表示不裁剪 */
  crop: CropRect | null
  filters: EditorFilters
}

export const DEFAULT_FILTERS: EditorFilters = {
  brightness: 1,
  contrast: 1,
  saturate: 1,
  grayscale: 0,
  vignette: 0,
  preset: 'none',
}

export const DEFAULT_EDITOR_STATE: EditorState = {
  flipH: false,
  flipV: false,
  rotate90: 0,
  straightenDeg: 0,
  crop: null,
  filters: { ...DEFAULT_FILTERS },
}

export interface CinematicPreset {
  id: CinematicPresetId
  /** 叠加在滤镜之上的固定 filter 调整（与用户滑块相乘合成） */
  filterAdjust: Partial<Pick<EditorFilters, 'brightness' | 'contrast' | 'saturate' | 'grayscale'>>
  /** 色调叠加层 */
  overlay?: { color: string; composite: GlobalCompositeOperation }
}

export const CINEMATIC_PRESETS: Record<CinematicPresetId, CinematicPreset> = {
  none: { id: 'none', filterAdjust: {} },
  warm: {
    id: 'warm',
    filterAdjust: { saturate: 1.1, contrast: 1.05 },
    overlay: { color: 'rgba(255,150,40,0.12)', composite: 'overlay' },
  },
  cool: {
    id: 'cool',
    filterAdjust: { saturate: 1.05, contrast: 1.05 },
    overlay: { color: 'rgba(40,120,255,0.12)', composite: 'overlay' },
  },
  faded: {
    id: 'faded',
    filterAdjust: { brightness: 1.05, contrast: 0.9, saturate: 0.85 },
    overlay: { color: 'rgba(180,170,150,0.10)', composite: 'soft-light' },
  },
  noir: {
    id: 'noir',
    filterAdjust: { grayscale: 1, contrast: 1.3 },
  },
}

// ---------------------------------------------------------------------------
// 纯计算函数（无 DOM 依赖，可单测）
// ---------------------------------------------------------------------------

/** 解析 "16:9" / "9:16" / "1:1" 为宽高比数值；非法或 "free" 返回 null */
export function parseRatio(input: string | null | undefined): number | null {
  if (!input) return null
  const match = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(input.trim())
  if (!match) return null
  const w = Number(match[1])
  const h = Number(match[2])
  if (!(w > 0) || !(h > 0)) return null
  return w / h
}

/** 合成用户滤镜与预设调整，返回 canvas ctx.filter 字符串 */
export function buildFilterString(filters: EditorFilters): string {
  const preset = CINEMATIC_PRESETS[filters.preset] ?? CINEMATIC_PRESETS.none
  const adj = preset.filterAdjust
  const brightness = filters.brightness * (adj.brightness ?? 1)
  const contrast = filters.contrast * (adj.contrast ?? 1)
  const saturate = filters.saturate * (adj.saturate ?? 1)
  const grayscale = Math.min(1, Math.max(filters.grayscale, adj.grayscale ?? 0))
  return [
    `brightness(${round(brightness)})`,
    `contrast(${round(contrast)})`,
    `saturate(${round(saturate)})`,
    `grayscale(${round(grayscale)})`,
  ].join(' ')
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * 旋转一个 w×h 矩形 angle（弧度）后，能内接的最大轴对齐矩形（避免空角）。
 * 经典解法（Largest inscribed rectangle of a rotated rectangle）。
 */
export function rotatedRectWithMaxArea(
  w: number,
  h: number,
  angle: number,
): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 }
  const sinA = Math.abs(Math.sin(angle))
  const cosA = Math.abs(Math.cos(angle))
  const widthIsLonger = w >= h
  const sideLong = widthIsLonger ? w : h
  const sideShort = widthIsLonger ? h : w

  let wr: number
  let hr: number
  if (sideShort <= 2 * sinA * cosA * sideLong || Math.abs(sinA - cosA) < 1e-10) {
    const x = 0.5 * sideShort
    if (widthIsLonger) {
      wr = sinA < 1e-10 ? sideLong : x / sinA
      hr = cosA < 1e-10 ? sideShort : x / cosA
    } else {
      wr = cosA < 1e-10 ? sideShort : x / cosA
      hr = sinA < 1e-10 ? sideLong : x / sinA
    }
  } else {
    const cosDA = cosA * cosA - sinA * sinA
    wr = (w * cosA - h * sinA) / cosDA
    hr = (h * cosA - w * sinA) / cosDA
  }
  return { w: Math.max(0, Math.min(w, wr)), h: Math.max(0, Math.min(h, hr)) }
}

/**
 * 将裁剪框约束到目标宽高比（保持中心，尽量贴近原框尺寸但不超出 [0,1]）。
 * @param crop  当前归一化裁剪框（相对基础图）
 * @param baseAspect 基础图像素宽高比 (w/h)
 * @param targetRatio 目标显示宽高比 (w/h)；null 表示自由比例（原样返回）
 */
export function applyRatioToCrop(
  crop: CropRect,
  baseAspect: number,
  targetRatio: number | null,
): CropRect {
  if (!targetRatio || !(baseAspect > 0)) return clampCrop(crop)
  // 归一化坐标下，像素宽高比 = (cw*baseW)/(ch*baseH) = (cw/ch)*baseAspect
  // 令其等于 targetRatio => cw/ch = targetRatio / baseAspect
  const ratioNorm = targetRatio / baseAspect
  const cx = crop.x + crop.w / 2
  const cy = crop.y + crop.h / 2
  // 以当前框高度为基准推宽度，超界则反推
  let ch = crop.h
  let cw = ch * ratioNorm
  if (cw > 1) {
    cw = 1
    ch = cw / ratioNorm
  }
  if (ch > 1) {
    ch = 1
    cw = ch * ratioNorm
  }
  let x = cx - cw / 2
  let y = cy - ch / 2
  x = Math.min(Math.max(0, x), 1 - cw)
  y = Math.min(Math.max(0, y), 1 - ch)
  return { x, y, w: cw, h: ch }
}

/** 将裁剪框各分量夹到合法范围 [0,1] 且不越界 */
export function clampCrop(crop: CropRect): CropRect {
  const w = clamp01(crop.w)
  const h = clamp01(crop.h)
  const x = Math.min(Math.max(0, crop.x), 1 - w)
  const y = Math.min(Math.max(0, crop.y), 1 - h)
  return { x, y, w, h }
}

/** 编辑状态是否等同于“未做任何修改” */
export function isPristine(state: EditorState): boolean {
  const f = state.filters
  return (
    !state.flipH &&
    !state.flipV &&
    state.rotate90 % 4 === 0 &&
    state.straightenDeg === 0 &&
    state.crop === null &&
    f.brightness === 1 &&
    f.contrast === 1 &&
    f.saturate === 1 &&
    f.grayscale === 0 &&
    f.vignette === 0 &&
    f.preset === 'none'
  )
}

// ---------------------------------------------------------------------------
// 渲染函数（依赖 DOM / Canvas）
// ---------------------------------------------------------------------------

type CanvasImageInput = HTMLImageElement | HTMLCanvasElement

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function sourceSize(image: CanvasImageInput): { w: number; h: number } {
  if (image instanceof HTMLImageElement) {
    return { w: image.naturalWidth || image.width, h: image.naturalHeight || image.height }
  }
  return { w: image.width, h: image.height }
}

/**
 * 应用几何变换（翻转 + 90° 旋转 + 拉直），返回基础图 canvas。
 * 拉直后裁出最大内接矩形以消除空角。
 */
export function renderGeometry(image: CanvasImageInput, state: EditorState): HTMLCanvasElement {
  const { w: sw, h: sh } = sourceSize(image)
  const rot90 = ((state.rotate90 % 4) + 4) % 4
  const swap = rot90 === 1 || rot90 === 3

  const stage = createCanvas(swap ? sh : sw, swap ? sw : sh)
  const sctx = stage.getContext('2d')!
  sctx.save()
  sctx.translate(stage.width / 2, stage.height / 2)
  sctx.rotate((rot90 * Math.PI) / 2)
  sctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1)
  sctx.drawImage(image, -sw / 2, -sh / 2, sw, sh)
  sctx.restore()

  if (!state.straightenDeg) return stage

  const rad = (state.straightenDeg * Math.PI) / 180
  const rect = rotatedRectWithMaxArea(stage.width, stage.height, rad)
  const out = createCanvas(rect.w, rect.h)
  const octx = out.getContext('2d')!
  octx.save()
  octx.translate(out.width / 2, out.height / 2)
  octx.rotate(rad)
  octx.drawImage(stage, -stage.width / 2, -stage.height / 2)
  octx.restore()
  return out
}

export interface RenderOptions {
  /** 是否应用裁剪（输出时 true；预览时 false，由 overlay 单独表示裁剪框） */
  applyCrop?: boolean
  /** 输出最长边上限（用于预览降采样以保证流畅），不传则使用全分辨率 */
  maxSize?: number
}

/**
 * 渲染最终图像到一个新的 canvas（几何 → 可选裁剪 → 滤镜 → 暗角/预设叠加）。
 */
export function renderToCanvas(
  image: CanvasImageInput,
  state: EditorState,
  options: RenderOptions = {},
): HTMLCanvasElement {
  const { applyCrop = true, maxSize } = options
  const base = renderGeometry(image, state)

  // 裁剪区域（像素，基于 base）
  let srcX = 0
  let srcY = 0
  let srcW = base.width
  let srcH = base.height
  if (applyCrop && state.crop) {
    const c = clampCrop(state.crop)
    srcX = Math.round(c.x * base.width)
    srcY = Math.round(c.y * base.height)
    srcW = Math.max(1, Math.round(c.w * base.width))
    srcH = Math.max(1, Math.round(c.h * base.height))
  }

  let outW = srcW
  let outH = srcH
  if (maxSize && Math.max(srcW, srcH) > maxSize) {
    const scale = maxSize / Math.max(srcW, srcH)
    outW = Math.max(1, Math.round(srcW * scale))
    outH = Math.max(1, Math.round(srcH * scale))
  }

  const out = createCanvas(outW, outH)
  const ctx = out.getContext('2d')!
  ctx.filter = buildFilterString(state.filters)
  ctx.drawImage(base, srcX, srcY, srcW, srcH, 0, 0, outW, outH)
  ctx.filter = 'none'

  // 预设色调叠加
  const preset = CINEMATIC_PRESETS[state.filters.preset]
  if (preset?.overlay) {
    ctx.save()
    ctx.globalCompositeOperation = preset.overlay.composite
    ctx.fillStyle = preset.overlay.color
    ctx.fillRect(0, 0, outW, outH)
    ctx.restore()
  }

  // 暗角
  if (state.filters.vignette > 0) {
    const v = clamp01(state.filters.vignette)
    const cx = outW / 2
    const cy = outH / 2
    const radius = Math.sqrt(cx * cx + cy * cy)
    const gradient = ctx.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius)
    gradient.addColorStop(0, 'rgba(0,0,0,0)')
    gradient.addColorStop(1, `rgba(0,0,0,${round(v * 0.85)})`)
    ctx.save()
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, outW, outH)
    ctx.restore()
  }

  return out
}

/** 将 canvas 导出为 File（JPEG），用于复用现有上传接口 */
export function canvasToFile(
  canvas: HTMLCanvasElement,
  filename: string,
  quality = 0.92,
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('canvas.toBlob returned null'))
          return
        }
        resolve(new File([blob], filename, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      quality,
    )
  })
}

/** 加载图片为 HTMLImageElement（同源 URL，crossOrigin 以保证 canvas 不被污染） */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}
