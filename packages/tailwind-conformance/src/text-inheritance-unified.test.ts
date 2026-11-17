// Decision 013's route against RFC 006's independent reference model. Both
// compile the same scenes through the real compiler and Metro transform; the
// reference renders with its contextual test hosts, the route with the
// shipped leaves and plain mock hosts. React Native's own Text-in-Text
// inheritance is applied by the projection, as in the existing comparisons.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { transformSync } from 'esbuild'
import { createCompiler } from '../../compiler/src/index.ts'
import { transformHozoSource } from '../../metro/src/transform.ts'
import { projectNativeText, type TextHostJson } from './text-inheritance-native-projection.ts'
import { createTextReference, TEXT_REFERENCE_FIELDS } from './text-inheritance-reference-core.ts'
import {
  flattenRuntimeStyle as flatten,
  loadTextInheritanceRuntime,
} from './text-inheritance-runtime-host.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
globalThis.IS_REACT_ACT_ENVIRONMENT = true

type Mode = 'reference' | 'unified'

function load(mode: Mode, files: Record<string, string>) {
  const legacy = React.createContext(14)
  const shipped = loadTextInheritanceRuntime(legacy)
  const reference = createTextReference({
    react: React,
    Text: 'NativeText' as never,
    View: 'NativeView' as never,
    HozoPressable: 'Unused' as never,
    HozoTextSizeContext: legacy,
    HozoInteractionContext: React.createContext(null),
    flattenStyle: flatten,
    renderViewStyle(style) {
      const result = flatten(style)
      for (const name of TEXT_REFERENCE_FIELDS) delete result[name]
      return result
    },
  })
  const compiler = createCompiler()
  const code: Record<string, string> = {}
  const cache = new Map<string, Record<string, unknown>>()
  const module = (name: string): Record<string, unknown> => {
    if (cache.has(name)) return cache.get(name)!
    const output = transformHozoSource(files[name], `${name}.tsx`, undefined, {
      ...compiler,
      compileNativeModule(input, bindings, file) {
        return compiler.compileNativeModule(
          input,
          bindings,
          file,
          mode === 'unified' ? { textUnified: true } : { textReference: true },
        )
      },
    })!
    code[name] = output
    const js = transformSync(output, { loader: 'tsx', jsx: 'automatic', format: 'cjs' }).code
    const cjs = { exports: {} as Record<string, unknown> }
    new Function('require', 'module', 'exports', js)(
      (specifier: string) => {
        if (specifier.startsWith('fixture:')) return module(specifier.slice(8))
        if (specifier === 'react' || specifier === 'react/jsx-runtime') return require(specifier)
        if (specifier === 'react-native')
          return mode === 'unified'
            ? shipped.native
            : { ...shipped.native, Text: reference.ReferenceText, View: reference.ReferenceView }
        if (specifier === '@hozo/core/generated/inherited-text')
          return {
            HozoInheritedLeafText: shipped.HozoInheritedLeafText,
            HozoInheritedScope: shipped.HozoInheritedScope,
            HozoInheritedText: shipped.HozoInheritedText,
          }
        throw new Error(`Unexpected generated dependency ${specifier} in ${name}`)
      },
      cjs,
      cjs.exports,
    )
    // esbuild's CommonJS output replaces `module.exports`; read it after.
    cache.set(name, cjs.exports)
    return cjs.exports
  }
  return { Scene: module('scene').Scene as never, code }
}

