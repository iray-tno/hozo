import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeBuildChanges } from './rebundle-rules.mjs'

test('JS-only diagnostic bundling accepts component, driver and documentation changes', () => {
  assert.deepEqual(
    nativeBuildChanges([
      'packages/three/src/r3f-native.tsx',
      'examples/native-showcase/src/Kumimono.stories.tsx',
      'examples/native-showcase/scripts/ios-smoke.mjs',
      '.github/workflows/native-showcase.yml',
      'README.md',
    ]),
    [],
  )
})
test('dependency, native configuration, patches and native-source changes require a new binary', () => {
  const paths = [
    'pnpm-lock.yaml',
    'package.json',
    'examples/native-showcase/package.json',
    'examples/native-showcase/app.json',
    'examples/native-showcase/app.config.ts',
    'patches/expo-gl.patch',
    'packages/native/src/NativeModule.ts',
    'packages/another/ios/Host.swift',
    'packages/another/android/Host.kt',
    'examples/native-showcase/ios/native-input',
    'examples/native-showcase/android/native-input',
  ]
  assert.deepEqual(nativeBuildChanges(paths), paths)
})
