import { describe, expect, it } from 'vitest'
import { normalizeYunwuBaseUrl } from '@/lib/generators/yunwu'

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
