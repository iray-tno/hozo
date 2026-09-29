/**
 * Every length in this package is a multiple of 4px.
 *
 * Tailwind's spacing unit is `0.25rem`, so `p-2` is 8px and `gap-3` is 12px
 * and every *integer* step is already on a grid of 4. What breaks it is the
 * half step: `py-1.5` is 6px, `gap-0.5` is 2px, `py-2.5` is 10px. There were
 * eight of them in here, and they were not decisions -- they were what "a
 * little tighter" compiles to when nobody is counting.
 *
 * So the rule is the simple one, and it is checkable: **no class in this
 * package contains a half step.** Two exemptions, both real:
 *
 * - `top-1/2`, `translate-x-1/2` and friends are *percentages*, not lengths.
 *   Half of something is not off-grid; 6px is.
 * - `border-2`, `outline-2` and `outline-offset-2` are ink, not layout. A
 *   hairline is 1px whatever the grid says, and a focus ring that had to be
 *   4px would be a different ring.
 *
 * ## What it costs, which is the reason to write it down
 *
 * Snapping is not free, and two places show why. A row's control could not
 * both sit on the grid and align to the first line of a `text-sm` label: a
 * 20px line box centres a 16px box at 10px. So those rows carry `leading-6`,
 * which puts the line box on the grid too and the offset at 12px. The line
 * height is part of the same grid as the padding, or the padding cannot stay
 * on it.
 *
 * And the buttons grew. `py-2.5` was 10px, giving a 36px control; `py-3` is
 * 12px and 44px, which is the height Apple's guidance asks for and comfortably
 * past WCAG 2.5.8's 24. The small size is 36. Two sizes, both on the grid,
 * both large enough -- which the previous pair was only by accident.
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const src = path.join(import.meta.dirname, '..', 'src')

/**
 * Every quoted run in every component, comments stripped first.
 *
 * The same reading `tokens.test.ts` does, and for the same reason: this file's
 * own doc comment names `py-1.5` four times to explain the rule, and a check
 * that cannot be written about makes the comments worse.
 */
const components = readdirSync(src)
  // The components *and* the modules holding lists for them: `calendar-look.ts`
  // is four grids' worth of class lists in a `.ts` file, and a rule that read
  // only `.tsx` would have stopped covering them the moment they were shared.
  .filter(
    (name) =>
      (name.endsWith('.ts') || name.endsWith('.tsx')) &&
      !name.endsWith('.test.ts') &&
      !name.endsWith('.test.tsx') &&
      name !== 'index.ts',
  )
  .map((name) => {
    const code = readFileSync(path.join(src, name), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|\s)\/\/[^\n]*/g, '$1')
    return {
      name,
      strings: [...code.matchAll(/'([^'\n]*)'|`([^`]*)`|"([^"\n]*)"/g)].map(
        (found) => found[1] ?? found[2] ?? found[3] ?? '',
      ),
    }
  })

/** A half step in a spacing or sizing utility: `py-1.5`, `-mt-0.5`, `h-2.5`. */
const HALF_STEP = /\b-?[a-z]+(?:-[a-z]+)*-\d+\.5\b/

test('no component writes a half step', () => {
  for (const { name, strings } of components) {
    for (const value of strings) {
      const found = HALF_STEP.exec(value)
      assert.equal(found, null, `${name} writes ${found?.[0]} -- lengths here are multiples of 4px`)
    }
  }
})

test('a row that draws a control against its first line puts the line box on the grid', () => {
  // The cost named in this file's docs, asserted so it cannot be quietly
  // undone: without `leading-6` the offset that centres a 16px box against a
  // `text-sm` line is 10px, and there is no way to write that on a grid of 4.
  // Every list here positions a `::before` at `top-3`, which is 12.
  for (const { name, strings } of components) {
    for (const value of strings) {
      if (!value.includes('before:top-3')) continue
      assert.match(value, /\bleading-6\b/, `a list in ${name} centres on a line box it did not set`)
    }
  }
})

test('every control is at least 24px tall, which is what 2.5.8 asks', () => {
  // Read rather than measured, because nothing here runs a layout engine: a
  // `py-N` plus a line box is a height, and the two smallest lists in the
  // package are the ones to check. `py-1 text-xs` is 4 + 4 + 16 = 24 exactly,
  // which is the badge, and nothing may go below it.
  const LINE = { 'text-xs': 16, 'text-sm': 20, 'leading-6': 24 } as const
  for (const { name, strings } of components) {
    for (const value of strings) {
      const padding = /\bpy-(\d+)\b/.exec(value) ?? /\bp-(\d+)\b/.exec(value)
      if (!padding) continue
      const line = Object.entries(LINE).find(([token]) => value.includes(token))
      if (!line) continue
      // `leading-6` wins over `text-sm` when both are present, which is why
      // the table is ordered and the last match is taken.
      const height = Number(padding[1]) * 4 * 2 + (value.includes('leading-6') ? 24 : line[1])
      assert.ok(height >= 24, `a list in ${name} is ${height}px tall, under 2.5.8's 24`)
    }
  }
})
