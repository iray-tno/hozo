// The one table, in two languages.
//
// A relative text size has to be resolved somewhere, and React Native
// offers nowhere: its `fontSize` is a number of points, there is no `em`,
// a nested `Text` inherits visually but cannot read what it inherited, and
// the only ancestor context the platform exposes is a boolean saying
// whether there is a `Text` above at all.
//
// So Hozo resolves it twice. The compiler does it at build time in
// `crates/hozo_native/src/render.rs`, against a font size it can see on
// the element, on an ancestor, or handed down the tree. The components in
// `index.native.tsx` do it at render time, against a size `Text`
// publishes. Both are needed -- the second is what an uncompiled project
// gets -- and they have to agree, because the same source going through
// the two must not come out at two sizes.
//
// They did not agree. `Sub` and `Sup` were 11 and `Small` was 12, which is
// the compiler's 0.75 and 0.85 applied to React Native's default of 14 and
// then frozen, so any other base drifted. Ruby had no ratio at all on
// either side.
//
// This reads the Rust and checks the numbers, rather than restating them.

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { TEXT_SIZE_RATIOS } from './text-size.ts'

function workspaceRoot() {
  let at = path.dirname(fileURLToPath(import.meta.url))
  while (!existsSync(path.join(at, 'pnpm-workspace.yaml'))) {
    const up = path.dirname(at)
    if (up === at) throw new Error('no workspace root above this test')
    at = up
  }
  return at
}

const rust = readFileSync(
  path.join(workspaceRoot(), 'crates', 'hozo_native', 'src', 'render.rs'),
  'utf8',
)

/** The `semantic_defaults` arm for a primitive, up to the next one. */
function arm(primitive: string) {
  const start = rust.indexOf(`Primitive::${primitive}`)
  assert.notEqual(start, -1, `no semantic default for Primitive::${primitive}`)
  const end = rust.indexOf('\n        Primitive::', start + 1)
  return rust.slice(start, end === -1 ? rust.indexOf('\n        _ => Vec::new()', start) : end)
}

/** The multiplier in `(base * N)`, which is how every one of them is written. */
function ratioIn(primitive: string) {
  const match = /base \* ([0-9.]+)/.exec(arm(primitive))
  assert.ok(match, `no \`base * N\` in the ${primitive} arm`)
  return Number(match[1])
}

test('sub, sup and small scale by what the compiler scales them by', () => {
  assert.equal(TEXT_SIZE_RATIOS.sub, ratioIn('Sub'))
  assert.equal(TEXT_SIZE_RATIOS.sup, ratioIn('Sup'))
  assert.equal(TEXT_SIZE_RATIOS.small, ratioIn('Small'))
})

test('ruby text is half on both sides', () => {
  assert.equal(TEXT_SIZE_RATIOS.rubyText, ratioIn('RubyText'))
  assert.equal(TEXT_SIZE_RATIOS.rubyText, 0.5)
})

test('the six heading ratios are the same six', () => {
  // Written as a match in the Rust and an array here, so this reads the
  // arms rather than a `base * N`.
  const heading = arm('Heading')
  const found = [...heading.matchAll(/^\s+(?:[1-6]|_) => ([0-9.]+),$/gm)].map((m) => Number(m[1]))
  assert.deepEqual(found, [...TEXT_SIZE_RATIOS.heading])
})

test('the ratios are the ones a browser applies', () => {
  // The denominator for all of this is the UA stylesheet, because it is
  // what the Web half of `index.native.tsx`'s own package renders. Stated
  // once here so a change to either side has to argue with it.
  assert.deepEqual(TEXT_SIZE_RATIOS.heading, [2, 1.5, 1.17, 1, 0.83, 0.67])
  assert.equal(TEXT_SIZE_RATIOS.rubyText, 0.5)
})

test('React Native’s own default is the base the components fall back to', () => {
  // 14, from `RCTFont.mm`. Worth pinning because the constants this
  // replaced -- 11, 11, 12 -- are exactly these ratios applied to it, so
  // an uncompiled render of a label that names no size looks the same as
  // it did before.
  assert.equal(Math.round(14 * TEXT_SIZE_RATIOS.sub), 11)
  assert.equal(Math.round(14 * TEXT_SIZE_RATIOS.sup), 11)
  assert.equal(Math.round(14 * TEXT_SIZE_RATIOS.small), 12)
})
