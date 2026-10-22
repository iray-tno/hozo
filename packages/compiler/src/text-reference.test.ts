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

test('state-conditioned label typography is driven by its own Button or Pressable only', () => {
  const compiler = createCompiler()
  for (const name of ['Button', 'Pressable']) {
    const source = `import {${name}} from '@hozo/core';export const Owner=({children})=> <${name} className="text-[#1355bb] hover:text-[#00aa00] active:text-[#cc0000] focus:font-semibold focus-visible:tracking-[2px] hover:active:text-[22px]">{children}</${name}>`
    const ordinary = compiler.compileNativeModule(source)
    const selected = compiler.compileNativeModule(source, undefined, undefined, {
      textInheritance: true,
      textStatic: true,
    }).components[0]
    assert.ok(
      !selected.diagnostics.some((d) => d.severity === 'error'),
      JSON.stringify(selected.diagnostics),
    )
    assert.match(selected.jsx, /HozoInheritedPressable/)
    assert.match(selected.jsx, /hozoTextStyle=/)
    assert.match(selected.jsx, /hozoFocusVisible/)
    assert.doesNotMatch(
      selected.jsx,
      /style=\{\(/,
      'host style callbacks are not implicitly assessed',
    )
    assert.deepEqual(compiler.compileNativeModule(source), ordinary)
  }
})

test('standalone selectable Chip uses its actual resolved label owner, not a widget-wide frame', () => {
  const compiler = createCompiler()
  const source = `import {Chip,View} from '@hozo/core';export const Owner=({children,style})=> <Chip defaultSelected={false} className="text-[#1355bb] text-[20px] hover:text-[#00aa00] focus:font-semibold p-4" style={style}><View>{children}</View></Chip>`
  const ordinary = compiler.compileNativeModule(source)
  const selected = compiler.compileNativeModule(source, undefined, undefined, {
    textInheritance: true,
    textStatic: true,
  }).components[0]
  assert.ok(
    !selected.diagnostics.some((d) => d.severity === 'error'),
    JSON.stringify(selected.diagnostics),
  )
  assert.ok(selected.runtimeImports.includes('HozoChip'))
  assert.ok(selected.runtimeImports.includes('HozoInheritedLabel'))
  assert.match(selected.jsx, /hozoInheritedLabel=\{HozoInheritedLabel\}/)
  assert.match(selected.jsx, /hozoStyle=/)
  assert.deepEqual(compiler.compileNativeModule(source), ordinary)
  const ownerImport = source.replace(
    "import {Chip,View} from '@hozo/core';",
    "import {Chip} from '@hozo/patterns';import {View} from '@hozo/core';",
  )
  const ownerNormal = compiler.compileNativeModule(ownerImport)
  const ownerSelected = compiler.compileNativeModule(ownerImport, undefined, undefined, {
    textInheritance: true,
  }).components[0]
  assert.ok(!ownerSelected.diagnostics.some((d) => d.severity === 'error'))
  assert.match(ownerSelected.jsx, /hozoInheritedLabel=\{HozoInheritedLabel\}/)
  assert.deepEqual(compiler.compileNativeModule(ownerImport), ownerNormal)
  for (const variant of [
    '<Chip defaultSelected={false} {...rest}>Label</Chip>',
    '<Chip defaultSelected={false} className="hover:bg-red-500">Label</Chip>',
    '<Chip defaultSelected={false} className="aria-pressed:text-red-500">Label</Chip>',
  ]) {
    const input = `import {Chip} from '@hozo/core';export const Owner=()=>${variant}`
    const normal = compiler.compileNativeModule(input)
    const refused = compiler.compileNativeModule(input, undefined, undefined, {
      textInheritance: true,
    }).components[0]
    assert.ok(
      refused.diagnostics.some((d) => d.severity === 'error'),
      variant,
    )
    assert.deepEqual(
      [refused.jsx, refused.styles, refused.runtimeImports],
      [normal.components[0].jsx, normal.components[0].styles, normal.components[0].runtimeImports],
    )
  }
})

test('Chip row and removal slots share the assessed domain and keep ordinary lowering unchanged', () => {
  const compiler = createCompiler()
  for (const attrs of ['', 'onRemove={remove}', 'defaultSelected={false} onRemove={remove}']) {
    const source = `import {Chip} from '@hozo/core';export const Owner=({children})=><Chip ${attrs} className="text-red-500 hover:text-blue-500 focus:font-semibold p-4" removeClassName="text-green-500 focus:text-red-500 active:font-bold p-2">{children}</Chip>`
    const normal = compiler.compileNativeModule(source)
    for (const textStatic of [false, true]) {
      const selected = compiler.compileNativeModule(source, undefined, undefined, {
        textInheritance: true,
        textStatic,
      }).components[0]
      assert.ok(!selected.diagnostics.some((d) => d.severity === 'error'), JSON.stringify(selected))
      assert.match(selected.jsx, /hozoInheritedText=\{HozoInheritedText\}/)
      assert.match(selected.jsx, /hozoInheritedLabel=\{HozoInheritedLabel\}/)
      assert.match(selected.jsx, /hozoRemoveStyle=/)
      assert.ok(selected.runtimeImports.includes('HozoInheritedText'))
    }
    assert.deepEqual(compiler.compileNativeModule(source), normal)
  }
  for (const slot of [
    '"italic"',
    '"font-serif"',
    '"normal-nums"',
    '"lining-nums"',
    '"transition-colors"',
    '"text-[2em]"',
    '"dark:text-red-500"',
    '"hover:bg-red-500"',
    '"aria-pressed:text-red-500"',
    '{dynamic}',
    '{ready ? "text-red-500" : dynamic}',
  ]) {
    const source = `import {Chip} from '@hozo/core';export const Owner=()=> <Chip onRemove={remove} removeClassName=${slot}>Label</Chip>`
    const normal = compiler.compileNativeModule(source).components[0]
    for (const textStatic of [false, true]) {
      const refused = compiler.compileNativeModule(source, undefined, undefined, {
        textInheritance: true,
        textStatic,
      }).components[0]
      assert.ok(
        refused.diagnostics.some((d) => d.severity === 'error'),
        slot,
      )
      assert.deepEqual(
        [refused.jsx, refused.styles, refused.runtimeImports],
        [normal.jsx, normal.styles, normal.runtimeImports],
      )
    }
  }
})

test('explicit color-only transitions use the inherited owner without changing ordinary lowering', () => {
  const compiler = createCompiler()
  for (const component of ['Button', 'Pressable']) {
    const source = `import {${component},View,Text} from '@hozo/core';export const Scene=()=> <${component} className="text-[#000000] hover:text-[#ff0000] transition-[color] duration-100 delay-20 ease-linear"><View><Text>Label</Text></View></${component}>`
    const ordinary = compiler.compileNativeModule(source)
    for (const textStatic of [false, true]) {
      const selected = compiler.compileNativeModule(source, undefined, undefined, {
        textInheritance: true,
        textStatic,
      }).components[0]
      assert.ok(
        !selected.diagnostics.some((d) => d.severity === 'error'),
        JSON.stringify(selected.diagnostics),
      )
      assert.match(selected.jsx, /HozoInheritedPressable/)
      assert.match(selected.jsx, /hozoTransition=/)
      assert.match(selected.jsx, /colors: true/)
      assert.match(selected.jsx, /opacity: false, transform: false/)
      assert.ok(!selected.runtimeImports.includes('HozoAnimated'))
    }
    assert.deepEqual(compiler.compileNativeModule(source), ordinary)
  }
  for (const classes of [
    'text-black hover:text-red-500 transition-all',
    'hover:text-red-500 transition-[color]',
    'text-black dark:text-red-500 transition-[color]',
    'text-black hover:text-red-500 hover:transition-[color]',
    'text-black hover:text-red-500 transition-[color] unscanned-utility',
  ]) {
    const source = `import {Button} from '@hozo/core';export const Scene=()=> <Button className="${classes}">Label</Button>`
    const selected = compiler.compileNativeModule(source, undefined, undefined, {
      textInheritance: true,
    }).components[0]
    const normal = compiler.compileNativeModule(source).components[0]
    assert.ok(
      selected.diagnostics.some((d) => d.severity === 'error'),
      classes,
    )
    assert.deepEqual(
      [selected.jsx, selected.styles, selected.runtimeImports],
      [normal.jsx, normal.styles, normal.runtimeImports],
    )
  }
})

test('class-owned text and background transitions reuse the inherited label and box owner', () => {
  const compiler = createCompiler()
  for (const component of ['Button', 'Pressable']) {
    for (const transition of ['transition-colors', 'transition-[color,background-color]']) {
      const source = `import {${component},Text} from '@hozo/core';export const Scene=()=> <${component} className="text-black hover:text-red-500 bg-white hover:bg-black active:bg-blue-500 ${transition} duration-100"><Text>Label</Text></${component}>`
      const ordinary = compiler.compileNativeModule(source)
      for (const textStatic of [false, true]) {
        const selected = compiler.compileNativeModule(source, undefined, undefined, {
          textInheritance: true,
          textStatic,
        }).components[0]
        assert.ok(
          !selected.diagnostics.some((d) => d.severity === 'error'),
          JSON.stringify(selected),
        )
        assert.match(selected.jsx, /HozoInheritedPressable/)
        assert.match(selected.jsx, /style=\{\(\{/)
        assert.match(selected.jsx, /hozoTextStyle=/)
        assert.match(selected.jsx, /opacity: false, transform: false, colors: true/)
      }
      assert.deepEqual(compiler.compileNativeModule(source), ordinary)
    }
  }
  for (const props of [
    'className="text-black bg-white hover:bg-black transition-colors" style={own}',
    'className="text-black bg-white hover:bg-black transition-colors" {...rest}',
    'className="bg-white hover:bg-black transition-colors"',
    'className="text-black hover:text-red-500 hover:border-red-500 transition-colors"',
    'className="text-black hover:text-red-500 hover:decoration-red-500 transition-colors"',
    'className="text-black bg-white hover:bg-black transition-[color]"',
    'className="text-black bg-white dark:bg-black transition-colors"',
    'className="text-black bg-white hover:bg-black hover:transition-colors"',
    'className="text-black bg-white hover:bg-black transition-all"',
  ]) {
    const source = `import {Button} from '@hozo/core';export const Scene=()=> <Button ${props}>Label</Button>`
    const ordinary = compiler.compileNativeModule(source).components[0]
    for (const textStatic of [false, true]) {
      const selected = compiler.compileNativeModule(source, undefined, undefined, {
        textInheritance: true,
        textStatic,
      }).components[0]
      assert.ok(
        selected.diagnostics.some((d) => d.severity === 'error'),
        props,
      )
      assert.deepEqual(
        [selected.jsx, selected.styles, selected.runtimeImports],
        [ordinary.jsx, ordinary.styles, ordinary.runtimeImports],
      )
    }
  }
})

test('internal runtime integration refuses unassessed primitives and conditions, not ordinary support', () => {
  const compiler = createCompiler()
  for (const source of [
    `import {Button} from '@hozo/core'; export const Label=()=> <Button className="active:bg-red-500">Label</Button>`,
    `import {Button} from '@hozo/core'; export const Label=()=> <Button className="dark:text-red-500">Label</Button>`,
    `import {Button} from '@hozo/core'; export const Label=()=> <Button className="not-hover:text-red-500">Label</Button>`,
    `import {Button} from '@hozo/core'; export const Label=()=> <Button className="group-hover:text-red-500">Label</Button>`,
    `import {Button} from '@hozo/core'; export const Label=()=> <Button className="disabled:text-red-500">Label</Button>`,
    `import {Button} from '@hozo/core'; export const Label=()=> <Button className="data-[state=open]:text-red-500">Label</Button>`,
    `import {View} from '@hozo/core'; export const Label=()=> <View className="hover:text-red-500">Label</View>`,
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
