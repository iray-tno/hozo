import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler } from './index.ts'

const closedClass =
  'text-[#111111] text-[22px] font-semibold leading-[32px] tracking-[1px] text-left uppercase'
const closed = (child = '<Text className="text-[#1355bb] font-medium">Nested</Text>') =>
  `import {Text} from '@hozo/core';import {memo} from 'react';export const Label=memo(()=> <Text className="${closedClass}">Parent${child}</Text>)`

test('internal static selection proves individual memo regions and keeps measured runtime and default paths independent', () => {
  const compiler = createCompiler()
  const source = `${closed()};export const Open=memo(()=> <Text>Open</Text>)`
  const ordinary = compiler.compileNativeModule(source)
  const runtime = compiler.compileNativeModule(source, undefined, undefined, {
    textInheritance: true,
  })
  const optimized = compiler.compileNativeModule(source, undefined, undefined, {
    textInheritance: true,
    textStatic: true,
  })
  assert.equal(optimized.components.length, 2)
  assert.deepEqual(optimized.components[0], ordinary.components[0])
  assert.deepEqual(optimized.components[0].runtimeImports, [])
  assert.deepEqual(optimized.components[0].nativeImports, ['Text'])
  assert.deepEqual(optimized.components[1], runtime.components[1])
  assert.ok(optimized.components[1].runtimeImports.includes('HozoInheritedText'))
  assert.ok(runtime.components.every((c) => c.runtimeImports.includes('HozoInheritedText')))
  assert.deepEqual(compiler.compileNativeModule(source), ordinary)
  assert.deepEqual(
    compiler.compileNativeModule(source, undefined, undefined, {
      textInheritance: true,
      textStatic: false,
    }),
    runtime,
  )
  assert.deepEqual(
    compiler.compileNativeModule(source, undefined, undefined, { textInheritance: true }),
    runtime,
  )
  assert.throws(
    () => compiler.compileNativeModule(source, undefined, undefined, { textStatic: true }),
    /requires textInheritance/,
  )
  assert.throws(
    () =>
      compiler.compileNativeModule(source, undefined, undefined, {
        textStatic: true,
        textReference: true,
      }),
    /requires textInheritance/,
  )
})

test('incomplete, mutable, opaque or alternate sites retain identical runtime output rather than adding restrictions', () => {
  const compiler = createCompiler()
  for (const source of [
    closed().replace(closedClass, 'text-[#111111] text-[22px]'),
    closed().replace(`className="${closedClass}"`, `className="${closedClass}" style={own}`),
    closed().replace(`className="${closedClass}"`, `className="${closedClass}" {...props}`),
    closed().replace(
      `className="${closedClass}"`,
      `className="${closedClass}" children={children}`,
    ),
    closed('<Text style={own}>Nested</Text>'),
    closed('<Text className={classes}>Nested</Text>'),
    closed('<Text className="dark:text-blue-500">Nested</Text>'),
    closed('<Opaque/>'),
    closed('{children}'),
    closed('<><Text>Fragment</Text></>'),
    closed()
      .replace('memo(()=>', 'memo(()=> flag ?')
      .replace('</Text>)', '</Text> : <Text>Other</Text>)'),
    closed()
      .replace('memo(()=>', 'memo(function Render(){const again=Render;return')
      .replace('</Text>)', '</Text>})'),
    closed().replace('memo(()=>', '(()=>'),
    closed().replace('memo(()=>', 'memo(async()=>'),
    closed().replace('memo(()=>', 'memo((Text)=>'),
    closed().replace("from 'react'", "from 'other'"),
    closed().replace("from '@hozo/core'", "from 'other'"),
    `${closed()};Text=Other`,
  ]) {
    const runtime = compiler.compileNativeModule(source, undefined, undefined, {
      textInheritance: true,
    })
    const optimized = compiler.compileNativeModule(source, undefined, undefined, {
      textInheritance: true,
      textStatic: true,
    })
    assert.deepEqual(optimized, runtime, source)
  }
})

