/**
 * Which way every chevron in this package points, in one place.
 *
 * All of them are the same trick: a box with only a bottom and a right border,
 * rotated. That shape is an angle whose apex points **south-east**, and CSS
 * rotates clockwise, which gives exactly one mapping:
 *
 * | rotation | apex |
 * |---|---|
 * | `-rotate-45` | east — along the text, a closed branch |
 * | `rotate-45` | south — down, a closed accordion row |
 * | `-rotate-135` | north — up, an open accordion row |
 *
 * The tree's right border is the logical end one, so in an RTL locale its box
 * is mirrored and the apex starts **south-west**. There the same two angles
 * swap: `rtl:rotate-45` is west, along RTL text, and `rtl:-rotate-45` south.
 *
 * It was wrong in `accordion.tsx` first, and shipped: `-rotate-45` was called
 * "down" in a comment while drawing a chevron pointing *right*, which opened to
 * the *left*. Nothing caught it, because no check in this repository looks at a
 * shape — axe reads the accessibility tree and the utterance goldens read text,
 * and a hidden marker is deliberately in neither.
 *
 * So this is the check: not what the shape looks like, which a test cannot see,
 * but that each file agrees with the table above. A chevron that flips still
 * needs someone to notice it once; it does not get to flip silently twice.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const src = path.join(import.meta.dirname, '..', 'src')
const read = (name: string) => readFileSync(path.join(src, name), 'utf8')

/**
 * A file with its block comments removed.
 *
 * `tree.tsx` quotes the demo's golden -- `treeitem, ▾ crates, expanded` -- to
 * explain why it draws the marker instead of writing it, and the first version
 * of this test failed on that quotation. Reading only the code is the same
 * accommodation `tokens.test.ts` makes, for the same reason: a check that
 * cannot be written about makes the comments worse.
 */
const code = (name: string) => read(name).replace(/\/\*[\s\S]*?\*\//g, ' ')

/** Every rotation in a file's code, in source order. */
const rotations = (name: string): string[] =>
  [...code(name).matchAll(/(-?rotate-\d+)/g)].map((found) => found[1] ?? '')

test('a chevron is always two borders and a size, never a glyph', () => {
  // A `▾` in the text is in the accessible name: the demo's tree announces
  // "treeitem, ▾ crates, expanded" -- the glyph, and then the same fact again.
  for (const name of ['accordion.tsx', 'tree.tsx', 'native-select.tsx']) {
    const source = code(name)
    assert.match(source, /border-b-2/, `${name} draws no border-bottom`)
    assert.match(source, /border-[re]-2/, `${name} draws no border-right`)
    assert.doesNotMatch(source, /[▾▸▴◂►▼]/, `${name} writes a glyph a reader would announce`)
  }
})

test('the accordion points down when closed and up when open', () => {
  // Two lists for the pattern's indicator slot, not `after:` on the trigger,
  // which React Native cannot draw (#1205).
  const source = code('accordion.tsx')
  const closed = /const chevron =\s*\n?\s*'([^']*)'/.exec(source)?.[1] ?? ''
  const open = /const chevronOpen =\s*\n?\s*'([^']*)'/.exec(source)?.[1] ?? ''
  assert.ok(closed.length > 0 && open.length > 0, 'the chevron class lists were not found')
  assert.match(closed, /(^|\s)rotate-45(\s|$)/, 'closed is south')
  assert.match(open, /(^|\s)-rotate-135(\s|$)/, 'open is north')
})

test('the select points down, as a closed accordion row does', () => {
  const chevron = /const chevron =\s*\n?\s*'([^']*)'/.exec(code('native-select.tsx'))?.[1] ?? ''
  assert.match(chevron, /(^|\s)rotate-45(\s|$)/, 'south')
})

test('the tree points along the text when closed and down when open', () => {
  // The other idiom, and the reason the table is worth writing down: the same
  // two angles mean different things in the two controls, so "the chevron
  // rotation" is not one decision made once.
  const source = code('tree.tsx')
  const closed = /const CLOSED = '([^']*)'/.exec(source)?.[1] ?? ''
  const open = /const OPEN = '([^']*)'/.exec(source)?.[1] ?? ''
  assert.match(closed, /(^|\s)-rotate-45(\s|$)/, 'closed is east')
  assert.match(open, /(^|\s)rotate-45(\s|$)/, 'open is south')
  // A logical end border mirrors the box in an RTL locale, which React
  // Native can do to a physical right border on its own; with a physical one
  // the two platforms could draw different boxes from one class list.
  for (const [state, classes] of [
    ['closed', closed],
    ['open', open],
  ] as const) {
    assert.match(classes, /(^|\s)border-e-2(\s|$)/, `${state} has a logical end border`)
    assert.doesNotMatch(classes, /border-r-/, `${state} has a physical right border`)
  }
  // From the mirrored apex, south-west: west along RTL text, and south.
  assert.match(closed, /(^|\s)rtl:rotate-45(\s|$)/, 'closed is west in RTL')
  assert.match(open, /(^|\s)rtl:-rotate-45(\s|$)/, 'open is south in RTL')
})

test('a leaf reserves the marker’s width and draws nothing in it', () => {
  // Without it the labels at one depth do not line up with each other, which
  // is the one thing indentation is for.
  const leaf = /const LEAF = '([^']*)'/.exec(code('tree.tsx'))?.[1] ?? ''
  // The drawn marker's `size-2`, so the labels start where theirs do.
  assert.match(leaf, /\bsize-2\b/)
  assert.doesNotMatch(leaf, /rotate/)
  assert.doesNotMatch(leaf, /border-/)
})

test('every rotation in the package is one the table names', () => {
  for (const name of ['accordion.tsx', 'tree.tsx', 'native-select.tsx']) {
    for (const angle of rotations(name)) {
      assert.ok(
        ['rotate-45', '-rotate-45', '-rotate-135'].includes(angle),
        `${name} rotates by ${angle}, which the table does not name`,
      )
    }
  }
})
