import assert from 'node:assert/strict'
import test from 'node:test'
import { ownerPublications, ownerShadow } from './style-slots/catalog.mjs'
import { packageOwnerChannels } from './style-slots/package-owners.mjs'

// The owner tests use a small export list; the catalog's primitive and text
// host rows name exports it does not have, and have tests of their own.
const channels = (name, names, options = {}) =>
  packageOwnerChannels(name, names, { primitives: {}, hosts: [], ...options })

const exports = [
  'Other',
  'HozoBottomSheet',
  'BottomSheet',
  'Drawer',
  'HozoDrawer',
  'Tabs',
  'HozoTabs',
  'Toolbar',
  'HozoToolbar',
]
const patternsShadow = {
  schema: ownerShadow.schema,
  contracts: ownerShadow.contracts.filter((row) =>
    ownerPublications.some((pub) => pub.owner === row.owner && pub.package === '@hozo/patterns'),
  ),
}

test('catalog publication owns the contract once and attaches only actual package export aliases', () => {
  const result = channels('@hozo/patterns', exports)
  assert.deepEqual(result.owners, patternsShadow)
  assert.notEqual(result.owners, ownerShadow, 'producer output must not mutate the catalog')
  assert.deepEqual(result.exports, [
    { name: 'BottomSheet', owners: ['BottomSheet.handle'] },
    { name: 'Drawer', owners: ['Drawer.panel', 'Drawer.scrim'] },
    { name: 'HozoBottomSheet', owners: ['BottomSheet.handle'] },
    { name: 'HozoDrawer', owners: ['Drawer.panel', 'Drawer.scrim'] },
    { name: 'HozoTabs', owners: ['Tabs.Tab'] },
    { name: 'HozoToolbar', owners: ['Toolbar.root'] },
    { name: 'Other', owners: [] },
    { name: 'Tabs', owners: ['Tabs.Tab'] },
    { name: 'Toolbar', owners: ['Toolbar.root'] },
  ])
  assert.equal(result.owners.contracts.length, 5)
  assert.deepEqual(
    result.owners.contracts.map((row) => [row.owner, row.audit]),
    [
      ['BottomSheet.handle', 'unknown'],
      ['Tabs.Tab', 'audited'],
      ['Toolbar.root', 'unknown'],
      ['Drawer.scrim', 'audited'],
      ['Drawer.panel', 'audited'],
    ],
  )
  const tab = result.owners.contracts.find((row) => row.owner === 'Tabs.Tab')
  assert.equal(tab.abi.nativePreparedProp, 'hozoTabStyle')
  assert.deepEqual(tab.authoredStyles, [{ prop: 'tabStyle', order: 0 }])
  assert.deepEqual(tab.shapes[0].inputs, {
    facts: ['disabled', 'aria-selected', 'aria-disabled'],
    splitText: true,
  })
  for (const name of ['@hozo/ui', '@hozo/core', '@hozo/other']) {
    const facade = channels(name, exports)
    assert.equal(facade.owners, null)
    assert.ok(facade.exports.every((row) => row.owners.length === 0))
  }
  const formResult = channels('@hozo/form', [
    'Form',
    'HozoForm',
    'SubmitButton',
    'HozoSubmitButton',
    'FileDropzone',
    'HozoFileDropzone',
    'Field',
    'HozoField',
    'TextArea',
    'HozoTextArea',
    'NativeSelect',
    'HozoNativeSelect',
    'Calendar',
    'HozoCalendar',
    'DatePicker',
    'HozoDatePicker',
    'DateRangePicker',
    'HozoDateRangePicker',
    'DateTimePicker',
    'HozoDateTimePicker',
    'TimePicker',
    'HozoTimePicker',
  ])
  assert.deepEqual(
    formResult.owners.contracts.map((row) => [row.owner, row.audit]),
    [
      ['Form.root', 'audited'],
      ['SubmitButton.root', 'audited'],
      ['FileDropzone.root', 'audited'],
      ['FileDropzone.active', 'audited'],
      ['Field.root', 'audited'],
      ['Field.label', 'audited'],
      ['Field.required', 'audited'],
      ['Field.description', 'audited'],
      ['Field.error', 'audited'],
      ['TextArea.root', 'audited'],
      ['TextArea.field', 'audited'],
      ['TextArea.count', 'audited'],
      ['NativeSelect.root', 'audited'],
      ['NativeSelect.indicator', 'audited'],
      ['NativeSelect.sheet', 'audited'],
      ['NativeSelect.scrim', 'audited'],
      ['NativeSelect.option', 'audited'],
      ['Calendar.root', 'audited'],
      ['Calendar.header', 'audited'],
      ['Calendar.grid', 'audited'],
      ['Calendar.monthButton', 'audited'],
      ['Calendar.day', 'audited'],
      ...[
        'DatePicker.root',
        'DatePicker.trigger',
        'DatePicker.dialog',
        'DatePicker.calendar',
        'DatePicker.header',
        'DatePicker.grid',
        'DatePicker.monthButton',
        'DatePicker.day',
        'DateRangePicker.root',
        'DateRangePicker.trigger',
        'DateRangePicker.dialog',
        'DateRangePicker.calendar',
        'DateRangePicker.header',
        'DateRangePicker.grid',
        'DateRangePicker.monthButton',
        'DateRangePicker.day',
        'DateTimePicker.root',
        'DateTimePicker.trigger',
        'DateTimePicker.dialog',
        'DateTimePicker.calendar',
        'DateTimePicker.header',
        'DateTimePicker.grid',
        'DateTimePicker.monthButton',
        'DateTimePicker.day',
        'DateTimePicker.done',
        'TimePicker.root',
        'TimePicker.field',
        'TimePicker.value',
        'TimePicker.period',
        'TimePicker.step',
      ].map((owner) => [owner, 'audited']),
    ],
  )
  assert.deepEqual(channels('@hozo/patterns', [...exports].reverse()), result)
})

