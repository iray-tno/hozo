const repository = 'https://github.com/iray-tno/hozo'

export interface ShowcaseRelease {
  tag: string
  url: string
  android: string
  ios: string
  instructions: string
}

// Presence is discovery, not another native-verification gate. The release
// workflow owns that gate. Never synthesize /latest/download URLs: 0.x releases
// are prereleases and an older package-only release has no showcase binaries.
export function selectShowcaseRelease(value: unknown): ShowcaseRelease | undefined {
  if (!Array.isArray(value)) return undefined
  const releases = value.filter((item) => item && typeof item === 'object')
  releases.sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))
  for (const release of releases) {
    const tag = release.tag_name
    if (
      release.draft !== false ||
      typeof release.published_at !== 'string' ||
      !Number.isFinite(Date.parse(release.published_at)) ||
      typeof tag !== 'string' ||
      !/^v\d+\.\d+\.\d+(?:-[\da-z.-]+)?$/i.test(tag) ||
      release.html_url !== `${repository}/releases/tag/${tag}` ||
      !Array.isArray(release.assets)
    )
      continue
    const names = [
      `hozo-showcase-${tag}-android.apk`,
      `hozo-showcase-${tag}-ios-simulator.app.zip`,
      'INSTALL.md',
      'SHA256SUMS',
      'showcase-manifest.json',
    ]
    const urls = names.map((name) => {
      const matching = release.assets.filter(
        (asset: Record<string, unknown>) => asset?.name === name,
      )
      const asset = matching[0]
      const url = `${repository}/releases/download/${tag}/${name}`
      return matching.length === 1 &&
        asset.state === 'uploaded' &&
        typeof asset.size === 'number' &&
        Number.isFinite(asset.size) &&
        asset.size > 0 &&
        asset.browser_download_url === url
        ? url
        : undefined
    })
    if (urls.every(Boolean))
      return {
        tag,
        url: release.html_url,
        android: urls[0]!,
        ios: urls[1]!,
        instructions: urls[2]!,
      }
  }
  return undefined
}

export async function loadShowcaseRelease({
  enabled = process.env.HOZO_SHOWCASE_DOWNLOADS === '1',
  fetcher = fetch,
  token = process.env.GITHUB_TOKEN,
}: {
  enabled?: boolean
  fetcher?: typeof fetch
  token?: string
} = {}) {
  // Local/PR builds are offline and deterministic. Only the Pages build opts
  // into discovery; a rate limit/outage leaves working source/release links.
  if (!enabled) return undefined
  try {
    const response = await fetcher(
      'https://api.github.com/repos/iray-tno/hozo/releases?per_page=20',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(5_000),
      },
    )
    if (!response.ok) throw new Error(`GitHub release discovery returned ${response.status}`)
    return selectShowcaseRelease(await response.json())
  } catch {
    console.warn('Showcase downloads unavailable at build time; using release/source links.')
    return undefined
  }
}
