import assert from 'node:assert/strict'
import test from 'node:test'

import { openCandidateCache } from './index.ts'
import { loadNativeBinding, nativePackageName } from './native-loader.ts'

test('the host addon exposes compatible candidate replay on every platform smoke path', () => {
  const cache = openCandidateCache()
  cache.scanFile('entry', `export const tone=()=> 'p-4 bg-red-500'`, 1)
  const record = cache.exportFile('entry')!
  const restored = openCandidateCache()
  restored.importFile('entry', record, 2)
  assert.equal(restored.renderCss(), cache.renderCss())
  assert.equal(restored.renderNativeModule(), cache.renderNativeModule())
  assert.equal(restored.isCurrent('entry', 2), true)
})

test('maps supported Node platforms to optional native packages', () => {
  assert.equal(nativePackageName('win32', 'x64'), '@hozo/compiler-win32-x64-msvc')
  assert.equal(nativePackageName('darwin', 'arm64'), '@hozo/compiler-darwin-arm64')
  assert.equal(nativePackageName('linux', 'x64', 'musl'), '@hozo/compiler-linux-x64-musl')
  assert.equal(nativePackageName('freebsd', 'x64'), undefined)
})

test('prefers the adjacent development addon and falls back to the platform package', () => {
  const tried: string[] = []
  const binding = loadNativeBinding<{ compile: string }>({
    localPath: 'local.node',
    platform: 'win32',
    arch: 'x64',
    require(specifier) {
      tried.push(specifier)
      if (specifier === 'local.node') throw new Error('missing')
      return { compile: 'native' }
    },
  })

  assert.deepEqual(tried, ['local.node', '@hozo/compiler-win32-x64-msvc'])
  assert.equal(binding.compile, 'native')
})

test('an explicit override is authoritative and failures are actionable', () => {
  assert.throws(
    () =>
      loadNativeBinding({
        localPath: 'local.node',
        platform: 'darwin',
        arch: 'arm64',
        override: '/custom/hozo.node',
        require() {
          throw new Error('wrong ABI')
        },
      }),
    (error: Error) =>
      error.message.includes('darwin/arm64') &&
      error.message.includes('/custom/hozo.node') &&
      error.message.includes('HOZO_NATIVE_BINDING'),
  )
})
