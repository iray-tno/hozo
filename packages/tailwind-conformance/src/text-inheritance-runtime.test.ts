// Actual compiler + Metro + shipped leaf code, with mock Native hosts only.
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
const REST = Object.freeze({
  color: '#112233',
  fontSize: 20,
  fontWeight: '400',
  lineHeight: 28,
  letterSpacing: 1,
  textAlign: 'left',
  textTransform: 'uppercase',
  width: 240,
  padding: 12,
})
const NEXT = Object.freeze({ ...REST, color: '#334455', fontSize: 28, lineHeight: 40 })
const OWN = Object.freeze({ color: '#abcdef', fontSize: 30 })
const sources: Record<string, string> = {
  scene: `import {View} from '@hozo/core';import {Label} from 'fixture:label';
export function Scene({frame,own,tick,viewRef,textRef,onLayout}) {return <View ref={viewRef} onLayout={onLayout} testID="owner" style={frame}><View style={own}><Label tick={tick} textRef={textRef}/></View></View>}`,
  label: `import {Text} from '@hozo/core';import {memo,useState} from 'react';let next=0;
export const Label=memo(function Label({tick,textRef}){const [id]=useState(()=>++next);return <Text ref={textRef} testID="label" accessibilityLabel={id+':'+tick}>Parent<Text testID="nested" className="text-[#1355bb] font-medium">Nested</Text></Text>})`,
}

function graph(
  runtime: boolean,
  sceneSource = sources.scene,
  textStatic = false,
  labelSource = sources.label,
) {
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
  const load = (name: string): Record<string, unknown> => {
    if (cache.has(name)) return cache.get(name)!
    const output = transformHozoSource(
      name === 'scene' ? sceneSource : name === 'label' ? labelSource : sources[name],
      `${name}.tsx`,
      undefined,
      {
        ...compiler,
        compileNativeModule(input, bindings, file) {
          return compiler.compileNativeModule(
            input,
            bindings,
            file,
            runtime ? { textInheritance: true, textStatic } : { textReference: true },
          )
        },
      },
    )!
    code[name] = output
    const js = transformSync(output, { loader: 'tsx', jsx: 'automatic', format: 'cjs' }).code
    const module = { exports: {} }
    new Function('require', 'module', 'exports', js)(
      (specifier: string) => {
        if (specifier.startsWith('fixture:')) return load(specifier.slice(8))
        if (specifier === 'react' || specifier === 'react/jsx-runtime') return require(specifier)
        if (specifier === 'react-native')
          return runtime
            ? shipped.native
            : { ...shipped.native, Text: reference.ReferenceText, View: reference.ReferenceView }
        if (specifier === '@hozo/core/generated/inherited-text')
          return { HozoInheritedText: shipped.HozoInheritedText }
        if (specifier === '@hozo/core/generated/inherited-view')
          return { HozoInheritedView: shipped.HozoInheritedView }
        throw new Error(`Unexpected generated dependency ${specifier}`)
      },
      module,
      module.exports,
    )
    cache.set(name, module.exports)
    return module.exports
  }
  return { Scene: load('scene').Scene, code, shipped }
}

