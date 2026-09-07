// The whole distance the reset decision has to travel, on Metro.
//
// It starts as an option in `metro.config.js` and ends as a number in a
// compiled `StyleSheet` -- `hr` is 1px under Tailwind's Preflight and 2px
// without it (#315). In between it crosses `withHozo`, `metro.json`, a
// `jest-worker` subprocess and the addon boundary, and a flag dropped at
// any of those hops compiles output that looks entirely reasonable: a
// separator with a height, just the wrong one.
//
// So this test runs the transformer the way Metro does, through
// `withHozo`, rather than handing `transformHozoSource` a compiler built
// in the test. The compiler it uses is the one the wiring produced.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { transform, withHozo } from './index.ts'

const RULE = `import { Separator } from '@hozo/core'
export function Rule() {
  return <Separator />
}
`

/**
 * A project with one Tailwind class in it, so `preflight: 'auto'` has
 * something to infer from, and an upstream transformer that hands the
 * rewritten source straight back.
 */
function project() {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-metro-preflight-'))
  mkdirSync(path.join(root, 'src'))
  writeFileSync(
    path.join(root, 'src', 'App.tsx'),
    `import { View } from '@hozo/core'\nexport const App = () => <View className="p-4" />\n`,
  )
  const upstream = path.join(root, 'upstream.cjs')
  writeFileSync(upstream, 'module.exports = { transform: (params) => params.src }\n')
  return { root, upstream }
}

async function compiledRule(options: { preflight?: boolean | 'auto' } = {}) {
  const { root, upstream } = project()
  try {
    await withHozo(
      { projectRoot: root, transformer: { babelTransformerPath: upstream } },
      { root, ...options },
    )
    return (await transform({
      src: RULE,
      filename: path.join(root, 'src', 'Rule.tsx'),
      options: { projectRoot: root, platform: 'android' },
    })) as string
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('a Tailwind project gets the separator its own browser would draw', async () => {
  // `p-4` in the project means Preflight is emitted on the Web half, and
  // Preflight makes an `hr` 1px. Nothing in this source says so; the
  // decision arrives from the config layer.
  assert.match(await compiledRule(), /height: 1,/)
})

test('and turning the reset off moves the compiler back to the bare browser', async () => {
  const output = await compiledRule({ preflight: false })
  assert.match(output, /height: 2,/)
  assert.doesNotMatch(output, /height: 1,/)
})
