import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler } from './index.ts'

test('internal runtime integration emits shipped passive ABI without changing ordinary or reference output', () => {
  const compiler = createCompiler()
  for (const source of [
    `import {Text} from '@hozo/core'; export const Label=()=> <Text>Label</Text>`,
    `import {View,Text} from '@hozo/core'; export const Label=()=> <View className="text-red-500 text-[20px]"><Text>Label</Text><Opaque/></View>`,
  ]) {
    const normal = compiler.compileNativeModule(source)
    const reference = compiler.compileNativeModule(source, undefined, undefined, {
      textReference: true,
    })
    const runtime = compiler.compileNativeModule(source, undefined, undefined, {
      textInheritance: true,
    })
    assert.ok(runtime.components.some((c) => c.runtimeImports.includes('HozoInheritedText')))
    assert.ok(runtime.components.every((c) => !c.diagnostics.some((d) => d.severity === 'error')))
    assert.deepEqual(runtime.imports, normal.imports)
    assert.deepEqual(compiler.compileNativeModule(source), normal)
    assert.deepEqual(
      compiler.compileNativeModule(source, undefined, undefined, { textInheritance: false }),
      normal,
    )
    assert.deepEqual(
      compiler.compileNativeModule(source, undefined, undefined, { textReference: true }),
      reference,
    )
    assert.throws(
      () =>
        compiler.compileNativeModule(source, undefined, undefined, {
          textInheritance: true,
          textReference: true,
        }),
      /one internal text experiment/,
    )
  }
})

test('internal runtime integration refuses unassessed primitives and conditions, not ordinary support', () => {
  const compiler = createCompiler()
  for (const source of [
    `import {Button} from '@hozo/core'; export const Label=()=> <Button>Label</Button>`,
    `import {Text} from '@hozo/core'; export const Label=()=> <Text className="dark:text-red-500">Label</Text>`,
    `import {Small} from '@hozo/core'; export const Label=()=> <Small>Label</Small>`,
  ]) {
    const normal = compiler.compileNativeModule(source)
    const runtime = compiler.compileNativeModule(source, undefined, undefined, {
      textInheritance: true,
    })
    assert.deepEqual(
      runtime.components.map((c) => [c.jsx, c.styles, c.runtimeImports]),
      normal.components.map((c) => [c.jsx, c.styles, c.runtimeImports]),
    )
    assert.ok(
      runtime.components.some((c) =>
        c.diagnostics.some(
          (d) => d.severity === 'error' && /Internal text inheritance/.test(d.message),
        ),
      ),
    )
    assert.deepEqual(compiler.compileNativeModule(source), normal)
  }
})

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
