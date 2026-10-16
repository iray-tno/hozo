/**
 * No component here writes an HTML element (#983).
 *
 * Hozo compiles its primitives, not intrinsic tags: a `<div>` reaches React
 * Native unchanged, and React Native has no `div` to render. Nine files did
 * it, unnoticed, because everything that looked at this package looked at it
 * in a browser. Like `tokens.test.ts`, this reads the source, with comments
 * taken out, since a doc comment explaining why a `<div>` is not used is
 * exactly where the word belongs.
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const src = path.join(import.meta.dirname, '..', 'src')

function intrinsicTags(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, '$1')
  return [...code.matchAll(/<([a-z][\w-]*)[\s/>]/g)].map((m) => m[1] ?? '')
}

test('no component writes an HTML element React Native cannot render', () => {
  const files = readdirSync(src).filter(
    (name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'),
  )
  assert.ok(files.length > 30, 'the source directory was not read')
  for (const name of files) {
    const tags = intrinsicTags(readFileSync(path.join(src, name), 'utf8'))
    assert.deepEqual(
      tags,
      [],
      `${name} writes <${tags[0]}> -- use View or Text from @hozo/core, or a package with a Native half`,
    )
  }
})