test('actual cross-file generated ABI matches the private oracle across owner updates, override removal, refs and grouping', () => {
  const records = []
  for (const mode of ['reference', 'runtime', 'optimized']) {
    const runtime = mode !== 'reference'
    const fixture = graph(runtime, sources.scene, mode === 'optimized')
    const textRef = React.createRef(),
      viewRef = React.createRef()
    const onLayout = () => {}
    let tree: ReturnType<typeof renderer.create>
    const props = {
      frame: REST,
      own: undefined as object | undefined,
      tick: 0,
      textRef,
      viewRef,
      onLayout,
    }
    const scene = () => React.createElement(fixture.Scene, props)
    try {
      renderer.act(() => {
        tree = renderer.create(scene(), {
          createNodeMock: (node: { props: { testID: string } }) => ({ id: node.props.testID }),
        })
      })
      const hosts = () => tree.root.findAll((node: { type: unknown }) => node.type === 'NativeText')
      const first = hosts()[0],
        textInstance = textRef.current,
        viewInstance = viewRef.current
      assert.deepEqual(textInstance, { id: 'label' })
      assert.deepEqual(viewInstance, { id: 'owner' })
      const stages = []
      const check = (expected: object) => {
        const texts = hosts()
        const root = flatten(texts[0].props.style),
          nested = flatten(texts[1].props.style)
        const frame = Object.fromEntries(
          Object.entries(expected).filter(([name]) =>
            TEXT_REFERENCE_FIELDS.includes(name as (typeof TEXT_REFERENCE_FIELDS)[number]),
          ),
        )
        assert.deepEqual(root, frame)
        assert.deepEqual(nested, { ...frame, color: '#1355bb', fontWeight: '500' })
        assert.equal(texts[0], first)
        assert.equal(textRef.current, textInstance)
        assert.equal(viewRef.current, viewInstance)
        assert.equal(texts[0].props.accessibilityLabel, `1:${props.tick}`)
        const views = tree.root.findAll((node: { type: unknown }) => node.type === 'NativeView')
        assert.equal(views.length, 2, 'providers must not add native boxes')
        assert.deepEqual(views[0].props.style, { width: 240, padding: 12 })
        assert.equal(views[0].props.onLayout, onLayout, 'one existing host callback')
        stages.push({
          root,
          nested,
          label: texts[0].props.accessibilityLabel,
          hosts: [views.length, texts.length],
        })
      }
      check(REST)
      props.frame = NEXT
      renderer.act(() => tree.update(scene()))
      check(NEXT)
      props.own = OWN
      renderer.act(() => tree.update(scene()))
      check({ ...NEXT, ...OWN })
      props.own = { color: undefined, fontSize: undefined }
      renderer.act(() => tree.update(scene()))
      check(NEXT)
      props.tick++
      renderer.act(() => tree.update(scene()))
      check(NEXT)
      props.frame = REST
      renderer.act(() => tree.update(scene()))
      check(REST)
      records.push(stages)
      if (runtime) {
        assert.match(fixture.code.scene, /@hozo\/core\/generated\/inherited-view/)
        assert.match(fixture.code.label, /@hozo\/core\/generated\/inherited-text/)
        assert.doesNotMatch(fixture.code.label, /ReferenceText|fixture:reference/)
      }
    } finally {
      renderer.act(() => tree?.unmount())
    }
    assert.equal(textRef.current, null)
    assert.equal(viewRef.current, null)
  }
  assert.deepEqual(records[1], records[0])
  assert.deepEqual(records[2], records[0])
  assert.equal(REST.color, '#112233', 'normalizing a View must not edit the authored style')
})

