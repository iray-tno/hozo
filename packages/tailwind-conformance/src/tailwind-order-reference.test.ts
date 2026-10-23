import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { orderCandidates, orderCases } from './tailwind-order-corpus.ts'
import {
  formatOrderReference,
  orderSnapshotFile,
  prepareOrderReference,
} from './tailwind-order-reference.ts'

test('pinned Tailwind rule signatures match the reviewed corpus without losing a class', async () => {
  const { snapshot, css } = await prepareOrderReference()
  assert.equal(readFileSync(orderSnapshotFile, 'utf8'), formatOrderReference(snapshot))
  assert.equal(snapshot.descriptors.length, orderCandidates.length)
  assert.equal(new Set(snapshot.firstRuleClassOrder).size, orderCandidates.length)
  assert.equal(new Set(orderCases.map((entry) => entry.id)).size, orderCases.length)
  assert.ok(css.length > 0)
})

test('the corpus distinguishes original rule signatures from flattened property counts', async () => {
  const { snapshot } = await prepareOrderReference()
  const descriptor = (candidate: string) =>
    snapshot.descriptors.find((entry) => entry.candidate === candidate)!.rules
  assert.deepEqual(descriptor('p-2')[0].properties, ['padding'])
  assert.deepEqual(descriptor('px-2')[0].properties, ['padding-inline'])
  assert.ok(
    descriptor('text-lg')[0].count > 1,
    'font size cannot be modeled as a one-declaration root',
  )
  assert.ok(descriptor('text-lg')[0].properties.includes('line-height'))
  assert.ok(descriptor('leading-6')[0].properties.includes('--tw-leading'))
  assert.ok(descriptor('hover:focus:p-4')[0].conditions.some((entry) => entry.includes(':focus')))
  assert.ok(descriptor('sm:p-4')[0].conditions.some((entry) => entry.includes('@media')))
  const multi = descriptor('order-multi-rule')
  assert.equal(multi.length, 2, 'first-rule class rank must not replace the full descriptor')
  assert.notDeepEqual(multi[0].order, multi[1].order)
})
