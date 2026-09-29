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
 * It was wrong in `accordion.tsx` first, and shipped: `-rotate-45` was called
 * "down" in a comment while drawing a chevron pointing *right*, which opened to
 * the *left*. Nothing caught it, because no check in this repository looks at a
 * shape — axe reads the accessibility tree and the utterance goldens read text,
 * and a pseudo-element is deliberately in neither.
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
  for (const name of ['accordion.tsx', 'tree.tsx']) {
    const source = code(name)
    assert.match(source, /border-b-2/, `${name} draws no border-bottom`)
    assert.match(source, /border-r-2/, `${name} draws no border-right`)
    assert.doesNotMatch(source, /[▾▸▴◂►▼]/, `${name} writes a glyph a reader would announce`)
  }
})

test('the accordion points down when closed and up when open', () => {
  const trigger = /const trigger =\s*\n?\s*"([^"]*)"/.exec(code('accordion.tsx'))?.[1] ?? ''
  assert.ok(trigger.length > 0, 'the trigger class list was not found')
  assert.match(trigger, /(^|\s)after:rotate-45(\s|$)/, 'closed is south')
  assert.match(trigger, /data-\[hozo-state=open\]:after:-rotate-135/, 'open is north')
})

test('the tree points along the text when closed and down when open', () => {
  // The other idiom, and the reason the table is worth writing down: the same
  // two angles mean different things in the two controls, so "the chevron
  // rotation" is not one decision made once.
  const source = code('tree.tsx')
  const closed = /const CLOSED =\s*\n?\s*"([^"]*)"/.exec(source)?.[1] ?? ''
  const open = /const OPEN =\s*\n?\s*"([^"]*)"/.exec(source)?.[1] ?? ''
  assert.match(closed, /(^|\s)before:-rotate-45(\s|$)/, 'closed is east')
  assert.match(open, /(^|\s)before:rotate-45(\s|$)/, 'open is south')
})

test('a leaf reserves the marker’s width and draws nothing in it', () => {
  // Without it the labels at one depth do not line up with each other, which
  // is the one thing indentation is for.
  const leaf = /const LEAF = '([^']*)'/.exec(code('tree.tsx'))?.[1] ?? ''
  assert.match(leaf, /\bps-4\b/)
  assert.doesNotMatch(leaf, /rotate/)
  assert.doesNotMatch(leaf, /border-/)
})

test('every rotation in the package is one the table names', () => {
  for (const name of ['accordion.tsx', 'tree.tsx']) {
    for (const angle of rotations(name)) {
      assert.ok(
        ['rotate-45', '-rotate-45', '-rotate-135'].includes(angle),
        `${name} rotates by ${angle}, which the table does not name`,
      )
    }
  }
})