test('proved production memo Text keeps ordinary host output, state and refs with zero inheritance helpers', () => {
  // The counting mock deliberately does not emulate RN attributed strings.
  // Retain actual props separately; this projection is not device evidence.
  const projectHosts = (node: TextHostJson): TextHostJson => {
    if (node === null || typeof node === 'string') return node
    if (Array.isArray(node)) return node.map(projectHosts)
    return {
      ...node,
      type: node.type === 'NativeText' ? 'Text' : node.type,
      children: node.children?.map(projectHosts) ?? null,
    }
  }
  const label = sources.label.replace(
    '<Text ref=',
    '<Text className="text-[#111111] text-[22px] font-semibold leading-[32px] tracking-[1px] text-left uppercase" ref=',
  )
  const expected = {
    color: '#111111',
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 32,
    letterSpacing: 1,
    textAlign: 'left',
    textTransform: 'uppercase',
  }
  const records = []
  for (const optimized of [false, true]) {
    const fixture = graph(true, sources.scene, optimized, label)
    if (optimized) {
      assert.doesNotMatch(fixture.code.label, /HozoInheritedText|generated\/inherited-text/)
      assert.match(fixture.code.label, /from 'react-native'/)
    } else assert.match(fixture.code.label, /generated\/inherited-text/)
    // Removing a Text region must not erase the opaque/dynamic View owners.
    assert.match(fixture.code.scene, /generated\/inherited-view/)
    const textRef = React.createRef()
    let tree: ReturnType<typeof renderer.create>
    let first: unknown, firstRef: unknown
    const stages = []
    try {
      for (const [step, { tick, frame }] of [
        { tick: 0, frame: REST },
        { tick: 0, frame: NEXT },
        { tick: 1, frame: NEXT },
        { tick: 0, frame: REST },
      ].entries()) {
        renderer.act(() => {
          const element = React.createElement(fixture.Scene, { frame, tick, textRef })
          if (tree) tree.update(element)
          else
            tree = renderer.create(element, {
              createNodeMock: (node: { props: { testID: string } }) => ({ id: node.props.testID }),
            })
        })
        const hosts = tree.root.findAll((node: { type: unknown }) => node.type === 'NativeText')
        assert.equal(hosts.length, 2)
        assert.deepEqual(flatten(hosts[0].props.style), expected)
        const nestedExpected = {
          ...expected,
          color: '#1355bb',
          fontWeight: '500',
        }
        assert.deepEqual(
          flatten(hosts[1].props.style),
          optimized ? { color: '#1355bb', fontWeight: '500' } : nestedExpected,
        )
        const projected = projectNativeText(projectHosts(tree.toJSON()), flatten)
        assert.deepEqual(projected, { label: expected, nested: nestedExpected })
        assert.equal(hosts[0].props.accessibilityLabel, `1:${tick}`)
        assert.deepEqual(textRef.current, { id: 'label' })
        if (step === 0) {
          first = hosts[0]
          firstRef = textRef.current
        }
        assert.equal(hosts[0], first)
        assert.equal(textRef.current, firstRef)
        assert.equal(
          tree.root.findAllByType(fixture.shipped.HozoInheritedText).length,
          optimized ? 0 : 2,
        )
        assert.equal(
          tree.root.findAll((node: { type: unknown }) => node.type === 'NativeView').length,
          2,
        )
        stages.push(
          hosts.map(
            (host: { props: { style: unknown; accessibilityLabel: string; testID: string } }) => ({
              style: projected[host.props.testID],
              label: host.props.accessibilityLabel,
            }),
          ),
        )
      }
      records.push(stages)
    } finally {
      renderer.act(() => tree?.unmount())
    }
    assert.equal(textRef.current, null)
  }
  assert.deepEqual(records[1], records[0])
})

test('compiler-inserted raw Text reads effective View overrides rather than copying static owner classes', () => {
  const fixture = graph(
    true,
    `import {View} from '@hozo/core';export const Scene=({frame})=><View className="text-red-500 text-[12px]" style={frame}>Raw</View>`,
  )
  let tree: ReturnType<typeof renderer.create>
  try {
    for (const frame of [REST, NEXT]) {
      renderer.act(() => {
        const scene = React.createElement(fixture.Scene, { frame })
        if (tree) tree.update(scene)
        else tree = renderer.create(scene)
      })
      const texts = tree.root.findAll((node: { type: unknown }) => node.type === 'NativeText')
      assert.equal(texts.length, 1)
      assert.equal(flatten(texts[0].props.style).color, frame.color)
      assert.equal(flatten(texts[0].props.style).fontSize, frame.fontSize)
    }
    assert.doesNotMatch(fixture.code.scene, /<Text\b/)
  } finally {
    renderer.act(() => tree?.unmount())
  }
})

