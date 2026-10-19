import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler } from './index.ts'

test('internal text experiment is opt-in and cannot leak into subsequent ordinary compilation', () => {
  const compiler = createCompiler()
  for (const source of [
    `import {View,Text} from '@hozo/core'; export const Label=()=> <View className="text-red-500 text-[20px]"><Text>Label</Text></View>`,
    `import {View} from '@hozo/core'; export const Label=()=> <View className="text-red-500 text-[20px]"><Opaque/></View>`,
    `import {Small} from '@hozo/core'; export const Label=()=> <Small>Small</Small>`,
    `import {Button,Text} from '@hozo/core'; export const Label=()=> <Button className="text-red-500 active:text-blue-500"><Text>Label</Text></Button>`,
  ]) {
    const normal = compiler.compileNativeModule(source)
    const off = compiler.compileNativeModule(source, undefined, undefined, { textReference: false })
    assert.deepEqual(off, normal)
    const reference = compiler.compileNativeModule(source, undefined, undefined, {
      textReference: true,
    })
    assert.notDeepEqual(reference.components, normal.components)
    assert.deepEqual(reference.imports, normal.imports)
    assert.deepEqual(reference.jsxBindings, normal.jsxBindings)
    assert.deepEqual(reference.syntaxDiagnostics, normal.syntaxDiagnostics)
    assert.deepEqual(compiler.compileNativeModule(source), normal)
    assert.deepEqual(compiler.compileNative(source), normal.components)
  }
})

test('internal reference preserves the semantic ratio rather than a guessed default-size result', () => {
  const compiler = createCompiler()
  const source = `import {Small} from '@hozo/core'; export const Label=()=> <Small testID="label">Small</Small>`
  const normal = compiler.compileNativeModule(source).components[0]
  const reference = compiler.compileNativeModule(source, undefined, undefined, {
    textReference: true,
  }).components[0]
  assert.match(normal.styles, /fontSize: 12/)
  assert.doesNotMatch(normal.jsx, /HozoRelativeText/)
  assert.match(reference.jsx, /HozoRelativeText hozoRelative=\{0\.833333/)
  assert.ok(reference.runtimeImports.includes('HozoRelativeText'))
  assert.doesNotMatch(reference.styles, /fontSize: 12/)
})
