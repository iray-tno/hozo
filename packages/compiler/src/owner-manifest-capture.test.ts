import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { captureOwnerManifests, type OwnerManifestObservation } from './owner-manifest-capture.ts'

const text = readFileSync(
  new URL('../../../scripts/style-slots/owner-shadow.json', import.meta.url),
  'utf8',
)
const a = { importer: 'app/App.tsx', specifier: 'ui-kit' }
const b = { importer: 'nested/Panel.tsx', specifier: 'ui-kit' }
const options = { platform: 'android', epoch: 'compiler-theme-epoch' }
const row = (input = a, instance = 'ui-kit@instance-1', body = text): OwnerManifestObservation => ({
  ...input,
  status: 'resolved',
  instance,
  entry: `${instance}/native.js`,
  manifest: { kind: 'present', file: `${instance}/owner.json`, text: body },
})

test('resolved instance/entry/content/platform/epoch identities freeze independently of package spelling', () => {
  const first = captureOwnerManifests([a, b], [row(a), row(b, 'ui-kit@instance-2')], options)
  assert.equal(first.status, 'complete')
  if (first.status !== 'complete') return
  assert.equal(first.bindings.length, 2)
  assert.notEqual(first.bindings[0]!.instance, first.bindings[1]!.instance)
  assert.equal(first.bindings[0]!.manifest!.shadow.contracts[0]!.audit, 'unknown')
  assert.ok(Object.isFrozen(first.bindings[0]!.manifest!.shadow.contracts[0]!.shapes))
  assert.equal(
    captureOwnerManifests([b, a], [row(b, 'ui-kit@instance-2'), row(a), row(a)], options).status,
    'complete',
  )
  assert.deepEqual(
    captureOwnerManifests([b, a], [row(b, 'ui-kit@instance-2'), row(a), row(a)], options),
    first,
  )
  const base = captureOwnerManifests([a], [row()], options)
  for (const result of [
    captureOwnerManifests([a], [row(a, 'ui-kit@instance-2')], options),
    captureOwnerManifests([a], [row(a, undefined, `${text}\n`)], options),
    captureOwnerManifests(
      [a],
      [{ ...row(), entry: 'browser.js' } as OwnerManifestObservation],
      options,
    ),
    captureOwnerManifests([a], [row()], { ...options, platform: 'web' }),
    captureOwnerManifests([a], [row()], { ...options, epoch: 'changed' }),
  ])
    assert.notDeepEqual(result, base)
})

test('missing/ambiguous/late/invalid observations expose no partial bindings or fingerprint', () => {
  for (const [expected, observations, reason] of [
    [[a, b], [row()], 'missing-resolution'],
    [[a], [row(), row(a, 'other')], 'ambiguous-resolution'],
    [[a], [row(), row(b)], 'unexpected-edge'],
    [[a], [{ ...a, status: 'unresolved', reason: 'resolver failed' }], 'unresolved'],
    [[a], [{ ...row(), manifest: { kind: 'missing', file: 'owner.json' } }], 'missing-manifest'],
    [[a], [row(a, undefined, '{}')], 'invalid-manifest'],
    [[a, b], [row(a), row(b, undefined, `${text}\n`)], 'conflicting-instance'],
  ] as const) {
    const result = captureOwnerManifests(
      expected,
      observations as readonly OwnerManifestObservation[],
      options,
    )
    assert.equal(result.status, 'incomplete')
    assert.ok(!('fingerprint' in result) && !('bindings' in result))
    if (result.status === 'incomplete')
      assert.ok(
        result.issues.some((issue) => issue.kind === reason),
        reason,
      )
  }
})

test('ordinary nonparticipants are distinct from promised missing manifests; captured data is independent', () => {
  const observation = row()
  const result = captureOwnerManifests([a], [observation], options)
  if (observation.status === 'resolved') observation.entry = 'mutated'
  assert.equal(result.status, 'complete')
  if (result.status === 'complete') assert.notEqual(result.bindings[0]!.entry, 'mutated')
  const ordinary = captureOwnerManifests(
    [a],
    [
      {
        ...a,
        status: 'resolved',
        instance: 'ordinary',
        entry: 'index.js',
        manifest: { kind: 'none' },
      },
    ],
    options,
  )
  assert.equal(ordinary.status, 'complete')
  if (ordinary.status === 'complete') assert.equal(ordinary.bindings[0]!.manifest, null)
  const conflicting = captureOwnerManifests(
    [a, b],
    [
      row(a),
      {
        ...b,
        status: 'resolved',
        instance: 'ui-kit@instance-1',
        entry: 'other.js',
        manifest: { kind: 'none' },
      },
    ],
    options,
  )
  assert.equal(conflicting.status, 'incomplete')
  assert.throws(() => captureOwnerManifests([a, a], [], options), /Duplicate/)
  assert.throws(() => captureOwnerManifests([a], [], { ...options, epoch: '' }), /identities/)
  assert.throws(() => captureOwnerManifests(Array(513).fill(a), [], options), /budget/)
})

test('bounded observations and code-unit ordering cannot silently certify empty/unsupported input', () => {
  assert.throws(() => captureOwnerManifests([a], Array(1025).fill(row()), options), /budget/)
  assert.throws(
    () => captureOwnerManifests([a], [row(a, undefined, ' '.repeat(2_097_153))], options),
    /budget/,
  )
  const audited = text.replace('"audit": "unknown"', '"audit": "audited"')
  assert.notEqual(audited, text)
  assert.equal(
    captureOwnerManifests([a], [row(a, undefined, audited)], options).status,
    'incomplete',
  )
  const ascii = { ...a, importer: 'z' },
    unicode = { ...a, importer: 'ä' }
  const sorted = captureOwnerManifests([unicode, ascii], [row(unicode), row(ascii)], options)
  assert.equal(sorted.status, 'complete')
  if (sorted.status === 'complete')
    assert.deepEqual(
      sorted.bindings.map((binding) => binding.importer),
      ['z', 'ä'],
    )
  const empty = captureOwnerManifests([], [], options)
  assert.equal(empty.scope, 'declared-owner-resolution-set')
  if (empty.status === 'complete') assert.deepEqual(empty.bindings, [])
})
