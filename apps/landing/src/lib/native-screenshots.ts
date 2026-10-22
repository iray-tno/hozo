// The Android screenshots of the /docs component demos (#1160).
//
// native-showcase's `ui-docs` scenario captures each demo on an emulator and
// uploads the images with a manifest (#1159). The Pages build fetches the
// newest such artifact from main and shows each page's image under its
// preview. Images are not committed: 39 of them per run would grow the
// repository every week for something a deploy can fetch.

export const artifactName = 'hozo-native-showcase-android-ui-docs'

export interface ScreenshotArtifact {
  id: number
  runId: number
  commit: string
}

// The newest unexpired artifact from a run on main. A run's conclusion is
// not consulted: the iOS job failing, or one demo timing out, does not make
// the other pages' images wrong, and each page carries its own status.
export function selectScreenshotArtifact(value: unknown): ScreenshotArtifact | undefined {
  const artifacts = (value as { artifacts?: unknown })?.artifacts
  if (!Array.isArray(artifacts)) return undefined
  const candidates = artifacts.filter(
    (item) =>
      item &&
      item.name === artifactName &&
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

export interface NativeScreenshots {
  platform: 'android'
  commit: string
  takenAt: string
  runUrl: string
  pages: Record<string, { status: ScreenshotStatus; image: string }>
}

// What the docs may show, from the manifest the scenario wrote. `failed` is
// kept: the image then shows the error the demo threw, which is what the
// page should say about it. `unreached` is dropped, because its image is of
// whatever happened to be on screen.
export function screenshotsFromManifest(
  manifest: unknown,
  { runUrl, hasImage }: { runUrl: string; hasImage: (name: string) => boolean },
): NativeScreenshots | undefined {
  const value = manifest as Record<string, unknown> | undefined
  if (
    value?.platform !== 'android' ||
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
      /^[a-z0-9-]+$/.test(slug) &&
      (status === 'ok' || status === 'failed') &&
      image === `${slug}.png` &&
      hasImage(image)
    )
      pages[slug] = { status, image }
  }
  return { platform: 'android', commit: value.commit, takenAt: value.takenAt, runUrl, pages }
}
