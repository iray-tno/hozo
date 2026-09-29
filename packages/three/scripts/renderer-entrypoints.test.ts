import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function bundledInputs(entry: string) {
  const result = await build({
    entryPoints: [path.join(root, 'src', entry)],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'browser',
    format: 'esm',
    external: ['@hozo/canvas', 'react', 'react/jsx-runtime'],
    logLevel: 'silent',
  })
  return Object.keys(result.metafile.inputs).map((input) => input.replaceAll('\\', '/'))
}

test('renderer entry points do not retain the other Three.js renderer family', async () => {
  const [portable, classic, modern, r3f, nativeR3FUnavailable] = await Promise.all([
    bundledInputs('index.ts'),
    bundledInputs('webgl-renderer.tsx'),
    bundledInputs('webgpu.tsx'),
    bundledInputs('r3f.tsx'),
    bundledInputs('r3f-native-unavailable.tsx'),
  ])

  assert.ok(!portable.some((input) => input.includes('/@react-three/fiber/')))
  assert.ok(r3f.some((input) => input.includes('/@react-three/fiber/')))
  assert.ok(!nativeR3FUnavailable.some((input) => input.includes('/@react-three/fiber/')))
  assert.ok(
    !r3f.some((input) => input.endsWith('/three/build/three.webgpu.js')),
    'the default R3F adapter eagerly retained the opt-in WebGPU renderer',
  )
  assert.ok(classic.some((input) => input.endsWith('/three/build/three.module.js')))
  assert.ok(!classic.some((input) => input.endsWith('/three/build/three.webgpu.js')))
  assert.ok(modern.some((input) => input.endsWith('/three/build/three.webgpu.js')))
  assert.ok(
    !modern.some((input) => input.endsWith('/three/build/three.module.js')),
    'the modern entry point retained the classic Three.js bundle',
  )
})
