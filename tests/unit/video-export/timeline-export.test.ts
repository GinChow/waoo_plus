import { describe, expect, it, vi } from 'vitest'
import {
  buildFinalCutProXml,
  buildPremiereXml,
  buildTimelineManifest,
  resolveTimelineDimensions,
  type TimelineExportProject,
} from '@/lib/video-export/timeline-export'

const project: TimelineExportProject = {
  projectName: '测试 & Project',
  episodeId: 'episode-1',
  fps: 30,
  width: 1080,
  height: 1920,
  clips: [
    {
      index: 1,
      fileName: '001_开场 & 镜头.mp4',
      durationSeconds: 3,
      panelId: 'panel-1',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      description: '开场 <镜头>',
      sourceType: 'original',
    },
    {
      index: 2,
      fileName: '002_对白.mp4',
      durationSeconds: 2.5,
      panelId: 'panel-2',
      storyboardId: 'storyboard-1',
      panelIndex: 1,
      description: '对白',
      sourceType: 'lip-sync',
    },
  ],
}

describe('timeline export', () => {
  it('builds a portable FCPXML timeline with sequential clips', () => {
    const xml = buildFinalCutProXml(project)

    expect(xml).toContain('<fcpxml version="1.10">')
    expect(xml).toContain('width="1080" height="1920"')
    expect(xml).toContain('duration="165/30s"')
    expect(xml).toContain('offset="90/30s"')
    expect(xml).toContain('src="media/001_%E5%BC%80%E5%9C%BA%20%26%20%E9%95%9C%E5%A4%B4.mp4"')
    expect(xml).toContain('name="测试 &amp; Project"')
    expect(xml).toContain('name="开场 &lt;镜头&gt;"')
  })

  it('builds Premiere XML with linked video and source-audio tracks', () => {
    const xml = buildPremiereXml(project)

    expect(xml).toContain('<xmeml version="5">')
    expect(xml).toContain('<duration>165</duration>')
    expect(xml).toContain('<pathurl>media/001_%E5%BC%80%E5%9C%BA%20%26%20%E9%95%9C%E5%A4%B4.mp4</pathurl>')
    expect(xml).toContain('<clipitem id="video-clip-1">')
    expect(xml).toContain('<clipitem id="audio-clip-1">')
    expect(xml).toContain('<mediatype>audio</mediatype>')
  })

  it('builds a manifest with frame-based timing and source metadata', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-09T10:00:00.000Z'))

    const manifest = JSON.parse(buildTimelineManifest(project))

    expect(manifest.generatedAt).toBe('2026-06-09T10:00:00.000Z')
    expect(manifest.project.durationFrames).toBe(165)
    expect(manifest.clips[1]).toMatchObject({
      file: 'media/002_%E5%AF%B9%E7%99%BD.mp4',
      startFrame: 90,
      durationFrames: 75,
      sourceType: 'lip-sync',
    })
    vi.useRealTimers()
  })

  it('resolves common project ratios to a 1920-pixel long edge', () => {
    expect(resolveTimelineDimensions('16:9')).toEqual({ width: 1920, height: 1080 })
    expect(resolveTimelineDimensions('9:16')).toEqual({ width: 1080, height: 1920 })
    expect(resolveTimelineDimensions('1:1')).toEqual({ width: 1920, height: 1920 })
    expect(resolveTimelineDimensions('invalid')).toEqual({ width: 1920, height: 1080 })
  })
})
