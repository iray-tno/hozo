// Reproduction/check entry point; the extractor is shared with project contexts.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { generatePortableOrder } from '../packages/tailwind/src/portable-order.ts'

assert.ok(
  process.argv.slice(2).every((arg) => arg === '--check'),
  'only --check is supported',
)
const file = new URL('../crates/hozo_ir/src/tailwind_portable.rs', import.meta.url)
const { source, snapshot } = await generatePortableOrder()
if (process.argv.includes('--check')) assert.equal(readFileSync(file, 'utf8'), source)
else writeFileSync(file, source)
console.log(
  `portable descriptors: ${snapshot.candidates.length} exact candidates, ${snapshot.candidates.flatMap((entry) => entry.rules).length} rules, ${Buffer.byteLength(source)} source bytes, fingerprint ${snapshot.fingerprint}`,
)
