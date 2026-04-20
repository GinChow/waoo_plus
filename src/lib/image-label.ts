import { logError as _ulogError } from '@/lib/logging/core'
import sharp from 'sharp'
import { uploadObject, getSignedUrl, generateUniqueKey, toFetchableUrl } from '@/lib/storage'
import { decodeImageUrlsFromDb, encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { initializeFonts, createLabelSVG } from '@/lib/fonts'

async function downloadImageBuffer(imageUrl: string): Promise<Buffer> {
  const storageKey = await resolveStorageKeyFromMediaValue(imageUrl)
  if (!storageKey) {
    throw new Error(`无法归一化媒体 key: ${imageUrl}`)
  }

  const signedUrl = getSignedUrl(storageKey, 3600)
  const response = await fetch(toFetchableUrl(signedUrl))
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

async function createLabeledImageBuffer(sourceBuffer: Buffer, labelText: string): Promise<Buffer> {
  await initializeFonts()

  const meta = await sharp(sourceBuffer).metadata()
  const width = meta.width || 2160
  const height = meta.height || 2160
  const fontSize = Math.floor(height * 0.04)
  const pad = Math.floor(fontSize * 0.5)
  const barHeight = fontSize + pad * 2
  const svg = await createLabelSVG(width, barHeight, fontSize, pad, labelText)

  return await sharp(sourceBuffer)
    .extend({
      top: barHeight,
      bottom: 0,
      left: 0,
      right: 0,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer()
}

function detectTopBlackLabelHeight(
  rgbBuffer: Buffer,
  width: number,
  height: number,
  channels: number,
): number {
  if (width <= 0 || height <= 0 || channels < 3) return 0

  const maxRows = Math.min(Math.floor(height * 0.25), 96)
  const minRows = Math.max(8, Math.floor(height * 0.015))
  if (maxRows < minRows) return 0

  let barStarted = false
  let lastBarRow = -1
  let gapRows = 0

  for (let y = 0; y < maxRows; y += 1) {
    let darkCount = 0
    let brightCount = 0
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels
      const r = rgbBuffer[offset] || 0
      const g = rgbBuffer[offset + 1] || 0
      const b = rgbBuffer[offset + 2] || 0
      if (r < 30 && g < 30 && b < 30) darkCount += 1
      if (r > 220 && g > 220 && b > 220) brightCount += 1
    }

    const darkRatio = darkCount / width
    const brightRatio = brightCount / width
    const isBarRow = darkRatio >= 0.82 || (darkRatio >= 0.72 && brightRatio <= 0.12)

    if (isBarRow) {
      barStarted = true
      lastBarRow = y
      gapRows = 0
      continue
    }

    if (!barStarted) break
    gapRows += 1
    if (gapRows > 2) break
  }

  const detectedRows = lastBarRow + 1
  if (detectedRows < minRows) return 0
  return detectedRows
}

async function createUnlabeledImageBuffer(sourceBuffer: Buffer): Promise<Buffer | null> {
  const meta = await sharp(sourceBuffer).metadata()
  const width = meta.width || 0
  const height = meta.height || 0
  if (width <= 0 || height <= 0) return null

  const probe = await sharp(sourceBuffer)
    .resize({
      width: Math.min(256, width),
      height: Math.min(256, height),
      fit: 'inside',
      withoutEnlargement: true,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const probeBarHeight = detectTopBlackLabelHeight(
    probe.data,
    probe.info.width,
    probe.info.height,
    probe.info.channels,
  )
  if (probeBarHeight <= 0) return null

  const cropTop = Math.round((probeBarHeight / probe.info.height) * height)
  if (cropTop <= 0 || cropTop >= height - 1) return null
  if (cropTop > Math.floor(height * 0.25)) return null

  return await sharp(sourceBuffer)
    .extract({ left: 0, top: cropTop, width, height: height - cropTop })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer()
}

export async function createUnlabeledCopyForGlobalUpload(imageUrl: string): Promise<string> {
  try {
    const sourceBuffer = await downloadImageBuffer(imageUrl)
    const unlabeledBuffer = await createUnlabeledImageBuffer(sourceBuffer)
    if (!unlabeledBuffer) return imageUrl

    const newKey = generateUniqueKey('global-upload-origin', 'jpg')
    await uploadObject(unlabeledBuffer, newKey)
    return newKey
  } catch (error) {
    _ulogError('Failed to create unlabeled copy for global upload:', error)
    return imageUrl
  }
}

export async function updateImageLabel(
  imageUrl: string,
  newLabelText: string,
  options?: {
    generateNewKey?: boolean
    keyPrefix?: string
  },
): Promise<string> {
  const originalKey = await resolveStorageKeyFromMediaValue(imageUrl)
  if (!originalKey) {
    throw new Error(`无法归一化媒体 key: ${imageUrl}`)
  }

  const buffer = await downloadImageBuffer(imageUrl)
  const meta = await sharp(buffer).metadata()
  const width = meta.width || 2160
  const height = meta.height || 2160
  const fontSize = Math.floor(height * 0.04)
  const pad = Math.floor(fontSize * 0.5)
  const barHeight = fontSize + pad * 2
  const croppedBuffer = await sharp(buffer)
    .extract({ left: 0, top: barHeight, width, height: height - barHeight })
    .toBuffer()
  const processed = await createLabeledImageBuffer(croppedBuffer, newLabelText)

  const finalKey = options?.generateNewKey
    ? generateUniqueKey(options.keyPrefix || 'labeled-image', 'jpg')
    : originalKey

  await uploadObject(processed, finalKey)
  return finalKey
}

export async function createProjectCharacterLabeledCopies(
  appearances: Array<{
    imageUrl: string | null
    imageUrls: string
    changeReason: string
  }>,
  characterName: string,
): Promise<Array<{ imageUrl: string | null; imageUrls: string }>> {
  const results: Array<{ imageUrl: string | null; imageUrls: string }> = []

  for (const appearance of appearances) {
    try {
      let imageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'appearance.imageUrls')
      if (imageUrls.length === 0 && appearance.imageUrl) {
        imageUrls = [appearance.imageUrl]
      }

      if (imageUrls.length === 0) {
        results.push({ imageUrl: null, imageUrls: encodeImageUrls([]) })
        continue
      }

      const labelText = `${characterName} - ${appearance.changeReason}`
      const labeledImageUrls = await Promise.all(
        imageUrls.map(async (imageUrl) => {
          if (!imageUrl) return ''
          try {
            const sourceBuffer = await downloadImageBuffer(imageUrl)
            const normalizedBuffer = await createUnlabeledImageBuffer(sourceBuffer)
            const processed = await createLabeledImageBuffer(normalizedBuffer || sourceBuffer, labelText)
            const newKey = generateUniqueKey('project-char-copy', 'jpg')
            await uploadObject(processed, newKey)
            return newKey
          } catch (error) {
            _ulogError('Failed to create project character labeled copy:', error)
            return imageUrl
          }
        }),
      )

      results.push({
        imageUrl: labeledImageUrls.find((url) => !!url) || null,
        imageUrls: encodeImageUrls(labeledImageUrls),
      })
    } catch (error) {
      _ulogError('Failed to copy project character images:', error)
      results.push({ imageUrl: appearance.imageUrl, imageUrls: appearance.imageUrls })
    }
  }

  return results
}

export async function createProjectLocationLabeledCopies(
  images: Array<{ imageUrl: string | null }>,
  locationName: string,
): Promise<Array<{ imageUrl: string | null }>> {
  const results: Array<{ imageUrl: string | null }> = []

  for (const image of images) {
    if (!image.imageUrl) {
      results.push({ imageUrl: null })
      continue
    }

    try {
      const sourceBuffer = await downloadImageBuffer(image.imageUrl)
      const normalizedBuffer = await createUnlabeledImageBuffer(sourceBuffer)
      const processed = await createLabeledImageBuffer(normalizedBuffer || sourceBuffer, locationName)
      const newKey = generateUniqueKey('project-location-copy', 'jpg')
      await uploadObject(processed, newKey)
      results.push({ imageUrl: newKey })
    } catch (error) {
      _ulogError('Failed to create project location labeled copy:', error)
      results.push({ imageUrl: image.imageUrl })
    }
  }

  return results
}
