export interface TimelineExportClip {
  index: number
  fileName: string
  durationSeconds: number
  panelId: string
  storyboardId: string
  panelIndex: number
  description: string
  sourceType: 'original' | 'lip-sync'
}

export interface TimelineExportProject {
  projectName: string
  episodeId: string
  fps: number
  width: number
  height: number
  clips: TimelineExportClip[]
}

interface PreparedClip extends TimelineExportClip {
  durationFrames: number
  startFrame: number
  assetId: string
  clipId: string
  audioClipId: string
  relativePath: string
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function encodeRelativePath(fileName: string): string {
  return `media/${fileName.split('/').map(encodeURIComponent).join('/')}`
}

function prepareProject(project: TimelineExportProject): PreparedClip[] {
  let startFrame = 0

  return project.clips.map((clip, index) => {
    const durationFrames = Math.max(1, Math.round(clip.durationSeconds * project.fps))
    const prepared = {
      ...clip,
      durationFrames,
      startFrame,
      assetId: `asset-${index + 1}`,
      clipId: `video-clip-${index + 1}`,
      audioClipId: `audio-clip-${index + 1}`,
      relativePath: encodeRelativePath(clip.fileName),
    }
    startFrame += durationFrames
    return prepared
  })
}

function projectDurationFrames(clips: PreparedClip[]): number {
  return clips.reduce((total, clip) => total + clip.durationFrames, 0)
}

export function buildFinalCutProXml(project: TimelineExportProject): string {
  const clips = prepareProject(project)
  const totalFrames = projectDurationFrames(clips)
  const resources = clips.map((clip) => `
    <asset id="${clip.assetId}" name="${escapeXml(clip.fileName)}" start="0s" duration="${clip.durationFrames}/${project.fps}s" hasVideo="1" hasAudio="1" format="format-1">
      <media-rep kind="original-media" src="${escapeXml(clip.relativePath)}" />
    </asset>`).join('')
  const spine = clips.map((clip) => `
          <asset-clip ref="${clip.assetId}" name="${escapeXml(clip.description || clip.fileName)}" offset="${clip.startFrame}/${project.fps}s" start="0s" duration="${clip.durationFrames}/${project.fps}s" />`).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="format-1" name="FFVideoFormatRateUndefined" frameDuration="1/${project.fps}s" width="${project.width}" height="${project.height}" colorSpace="1-1-1 (Rec. 709)" />${resources}
  </resources>
  <library>
    <event name="${escapeXml(project.projectName)}">
      <project name="${escapeXml(project.projectName)}">
        <sequence format="format-1" duration="${totalFrames}/${project.fps}s" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>${spine}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`
}

function buildPremiereFileNode(clip: PreparedClip, project: TimelineExportProject): string {
  return `<file id="${clip.assetId}">
              <name>${escapeXml(clip.fileName)}</name>
              <pathurl>${escapeXml(clip.relativePath)}</pathurl>
              <rate><timebase>${project.fps}</timebase><ntsc>FALSE</ntsc></rate>
              <duration>${clip.durationFrames}</duration>
              <media>
                <video><samplecharacteristics><width>${project.width}</width><height>${project.height}</height></samplecharacteristics></video>
                <audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio>
              </media>
            </file>`
}

function buildPremiereLinks(clip: PreparedClip): string {
  return `<link><linkclipref>${clip.clipId}</linkclipref><mediatype>video</mediatype><trackindex>1</trackindex><clipindex>${clip.index}</clipindex></link>
            <link><linkclipref>${clip.audioClipId}</linkclipref><mediatype>audio</mediatype><trackindex>1</trackindex><clipindex>${clip.index}</clipindex></link>`
}

export function buildPremiereXml(project: TimelineExportProject): string {
  const clips = prepareProject(project)
  const totalFrames = projectDurationFrames(clips)
  const videoItems = clips.map((clip) => `
          <clipitem id="${clip.clipId}">
            <name>${escapeXml(clip.description || clip.fileName)}</name>
            <duration>${clip.durationFrames}</duration>
            <rate><timebase>${project.fps}</timebase><ntsc>FALSE</ntsc></rate>
            <start>${clip.startFrame}</start><end>${clip.startFrame + clip.durationFrames}</end>
            <in>0</in><out>${clip.durationFrames}</out>
            ${buildPremiereFileNode(clip, project)}
            <sourcetrack><mediatype>video</mediatype><trackindex>1</trackindex></sourcetrack>
            ${buildPremiereLinks(clip)}
          </clipitem>`).join('')
  const audioItems = clips.map((clip) => `
          <clipitem id="${clip.audioClipId}">
            <name>${escapeXml(clip.description || clip.fileName)}</name>
            <duration>${clip.durationFrames}</duration>
            <rate><timebase>${project.fps}</timebase><ntsc>FALSE</ntsc></rate>
            <start>${clip.startFrame}</start><end>${clip.startFrame + clip.durationFrames}</end>
            <in>0</in><out>${clip.durationFrames}</out>
            <file id="${clip.assetId}" />
            <sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>
            ${buildPremiereLinks(clip)}
          </clipitem>`).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence id="sequence-1">
    <name>${escapeXml(project.projectName)}</name>
    <duration>${totalFrames}</duration>
    <rate><timebase>${project.fps}</timebase><ntsc>FALSE</ntsc></rate>
    <media>
      <video>
        <format><samplecharacteristics><width>${project.width}</width><height>${project.height}</height><pixelaspectratio>square</pixelaspectratio><rate><timebase>${project.fps}</timebase><ntsc>FALSE</ntsc></rate></samplecharacteristics></format>
        <track>${videoItems}
        </track>
      </video>
      <audio>
        <format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>
        <track>${audioItems}
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>
`
}

export function buildTimelineManifest(project: TimelineExportProject): string {
  const clips = prepareProject(project)

  return JSON.stringify({
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    project: {
      name: project.projectName,
      episodeId: project.episodeId,
      fps: project.fps,
      width: project.width,
      height: project.height,
      durationFrames: projectDurationFrames(clips),
    },
    clips: clips.map((clip) => ({
      index: clip.index,
      file: clip.relativePath,
      startFrame: clip.startFrame,
      durationFrames: clip.durationFrames,
      durationSeconds: clip.durationSeconds,
      panelId: clip.panelId,
      storyboardId: clip.storyboardId,
      panelIndex: clip.panelIndex,
      description: clip.description,
      sourceType: clip.sourceType,
    })),
  }, null, 2)
}

export function resolveTimelineDimensions(videoRatio: string): { width: number; height: number } {
  const [rawWidth, rawHeight] = videoRatio.split(':').map(Number)
  if (!rawWidth || !rawHeight || rawWidth <= 0 || rawHeight <= 0) {
    return { width: 1920, height: 1080 }
  }

  if (rawWidth >= rawHeight) {
    return { width: 1920, height: Math.round(1920 * rawHeight / rawWidth) }
  }
  return { width: Math.round(1920 * rawWidth / rawHeight), height: 1920 }
}
