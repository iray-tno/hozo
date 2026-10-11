import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const cli = path.join(path.dirname(require.resolve('expo/package.json')), 'bin/cli')
const videoFixture = readFileSync(path.join(root, '../showcase/assets/hozo-video.mp4'))

// Real production Metro exports run in main's integration report, not every
// PR. Separate output directories do not race the user's interactive bundle.
for (const platform of ['android', 'ios']) {
  const output = path.join(root, 'dist', `check-${platform}`)
  const result = spawnSync(
    process.execPath,
    [
      cli,
      'export',
      '--platform',
      platform,
      '--no-bytecode',
      '--max-workers',
      '2',
      '--output-dir',
      output,
    ],
    {
      cwd: root,
      stdio: 'inherit',
      timeout: 180_000,
      env: { ...process.env, CI: '1', STORYBOOK_DISABLE_TELEMETRY: '1' },
    },
  )
  assert.equal(
    result.status,
    0,
    `${platform} export failed: ${result.error ?? result.signal ?? result.status}`,
  )
  const metadata = JSON.parse(readFileSync(path.join(output, 'metadata.json'), 'utf8'))
  const bundle = readFileSync(
    path.join(output, metadata.fileMetadata[platform].bundle),
    'utf8',
  ).replace(/\\u([\da-f]{4})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
  for (const label of [
    'Primitives/Shared showcase',
    'Media/Video',
    'Moving square, silent video',
    'Native video playback',
    'Local video pixel probe',
    'Three/Kumimono',
    'Patterns/Shared showcase',
    'Email notifications',
    'Workspace sections',
    'Confirm save',
    'Add one',
    'Save profile',
    'SVG/Shared filters',
    'SVG/Filter pixels',
    'SVG pixel scene',
    'Turn filter on',
    'SVG filters',
    'Composed shadow',
    'Turn filters off',
    '組み立て',
  ]) {
    assert.ok(bundle.includes(label), `${platform}: missing story content ${label}`)
  }
  assert.ok(bundle.includes('getStorybookUI'), `${platform}: missing on-device Storybook UI`)
  assert.ok(bundle.includes('ExpoVideo'), `${platform}: media must resolve to the Native engine`)
  const videos = metadata.fileMetadata[platform].assets.filter((asset) => asset.ext === 'mp4')
  assert.ok(
    videos.some((asset) => readFileSync(path.join(output, asset.path)).equals(videoFixture)),
    `${platform}: the exact local showcase video was not exported`,
  )
  console.log(`[native-showcase] ${platform}: Storybook and all demo content bundled`)
}
