import { describe, expect, it } from 'vitest'
import { normalizeYunwuBaseUrl, normalizeYunwuOmniBaseUrl } from '@/lib/generators/yunwu'

describe('normalizeYunwuBaseUrl', () => {
  it('keeps base with /ent/v2 unchanged', () => {
    expect(normalizeYunwuBaseUrl('https://yunwu.ai/ent/v2')).toBe('https://yunwu.ai/ent/v2')
  })

  it('appends /ent/v2 when base has no version path', () => {
    expect(normalizeYunwuBaseUrl('https://yunwu.ai')).toBe('https://yunwu.ai/ent/v2')
  })

  it('strips mistaken img2video endpoint suffix from base', () => {
    expect(normalizeYunwuBaseUrl('https://yunwu.ai/ent/v2/img2video')).toBe('https://yunwu.ai/ent/v2')
  })

  it('strips duplicated endpoint/version suffix pattern from base', () => {
    expect(normalizeYunwuBaseUrl('https://yunwu.ai/ent/v2/img2video/ent/v2')).toBe('https://yunwu.ai/ent/v2')
  })

  it('strips mistaken start-end2video endpoint suffix from base', () => {
    expect(normalizeYunwuBaseUrl('https://yunwu.ai/ent/v2/start-end2video')).toBe('https://yunwu.ai/ent/v2')
  })
})

describe('normalizeYunwuOmniBaseUrl', () => {
  it('keeps root yunwu base for omni endpoint', () => {
    expect(normalizeYunwuOmniBaseUrl('https://yunwu.ai')).toBe('https://yunwu.ai/kling/v1')
  })

  it('strips version and endpoint suffixes for omni endpoint', () => {
    expect(normalizeYunwuOmniBaseUrl('https://yunwu.ai/ent/v2')).toBe('https://yunwu.ai/kling/v1')
    expect(normalizeYunwuOmniBaseUrl('https://yunwu.ai/kling/v1')).toBe('https://yunwu.ai/kling/v1')
    expect(normalizeYunwuOmniBaseUrl('https://yunwu.ai/v1/kling')).toBe('https://yunwu.ai/kling/v1')
    expect(normalizeYunwuOmniBaseUrl('https://yunwu.ai/kling/v1/videos/omni-video')).toBe('https://yunwu.ai/kling/v1')
  })
})
