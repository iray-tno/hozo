import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { captureOwnerManifests, type OwnerManifestObservation } from './owner-manifest-capture.ts'
import { OWNER_PACKAGE_SCHEMA } from './owner-package.ts'
import { collectOwnerPackageContributions } from './owner-package-contributions.ts'

const ownerText = readFileSync(
  new URL('../../../scripts/style-slots/owner-shadow.json', import.meta.url),
  'utf8',
)
const options = { platform: 'android', epoch: 'compiler-theme-abi-policy' }
const a = { importer: '/app/App.tsx', specifier: 'widget-kit' },
  b = { importer: '/bridge/Panel.tsx', specifier: 'widget-kit' }
function row(edge = a, instance = '/first', candidates = ['p-4']): OwnerManifestObservation {
  return {
    ...edge,
    status: 'resolved',
    instance,
    entry: `${instance}/native.js`,
    manifest: {
      kind: 'present',
      file: `${instance}/owner.json`,
      text: JSON.stringify({
        schema: OWNER_PACKAGE_SCHEMA,
        owners: JSON.parse(ownerText),
        exports: [
          { name: 'Sheet', owners: ['BottomSheet.handle'] },
          { name: 'cn', owners: [] },
        ],
        candidates,
        helpers: ['cn'],
        compiledByConsumer: true,
        textForwarding: { version: 1, textForwarding: {} },
      }),
    },
  }
}
test('capture unions candidate tokens but preserves two same-name instances and scoped helper/export facts', () => {
  const capture = captureOwnerManifests([a, b], [row(), row(b, '/second', ['p-2', 'p-4'])], options)
  const result = collectOwnerPackageContributions(capture)
  assert.equal(result.status, 'complete')
  if (result.status !== 'complete') return
  assert.deepEqual(result.candidates, ['p-2', 'p-4'])
  assert.deepEqual(
    result.instances.map((item) => item.instance),
    ['/first', '/second'],
  )
  assert.deepEqual(
    result.instances.map((item) => item.data.helpers),
    [['cn'], ['cn']],
  )
  assert.ok(Object.isFrozen(result.instances[0]!.data.exports))
  assert.ok(Object.isFrozen(result.candidates))
  assert.equal(result.instances[0]!.data.owners!.contracts[0]!.audit, 'unknown')
  const permuted = collectOwnerPackageContributions(
    captureOwnerManifests([b, a], [row(b, '/second', ['p-2', 'p-4']), row()], options),
  )
  assert.deepEqual(permuted, result)
  const changed = collectOwnerPackageContributions(
    captureOwnerManifests([a, b], [row(), row(b, '/second', ['p-8'])], options),
  )
  assert.notDeepEqual(changed, result)
})
test('owner-only and incomplete observations cannot silently become empty package candidate sets', () => {
  const legacy = row()
  if (legacy.status === 'resolved' && legacy.manifest.kind === 'present')
    legacy.manifest.text = ownerText
  for (const capture of [
    captureOwnerManifests([a], [legacy], options),
    captureOwnerManifests([a, b], [row()], options),
  ]) {
    const result = collectOwnerPackageContributions(capture)
    assert.equal(result.status, 'incomplete')
    assert.ok(!('candidates' in result) && !('instances' in result) && !('fingerprint' in result))
  }
  const ordinary: OwnerManifestObservation = {
    ...a,
    status: 'resolved',
    instance: '/ordinary',
    entry: '/ordinary/index.js',
    manifest: { kind: 'none' },
  }
  const result = collectOwnerPackageContributions(captureOwnerManifests([a], [ordinary], options))
  assert.equal(result.status, 'complete')
  if (result.status === 'complete') {
    assert.deepEqual(result.candidates, [])
    assert.deepEqual(result.unassessed, ['/ordinary'])
  }
})
test('explicit packages without owners remain participants and candidate bytes invalidate old captures', () => {
  const observation = row()
  if (observation.status !== 'resolved' || observation.manifest.kind !== 'present')
    throw new Error('fixture')
  const data = JSON.parse(observation.manifest.text)
  data.owners = null
  data.exports = [{ name: 'cn', owners: [] }]
  observation.manifest.text = JSON.stringify(data)
  const capture = captureOwnerManifests([a], [observation], options)
  const result = collectOwnerPackageContributions(capture)
  assert.equal(result.status, 'complete')
  if (result.status === 'complete') {
    assert.deepEqual(result.candidates, ['p-4'])
    assert.equal(result.instances[0]!.data.owners, null)
    data.candidates.push('p-8')
    assert.deepEqual(result.candidates, ['p-4'])
  }
})
