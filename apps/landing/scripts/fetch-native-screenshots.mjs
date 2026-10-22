// Fetches the newest Android and iOS screenshots of the /docs demos from main
// for the Pages build (#1160, #1204): the images into
// `public/native-screenshots/<platform>/` and what the pages may show into
// `src/data/native-screenshots.json`. Both are ignored by git.
//
// Only the deploy runs this, with a token that can read Actions artifacts.
// Anything going wrong leaves the docs without that platform's screenshots
// rather than failing the deploy: the previews and their React Native line
// stand on their own, and one platform's images do not need the other's.

import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  artifactNames,
  platforms,
  pngSize,
  screenshotsFromManifest,
  selectScreenshotArtifact,
} from '../src/lib/native-screenshots.ts'

const landing = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const images = path.join(landing, 'public', 'native-screenshots')
const data = path.join(landing, 'src', 'data', 'native-screenshots.json')
const repository = process.env.GITHUB_REPOSITORY ?? 'iray-tno/hozo'
const token = process.env.GITHUB_TOKEN

rmSync(images, { recursive: true, force: true })
rmSync(data, { force: true })

async function github(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return response
}

async function fetchPlatform(platform) {
  const name = artifactNames[platform]
  const list = await github(
    `https://api.github.com/repos/${repository}/actions/artifacts?name=${name}&per_page=50`,
  )
  const artifact = selectScreenshotArtifact(await list.json(), name)
  if (!artifact) throw new Error(`no unexpired ${name} artifact from main`)

  const work = mkdtempSync(path.join(tmpdir(), `hozo-native-screenshots-${platform}-`))
  try {
    const zip = path.join(work, 'artifact.zip')
    const unpacked = path.join(work, 'unpacked')
    const archive = await github(
      `https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}/zip`,
    )
    writeFileSync(zip, Buffer.from(await archive.arrayBuffer()))
    execFileSync('unzip', ['-q', zip, '-d', unpacked])

    const screenshots = screenshotsFromManifest(
      JSON.parse(readFileSync(path.join(unpacked, 'manifest.json'), 'utf8')),
      {
        platform,
        runUrl: `https://github.com/${repository}/actions/runs/${artifact.runId}`,
        imageSize: (image) => {
          const file = path.join(unpacked, image)
          return existsSync(file) ? pngSize(readFileSync(file)) : undefined
        },
      },
    )
    if (!screenshots) throw new Error('the artifact manifest is not one this build understands')

    const out = path.join(images, platform)
    mkdirSync(out, { recursive: true })
    for (const { image } of Object.values(screenshots.pages))
      copyFileSync(path.join(unpacked, image), path.join(out, image))
    return screenshots
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

const found = {}
for (const platform of platforms) {
  try {
    // Downloading an artifact needs a token even for a public repository.
    if (!token) throw new Error('GITHUB_TOKEN is not set')
    found[platform] = await fetchPlatform(platform)
    console.log(
      `Native screenshots (${platform}): ${Object.keys(found[platform].pages).length} pages from ${found[platform].runUrl}`,
    )
  } catch (error) {
    console.warn(
      `Native screenshots (${platform}) unavailable; the docs deploy without them. ${error.message}`,
    )
  }
}
if (Object.keys(found).length > 0) {
  // `src/data/` holds only generated files, so a fresh checkout has no such
  // directory.
  mkdirSync(path.dirname(data), { recursive: true })
  writeFileSync(data, `${JSON.stringify(found, null, 2)}\n`)
}
