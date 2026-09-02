import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

import { serverComponentNeedingScript } from '../loader.js'

/** A path as a bundler hands it over, in this platform's spelling. */
const at = (...parts: string[]) => path.join(process.cwd(), ...parts)

const NEEDS = { needsClientBoundary: true }
const STATIC = { needsClientBoundary: false }

test('an app entry with no directive is told what it cannot run', () => {
  const warning = serverComponentNeedingScript(
    at('src', 'app', 'page.tsx'),
    'export const x = 1',
    NEEDS,
  )
  assert.equal(warning?.code, 'SERVER_COMPONENT_NEEDS_CLIENT')
  assert.match(warning.message, /use client/)
})

test('the same entry says nothing once the directive is there', () => {
  // The whole point of keeping the convention in this package: the two
  // positions where "server component" is decidable from the path are
  // Next's, and the directive is the author saying otherwise.
  for (const source of ["'use client'\nexport const x = 1", '"use client"\nexport const x = 1']) {
    assert.equal(
      serverComponentNeedingScript(at('src', 'app', 'page.tsx'), source, NEEDS),
      undefined,
    )
  }
})

test('a nested route and a layout are entries too, an ordinary module is not', () => {
  const entries = [
    ['src', 'app', 'notes', 'page.mdx'],
    ['src', 'app', 'notes', 'deep', 'page.tsx'],
    ['src', 'app', 'layout.tsx'],
  ]
  for (const parts of entries) {
    assert.ok(serverComponentNeedingScript(at(...parts), '', NEEDS), parts.join('/'))
  }
  // A component under `app/` is not an entry: nothing says whether it is
  // reached from a server component or a client one, which is exactly the
  // question this refuses to guess at.
  const notEntries = [
    ['src', 'app', 'components', 'Card.tsx'],
    ['src', 'components', 'Card.tsx'],
    ['src', 'app', 'page.ts'],
  ]
  for (const parts of notEntries) {
    assert.equal(serverComponentNeedingScript(at(...parts), '', NEEDS), undefined, parts.join('/'))
  }
})

test('a static entry is left alone', () => {
  assert.equal(serverComponentNeedingScript(at('src', 'app', 'page.tsx'), '', STATIC), undefined)
})
