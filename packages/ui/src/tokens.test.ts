/**
 * The two rules this package rests on, checked against its own source.
 *
 * Not a rendering test. What can go wrong here is not that a component emits
 * the wrong markup -- it emits no markup, it hands class names to something
 * that was verified elsewhere -- but that somebody writes `bg-slate-100`
 * because it was quicker, or adds a control and forgets the focus ring. Both
 * are invisible in a DOM snapshot and plain in the source, so the source is
 * what is read.
 *
 * Comments are stripped and only string literals are read. The first version
 * of this test failed on `button.tsx` for the phrase
 * "`focus-visible:outline-indigo-600` in four places" -- a doc comment
 * explaining the very gap this package closes. Reading only quoted runs was
 * not enough on its own, because a markdown code span in a doc comment is
 * quoted too, in backticks, and a template literal is written the same way.
 * A test that cannot be written about in a comment makes the comments worse.
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const src = path.join(import.meta.dirname, '..', 'src')

/**
 * Every quoted run in a file, with the comments taken out first.
 *
 * The line-comment strip would damage a string containing `//` -- a URL --
 * and there is none here. If one arrives, the cost is this test missing a
 * class name on that line rather than reporting one that is not there.
 */
function literals(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, '$1')
  return [...code.matchAll(/'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? '')
}

/**
 * Every file that can hold a class list: the components, and the modules that
 * hold lists for them.
 *
 * `.tsx` alone was the filter until `calendar-look.ts` arrived -- four grids
 * wear the same lists, so they live in a `.ts` module, and a rule that read
 * only components would have stopped covering them the moment they were shared.
 * A shared class list is still a class list.
 */
function sourceFile(name: string): boolean {
  if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) return false
  if (name === 'index.ts') return false
  return name.endsWith('.ts') || name.endsWith('.tsx')
}

const components = readdirSync(src)
  .filter(sourceFile)
  .map((name) => {
    const source = readFileSync(path.join(src, name), 'utf8')
    return { name, strings: literals(source) }
  })

/**
 * Tailwind's palette families, which a component may not name.
 *
 * Matched with the shade attached -- `slate-100`, not `slate` -- so a word
 * that happens to be a colour is not a failure.
 */
const PALETTE =
  /\b(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)\b/

/** Colours with no shade, and arbitrary values: `bg-white`, `text-[#fff]`. */
const LITERAL = /\b(bg|text|border|outline|ring|fill|stroke|from|via|to)-(white|black|\[#)/

test('no component names a palette colour', () => {
  // One `bg-slate-100` in one component is a theme that is 95% swappable,
  // which is the same as not swappable.
  for (const { name, strings } of components) {
    for (const value of strings) {
      const found = PALETTE.exec(value)
      assert.equal(found, null, `${name} names ${found?.[0]} -- use a token from theme.css`)
    }
  }
})

test('no component writes a literal colour', () => {
  for (const { name, strings } of components) {
    for (const value of strings) {
      const found = LITERAL.exec(value)
      assert.equal(found, null, `${name} writes ${found?.[0]} -- use a token from theme.css`)
    }
  }
})

test('every class list that styles hover also carries the focus ring', () => {
  // The gap this package was built to close: the Storybook demo it took its
  // look from had a focus ring on four controls and nothing on the rest. A
  // ring that is part of every class list a control can have is a ring nobody
  // can forget.
  //
  // Per class list rather than per file, because a component with four tones
  // has four of them and three-quarters coverage is the bug. `hover:` is the
  // marker for "this list styles an interactive element", which is not a law
  // of nature but is true of everything here and fails loudly if it stops
  // being.
  for (const { name, strings } of components) {
    for (const value of strings) {
      if (!value.includes('hover:')) continue
      assert.match(
        value,
        /focus-visible:outline-hozo-focus/,
        `a class list in ${name} styles hover and not focus`,
      )
    }
  }
})

test('the token file defines every token the components ask for', () => {
  // The other direction, and the one that fails silently: a component
  // reaching for `bg-hozo-warning` that nothing defines renders with no
  // background at all, because Tailwind emits nothing for a utility it cannot
  // resolve.
  const theme = readFileSync(path.join(src, 'theme.css'), 'utf8')
  const defined = new Set(
    [...theme.matchAll(/--(?:color|radius|shadow)-(hozo-[a-z-]+):/g)].map((m) => m[1]),
  )
  assert.ok(defined.size > 0, 'theme.css defined nothing, so this test would pass vacuously')

  for (const { name, strings } of components) {
    for (const value of strings) {
      for (const [, token] of value.matchAll(/\b[a-z-]+-(hozo-[a-z-]+)\b/g)) {
        if (token === undefined) continue
        assert.ok(defined.has(token), `${name} uses ${token}, which theme.css does not define`)
      }
    }
  }
})