test('Metro executes mixed native and runtime Text bindings from the same authored import', () => {
  const label = `${sources.label.replace(
    '<Text ref=',
    '<Text className="text-[#111111] text-[22px] font-semibold leading-[32px] tracking-[1px] text-left uppercase" ref=',
  )};export const Open=memo(()=> <Text testID="open">Open</Text>)`
  const scene = `import {View} from '@hozo/core';import {Label,Open} from 'fixture:label';
export const Scene=({frame})=> <View style={frame}><Label tick={0}/><Open/></View>`
  const fixture = graph(true, scene, true, label)
  assert.match(fixture.code.label, /<Text\b/)
  assert.match(fixture.code.label, /<HozoInheritedText\b/)
  let tree: ReturnType<typeof renderer.create>
  try {
    for (const frame of [REST, NEXT, REST]) {
      renderer.act(() => {
        const element = React.createElement(fixture.Scene, { frame })
        if (tree) tree.update(element)
        else tree = renderer.create(element)
      })
      const hosts = tree.root.findAll((node: { type: unknown }) => node.type === 'NativeText')
      assert.equal(hosts.length, 3)
      assert.equal(flatten(hosts[0].props.style).fontSize, 22)
      assert.equal(hosts[0].props.accessibilityLabel, '1:0')
      assert.equal(flatten(hosts[2].props.style).fontSize, frame.fontSize)
      assert.equal(flatten(hosts[2].props.style).color, frame.color)
      assert.equal(tree.root.findAllByType(fixture.shipped.HozoInheritedText).length, 1)
    }
  } finally {
    renderer.act(() => tree?.unmount())
  }
})

test('the shipped View normalizes only raw scalars and rejects unassessed animated/callback values', () => {
  const runtime = loadTextInheritanceRuntime(React.createContext(14))
  let tree: ReturnType<typeof renderer.create>
  try {
    renderer.act(() => {
      tree = renderer.create(
        React.createElement(
          runtime.HozoInheritedView,
          { style: REST },
          'Raw',
          0,
          React.createElement(
            'NativeView',
            { testID: 'opaque-box' },
            React.createElement(runtime.HozoInheritedText, { testID: 'inside' }, 'Inside'),
          ),
        ),
      )
    })
    const texts = tree.root.findAll((node: { type: unknown }) => node.type === 'NativeText')
    assert.equal(texts.length, 3)
    assert.ok(
      texts.every(
        (node: { props: { style: unknown } }) => flatten(node.props.style).fontSize === 20,
      ),
    )
    assert.equal(
      tree.root.findAll((node: { type: unknown }) => node.type === 'NativeView').length,
      2,
    )
  } finally {
    renderer.act(() => tree?.unmount())
  }
  for (const style of [
    () => ({ color: '#123456' }),
    { color: { animated: true } },
    { fontSize: '20px' },
    { fontSize: Number.NaN },
    { fontFamily: 'Custom' },
    { fontVariant: ['small-caps'] },
    { fontStyle: 'italic' },
  ])
    assert.throws(
      () =>
        renderer.act(() =>
          renderer.create(React.createElement(runtime.HozoInheritedText, { style }, 'Unassessed')),
        ),
      /does not assess/,
    )
})

test('default output needs no inherited ABI and existing import collision checks protect opt-in output', () => {
  const compiler = createCompiler()
  const source = `import {View,Text} from '@hozo/core';export const Label=()=> <View><Text className="text-red-500">Label</Text></View>`
  const before = transformHozoSource(source, 'default.tsx', undefined, compiler)
  assert.doesNotMatch(before!, /Inherited|text-inheritance-protocol/)
  const opted = {
    ...compiler,
    compileNativeModule(input: string) {
      return compiler.compileNativeModule(input, undefined, undefined, { textInheritance: true })
    },
  }
  assert.match(transformHozoSource(source, 'opted.tsx', undefined, opted)!, /HozoInheritedText/)
  assert.equal(transformHozoSource(source, 'default.tsx', undefined, compiler), before)
  assert.throws(
    () =>
      transformHozoSource(
        `const HozoInheritedText=()=>null;${source}`,
        'collision.tsx',
        undefined,
        opted,
      ),
    /HozoInheritedText/,
  )
})
