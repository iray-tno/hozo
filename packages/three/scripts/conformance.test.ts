import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'

import * as THREE from 'three'

import {
  summarizeThreeConformance,
  THREE_CONFORMANCE_CASES,
  type ThreeUpstreamSurface,
} from './conformance.ts'

const require = createRequire(import.meta.url)
const threeRoot = path.dirname(path.dirname(require.resolve('three')))

function upstreamNames(surface: ThreeUpstreamSurface): string[] {
  const directory = path.join(threeRoot, 'src', `${surface}s`)
  return readdirSync(directory)
    .filter((file) => file.endsWith('.js'))
    .map((file) => path.basename(file, '.js'))
    .filter((name) => name in THREE)
    .sort()
}

test('every upstream object, camera, and material class is classified exactly once', () => {
  for (const surface of ['object', 'camera', 'material'] as const) {
    const classified = THREE_CONFORMANCE_CASES.filter(
      (entry) => entry.upstream?.surface === surface,
    )
      .map((entry) => entry.upstream?.name)
      .sort()
    assert.deepEqual(classified, upstreamNames(surface))
  }
})

test('usable conformance claims point to tests that exist', () => {
  const sources = new Map<string, string>()
  for (const entry of THREE_CONFORMANCE_CASES) {
    if (entry.status === 'full' || entry.status === 'partial') {
      assert.ok(entry.tests?.length, `${entry.category}/${entry.feature} has no test reference`)
    }
    for (const reference of entry.tests ?? []) {
      const source =
        sources.get(reference.file) ??
        readFileSync(path.resolve(path.dirname(import.meta.filename), '..', reference.file), 'utf8')
      sources.set(reference.file, source)
      assert.ok(
        source.includes(`test('${reference.title}'`),
        `${entry.category}/${entry.feature} points to missing test: ${reference.title}`,
      )
    }
  }
})

test('conformance rows and summary are internally consistent', () => {
  const identities = THREE_CONFORMANCE_CASES.map((entry) => `${entry.category}/${entry.feature}`)
  assert.equal(new Set(identities).size, identities.length)

  const summary = summarizeThreeConformance()
  assert.equal(summary.inScope + summary.outOfScope, THREE_CONFORMANCE_CASES.length)
  assert.equal(summary.usable, summary.exact + summary.partial)
  assert.equal(summary.safe + summary.silent, summary.inScope)
})
