// The candidate stylesheet's order, against the order Tailwind writes.
//
// Every utility in that stylesheet is a single class, so they all carry
// the same specificity and the order they appear in *is* the cascade.
// Hozo used to emit them alphabetically, which is what a sorted candidate
// set gives: `2xl:` first, `sm:` after `md:`. So
// `className="hidden sm:block md:hidden"` -- show from `sm`, hide again
// from `md`, the most ordinary responsive idiom there is -- stayed visible
// past `md`.
//
// Found in a browser, in a Storybook story built to show which breakpoint
// range is live: at 1600px three of six mutually exclusive chips were
// showing at once.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { compile } from 'tailwindcss'

import { loadClassOrder, tailwindPackageDir } from './theme.ts'

const CSS = '@import "tailwindcss";'

/**
 * The order Tailwind itself writes these candidates in.
 *
 * Read out of its compiled stylesheet rather than asserted from a list
 * kept here. A list would be a second opinion about the thing under test,
 * and the whole point of asking Tailwind is that its answer is the one
 * that matters.
 */
async function tailwindOrder(candidates: string[]): Promise<string[]> {
  const dir = tailwindPackageDir()
  const compiler = await compile(CSS, {
    base: dir,
    loadStylesheet: async (id: string) => {
      const file = id === 'tailwindcss' ? path.join(dir, 'index.css') : id
      return { path: file, base: path.dirname(file), content: readFileSync(file, 'utf8') }
    },
  })
  const css = compiler.build(candidates)
  // By where each candidate's selector first appears, rather than by
  // parsing selectors out of the stylesheet. Parsing them is what a first
  // attempt did, and it read `.hover\:bg-red-500:hover` as a candidate
  // called `hover:bg-red-500:hover` and stopped `.\32 xl\:block` at the
  // space inside its escape -- so two of nine went missing and the
  // expectation quietly became a shorter list.
  const at = new Map<string, number>()
  for (const candidate of candidates) {
    const index = css.indexOf(`.${escapeForCss(candidate)}`)
    assert.notEqual(index, -1, `Tailwind wrote no rule for ${candidate}`)
    at.set(candidate, index)
  }
  return [...candidates].sort((a, b) => at.get(a)! - at.get(b)!)
}

/** How Tailwind spells a candidate in a selector. */
function escapeForCss(candidate: string): string {
  const escaped = candidate.replace(/[^\w-]/g, (ch) => `\\${ch}`)
  // A leading digit cannot be carried by a backslash: CSS wants the code
  // point in hex with a space to end it.
  return /^\d/.test(escaped)
    ? `\\${escaped.charCodeAt(0).toString(16)} ${escaped.slice(1)}`
    : escaped
}

test('candidates come out in the order Tailwind writes them', async () => {
  // Deliberately handed in alphabetical order, which is what the cache
  // holds and what used to reach the stylesheet unchanged.
  const candidates = [
    '2xl:block',
    'flex',
    'hidden',
    'hover:bg-red-500',
    'lg:block',
    'md:hidden',
    'p-4',
    'sm:block',
    'xl:hidden',
  ]
  const ours = await loadClassOrder(CSS, tailwindPackageDir(), candidates)
  assert.deepEqual(ours, await tailwindOrder(candidates))
})

test('the breakpoints end up ascending, which is the case that broke', async () => {
  const ours = await loadClassOrder(CSS, tailwindPackageDir(), [
    '2xl:block',
    'lg:block',
    'md:hidden',
    'sm:block',
    'xl:hidden',
  ])
  assert.deepEqual(ours, ['sm:block', 'md:hidden', 'lg:block', 'xl:hidden', '2xl:block'])
})

test('a token that only looked like a class keeps its place and goes last', async () => {
  // The candidate set comes from a byte scan, so it is expected to hold
  // things Tailwind has never heard of. Dropping them here would drop them
  // from the stylesheet; Tailwind gives them no position, so they go where
  // an unpositioned rule does least harm.
  const ours = await loadClassOrder(CSS, tailwindPackageDir(), [
    'notautility',
    'md:hidden',
    'alsonotone',
    'sm:block',
  ])
  assert.deepEqual(ours.slice(0, 2), ['sm:block', 'md:hidden'])
  assert.deepEqual(ours.slice(2), ['notautility', 'alsonotone'])
})
