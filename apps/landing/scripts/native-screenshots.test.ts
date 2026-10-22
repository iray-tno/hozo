import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  artifactName,
  screenshotsFromManifest,
  selectScreenshotArtifact,
} from '../src/lib/native-screenshots.ts'

const sha = 'f754670f4e3bb1fa6815a5146c477cc23d8df167'
function artifact(id: number, created: string, branch = 'main', expired = false) {
  return {
    id,
    name: artifactName,
    expired,
    created_at: created,
    workflow_run: { id: id * 10, head_branch: branch, head_sha: sha },
  }
}

test('the newest unexpired artifact from main is chosen, whatever the order', () => {
  const chosen = selectScreenshotArtifact({
    artifacts: [
      artifact(1, '2026-10-14T00:00:00Z'),
      artifact(2, '2026-10-21T00:00:00Z'),
      artifact(3, '2026-10-22T00:00:00Z', 'feat/native-ui-screenshots'),
      artifact(4, '2026-10-23T00:00:00Z', 'main', true),
    ],
  })
  assert.deepEqual(chosen, { id: 2, runId: 20, commit: sha })
})

test('no artifact from main means no screenshots', () => {
  assert.equal(
    selectScreenshotArtifact({ artifacts: [artifact(3, '2026-10-22', 'pr')] }),
    undefined,
  )
  assert.equal(selectScreenshotArtifact({ message: 'Bad credentials' }), undefined)
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

test('ok and failed pages are shown; unreached, missing or misnamed images are not', () => {
  const shots = screenshotsFromManifest(manifest, {
    runUrl,
    hasImage: (name) => name !== 'menu.png',
  })
  assert.deepEqual(shots, {
    platform: 'android',
    commit: sha,
    takenAt: manifest.takenAt,
    runUrl,
    pages: {
      button: { status: 'ok', image: 'button.png' },
      calendar: { status: 'failed', image: 'calendar.png' },
    },
  })
})

test('a manifest of another shape is refused whole', () => {
  const hasImage = () => true
  assert.equal(
    screenshotsFromManifest({ ...manifest, platform: 'ios' }, { runUrl, hasImage }),
    undefined,
  )
  assert.equal(
    screenshotsFromManifest({ ...manifest, commit: 'main' }, { runUrl, hasImage }),
    undefined,
  )
  assert.equal(screenshotsFromManifest(undefined, { runUrl, hasImage }), undefined)
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

test('the artifact name is the one native-showcase uploads', () => {
  const workflow = readFileSync(
    new URL('../../../.github/workflows/native-showcase.yml', import.meta.url),
    'utf8',
  )
  assert.ok(workflow.includes(`name: ${artifactName}`))
})
