import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { compiledTables, manifestDisagreements } from './manifest-agreement.mjs'

const read = (name) =>
  JSON.parse(readFileSync(new URL(`../packages/${name}/hozo.manifest.json`, import.meta.url)))

test('every shipped manifest agrees with the compiled-in tables', () => {
  for (const [dir, name] of [
    ['patterns', '@hozo/patterns'],
    ['form', '@hozo/form'],
    ['ui', '@hozo/ui'],
  ])
    assert.deepEqual(manifestDisagreements(name, read(dir)), [], name)
})

test('the tables are read from the compiler, not from the catalog', () => {
  const tables = compiledTables('@hozo/patterns', ['Chip', 'Checkbox', 'Alert', 'Toolbar'])
  assert.deepEqual([...tables.primitives], ['Chip'])
  assert.deepEqual(
    [...tables.hosts],
    [
      ['Checkbox', true],
      ['Alert', false],
    ],
  )
  // Not a trusted primitive source, and no text hosts of its own.
  const ui = compiledTables('@hozo/ui', ['Chip', 'Checkbox'])
  assert.deepEqual([...ui.primitives], [])
  assert.deepEqual([...ui.hosts], [])
})

test('an altered entry on either side is named by field and entry', () => {
  const manifest = read('patterns')
  const names = manifest.exports.map((row) => row.name)
  const tables = compiledTables('@hozo/patterns', names)

  const flipped = new Map(tables.hosts).set('Switch', false)
  assert.deepEqual(
    manifestDisagreements('@hozo/patterns', manifest, { ...tables, hosts: flipped }),
    ['@hozo/patterns: textPublish Switch: the manifest says true, the compiler false'],
  )
  const lost = new Set(tables.primitives)
  lost.delete('Stepper')
  assert.deepEqual(
    manifestDisagreements('@hozo/patterns', manifest, { ...tables, primitives: lost }),
    [
      '@hozo/patterns: exports[].primitive Stepper: the manifest says "Stepper", the compiler nothing',
    ],
  )

  const edited = structuredClone(manifest)
  edited.textPublish = edited.textPublish.filter((row) => row.name !== 'Alert')
  delete edited.exports.find((row) => row.name === 'Chip').primitive
  assert.deepEqual(manifestDisagreements('@hozo/patterns', edited, tables), [
    '@hozo/patterns: exports[].primitive Chip: the manifest says nothing, the compiler "Chip"',
    '@hozo/patterns: textPublish Alert: the manifest says nothing, the compiler false',
  ])
  assert.deepEqual(manifestDisagreements('@hozo/patterns', { ...manifest, version: 1 }, tables), [
    '@hozo/patterns: version is 1, not 2',
  ])
})
