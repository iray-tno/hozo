import assert from 'node:assert/strict'
import test from 'node:test'
import { ownerPublications, ownerShadow } from './style-slots/catalog.mjs'
import { packageOwnerChannels } from './style-slots/package-owners.mjs'

const exports = ['Other', 'HozoBottomSheet', 'BottomSheet', 'Tabs', 'HozoTabs']
test('catalog publication owns the contract once and attaches only actual package export aliases', () => {
  const result = packageOwnerChannels('@hozo/patterns', exports)
  assert.deepEqual(result.owners, ownerShadow)
  assert.notEqual(result.owners, ownerShadow, 'producer output must not mutate the catalog')
  assert.deepEqual(result.exports, [
    { name: 'BottomSheet', owners: ['BottomSheet.handle'] },
    { name: 'HozoBottomSheet', owners: ['BottomSheet.handle'] },
    { name: 'HozoTabs', owners: ['Tabs.Tab'] },
    { name: 'Other', owners: [] },
    { name: 'Tabs', owners: ['Tabs.Tab'] },
  ])
  assert.equal(result.owners.contracts.length, 2)
  assert.ok(result.owners.contracts.every((row) => row.audit === 'unknown'))
  const tab = result.owners.contracts.find((row) => row.owner === 'Tabs.Tab')
  assert.equal(tab.abi.nativePreparedProp, 'hozoTabStyle')
  assert.deepEqual(tab.authoredStyles, [{ prop: 'tabStyle', order: 0 }])
  assert.deepEqual(tab.shapes[0].inputs, {
    facts: ['disabled', 'aria-selected', 'aria-disabled'],
    splitText: true,
  })
  for (const name of ['@hozo/ui', '@hozo/core', '@hozo/other']) {
    const facade = packageOwnerChannels(name, exports)
    assert.equal(facade.owners, null)
    assert.ok(facade.exports.every((row) => row.owners.length === 0))
  }
  assert.deepEqual(packageOwnerChannels('@hozo/patterns', [...exports].reverse()), result)
})

test('fixtures explicitly select one catalog owner without alias or first-contract inference', async () => {
  const { ownerFixtureShadow } = await import('./style-slots/owner-fixture.mjs')
  for (const owner of ['Tabs.Tab', 'BottomSheet.handle']) {
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
        packageOwnerChannels(
          '@hozo/patterns',
          exports.filter((name) => name !== missing),
        ),
      /no public value export/,
    )
  assert.throws(
    () => packageOwnerChannels('@hozo/patterns', ['BottomSheet']),
    /no public value export/,
  )
  assert.throws(
    () => packageOwnerChannels('@hozo/patterns', [...exports, exports[0]]),
    /Duplicate public/,
  )
  for (const publications of [
    [],
    [...ownerPublications, { ...ownerPublications[0], package: '@hozo/ui' }],
    [{ ...ownerPublications[0], owner: 'Missing.handle' }],
    [{ ...ownerPublications[0], exports: ['BottomSheet', 'BottomSheet'] }],
    [{ ...ownerPublications[0], exports: [] }],
  ])
    assert.throws(
      () => packageOwnerChannels('@hozo/patterns', exports, { publications }),
      /publication/,
    )
  const shadow = structuredClone(ownerShadow)
  shadow.contracts[0].classProp = 'inventedClassName'
  assert.throws(
    () => packageOwnerChannels('@hozo/patterns', exports, { shadow }),
    /inventoried catalog slot/,
  )
  const audited = structuredClone(ownerShadow)
  audited.contracts[0].audit = 'audited'
  assert.throws(() => packageOwnerChannels('@hozo/patterns', exports, { shadow: audited }), /audit/)
})
