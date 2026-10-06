// Test-only preload: the real Astro route takes the enabled discovery path,
// without publishing or depending on a changing external release catalogue.
// This is never imported by the site or the Pages build.
const tag = 'v0.2.1'
const repository = 'https://github.com/iray-tno/hozo'
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, options) => {
  if (String(input) !== 'https://api.github.com/repos/iray-tno/hozo/releases?per_page=20') {
    return originalFetch(input, options)
  }
  return new Response(
    JSON.stringify([
      {
        tag_name: tag,
        draft: false,
        prerelease: true,
        published_at: '2026-10-06T00:00:00Z',
        html_url: `${repository}/releases/tag/${tag}`,
        assets: [
          `hozo-showcase-${tag}-android.apk`,
          `hozo-showcase-${tag}-ios-simulator.app.zip`,
          'INSTALL.md',
          'SHA256SUMS',
          'showcase-manifest.json',
        ].map((name) => ({
          name,
          state: 'uploaded',
          size: 123,
          browser_download_url: `${repository}/releases/download/${tag}/${name}`,
        })),
      },
    ]),
  )
}
