import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { components, profiles } from './style-slots/catalog.mjs'
import { checkGenerated, outputs, validateCatalog } from './style-slots/generate.mjs'
import { checkPublicProps } from './style-slots/public-props.mjs'

test('the one catalog generates current IR mappings, Native callback contracts and type-only facts', () => {
  assert.deepEqual(checkGenerated(), [])
  const rendered = outputs()
  const facts = rendered['packages/patterns/src/slot-facts.native.ts']
  assert.ok(
    !/^import |^export (const|function|class) /m.test(facts),
    'no runtime registry or evaluator',
  )
  assert.ok(facts.includes('readOnly: true'), 'constant truth is distinct from an unavailable fact')
  assert.ok(
    facts.includes("'aria-checked': false"),
    'Native announcements do not invent Web attributes',
  )
  const secondary = Object.values(components)
    .flat()
    .filter((slot) => slot.lowering === 'secondary')
  assert.equal(
    (rendered['crates/hozo_ir/src/class_slots.rs'].match(/ClassSlot \{/g) ?? []).length,
    secondary.length,
  )
  const callbacks = Object.values(components)
    .flat()
    .filter((slot) => slot.callback)
  assert.equal(
    (rendered['crates/hozo_native/src/pattern_contracts.rs'].match(/Some\(InteractionSlot/g) ?? [])
      .length,
    callbacks.length,
  )
})

test('real Web and Native exported props include every catalog slot, style prop and declared callback ABI', () => {
  assert.equal(checkPublicProps(), '')
})

test('removing a public slot or whole component from the catalog fails independent type discovery', () => {
  const missing = structuredClone(components)
  missing.Chip = missing.Chip.filter((slot) => slot.classProp !== 'className')
  delete missing.OtpInput
  const output = checkPublicProps(missing)
  assert.match(output, /Chip\.className/)
  assert.match(output, /OtpInput\.\*/)
})

test('spurious slots and missing private callback declarations are not silently accepted', () => {
  const spurious = structuredClone(components)
  spurious.Chip.push({ ...spurious.Chip[0], classProp: 'inventedClassName', callback: undefined })
  spurious.Chip[0].callback = 'hozoMissingStyle'
  const output = checkPublicProps(spurious)
  assert.match(output, /Chip\.inventedClassName/)
  assert.match(output, /Chip\.hozoMissingStyle/)
})

test('catalog validation refuses duplicate, unknown and ambiguous owner declarations', () => {
  const duplicate = structuredClone(components)
  duplicate.Chip.push(duplicate.Chip[0])
  assert.throws(() => validateCatalog(duplicate), /Duplicate Chip.className/)
  const missing = structuredClone(components)
  missing.Chip[0].profile = 'Unknown'
  assert.throws(() => validateCatalog(missing), /Unknown profile/)
  missing.Chip[0].profile = 'Chip'
  delete missing.Chip[0].focus
  assert.throws(() => validateCatalog(missing), /Incomplete owner/)
  const unknown = structuredClone(profiles)
  unknown.Chip.facts.checked = false
  assert.throws(() => validateCatalog(components, unknown), /Unknown fact/)
})

test('the contract checks run outside Turbo cached tests and keep pending owners explicit', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.ok(pkg.scripts['test:publishing'].includes('scripts/style-slots.test.mjs'))
  const pending = Object.values(components)
    .flat()
    .filter((slot) => slot.owner === 'pending-audit')
  assert.ok(pending.length > 0, 'inventory is not a blanket parity certification')
  assert.ok(pending.every((slot) => !slot.callback && !slot.profile))
  const unused = components.ColorPicker.find((slot) => slot.classProp === 'eyeDropperClassName')
  assert.equal(unused.lowering, 'web-only')
  assert.ok(unused.reason)
})
