import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { getSignedObjectUrl, toFetchableUrl } from '@/lib/storage'

export async function resolveVideoProxyFetchUrl(videoValue: string): Promise<string> {
  if (videoValue.startsWith('http://') || videoValue.startsWith('https://')) {
    return videoValue
  }

  const storageKey = await resolveStorageKeyFromMediaValue(videoValue)
  if (storageKey) {
    return toFetchableUrl(await getSignedObjectUrl(storageKey, 3600))
  }

  return toFetchableUrl(videoValue)
}