test('fixtures explicitly select one catalog owner without alias or first-contract inference', async () => {
  const { ownerFixtureShadow } = await import('./style-slots/owner-fixture.mjs')
  for (const owner of ['Tabs.Tab', 'BottomSheet.handle', 'Toolbar.root']) {
    const selected = JSON.parse(ownerFixtureShadow(owner))
    assert.deepEqual(selected, {
      schema: ownerShadow.schema,
      contracts: ownerShadow.contracts.filter((row) => row.owner === owner),
    })
    assert.equal(selected.contracts.length, 1)
  }
  assert.throws(() => ownerFixtureShadow('Tabs'), /Expected one/)
})

test('missing aliases, duplicate publishers, invented owners and missing publication are explicit failures', () => {
  for (const missing of ['Tabs', 'HozoTabs'])
    assert.throws(
      () =>
        channels(
          '@hozo/patterns',
          exports.filter((name) => name !== missing),
        ),
      /no public value export/,
    )
  assert.throws(() => channels('@hozo/patterns', ['BottomSheet']), /no public value export/)
  assert.throws(() => channels('@hozo/patterns', [...exports, exports[0]]), /Duplicate public/)
  for (const publications of [
    [],
    [...ownerPublications, { ...ownerPublications[0], package: '@hozo/ui' }],
    [{ ...ownerPublications[0], owner: 'Missing.handle' }],
    [{ ...ownerPublications[0], exports: ['BottomSheet', 'BottomSheet'] }],
    [{ ...ownerPublications[0], exports: [] }],
  ])
    assert.throws(() => channels('@hozo/patterns', exports, { publications }), /publication/)
  const shadow = structuredClone(ownerShadow)
  shadow.contracts[0].classProp = 'inventedClassName'
  assert.throws(() => channels('@hozo/patterns', exports, { shadow }), /inventoried catalog slot/)
  const audited = structuredClone(ownerShadow)
  audited.contracts[0].audit = 'certified'
  assert.throws(() => channels('@hozo/patterns', exports, { shadow: audited }), /audit/)
})

test('publication preserves recognized audit declarations without publishing a proof channel', () => {
  const shadow = structuredClone(ownerShadow)
  shadow.contracts[0].audit = 'audited'
  const result = channels('@hozo/patterns', exports, { shadow })
  assert.equal(result.owners.contracts[0].audit, 'audited')
  assert.equal(Object.hasOwn(result, 'auditEvidence'), false)
  assert.deepEqual(result.exports, channels('@hozo/patterns', exports).exports)
})

test('the catalog publishes primitive exports and text hosts only on their own package', () => {
  const names = [...exports, 'Chip', 'Checkbox']
  const options = {
    primitives: { '@hozo/patterns': ['Chip'] },
    hosts: [{ package: '@hozo/patterns', export: 'Checkbox', sharesState: true }],
  }
  const patterns = packageOwnerChannels('@hozo/patterns', names, options)
  assert.deepEqual(
    patterns.exports.filter((row) => row.primitive),
    [{ name: 'Chip', owners: [], primitive: 'Chip' }],
  )
  assert.deepEqual(patterns.textPublish, [{ name: 'Checkbox', sharesState: true }])
  const ui = packageOwnerChannels('@hozo/ui', names, options)
  assert.ok(ui.exports.every((row) => !Object.hasOwn(row, 'primitive')))
  assert.deepEqual(ui.textPublish, [])
  assert.throws(
    () => packageOwnerChannels('@hozo/patterns', exports, options),
    /Primitive export is not a public value export: Chip/,
  )
  assert.throws(
    () => packageOwnerChannels('@hozo/patterns', [...exports, 'Chip'], options),
    /Text host is not a public value export: Checkbox/,
  )
})
