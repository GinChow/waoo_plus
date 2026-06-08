import { describe, expect, it } from 'vitest'
import { shouldResetPlaybackAfterPlayError } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/runtime/hooks/usePanelPlayer'

describe('usePanelPlayer', () => {
  it('resets playback for aborted or failed native video play attempts', () => {
    expect(shouldResetPlaybackAfterPlayError(new DOMException('interrupted', 'AbortError'))).toBe(true)
    expect(shouldResetPlaybackAfterPlayError(new Error('network failed'))).toBe(true)
  })

  it('resets playback for browser permission prompts', () => {
    expect(shouldResetPlaybackAfterPlayError(new DOMException('blocked', 'NotAllowedError'))).toBe(true)
  })
})
