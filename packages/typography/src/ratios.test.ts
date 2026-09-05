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
  path.join(workspaceRoot(), 'crates', 'hozo_native', 'src', 'text.rs'),
  'utf8',
)

/** One `pub(super) const NAME: f64 = N;` from the compiler's table. */
function constant(name: string) {
  const match = new RegExp(`const ${name}: f64 = ([0-9.]+);`).exec(rust)
  assert.ok(match, `no ${name} in the compiler's ratio table`)
  return Number(match[1])
}

test('sub, sup and small scale by what the compiler scales them by', () => {
  assert.equal(TEXT_SIZE_RATIOS.sub, constant('SUB_RATIO'))
  assert.equal(TEXT_SIZE_RATIOS.sup, constant('SUP_RATIO'))
  assert.equal(TEXT_SIZE_RATIOS.small, constant('SMALL_RATIO'))
})

test('ruby text is half on both sides', () => {
  assert.equal(TEXT_SIZE_RATIOS.rubyText, constant('RUBY_TEXT_RATIO'))
  assert.equal(TEXT_SIZE_RATIOS.rubyText, 0.5)
})

test('the six heading ratios are the same six', () => {
  const match = /const HEADING_RATIOS: \[f64; 6\] = \[([^\]]+)\];/.exec(rust)
  assert.ok(match, 'no HEADING_RATIOS in the compiler')
  const found = (match[1] as string).split(',').map((each) => Number(each.trim()))
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
