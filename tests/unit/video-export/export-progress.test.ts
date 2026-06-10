import { describe, expect, it } from 'vitest'
import {
  calculateDownloadProgress,
  calculatePackingProgress,
} from '@/lib/video-export/export-progress'

describe('timeline export progress', () => {
  it('maps clip downloads into the main progress range', () => {
    expect(calculateDownloadProgress(0, 20)).toBe(5)
    expect(calculateDownloadProgress(10, 20)).toBe(45)
    expect(calculateDownloadProgress(20, 20)).toBe(85)
    expect(calculateDownloadProgress(30, 20)).toBe(85)
  })

  it('maps archive generation into the final progress range', () => {
    expect(calculatePackingProgress(0)).toBe(85)
    expect(calculatePackingProgress(50)).toBe(93)
    expect(calculatePackingProgress(100)).toBe(100)
    expect(calculatePackingProgress(150)).toBe(100)
  })
})
