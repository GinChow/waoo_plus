import { describe, it, expect } from 'vitest'
import {
  parseRatio,
  buildFilterString,
  rotatedRectWithMaxArea,
  applyRatioToCrop,
  clampCrop,
  isPristine,
  DEFAULT_EDITOR_STATE,
  type EditorState,
} from '@/lib/image-editor/transforms'

describe('parseRatio', () => {
  it('解析常见比例', () => {
    expect(parseRatio('16:9')).toBeCloseTo(16 / 9)
    expect(parseRatio('9:16')).toBeCloseTo(9 / 16)
    expect(parseRatio('1:1')).toBe(1)
    expect(parseRatio('16/9')).toBeCloseTo(16 / 9)
  })

  it('非法输入返回 null', () => {
    expect(parseRatio(null)).toBeNull()
    expect(parseRatio('free')).toBeNull()
    expect(parseRatio('0:9')).toBeNull()
    expect(parseRatio('abc')).toBeNull()
  })
})

describe('buildFilterString', () => {
  it('默认滤镜为原始值', () => {
    expect(buildFilterString(DEFAULT_EDITOR_STATE.filters)).toBe(
      'brightness(1) contrast(1) saturate(1) grayscale(0)',
    )
  })

  it('noir 预设强制灰度并提高对比度', () => {
    const result = buildFilterString({ ...DEFAULT_EDITOR_STATE.filters, preset: 'noir' })
    expect(result).toContain('grayscale(1)')
    expect(result).toContain('contrast(1.3)')
  })

  it('用户滑块与预设相乘合成', () => {
    const result = buildFilterString({ ...DEFAULT_EDITOR_STATE.filters, saturate: 1.2, preset: 'warm' })
    // 1.2 * 1.1 = 1.32
    expect(result).toContain('saturate(1.32)')
  })
})

describe('rotatedRectWithMaxArea', () => {
  it('0 度返回原尺寸', () => {
    const r = rotatedRectWithMaxArea(100, 50, 0)
    expect(r.w).toBeCloseTo(100)
    expect(r.h).toBeCloseTo(50)
  })

  it('结果不超过原始尺寸', () => {
    const r = rotatedRectWithMaxArea(100, 50, (10 * Math.PI) / 180)
    expect(r.w).toBeLessThanOrEqual(100)
    expect(r.h).toBeLessThanOrEqual(50)
    expect(r.w).toBeGreaterThan(0)
    expect(r.h).toBeGreaterThan(0)
  })

  it('退化输入返回零', () => {
    expect(rotatedRectWithMaxArea(0, 50, 0.1)).toEqual({ w: 0, h: 0 })
  })
})

describe('clampCrop', () => {
  it('越界裁剪框被夹回 [0,1]', () => {
    const c = clampCrop({ x: -0.2, y: 0.9, w: 0.5, h: 0.5 })
    expect(c.x).toBe(0)
    expect(c.y).toBeCloseTo(0.5)
    expect(c.x + c.w).toBeLessThanOrEqual(1.0001)
    expect(c.y + c.h).toBeLessThanOrEqual(1.0001)
  })
})

describe('applyRatioToCrop', () => {
  it('自由比例原样夹紧返回', () => {
    const crop = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }
    expect(applyRatioToCrop(crop, 1.5, null)).toEqual(clampCrop(crop))
  })

  it('约束后的像素宽高比等于目标比例', () => {
    const baseAspect = 16 / 9 // 基础图为横图
    const targetRatio = 1 // 目标 1:1
    const crop = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }
    const result = applyRatioToCrop(crop, baseAspect, targetRatio)
    const pixelRatio = (result.w * baseAspect) / result.h
    expect(pixelRatio).toBeCloseTo(targetRatio, 5)
    // 不越界
    expect(result.x).toBeGreaterThanOrEqual(0)
    expect(result.y).toBeGreaterThanOrEqual(0)
    expect(result.x + result.w).toBeLessThanOrEqual(1.0001)
    expect(result.y + result.h).toBeLessThanOrEqual(1.0001)
  })

  it('保持中心不变', () => {
    const baseAspect = 1
    const crop = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 }
    const result = applyRatioToCrop(crop, baseAspect, 16 / 9)
    expect(result.x + result.w / 2).toBeCloseTo(0.5, 5)
    expect(result.y + result.h / 2).toBeCloseTo(0.5, 5)
  })
})

describe('isPristine', () => {
  it('默认状态为未修改', () => {
    expect(isPristine(DEFAULT_EDITOR_STATE)).toBe(true)
  })

  it('任一修改即非 pristine', () => {
    const flipped: EditorState = { ...DEFAULT_EDITOR_STATE, flipH: true }
    expect(isPristine(flipped)).toBe(false)
    const filtered: EditorState = {
      ...DEFAULT_EDITOR_STATE,
      filters: { ...DEFAULT_EDITOR_STATE.filters, brightness: 1.2 },
    }
    expect(isPristine(filtered)).toBe(false)
  })
})
