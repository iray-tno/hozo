import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { MANIFEST_VERSION } from './manifest.ts'
import {
  OWNER_SHADOW_VERSION,
  parseOwnerContractShadow,
  selectOwnerShape,
} from './owner-contract.ts'

const text = readFileSync(
  new URL('../../../scripts/style-slots/owner-shadow.json', import.meta.url),
  'utf8',
)
const parsed = () => parseOwnerContractShadow(text)
const contract = () => parsed().contracts[0]!
function rejects(change: (value: ReturnType<typeof parsed>) => void, reason: RegExp) {
  const value = parsed()
  change(value)
  assert.throws(() => parseOwnerContractShadow(JSON.stringify(value)), reason)
}

test('shadow data is explicit, bounded and independent of the shipped v1 manifest protocol', () => {
  assert.equal(MANIFEST_VERSION, 1)
  assert.equal(parsed().schema, OWNER_SHADOW_VERSION)
  assert.equal(contract().owner, 'BottomSheet.handle')
  assert.equal(contract().audit, 'unknown')
  assert.deepEqual(contract().authoredStyles, [{ prop: 'handleStyle', order: 0 }])
  assert.throws(() => parseOwnerContractShadow('{'), /JSON/)
  assert.throws(() => parseOwnerContractShadow(' '.repeat(65_537)), /size/)
  assert.throws(() => parseOwnerContractShadow('{"schema":2,"contracts":[]}'), /schema/)
  assert.throws(
    () =>
      parseOwnerContractShadow(
        '{"schema":"rfc010-owner-shadow-0","contracts":[],"execute":"evil()"}',
      ),
    /fields/,
  )
  rejects((value) => {
    value.contracts = []
  }, /contracts/)
  rejects((value) => {
    value.contracts.push(value.contracts[0]!)
  }, /duplicate/)
  rejects((value) => {
    Object.assign(value.contracts[0]!, { audit: 'audited' })
  }, /audit/)
})

test('gates choose each present handle shape; an absent owner does not require resizable', () => {
  const owner = contract()
  for (const resizable of [false, true]) {
    assert.deepEqual(selectOwnerShape(owner, { present: false, resizable }), { status: 'absent' })
    const selected = selectOwnerShape(owner, { present: true, resizable })
    assert.equal(selected.status, 'selected')
    if (selected.status === 'selected')
      assert.equal(selected.shape.id, resizable ? 'resizable' : 'decorative')
  }
  assert.deepEqual(selectOwnerShape(owner, { present: false }), { status: 'absent' })
  assert.deepEqual(selectOwnerShape(owner, {}), {
    status: 'unresolved',
    possible: ['resizable', 'decorative'],
  })
  assert.deepEqual(selectOwnerShape(owner, { present: true }), {
    status: 'unresolved',
    possible: ['resizable', 'decorative'],
  })
  assert.deepEqual(selectOwnerShape(owner, { present: 'true' }), {
    status: 'invalid',
    binding: 'present',
  })
  assert.equal(
    selectOwnerShape(owner, Object.create({ present: true, resizable: true })).status,
    'unresolved',
  )
  let reads = 0
  const accessor = {
    get present() {
      reads++
      return true
    },
    resizable: true,
  }
  assert.deepEqual(selectOwnerShape(owner, accessor), { status: 'invalid', binding: 'present' })
  assert.equal(reads, 0, 'shadow inspection must not capture/evaluate caller accessors')
})

test('overlap and a true shape competing with an unknown one never silently select the first', () => {
  const owner = contract()
  owner.shapes[1]!.when = { eq: ['present', true] }
  assert.deepEqual(selectOwnerShape(owner, { present: true, resizable: true }), {
    status: 'ambiguous',
    matching: ['resizable', 'decorative'],
  })
  assert.deepEqual(selectOwnerShape(owner, { present: true }), {
    status: 'unresolved',
    possible: ['resizable', 'decorative'],
  })
  owner.shapes[0]!.when = { any: [{ eq: ['present', true] }, { eq: ['resizable', true] }] }
  assert.equal(selectOwnerShape(owner, { present: false }).status, 'unresolved')
  assert.equal(selectOwnerShape(owner, { present: false, resizable: true }).status, 'selected')
})

test('symbols are declared booleans, not executable expressions or arbitrary gate operators', () => {
  rejects((value) => {
    value.contracts[0]!.bindings[0] = 'props.present()'
  }, /binding/)
  rejects((value) => {
    value.contracts[0]!.bindings.push('present')
  }, /duplicate/)
  rejects((value) => {
    value.contracts[0]!.shapes[0]!.when = { eq: ['missing', true] }
  }, /binding/)
  rejects((value) => {
    Object.assign(value.contracts[0]!.shapes[0]!, { when: { js: 'present()' } })
  }, /operator/)
  rejects((value) => {
    Object.assign(value.contracts[0]!.shapes[0]!, { when: { eq: ['present', 'true'] } })
  }, /binding/)
  rejects((value) => {
    value.contracts[0]!.shapes[0]!.when = { all: [] }
  }, /operands/)
  rejects((value) => {
    value.contracts[0]!.shapes[0]!.when = { all: [{ eq: ['present', true] }], any: [] }
  }, /fields/)
  rejects((value) => {
    for (let i = 0; i < 10; i++)
      value.contracts[0]!.shapes[0]!.when = { all: [value.contracts[0]!.shapes[0]!.when] }
  }, /budget/)
  rejects((value) => {
    value.contracts[0]!.shapes = Array.from({ length: 16 }, (_, i) => ({
      ...value.contracts[0]!.shapes[0]!,
      id: `s${i}`,
      when: { all: Array.from({ length: 16 }, () => ({ eq: ['present', true] })) },
    }))
  }, /budget/)
})

test('unsupported host/event declarations remain errors rather than invented decoration state', () => {
  rejects((value) => {
    value.contracts[0]!.shapes[1]!.events = ['hovered']
  }, /decoration/)
  rejects((value) => {
    Object.assign(value.contracts[0]!.shapes[0]!, { nativeHost: 'Text' })
  }, /host/)
  rejects((value) => {
    value.contracts[0]!.shapes[0]!.webHost = 'div'
  }, /host/)
  rejects((value) => {
    Object.assign(value.contracts[0]!.shapes[0]!, { events: ['selected'] })
  }, /event/)
  rejects((value) => {
    value.contracts[0]!.shapes[0]!.events = ['pressed', 'pressed']
  }, /duplicate/)
  rejects((value) => {
    value.contracts[0]!.shapes[1]!.id = 'resizable'
  }, /duplicate/)
})

test('prepared carrier and explicit author ordering cannot collide', () => {
  rejects((value) => {
    value.contracts[0]!.authoredStyles[0]!.prop = 'hozoHandleStyle'
  }, /collision/)
  rejects((value) => {
    value.contracts[0]!.authoredStyles[0]!.prop = 'handleClassName'
  }, /collision/)
  rejects((value) => {
    value.contracts[0]!.authoredStyles[0]!.order = -1
  }, /order/)
  rejects((value) => {
    value.contracts[0]!.authoredStyles.push({ prop: 'style', order: 0 })
  }, /duplicate/)
  rejects((value) => {
    value.contracts[0]!.abi.webClassProp = 'className'
  }, /carrier/)
  rejects((value) => {
    value.contracts[0]!.abi.nativePreparedProp = 'handleStyle'
  }, /private carrier/)
})
