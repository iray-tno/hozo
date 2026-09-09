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

import { BARE_TEXT_SIZE_RATIOS, TEXT_SIZE_RATIOS } from './text-size.ts'

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
  // The denominator is what the Web half of this package renders, and
  // that is two browsers rather than one: with the project's CSS reset and
  // without it. Measured in headless Chrome at bases 16, 20 and 32, with
  // and without this repository's own generated preflight.
  //
  // Stated here so a change to either side has to argue with it.
  assert.equal(TEXT_SIZE_RATIOS.small, 0.8) // preflight: `small { font-size: 80% }`
  assert.equal(TEXT_SIZE_RATIOS.sub, 0.75) // preflight: `sub, sup { font-size: 75% }`
  assert.equal(TEXT_SIZE_RATIOS.sup, 0.75)
  // Preflight touches neither of these, so one number answers both ways.
  assert.equal(TEXT_SIZE_RATIOS.rubyText, 0.5)
  assert.deepEqual(TEXT_SIZE_RATIOS.heading, [2, 1.5, 1.17, 1, 0.83, 0.67])
})

test('the bare table follows the compiler into an unreset project', () => {
  const smaller = /const SMALLER_RATIO: f64 = ([0-9.]+) \/ ([0-9.]+);/.exec(rust)
  assert.ok(smaller, 'no SMALLER_RATIO in the compiler')
  const ratio = Number(smaller[1]) / Number(smaller[2])
  assert.equal(ratio, 1 / 1.2)
  assert.equal(BARE_TEXT_SIZE_RATIOS.small, ratio)
  assert.equal(BARE_TEXT_SIZE_RATIOS.sub, ratio)
  assert.equal(BARE_TEXT_SIZE_RATIOS.sup, ratio)
})

test('React Native’s own default is the base the components fall back to', () => {
  // 14, from `RCTFont.mm`. Worth pinning because it is the base an
  // uncompiled label that names no size is drawn at, so these are the
  // sizes that actually reach the screen.
  //
  // `small` moved from 12 to 11 here, because 0.85 was neither browser's
  // number -- it was the one this table had before anybody measured.
  assert.equal(Math.round(14 * TEXT_SIZE_RATIOS.sub), 11)
  assert.equal(Math.round(14 * TEXT_SIZE_RATIOS.sup), 11)
  assert.equal(Math.round(14 * TEXT_SIZE_RATIOS.small), 11)
})
