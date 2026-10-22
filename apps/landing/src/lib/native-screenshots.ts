// The Android and iOS screenshots of the /docs component demos (#1160, #1204).
//
// native-showcase's `ui-docs` scenario captures each demo on an emulator or
// simulator and uploads the images with a manifest (#1159). The Pages build
// fetches the newest such artifact from main for each platform and shows
// each page's images under its preview. Images are not committed: 39 of them
// per platform per run would grow the repository every week for something a
// deploy can fetch.

export const platforms = ['android', 'ios'] as const
export type Platform = (typeof platforms)[number]

export const artifactNames: Record<Platform, string> = {
  android: 'hozo-native-showcase-android-ui-docs',
  ios: 'hozo-native-showcase-ios-ui-docs',
}

export const platformNames: Record<Platform, string> = { android: 'Android', ios: 'iOS' }

export interface ScreenshotArtifact {
  id: number
  runId: number
  commit: string
}

// The newest unexpired artifact of that name from a run on main. A run's
// conclusion is not consulted: one platform's job failing, or one demo timing
// out, does not make the other images wrong, and each page carries its own
// status.
export function selectScreenshotArtifact(
  value: unknown,
  name: string,
): ScreenshotArtifact | undefined {
  const artifacts = (value as { artifacts?: unknown })?.artifacts
  if (!Array.isArray(artifacts)) return undefined
  const candidates = artifacts.filter(
    (item) =>
      item &&
      item.name === name &&
      item.expired === false &&
      Number.isInteger(item.id) &&
      typeof item.created_at === 'string' &&
      item.workflow_run?.head_branch === 'main' &&
      Number.isInteger(item.workflow_run?.id) &&
      typeof item.workflow_run?.head_sha === 'string',
  )
  candidates.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  const newest = candidates[0]
  return newest
    ? { id: newest.id, runId: newest.workflow_run.id, commit: newest.workflow_run.head_sha }
    : undefined
}

export type ScreenshotStatus = 'ok' | 'failed'

export interface Screenshot {
  status: ScreenshotStatus
  image: string
  width: number
  height: number
}

export interface NativeScreenshots {
  platform: Platform
  commit: string
  takenAt: string
  runUrl: string
  pages: Record<string, Screenshot>
}

/** What the fetch writes: whichever platforms it found. */
export type NativeScreenshotsByPlatform = Partial<Record<Platform, NativeScreenshots>>

// The pixel size from a PNG's header, so the page can reserve the image's
// space before it loads: an emulator and a simulator screen differ.
export function pngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || signature.some((byte, at) => bytes[at] !== byte)) return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  return width > 0 && height > 0 ? { width, height } : undefined
}

// What the docs may show, from the manifest the scenario wrote. `failed` is
// kept: the image then shows the error the demo threw, which is what the
// page should say about it. `unreached` is dropped, because its image is of
// whatever happened to be on screen.
export function screenshotsFromManifest(
  manifest: unknown,
  {
    platform,
    runUrl,
    imageSize,
  }: {
    platform: Platform
    runUrl: string
    imageSize: (name: string) => { width: number; height: number } | undefined
  },
): NativeScreenshots | undefined {
  const value = manifest as Record<string, unknown> | undefined
  if (
    value?.platform !== platform ||
    typeof value.commit !== 'string' ||
    !/^[0-9a-f]{40}$/.test(value.commit) ||
    typeof value.takenAt !== 'string' ||
    !Number.isFinite(Date.parse(value.takenAt)) ||
    !value.pages ||
    typeof value.pages !== 'object'
  )
    return undefined
  const pages: NativeScreenshots['pages'] = {}
  for (const [slug, page] of Object.entries(value.pages as Record<string, unknown>)) {
    const { status, image } = (page ?? {}) as { status?: unknown; image?: unknown }
    if (
      !/^[a-z0-9-]+$/.test(slug) ||
      (status !== 'ok' && status !== 'failed') ||
      image !== `${slug}.png`
    )
      continue
    const size = imageSize(image)
    if (size) pages[slug] = { status, image, ...size }
  }
  return { platform, commit: value.commit, takenAt: value.takenAt, runUrl, pages }
}
