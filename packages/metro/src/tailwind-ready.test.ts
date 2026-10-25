import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, prepareTailwindContext } from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from '@hozo/tailwind'
import { transformHozoSource } from './transform.ts'

test('test-only ready-compiler injection preserves the real post-Canvas Metro transform', async () => {
  const source = `import {View,Text,Avatar} from '@hozo/core';import {Canvas} from '@hozo/canvas';
export const Row=()=> <View className="p-2"><Avatar fallbackClassName="font-bold"/><Text className="text-lg">😀Label</Text><Canvas><Canvas.Rect className="fill-red-500"/></Canvas></View>`
  const compiler = createCompiler()
  const expected = transformHozoSource(source, 'Ready.tsx', undefined, compiler)
  const context = prepareTailwindContext(
    JSON.stringify(
      (
        await prepareTailwindOrder('@import "tailwindcss/theme.css";', tailwindPackageDir(), [
          'p-2',
          'font-bold',
          'text-lg',
          'fill-red-500',
        ])
      ).snapshot,
    ),
  )
  let calls = 0
  // This replaces the compiler only in this test. It neither enables an
  // adapter path nor implies the synchronous Metro transformer can await.
  compiler.compileNativeModule = (input, bindings) => {
    calls++
    assert.doesNotMatch(input, /fill-red-500/)
    assert.match(input, /<Canvas\.Rect[^>]*fill=/)
    const result = compiler.compileNativeOrPrepare(input, context, bindings)
    assert.ok('components' in result, 'the known complete context must emit synchronously')
    return result
  }
  compiler.prepareNativeModule = () => {
    throw new Error('unexpected retained handle/reparse')
  }
  assert.deepEqual(transformHozoSource(source, 'Ready.tsx', undefined, compiler), expected)
  assert.equal(calls, 1)
})
