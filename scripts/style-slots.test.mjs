import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { nonControlSlotFacts } from '../packages/patterns/src/non-control-facts.native.ts'
import { components, profiles } from './style-slots/catalog.mjs'
import { checkGenerated, outputs, validateCatalog } from './style-slots/generate.mjs'
import { checkPublicProps } from './style-slots/public-props.mjs'

test('ColorPicker thumb focus belongs to each slider, separate from swatch pointer and input facts', () => {
  const thumb = components.ColorPicker.find((slot) => slot.classProp === 'thumbClassName')
  assert.equal(thumb.callback, 'hozoThumbStyle')
  assert.equal(thumb.focus, true)
  assert.equal(thumb.pointer, false)
  assert.equal(thumb.profile, 'SliderThumb')
  assert.equal(profiles.SliderThumb.facts.disabled, false)
  assert.equal(profiles.SliderThumb.facts.enabled, false)
  assert.deepEqual(profiles.SliderThumb.facts['aria-disabled'], { alias: '__hozoSlotAriaDisabled' })
})

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
  spurious.Combobox.find((slot) => slot.classProp === 'inputClassName').placeholderColorProp =
    'hozoMissingPlaceholderTextColor'
  const output = checkPublicProps(spurious)
  assert.match(output, /Chip\.inventedClassName/)
  assert.match(output, /Chip\.hozoMissingStyle/)
  assert.match(output, /Combobox\.hozoMissingPlaceholderTextColor/)
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
  const noConsumer = structuredClone(components)
  noConsumer.Pagination.find((slot) => slot.classProp === 'ellipsisClassName').profile =
    'Pagination'
  assert.throws(() => validateCatalog(noConsumer), /Facts need a consuming callback/)
  const conflicting = structuredClone(components)
  conflicting.Chip[0].events = 'unavailable'
  assert.throws(() => validateCatalog(conflicting), /Conflicting event owner/)
  const noPlaceholderOwner = structuredClone(components)
  const input = noPlaceholderOwner.Combobox.find((slot) => slot.classProp === 'inputClassName')
  delete input.callback
  input.profile = 'NonControl'
  assert.throws(() => validateCatalog(noPlaceholderOwner), /Invalid placeholder prop owner/)
})

test('semantic callback parameters belong to each slot, not the union of its widget siblings', () => {
  const future = structuredClone(components)
  Object.assign(
    future.ColorPicker.find((slot) => slot.classProp === 'inputClassName'),
    {
      owner: 'real-input',
      profile: 'TextInput',
      callback: 'hozoInputStyle',
      focus: true,
      pointer: false,
    },
  )
  const native = outputs(future)['crates/hozo_native/src/pattern_contracts.rs']
  const parameters = native.slice(
    native.indexOf('fn semantic_parameters'),
    native.indexOf('fn interaction_slot'),
  )
  const swatches = parameters
    .split('\n')
    .find((line) => line.includes('Primitive::ColorPicker') && line.includes('swatchClassName'))
  const input = parameters
    .split('\n')
    .find((line) => line.includes('Primitive::ColorPicker') && line.includes('inputClassName'))
  assert.match(input, /readOnly: __hozoSlotReadOnly/)
  assert.doesNotMatch(input, /__hozoSlotAriaChecked/)
  assert.match(swatches, /__hozoSlotAriaChecked/)
  assert.doesNotMatch(swatches, /readOnly/)
})

test('Listbox and Combobox share option facts, not focus ownership or selection meaning', () => {
  const listbox = components.Listbox.find((slot) => slot.classProp === 'optionClassName')
  const combobox = components.Combobox.find((slot) => slot.classProp === 'optionClassName')
  assert.equal(listbox.profile, 'ListOption')
  assert.equal(listbox.profile, combobox.profile)
  assert.equal(listbox.focus, true)
  assert.equal(combobox.focus, false)
  assert.equal(listbox.gate, 'each-option')
  assert.equal(combobox.gate, 'each-filtered-option')
})

test('Menu separates a real enabled button from non-form action divs', () => {
  const trigger = components.Menu.find((slot) => slot.classProp === 'triggerClassName')
  const item = components.Menu.find((slot) => slot.classProp === 'itemClassName')
  assert.equal(trigger.profile, 'MenuTrigger')
  assert.equal(item.profile, 'MenuItem')
  assert.equal(profiles.MenuTrigger.facts.enabled, true)
  assert.equal(profiles.MenuItem.facts.enabled, false)
  assert.equal(profiles.MenuItem.facts['aria-selected'], false)
  assert.deepEqual(
    Object.keys(profiles.MenuTrigger.facts).filter(
      (key) => typeof profiles.MenuTrigger.facts[key] === 'object',
    ),
    ['aria-expanded'],
  )
  assert.deepEqual(
    Object.keys(profiles.MenuItem.facts).filter(
      (key) => typeof profiles.MenuItem.facts[key] === 'object',
    ),
    ['aria-disabled'],
  )
})

test('audited decorative slots supply the same constant facts without inventing an interaction ABI', () => {
  assert.deepEqual(nonControlSlotFacts, profiles.NonControl.facts)
  const decorative = Object.values(components)
    .flat()
    .filter((slot) => slot.profile === 'NonControl')
  assert.equal(decorative.length, 17)
  assert.deepEqual(
    components.Avatar.filter((slot) => slot.profile === 'NonControl').map((slot) => slot.classProp),
    ['imageClassName', 'fallbackClassName', 'statusClassName'],
  )
  assert.deepEqual(
    components.CommandPalette.filter((slot) => slot.profile === 'NonControl').map(
      (slot) => slot.classProp,
    ),
    ['groupHeadingClassName', 'shortcutClassName', 'emptyClassName'],
  )
  assert.ok(
    decorative.every(
      (slot) =>
        ['root', 'secondary'].includes(slot.lowering) &&
        !slot.callback &&
        slot.events === 'unavailable',
    ),
  )
  assert.ok(
    decorative.every(
      (slot) => ![slot.owner, slot.gate, slot.composition].includes('pending-audit'),
    ),
  )
  for (const key of ['hovered', 'pressed', 'focused', 'focusVisible'])
    assert.equal(Object.hasOwn(nonControlSlotFacts, key), false, `${key} is unavailable, not false`)
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
