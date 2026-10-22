// Fetches the newest Android screenshots of the /docs demos from main for
// the Pages build (#1160): the images into `public/native-screenshots/android/`
// and what the pages may show into `src/data/native-screenshots.json`. Both
// are ignored by git.
//
// Only the deploy runs this, with a token that can read Actions artifacts.
// Anything going wrong leaves the docs without screenshots rather than
// failing the deploy: the previews and their React Native line stand on
// their own.

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
  artifactName,
  screenshotsFromManifest,
  selectScreenshotArtifact,
} from '../src/lib/native-screenshots.ts'

const landing = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const images = path.join(landing, 'public', 'native-screenshots', 'android')
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

try {
  // Downloading an artifact needs a token even for a public repository.
  if (!token) throw new Error('GITHUB_TOKEN is not set')
  const list = await github(
    `https://api.github.com/repos/${repository}/actions/artifacts?name=${artifactName}&per_page=50`,
  )
  const artifact = selectScreenshotArtifact(await list.json())
  if (!artifact) throw new Error(`no unexpired ${artifactName} artifact from main`)

  const work = mkdtempSync(path.join(tmpdir(), 'hozo-native-screenshots-'))
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
      runUrl: `https://github.com/${repository}/actions/runs/${artifact.runId}`,
      hasImage: (name) => existsSync(path.join(unpacked, name)),
    },
  )
  if (!screenshots) throw new Error('the artifact manifest is not one this build understands')

  mkdirSync(images, { recursive: true })
  mkdirSync(path.dirname(data), { recursive: true })
  for (const { image } of Object.values(screenshots.pages))
    copyFileSync(path.join(unpacked, image), path.join(images, image))
  writeFileSync(data, `${JSON.stringify(screenshots, null, 2)}\n`)
  rmSync(work, { recursive: true, force: true })
  console.log(
    `Native screenshots: ${Object.keys(screenshots.pages).length} pages from ${screenshots.runUrl}`,
  )
} catch (error) {
  console.warn(`Native screenshots unavailable; the docs deploy without them. ${error.message}`)
}
