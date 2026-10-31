import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { captureOwnerManifests } from './owner-manifest-capture.ts'
import { OwnerManifestEpoch } from './owner-manifest-epoch.ts'

const text = readFileSync(
  new URL('../../../scripts/style-slots/owner-shadow.json', import.meta.url),
  'utf8',
)
const edge = { importer: '/app/main.ts', specifier: 'widget-kit' }
function capture(body = text, entry = '/kit/native.js', epoch = 'compiler-theme-abi-policy') {
  return captureOwnerManifests(
    [edge],
    [
      {
        ...edge,
        status: 'resolved',
        instance: '/kit',
        entry,
        manifest: { kind: 'present', file: '/kit/owner.json', text: body },
      },
    ],
    { platform: 'native', epoch },
  )
}

test('only complete observations can freeze; equal rechecks retain original immutable identity', async () => {
  const epoch = new OwnerManifestEpoch()
  assert.throws(() => epoch.lease(), /NOT_READY/)
  const first = capture()
  epoch.adopt(first)
  epoch.adopt(capture())
  const lease = epoch.lease()
  assert.equal(lease.capture, first)
  assert.ok(Object.isFrozen(lease))
  assert.equal(await epoch.run(({ capture }) => capture), first)
  assert.equal(lease.capture.bindings[0]!.manifest!.shadow.contracts[0]!.audit, 'unknown')
})

test('changed bytes, entries, context or incomplete sets permanently retire the old epoch', () => {
  for (const next of [
    capture(`${text}\n`),
    capture(text, '/kit/web.js'),
    capture(text, undefined, 'new-policy'),
    capture('{}'),
  ]) {
    const epoch = new OwnerManifestEpoch()
    epoch.adopt(capture())
    const old = epoch.lease()
    assert.throws(() => epoch.adopt(next), /INVALIDATED/)
    assert.ok(old.signal.aborted)
    assert.throws(() => old.check(), /INVALIDATED/)
    assert.throws(() => epoch.adopt(capture()), /INVALIDATED/)
    assert.throws(() => epoch.lease(), /INVALIDATED/)
    assert.equal(old.capture.status, 'complete', 'earlier immutable evidence is not edited')
  }
  const incomplete = new OwnerManifestEpoch()
  assert.throws(() => incomplete.adopt(capture('{}')), /INCOMPLETE/)
  assert.throws(() => incomplete.adopt(capture()), /INVALIDATED/)
})

test('watcher retirement fences synchronous cache hits and pending asynchronous delivery', async () => {
  for (const pending of [false, true]) {
    const epoch = new OwnerManifestEpoch()
    epoch.adopt(capture())
    let release: (value: string) => void = () => {}
    const output = epoch.run(() =>
      pending
        ? new Promise<string>((resolve) => {
            release = resolve
          })
        : 'cached',
    )
    epoch.invalidate()
    epoch.invalidate()
    release('late')
    await assert.rejects(output, /INVALIDATED/)
  }
})

test('a replacement epoch is independent and failed work cannot be promoted to output', async () => {
  const old = new OwnerManifestEpoch()
  old.adopt(capture())
  const stale = old.lease()
  old.invalidate()
  const next = new OwnerManifestEpoch()
  next.adopt(capture())
  assert.throws(() => stale.check(), /INVALIDATED/)
  assert.equal(await next.run(() => 'fresh'), 'fresh')
  const failure = new Error('actual collection failed')
  await assert.rejects(
    next.run(() => {
      throw failure
    }),
    (error) => error === failure,
  )
  assert.equal(await next.run(() => 'still fresh'), 'still fresh')
})
