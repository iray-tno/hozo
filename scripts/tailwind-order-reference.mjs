// Regenerate only after reviewing a deliberate corpus/reference change.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import {
  formatOrderReference,
  orderSnapshotFile,
  prepareOrderReference,
} from '../packages/tailwind-conformance/src/tailwind-order-reference.ts'

assert.ok(
  process.argv.slice(2).every((arg) => arg === '--check'),
  'only --check is supported',
)
const { snapshot } = await prepareOrderReference()
const source = formatOrderReference(snapshot)
if (process.argv.includes('--check')) assert.equal(readFileSync(orderSnapshotFile, 'utf8'), source)
else writeFileSync(orderSnapshotFile, source)
