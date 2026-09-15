// The versions the snapshot was measured against, checked on every PR.
//
// `run.ts --check` already fails when a recorded version moves, but it takes
// minutes and runs only on the Pages deploy -- after merge. Bumping React
// Native to 0.87.1 (#441) regenerated the StyleX manifest, which records the
// same version and is checked here, but not `snapshot.json`, and main's
// deploy went red three merges in a row before anyone looked. Reading three
// installed `package.json` files costs nothing, so the version half of that
// check runs where a dependency bump is reviewed.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { reactNativeVersion } from './native-surface.ts'
import { stylexVersion } from './stylex-surface.ts'
import { tailwindVersion } from './theme.ts'

test('the snapshot names the versions this checkout has installed', () => {
  const snapshot = JSON.parse(readFileSync(new URL('../snapshot.json', import.meta.url), 'utf8'))
  assert.deepEqual(
    snapshot.versions,
    {
      tailwind: tailwindVersion(),
      reactNative: reactNativeVersion(),
      stylex: stylexVersion(),
    },
    'a dependency moved without the conformance snapshot: run `pnpm --filter @hozo/tailwind-conformance run report` and commit snapshot.json',
  )
})
