import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('VideoGroupOmniModal layer', () => {
  it('portals the modal above workspace stacking contexts', () => {
    const source = readFileSync(
      'src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/VideoGroupOmniModal.tsx',
      'utf8',
    )

    expect(source).toContain("import { createPortal } from 'react-dom'")
    expect(source).toContain('return createPortal(')
    expect(source).toContain('fixed inset-0 z-[120]')
    expect(source).toContain('document.body')
    expect(source).not.toContain('fixed inset-0 z-50')
  })
})
