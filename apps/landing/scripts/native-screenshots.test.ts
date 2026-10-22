import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  artifactNames,
  pngSize,
  screenshotsFromManifest,
  selectScreenshotArtifact,
} from '../src/lib/native-screenshots.ts'

const sha = 'f754670f4e3bb1fa6815a5146c477cc23d8df167'
function artifact(
  id: number,
  created: string,
  { branch = 'main', expired = false, name = artifactNames.android } = {},
) {
  return {
    id,
    name,
    expired,
    created_at: created,
    workflow_run: { id: id * 10, head_branch: branch, head_sha: sha },
  }
}

test('the newest unexpired artifact of that name from main is chosen, whatever the order', () => {
  const list = {
    artifacts: [
      artifact(1, '2026-10-14T00:00:00Z'),
      artifact(2, '2026-10-21T00:00:00Z'),
      artifact(3, '2026-10-22T00:00:00Z', { branch: 'feat/native-ui-screenshots' }),
      artifact(4, '2026-10-23T00:00:00Z', { expired: true }),
      artifact(5, '2026-10-24T00:00:00Z', { name: artifactNames.ios }),
    ],
  }
  assert.deepEqual(selectScreenshotArtifact(list, artifactNames.android), {
    id: 2,
    runId: 20,
    commit: sha,
  })
  assert.deepEqual(selectScreenshotArtifact(list, artifactNames.ios), {
    id: 5,
    runId: 50,
    commit: sha,
  })
})

test('no artifact from main means no screenshots', () => {
  assert.equal(
    selectScreenshotArtifact(
      { artifacts: [artifact(3, '2026-10-22', { branch: 'pr' })] },
      artifactNames.android,
    ),
    undefined,
  )
  assert.equal(
    selectScreenshotArtifact({ message: 'Bad credentials' }, artifactNames.android),
    undefined,
  )
})

test('a PNG header gives the size; anything else gives none', () => {
  const header = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 4,
    0x38, 0, 0, 9, 0x60,
  ])
  assert.deepEqual(pngSize(header), { width: 1080, height: 2400 })
  assert.equal(pngSize(Uint8Array.from([1, 2, 3])), undefined)
})

const manifest = {
  platform: 'android',
  commit: sha,
  takenAt: '2026-10-21T16:47:19.618Z',
  pages: {
    button: { status: 'ok', image: 'button.png' },
    calendar: { status: 'failed', image: 'calendar.png' },
    dialog: { status: 'unreached', reason: 'Timed out', image: 'dialog.png' },
    menu: { status: 'ok', image: 'menu.png' },
    '../escape': { status: 'ok', image: '../escape.png' },
    tabs: { status: 'ok', image: '../tabs.png' },
  },
}
const runUrl = 'https://github.com/iray-tno/hozo/actions/runs/1'
const size = { width: 1080, height: 2400 }

test('ok and failed pages are shown; unreached, missing or misnamed images are not', () => {
  const shots = screenshotsFromManifest(manifest, {
    platform: 'android',
    runUrl,
    imageSize: (name) => (name === 'menu.png' ? undefined : size),
  })
  assert.deepEqual(shots, {
    platform: 'android',
    commit: sha,
    takenAt: manifest.takenAt,
    runUrl,
    pages: {
      button: { status: 'ok', image: 'button.png', ...size },
      calendar: { status: 'failed', image: 'calendar.png', ...size },
    },
  })
})

test('a manifest of another platform or shape is refused whole', () => {
  const options = { runUrl, imageSize: () => size }
  assert.equal(screenshotsFromManifest(manifest, { ...options, platform: 'ios' }), undefined)
  assert.ok(
    screenshotsFromManifest({ ...manifest, platform: 'ios' }, { ...options, platform: 'ios' }),
  )
  assert.equal(
    screenshotsFromManifest({ ...manifest, commit: 'main' }, { ...options, platform: 'android' }),
    undefined,
  )
  assert.equal(screenshotsFromManifest(undefined, { ...options, platform: 'android' }), undefined)
})

test('the deploy fetches the screenshots before building, with a token that can read artifacts', () => {
  const workflow = readFileSync(
    new URL('../../../.github/workflows/deploy-pages.yml', import.meta.url),
    'utf8',
  )
  assert.match(workflow, /^\s+actions: read$/m)
  const fetchAt = workflow.indexOf('node apps/landing/scripts/fetch-native-screenshots.mjs')
  assert.ok(fetchAt > 0, 'the deploy does not fetch the screenshots')
  assert.ok(fetchAt < workflow.indexOf('pnpm --filter @hozo/landing build'))
})

test('the artifact names are the ones native-showcase uploads', () => {
  const workflow = readFileSync(
    new URL('../../../.github/workflows/native-showcase.yml', import.meta.url),
    'utf8',
  )
  for (const name of Object.values(artifactNames))
    assert.ok(workflow.includes(`name: ${name}`), `native-showcase does not upload ${name}`)
})

test('each screenshot names its component and platform in its alt text', () => {
  const template = readFileSync(
    new URL('../src/components/docs/UiExample.astro', import.meta.url),
    'utf8',
  )
  assert.match(template, /`The \$\{component\} demo on \$\{platformNames\[platform\]\}`/)
  assert.match(
    template,
    /`The error the \$\{component\} demo threw on \$\{platformNames\[platform\]\}`/,
  )
})