test('the static proof follows import aliases and source grammar without losing non-ASCII offsets', () => {
  const compiler = createCompiler()
  const source = `/*日本語🙂*/${closed().replaceAll('Text', 'T').replace('import {T}', 'import {Text as T}').replaceAll('memo', 'm').replace('import {m}', 'import {memo as m}')}`
  const normal = compiler.compileNativeModule(source, undefined, 'label.jsx')
  const optimized = compiler.compileNativeModule(source, undefined, 'label.jsx', {
    textInheritance: true,
    textStatic: true,
  })
  assert.equal(optimized.components.length, 1)
  assert.deepEqual(optimized, normal)
})

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

test('internal inheritance preserves semantic typography and runtime ratios without changing ordinary lowering', () => {
  for (const preflight of [false, true]) {
    const compiler = createCompiler({ colors: [], preflight })
    for (const name of [
      'Paragraph',
      'Strong',
      'Heading',
      'Small',
      'Sub',
      'Sup',
      'Mark',
      'NoBreak',
    ]) {
      const source = `import {${name}} from '@hozo/typography';export const Label=()=> <${name} testID="label">Label</${name}>`
      const ordinary = compiler.compileNativeModule(source)
      const runtime = compiler.compileNativeModule(source, undefined, undefined, {
        textInheritance: true,
        textStatic: true,
      })
      assert.equal(runtime.components.length, 1)
      const result = runtime.components[0]
      assert.ok(
        !result.diagnostics.some((d) => d.severity === 'error'),
        `${name}: ${JSON.stringify(result.diagnostics)}`,
      )
      const relative = ['Small', 'Sub', 'Sup'].includes(name) || (name === 'Heading' && !preflight)
      assert.ok(
        result.runtimeImports.includes(
          relative ? 'HozoInheritedRelativeText' : 'HozoInheritedText',
        ),
        name,
      )
      assert.ok(!result.runtimeImports.includes('HozoRelativeText'), name)
      if (relative) assert.match(result.jsx, /hozoRelative=\{/)
      if (name === 'Heading') assert.match(result.jsx, /accessibilityRole="header"/)
      assert.deepEqual(compiler.compileNativeModule(source), ordinary)
    }
  }
})

test('bounded label owners select the inherited adapter without changing ordinary output', () => {
  const compiler = createCompiler()
  for (const name of ['Button', 'Pressable']) {
    const source = `import {${name},View,Text} from '@hozo/core';export const Owner=({children,own})=> <${name} className="text-[#1355bb] text-[20px] p-4" style={own}><View><Text>Visible</Text>{children}</View></${name}>`
    const ordinary = compiler.compileNativeModule(source)
    const selected = compiler.compileNativeModule(source, undefined, undefined, {
      textInheritance: true,
      textStatic: true,
    })
    assert.ok(
      selected.components.every((c) => !c.diagnostics.some((d) => d.severity === 'error')),
      JSON.stringify(selected.components),
    )
    assert.ok(selected.components[0].runtimeImports.includes('HozoInheritedPressable'))
    assert.ok(!selected.components[0].runtimeImports.includes('HozoPressable'))
    assert.match(selected.components[0].jsx, /hozoTextStyle=/)
    assert.deepEqual(compiler.compileNativeModule(source), ordinary)
  }
})

test('internal runtime integration refuses unassessed primitives and conditions, not ordinary support', () => {
  const compiler = createCompiler()
  for (const source of [
    `import {Button} from '@hozo/core'; export const Label=()=> <Button className="active:text-red-500">Label</Button>`,
    `import {Text} from '@hozo/core'; export const Label=()=> <Text className="dark:text-red-500">Label</Text>`,
    `import {Code} from '@hozo/core'; export const Label=()=> <Code>Label</Code>`,
    `import {Emphasis} from '@hozo/core'; export const Label=()=> <Emphasis>Label</Emphasis>`,
    `import {Text} from '@hozo/core'; export const Label=()=> <Text className="italic">Label</Text>`,
    `import {Heading} from '@hozo/core'; export const Label=()=> <Heading level={level}>Label</Heading>`,
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
