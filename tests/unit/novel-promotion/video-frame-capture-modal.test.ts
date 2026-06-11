import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VideoFrameCaptureModal from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoFrameCaptureModal'

vi.mock('react-dom', () => ({
  createPortal: (node: React.ReactNode) => node,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (
    values?.number === undefined ? key : `${key}:${String(values.number)}`
  ),
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name }: { name: string }) => React.createElement('span', null, name),
}))

describe('VideoFrameCaptureModal', () => {
  const originalDocument = globalThis.document

  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {},
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    })
  })

  it('renders local download and available adjacent panel actions', () => {
    const markup = renderToStaticMarkup(React.createElement(VideoFrameCaptureModal, {
      projectId: 'project-1',
      videoUrl: 'https://example.com/video.mp4',
      aspectRatio: '16/9',
      targets: [
        { panelId: 'panel-1', panelNumber: 1, position: 'previous', hasImage: true },
        { panelId: 'panel-2', panelNumber: 2, position: 'current', hasImage: true },
        { panelId: 'panel-3', panelNumber: 3, position: 'next', hasImage: false },
      ],
      onApply: vi.fn(async () => undefined),
      onClose: vi.fn(),
    }))

    expect(markup).toContain('frameCapture.saveLocal')
    expect(markup).toContain('frameCapture.setAsPreviousPanel:1')
    expect(markup).toContain('frameCapture.setAsCurrentPanel:2')
    expect(markup).toContain('frameCapture.setAsNextPanel:3')
    expect(markup).toContain('download')
  })
})
