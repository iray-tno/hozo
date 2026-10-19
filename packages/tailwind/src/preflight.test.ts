import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { compile } from 'tailwindcss'

import { preflightCss, resolveThemeCalls } from './preflight.ts'

const require = createRequire(import.meta.url)

// A dashed-ident followed by `(` is a function only Tailwind's compiler
// knows (`--theme()`, `--spacing()`, `--alpha()`). Browsers have none, so
// any of them reaching the page is a declaration that is silently dropped.
const sourceOnlyFunction = /--[a-z][\w-]*\(/i

test('the base layer has no Tailwind-only functions left in it', () => {
  const css = preflightCss()
  assert.doesNotMatch(css, sourceOnlyFunction)
})

test('the font declarations are the ones Tailwind writes for a project with no theme', async () => {
  const file = require.resolve('tailwindcss/preflight.css')
  const compiled = await compile('@import "tailwindcss/preflight.css";', {
    base: process.cwd(),
    loadStylesheet: async () => ({
      path: file,
      base: process.cwd(),
      content: readFileSync(file, 'utf8'),
    }),
  })
  const fonts = (css: string) =>
    [...css.matchAll(/(font-(?:family|feature-settings|variation-settings)):\s*([^;]+);/g)].map(
      ([, property, value]) => `${property}: ${value.replace(/\s+/g, ' ').trim()}`,
    )
  const ours = fonts(preflightCss())
  assert.ok(
    ours.some((line) => line.startsWith('font-family: -apple-system')),
    'html has a sans stack',
  )
  assert.deepEqual(ours, fonts(compiled.build([])))
})

test('a fallback with parentheses and commas is kept whole', () => {
  assert.equal(
    resolveThemeCalls('a { font-family: --theme(--x, var(--y, a), "b, c"); }'),
    'a { font-family: var(--y, a), "b, c"; }',
  )
})

test('a call with no fallback is refused rather than shipped', () => {
  assert.throws(() => resolveThemeCalls('a { color: --theme(--x); }'), /no fallback/)
})
