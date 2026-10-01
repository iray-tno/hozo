import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const cli = path.join(path.dirname(require.resolve('expo/package.json')), 'bin/cli')

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
    'Three/Kumimono',
    'Add one',
    'Save profile',
    '組み立て',
  ]) {
    assert.ok(bundle.includes(label), `${platform}: missing story content ${label}`)
  }
  assert.ok(bundle.includes('getStorybookUI'), `${platform}: missing on-device Storybook UI`)
  console.log(`[native-showcase] ${platform}: Storybook and all demo content bundled`)
}