const asNative = (node: TextHostJson): TextHostJson => {
  if (node === null || typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(asNative)
  return {
    ...node,
    type: node.type === 'NativeText' ? 'Text' : node.type,
    children: node.children?.map(asNative) ?? null,
  }
}

function project(mode: Mode, files: Record<string, string>) {
  const { Scene, code } = load(mode, files)
  let tree: ReturnType<typeof renderer.create>
  try {
    renderer.act(() => {
      tree = renderer.create(React.createElement(Scene))
    })
  } catch (error) {
    throw new Error(`${mode}: ${(error as Error).message}\n${Object.values(code).join('\n---\n')}`)
  }
  const projected = projectNativeText(asNative(tree!.toJSON()), flatten)
  // Only the protocol fields: the two routes may place layout differently.
  return {
    code,
    texts: Object.fromEntries(
      Object.entries(projected).map(([id, style]) => [
        id,
        Object.fromEntries(
          TEXT_REFERENCE_FIELDS.flatMap((f) => (f in style ? [[f, style[f]]] : [])),
        ),
      ]),
    ),
  }
}

const label = (body: string) =>
  `import {View,Text} from '@hozo/core';export const Label=({children})=> ${body}`
const scene = (body: string) =>
  `import {View,Text} from '@hozo/core';import {Label} from 'fixture:label';export const Scene=()=> ${body}`

const cases: Record<
  string,
  { scene: string; label: string; outer?: string; expect: Record<string, object> }
> = {
  'a container publishes to a component it cannot see': {
    scene: scene('<View className="text-[#ff0000] text-[18px]"><Label/></View>'),
    label: label('<Text testID="label" className="font-bold">x</Text>'),
    expect: { label: { color: '#ff0000', fontSize: 18, fontWeight: '700' } },
  },
  'the nearer container wins, field by field': {
    scene: scene(
      '<View className="text-[#ff0000] text-[18px]"><View className="text-[24px]">{<Label/>}</View></View>',
    ),
    label: label('<Text testID="label">x</Text>'),
    expect: { label: { color: '#ff0000', fontSize: 24 } },
  },
  'a nested Text inherits from its outer Text, not from outside': {
    scene: scene('<View className="text-[#ff0000] text-[18px]"><Label/></View>'),
    label: label(
      '<Text testID="label" className="text-[#0000ff]">a<Text testID="nested" className="font-bold">b</Text></Text>',
    ),
    expect: {
      label: { color: '#0000ff', fontSize: 18 },
      nested: { color: '#0000ff', fontSize: 18, fontWeight: '700' },
    },
  },
  // The outer Text is in a third file, so the scope above it is published at
  // run time rather than copied, and the label must not read it past the
  // Text that natively encloses it.
  'a component inside a Text inherits from that Text, not from the scope around it': {
    scene: scene('<View className="text-[#ff0000] text-[18px]"><Outer/></View>').replace(
      "import {Label} from 'fixture:label'",
      "import {Outer} from 'fixture:outer'",
    ),
    outer: label('<Text testID="outer" className="text-[#0000ff]">Hi <Label/></Text>').replace(
      'export const Label',
      "import {Label} from 'fixture:label';export const Outer",
    ),
    label: label('<Text testID="label" className="font-bold">x</Text>'),
    expect: {
      outer: { color: '#0000ff', fontSize: 18 },
      label: { color: '#0000ff', fontSize: 18, fontWeight: '700' },
    },
  },
  'a Text under a visible container in the other file combines both': {
    scene: scene('<View className="text-[#ff0000] text-[18px]"><Label/></View>'),
    label: label('<View className="text-[12px]"><Text testID="label">x</Text></View>'),
    expect: { label: { color: '#ff0000', fontSize: 12 } },
  },
  'a Text that sets every field ignores what is published': {
    scene: scene('<View className="text-[#ff0000] text-[18px] text-center"><Label/></View>'),
    label: label(
      '<Text testID="label" className="text-[#111111] text-[22px] font-semibold leading-[32px] tracking-[1px] text-left uppercase">x</Text>',
    ),
    expect: {
      label: {
        color: '#111111',
        fontSize: 22,
        fontWeight: '600',
        lineHeight: 32,
        letterSpacing: 1,
        textAlign: 'left',
        textTransform: 'uppercase',
      },
    },
  },
  'children passed through a component reach its scope': {
    scene: scene('<Label><Text testID="child">x</Text></Label>'),
    label: label('<View className="text-[#00aa00] text-[20px]">{children}</View>'),
    expect: { child: { color: '#00aa00', fontSize: 20 } },
  },
}

for (const [name, { scene, label, outer, expect }] of Object.entries(cases)) {
  test(name, () => {
    const files = { scene, label, ...(outer ? { outer } : {}) }
    const unified = project('unified', files)
    const reference = project('reference', files)
    assert.deepEqual(reference.texts, expect, 'the reference model itself')
    assert.deepEqual(unified.texts, reference.texts, Object.values(unified.code).join('\n---\n'))
  })
}

test('ordinary output beside the route: a closed file is unchanged, and no element is refused', () => {
  const compiler = createCompiler()
  const closed = `import {View,Text} from '@hozo/core';export const A=()=> <View className="p-4"><Text className="text-[#111111] text-[22px] font-semibold leading-[32px] tracking-[1px] text-left uppercase">x</Text></View>`
  const unified = compiler.compileNativeModule(closed, undefined, undefined, { textUnified: true })
  assert.deepEqual(unified, compiler.compileNativeModule(closed))
  const mixed = `import {View,Text} from '@hozo/core';export const A=({c})=> <View className="text-lg animate-spin"><Text className="font-[Inter] dark:text-white">x</Text>{c}</View>`
  const output = compiler.compileNativeModule(mixed, undefined, undefined, { textUnified: true })
  const errors = (o: typeof output) =>
    o.components[0].diagnostics.filter((d) => d.severity === 'error').map((d) => d.message)
  // Whatever ordinary output refuses it still refuses; the route adds none.
  assert.deepEqual(errors(output), errors(compiler.compileNativeModule(mixed)))
  assert.match(output.components[0].jsx, /HozoInheritedLeafText/)
  assert.match(output.components[0].jsx, /HozoInheritedScope/)
})
