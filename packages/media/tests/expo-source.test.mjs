import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

async function adapter(fromModule) {
  const built = await build({
    entryPoints: [fileURLToPath(new URL('../src/expo-source-index.ts', import.meta.url))],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(
    (name) => {
      assert.equal(
        name,
        'expo-asset',
        'the adapter must not import React or either playback engine',
      )
      return { Asset: { fromModule } }
    },
    module,
    module.exports,
  )
  return module.exports.resolveExpoMediaAsset
}

test('Expo adapter resolves bundled module IDs through the SDK, prefers local URI and preserves embedded URI fallback', async () => {
  const calls = []
  const resolve = await adapter((id) => {
    calls.push(id)
    return {
      downloadAsync: async () => ({
        localUri: id === 1 ? 'file:///tone.wav' : null,
        uri: 'asset:///embedded.mp4',
      }),
    }
  })
  assert.equal(await resolve(1, new AbortController().signal), 'file:///tone.wav')
  assert.equal(await resolve(2, new AbortController().signal), 'asset:///embedded.mp4')
  assert.deepEqual(calls, [1, 2])
})

test('Expo adapter rejects invalid IDs and pre-aborted requests before touching the SDK', async () => {
  let calls = 0
  const resolve = await adapter(() => {
    calls++
    throw new Error('must not run')
  })
  for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, '42'])
    await assert.rejects(resolve(value, new AbortController().signal), TypeError)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(resolve(1, controller.signal), { name: 'AbortError' })
  assert.equal(calls, 0)
})

test('Expo cannot cancel the SDK download but does not return a retired URI or delete SDK caches', async () => {
  let finish
  const resolve = await adapter(() => ({
    downloadAsync: () =>
      new Promise((yes) => {
        finish = yes
      }),
  }))
  const controller = new AbortController()
  const pending = resolve(1, controller.signal)
  controller.abort()
  finish({ localUri: 'file:///cached', uri: 'sdk-uri' })
  await assert.rejects(pending, { name: 'AbortError' })
})

test('Expo lookup, acquisition and empty resolved URI failures are not hidden by a remote fallback', async () => {
  for (const fromModule of [
    () => {
      throw new Error('unknown module')
    },
    () => ({
      downloadAsync: async () => {
        throw new Error('download failed')
      },
    }),
    () => ({ downloadAsync: async () => ({ localUri: '', uri: 'remote' }) }),
  ]) {
    const resolve = await adapter(fromModule)
    await assert.rejects(resolve(1, new AbortController().signal))
  }
})
