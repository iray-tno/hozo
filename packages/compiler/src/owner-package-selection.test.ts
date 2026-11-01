import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { captureOwnerManifests, type OwnerManifestObservation } from './owner-manifest-capture.ts'
import { OwnerManifestEpoch } from './owner-manifest-epoch.ts'
import { selectOwnerPackageContract } from './owner-package-selection.ts'

const shadow = JSON.parse(
  readFileSync(new URL('../../../scripts/style-slots/owner-shadow.json', import.meta.url), 'utf8'),
)
const a = { importer: '/app/App.tsx', specifier: 'kit' }
const b = { importer: '/bridge/Other.tsx', specifier: 'kit' }
const request = { ...a, entry: '/one/native.js', imported: 'Sheet', classProp: 'handleClassName' }
function data(carrier = 'hozoHandleStyle') {
  const owners = structuredClone(shadow)
  owners.contracts[0].abi.nativePreparedProp = carrier
  return {
    schema: 'rfc010-package-shadow-0',
    owners,
    exports: [
      { name: 'Sheet', owners: ['BottomSheet.handle'] },
      { name: 'Other', owners: [] },
    ],
    candidates: [],
    helpers: [],
    compiledByConsumer: false,
    textForwarding: { version: 1, textForwarding: {} },
  }
}
function observe(edge = a, instance = '/one', input = data()): OwnerManifestObservation {
  return {
    ...edge,
    status: 'resolved',
    instance,
    entry: `${instance}/native.js`,
    manifest: { kind: 'present', file: `${instance}/owner.json`, text: JSON.stringify(input) },
  }
}
function fixture(
  rows: OwnerManifestObservation[] = [observe(), observe(b, '/two', data('hozoSecondStyle'))],
) {
  const expected = rows.map(({ importer, specifier }) => ({ importer, specifier }))
  const options = { platform: 'ios', epoch: 'compiler-css-abi-epoch' }
  const epoch = new OwnerManifestEpoch()
  epoch.adopt(captureOwnerManifests(expected, rows, options))
  return { epoch, lease: epoch.lease(), expected, options }
}

test('same-name exports select only their exact edge, entry, instance and content provenance', () => {
  const { lease } = fixture()
  const first = selectOwnerPackageContract(lease, request)
  const second = selectOwnerPackageContract(lease, { ...request, ...b, entry: '/two/native.js' })
  assert.equal(first.status, 'selected')
  assert.equal(second.status, 'selected')
  if (first.status !== 'selected' || second.status !== 'selected') return
  assert.equal(first.identity.instance, '/one')
  assert.equal(second.identity.instance, '/two')
  assert.equal(first.identity.captureFingerprint, lease.capture.fingerprint)
  assert.equal(first.identity.platform, 'ios')
  assert.equal(first.identity.epoch, 'compiler-css-abi-epoch')
  assert.notEqual(first.identity.manifestSha256, second.identity.manifestSha256)
  assert.equal(JSON.parse(first.shadow).contracts[0].abi.nativePreparedProp, 'hozoHandleStyle')
  assert.equal(JSON.parse(second.shadow).contracts[0].abi.nativePreparedProp, 'hozoSecondStyle')
  assert.equal(JSON.parse(first.shadow).contracts[0].audit, 'unknown')
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.identity))
  assert.deepEqual(selectOwnerPackageContract(lease, { ...request, entry: '/two/native.js' }), {
    status: 'unassessed',
    reason: 'entry-mismatch',
  })
  assert.deepEqual(selectOwnerPackageContract(lease, { ...request, importer: '/late.tsx' }), {
    status: 'unassessed',
    reason: 'edge-not-captured',
  })
  assert.deepEqual(selectOwnerPackageContract(lease, { ...request, imported: 'Missing' }), {
    status: 'unassessed',
    reason: 'export-not-declared',
  })
  assert.deepEqual(selectOwnerPackageContract(lease, { ...request, imported: 'Other' }), {
    status: 'unassessed',
    reason: 'owner-not-declared',
  })
  assert.deepEqual(selectOwnerPackageContract(lease, { ...request, classProp: 'className' }), {
    status: 'unassessed',
    reason: 'owner-not-declared',
  })
})

test('ordinary, owner-only and ambiguous packages never become implicit contracts', () => {
  const ordinary = observe()
  if (ordinary.status !== 'resolved') return
  ordinary.manifest = { kind: 'none' }
  const ownerOnly = observe()
  if (ownerOnly.status !== 'resolved') return
  ownerOnly.manifest = { kind: 'present', file: '/one/owner.json', text: JSON.stringify(shadow) }
  for (const [row, reason] of [
    [ordinary, 'ordinary-package'],
    [ownerOnly, 'package-channels-unavailable'],
  ] as const) {
    const { lease } = fixture([row])
    assert.deepEqual(selectOwnerPackageContract(lease, request), { status: 'unassessed', reason })
  }
  const ambiguous = data()
  const extra = structuredClone(ambiguous.owners.contracts[0])
  extra.owner = 'BottomSheet.extra'
  ambiguous.owners.contracts.push(extra)
  ambiguous.exports[0].owners.push(extra.owner)
  assert.deepEqual(
    selectOwnerPackageContract(fixture([observe(a, '/one', ambiguous)]).lease, request),
    { status: 'unassessed', reason: 'ambiguous-owner' },
  )
})

test('invalid requests and retired leases cannot escape the original immutable selection', () => {
  const { lease, epoch, expected, options } = fixture()
  const input = { ...request }
  const selected = selectOwnerPackageContract(lease, input)
  input.importer = '/retargeted'
  if (selected.status !== 'selected') throw new Error('expected selected contract')
  assert.equal(selected.identity.importer, a.importer)
  for (const change of [{ entry: '' }, { imported: 'x\0y' }, { specifier: 'x'.repeat(4097) }])
    assert.throws(
      () => selectOwnerPackageContract(lease, { ...request, ...change }),
      /INVALID_REQUEST/,
    )
  assert.throws(
    () =>
      epoch.adopt(
        captureOwnerManifests(
          expected,
          [observe(), observe(b, '/two', data('hozoEditedStyle'))],
          options,
        ),
      ),
    /INVALIDATED/,
  )
  assert.throws(() => selected.check(), /INVALIDATED/)
  assert.throws(() => selectOwnerPackageContract(lease, request), /INVALIDATED/)
})
