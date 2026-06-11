import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import PanelGroupCollapseButton from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/PanelGroupCollapseButton'

describe('PanelGroupCollapseButton', () => {
  it('renders a stable, easy-to-hit collapse target', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PanelGroupCollapseButton, {
        label: '折叠',
        title: '折叠为组合卡片',
        onClick: vi.fn(),
      }),
    )

    expect(markup).toContain('h-5')
    expect(markup).toContain('min-w-13')
    expect(markup).toContain('text-[10px]')
    expect(markup).toContain('pointer-events-auto')
    expect(markup).toContain('touch-manipulation')
    expect(markup).toContain('hover:bg-[var(--glass-accent-from)]')
    expect(markup).toContain('hover:text-white')
    expect(markup).toContain('focus-visible:ring-2')
    expect(markup).toContain('折叠')
  })

  it('keeps the collapse target inside the current card stacking area', () => {
    const sourceFiles = [
      'src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/StoryboardPanelList.tsx',
      'src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/VideoRenderPanel.tsx',
    ]

    sourceFiles.forEach((filePath) => {
      const source = readFileSync(filePath, 'utf8')
      expect(source).toContain('absolute top-2 left-2 right-2')
      expect(source).not.toContain('absolute -top-2 left-2 right-2')
    })
  })
})
