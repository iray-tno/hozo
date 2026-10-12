import { Asset } from 'expo-asset'
import type { MediaSourceResolver } from './source-types.ts'
import { resolveMediaURI } from './source-uri.ts'

function requireActive(signal: AbortSignal) {
  if (!signal.aborted) return
  const error = new Error('Media asset resolution was aborted')
  error.name = 'AbortError'
  throw error
}

/** Optional SDK adapter; Web URI consumers never import Expo through /source. */
export const resolveExpoMediaAsset: MediaSourceResolver<number> = async (source, signal) => {
  requireActive(signal)
  if (!Number.isSafeInteger(source) || source <= 0)
    throw new TypeError('Expo media source requires a positive integer Metro asset ID')
  const asset = await Asset.fromModule(source).downloadAsync()
  requireActive(signal)
  // Preserve Expo's embedded-resource URI fallback; a URI is not proof of a
  // persistent local file, offline availability or codec support.
  return resolveMediaURI(asset.localUri ?? asset.uri)
}
