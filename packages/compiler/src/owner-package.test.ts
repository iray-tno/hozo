import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { textForwardingModule } from './manifest.ts'
import { OWNER_PACKAGE_SCHEMA, parseOwnerPackageShadow } from './owner-package.ts'

const owners = JSON.parse(
  readFileSync(new URL('../../../scripts/style-slots/owner-shadow.json', import.meta.url), 'utf8'),
)
function example() {
  return {
    schema: OWNER_PACKAGE_SCHEMA,
    owners,
    exports: [
      { name: 'Sheet', owners: ['BottomSheet.handle'] },
      { name: 'cn', owners: [] },
    ],
    candidates: ['p-4', 'hover:bg-red-500'],
    helpers: ['cn'],
    compiledByConsumer: true,
    textForwarding: {
      version: 1,
      textForwarding: {
        Sheet: {
          props: [{ name: 'size', values: ['sm'], default: 'sm' }],
          variants: [{ when: ['sm'], classes: 'text-sm' }],
        },
      },
    },
  }
}
test('package channels keep aliases, finite candidates, helper exports and readable v1 text facts as data', () => {
  const value = parseOwnerPackageShadow(JSON.stringify(example()))
  assert.equal(value.owners!.contracts[0]!.audit, 'unknown')
  assert.equal(value.exports[0]!.name, 'Sheet')
  assert.deepEqual(value.helpers, ['cn'])
  assert.equal(textForwardingModule('kit', value.textForwarding).components[0]!.name, 'Sheet')
  const empty = {
    ...example(),
    owners: null,
    exports: [],
    helpers: [],
    candidates: [],
    textForwarding: { version: 1, textForwarding: {} },
  }
  assert.deepEqual(parseOwnerPackageShadow(JSON.stringify(empty)).candidates, [])
})
test('absent channels, invented primitive mappings, bad references and claimed audits are not empty contracts', () => {
  const invalid = []
  for (const key of Object.keys(example())) {
    const value = example()
    delete value[key]
    invalid.push(value)
  }
  invalid.push({ ...example(), primitive: 'View' }, { ...example(), compiledByConsumer: 'true' })
  const badRef = example()
  badRef.exports[0].owners = ['Other.handle']
  invalid.push(badRef)
  const badHelper = example()
  badHelper.helpers = ['missing']
  invalid.push(badHelper)
  const audited = structuredClone(example())
  audited.owners.contracts[0].audit = 'audited'
  invalid.push(audited)
  for (const input of invalid)
    assert.throws(() => parseOwnerPackageShadow(JSON.stringify(input)), /Invalid owner/)
})
test('budgets, duplicate tokens and malformed legacy forwarding fail explicitly', () => {
  for (const candidates of [
    ['p-4', 'p-4'],
    ['p-4 p-2'],
    [''],
    ['x'.repeat(513)],
    Array.from({ length: 513 }, (_, i) => `c${i}`),
  ])
    assert.throws(
      () => parseOwnerPackageShadow(JSON.stringify({ ...example(), candidates })),
      /Invalid owner package/,
    )
  for (const mutate of [
    (value) => {
      value.textForwarding.version = 2
    },
    (value) => {
      value.textForwarding.textForwarding.Sheet.props[0].default = 'lg'
    },
    (value) => {
      value.textForwarding.textForwarding.Sheet.variants[0].when = ['lg']
    },
    (value) => {
      value.exports[0].name = '__proto__'
    },
  ]) {
    const value = example()
    mutate(value)
    assert.throws(() => parseOwnerPackageShadow(JSON.stringify(value)), /Invalid owner package/)
  }
  assert.throws(() => parseOwnerPackageShadow(' '.repeat(65_537)), /size/)
  assert.throws(() => parseOwnerPackageShadow(`\ufeff${JSON.stringify(example())}`), /JSON/)
})
