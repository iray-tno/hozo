// Actual compiler + Metro + shipped leaf code, with mock Native hosts only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildSync, transformSync } from 'esbuild'
import { createCompiler } from '../../compiler/src/index.ts'
import { transformHozoSource } from '../../metro/src/transform.ts'
import { loadNativePortal } from './portal-native-host.ts'
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
  preflight?: boolean,
  labels = false,
  chips = false,
) {
  const legacy = React.createContext(14)
  const shipped = loadTextInheritanceRuntime(legacy, undefined, labels, chips)
  const reference = createTextReference({
    react: React,
    Text: 'NativeText' as never,
    View: 'NativeView' as never,
    HozoPressable: labels ? shipped.HozoPressable! : ('Unused' as never),
    HozoTextSizeContext: legacy,
    // The independent inheritance model still consumes the real owner's facts.
    // A fresh Context here would silently pin every reference label to idle.
    HozoInteractionContext: labels ? shipped.HozoInteractionContext! : React.createContext(null),
    flattenStyle: flatten,
    renderViewStyle(style) {
      const result = flatten(style)
      for (const name of TEXT_REFERENCE_FIELDS) delete result[name]
      return result
    },
  })
  const compiler = createCompiler(preflight === undefined ? undefined : { colors: [], preflight })
  const ReferenceChip = (props) =>
    React.createElement(shipped.HozoChip, {
      ...props,
      hozoInheritedLabel: reference.ReferenceLabel,
      hozoInheritedText: reference.ReferenceText,
    })
  // The independent reference keeps using the pre-existing relative helper,
  // with only its native Text host bound to the private contextual oracle.
  const relativeModule = { exports: {} }
  const relativeCode = transformSync(
    readFileSync(
      new URL('../../primitives/src/runtime-text-size.native.tsx', import.meta.url),
      'utf8',
    ),
    { loader: 'tsx', jsx: 'automatic', format: 'cjs' },
  ).code
  new Function('require', 'module', 'exports', relativeCode)(
    (name: string) => {
      if (name === 'react-native') return { ...shipped.native, Text: reference.ReferenceText }
      if (name === '@hozo/engine') return { HozoTextSizeContext: legacy }
      return require(name)
    },
    relativeModule,
    relativeModule.exports,
  )
  const code: Record<string, string> = {}
  const cache = new Map<string, Record<string, unknown>>()
  let portal: ReturnType<typeof loadNativePortal> | undefined
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
        if (specifier === '@hozo/engine/generated/text-inheritance-protocol')
          return {
            HozoInheritedMetricsContext: shipped.HozoInheritedMetricsContext,
            HozoInheritedPaintContext: shipped.HozoInheritedPaintContext,
          }
        if (specifier === '@hozo/behaviors')
          return (portal ??= loadNativePortal({ View: shipped.native.View }))
        if (specifier === 'react-native')
          return runtime
            ? shipped.native
            : { ...shipped.native, Text: reference.ReferenceText, View: reference.ReferenceView }
        if (specifier === '@hozo/core/generated/inherited-text')
          return { HozoInheritedText: shipped.HozoInheritedText }
        if (specifier === '@hozo/core/generated/inherited-label')
          return { HozoInheritedLabel: shipped.HozoInheritedLabel }
        if (specifier === '@hozo/core/generated/chip')
          return { HozoChip: runtime ? shipped.HozoChip : ReferenceChip }
        if (specifier === '@hozo/core/generated/inherited-pressable')
          return { HozoInheritedPressable: shipped.HozoInheritedPressable }
        if (specifier === '@hozo/core/generated/pressable')
          return { HozoPressable: reference.ReferencePressable }
        if (specifier === '@hozo/core/generated/inherited-relative-text')
          return { HozoInheritedRelativeText: shipped.HozoInheritedRelativeText }
        if (specifier === '@hozo/core/generated/text-size') return relativeModule.exports
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
  return { Scene: load('scene').Scene, getLabel: () => load('label').Label, code, shipped }
}

test('generated standalone Chip publishes only its resolved label through opaque children', () => {
  const source = `import {View,Chip} from '@hozo/core';import {Label} from 'fixture:label';export const Scene=({host,chipOwn,childOwn,onSelectedChange,note})=> <View style={host}><Chip testID="chip" defaultSelected={false} onSelectedChange={onSelectedChange} accessibilityLabel="Filter" className="p-4 text-[#1355bb] text-[18px] hover:text-[#00aa00] active:text-[#cc0000] focus:font-semibold" style={chipOwn}><View><Label id="target" own={childOwn} note={note}/></View>{0}</Chip><Chip defaultSelected={false} className="text-[#abcdef] text-[24px]"><Label id="sibling" note={note}/></Chip></View>`
  const label = `import {Text} from '@hozo/core';import {memo,useState} from 'react';let next=0;export const Label=memo(({id,own,note})=>{note(id);const [token]=useState(()=>++next);return <Text testID={id} nativeID={'mount:'+token} style={own}>Label</Text>})`
  const records = []
  for (const mode of ['reference', 'runtime', 'optimized']) {
    const fixture = graph(
      mode !== 'reference',
      source,
      mode === 'optimized',
      label,
      undefined,
      true,
      true,
    )
    let tree: ReturnType<typeof renderer.create>
    let host = REST,
      chipOwn: object | undefined,
      childOwn: object | undefined
    const changes = []
    const renders = { target: 0, sibling: 0 }
    const note = (id) => renders[id]++
    const onSelectedChange = (value) => changes.push(value)
    const scene = () =>
      React.createElement(fixture.Scene, { host, chipOwn, childOwn, onSelectedChange, note })
    const stages = []
    try {
      renderer.act(() => {
        tree = renderer.create(scene())
      })
      const button = () =>
        tree.root.findAll((node) => node.type === 'Pressable' && node.props.testID === 'chip')[0]
      const text = (id) =>
        tree.root.findAll((node) => node.type === 'NativeText' && node.props.testID === id)[0]
      const first = text('target'),
        sibling = text('sibling'),
        control = button(),
        marker = first.props.nativeID
      const check = (state = {}) => {
        const ownerFrame = {
          ...Object.fromEntries(TEXT_REFERENCE_FIELDS.map((key) => [key, host[key]])),
          color: '#1355bb',
          fontSize: 18,
          ...state,
          ...chipOwn,
        }
        const expected = { ...ownerFrame, ...childOwn }
        assert.deepEqual(flatten(first.props.style), expected, mode)
        assert.equal(text('target') === first, true, 'stable target host')
        assert.equal(text('sibling') === sibling, true, 'stable sibling host')
        assert.equal(button() === control, true, 'same actual control')
        assert.equal(first.props.nativeID, marker)
        assert.deepEqual(flatten(sibling.props.style), {
          ...Object.fromEntries(TEXT_REFERENCE_FIELDS.map((key) => [key, host[key]])),
          color: '#abcdef',
          fontSize: 24,
        })
        assert.equal(tree.root.findAllByType('Pressable').length, 2)
        assert.equal(tree.root.findAllByType('NativeView').length, 2)
        const zero = tree.root
          .findAllByType('NativeText')
          .find((node) => node.children.length === 1 && node.children[0] === '0')
        assert.ok(zero, 'raw zero is normalized only once at the label')
        assert.deepEqual(flatten(zero.props.style), ownerFrame)
        assert.equal(fixture.shipped.native.Animated.__hozoTimings.length, 0)
        stages.push(expected)
      }
      check()
      assert.equal(button().props.accessibilityRole, 'togglebutton')
      assert.equal(button().props.accessibilityLabel, 'Filter')
      assert.equal(button().props.accessibilityState.checked, false)
      const restingRenders = { ...renders }
      host = { ...REST, color: '#eecc00' }
      renderer.act(() => tree.update(scene()))
      check()
      assert.deepEqual(
        renders,
        restingRenders,
        'effective local colors shield stable opaque labels',
      )
      renderer.act(() => button().props.onHoverIn({}))
      check({ color: '#00aa00' })
      renderer.act(() => button().props.onPressIn({}))
      check({ color: '#cc0000' })
      renderer.act(() => button().props.onPress({}))
      assert.deepEqual(changes, [true])
      assert.equal(button().props.accessibilityState.checked, true)
      renderer.act(() => button().props.onPressOut({}))
      check({ color: '#00aa00' })
      renderer.act(() => button().props.onFocus({}))
      check({ color: '#00aa00', fontWeight: '600' })
      chipOwn = OWN
      renderer.act(() => tree.update(scene()))
      check({ color: '#00aa00', fontWeight: '600' })
      childOwn = { color: '#eecc00', fontSize: 10 }
      renderer.act(() => tree.update(scene()))
      check({ color: '#00aa00', fontWeight: '600' })
      host = NEXT
      renderer.act(() => tree.update(scene()))
      check({ color: '#00aa00', fontWeight: '600' })
      childOwn = undefined
      chipOwn = undefined
      renderer.act(() => tree.update(scene()))
      check({ color: '#00aa00', fontWeight: '600' })
      renderer.act(() => {
        button().props.onHoverOut({})
        button().props.onBlur({})
      })
      check()
    } finally {
      renderer.act(() => tree?.unmount())
    }
    records.push(stages)
  }
  assert.deepEqual(records[1], records[0])
  assert.deepEqual(records[2], records[0])
})

test('Chip label integration adds no resolver calls or event owners to the existing string path', () => {
  const api = loadTextInheritanceRuntime(React.createContext(14), undefined, true, true)
  const counts = []
  for (const inherit of [false, true]) {
    const snapshots = []
    let tree: ReturnType<typeof renderer.create>
    try {
      renderer.act(() => {
        tree = renderer.create(
          React.createElement(
            api.HozoChip,
            {
              defaultSelected: false,
              hozoInheritedLabel: inherit ? api.HozoInheritedLabel : undefined,
              hozoStyle: (state) => {
                snapshots.push({ ...state })
                return { color: state.hovered ? '#00aa00' : '#1355bb', padding: 4 }
              },
            },
            'Label',
          ),
        )
      })
      const host = () => tree.root.findByType('Pressable')
      const check = (color) => {
        assert.deepEqual(flatten(host().props.style({ pressed: false })), { padding: 4 })
        assert.equal(tree.root.findAllByType('Pressable').length, 1)
        assert.equal(tree.root.findAllByType('NativeView').length, 0)
        assert.equal(flatten(tree.root.findByType('NativeText').props.style).color, color)
        counts.push(snapshots.length)
      }
      check('#1355bb')
      renderer.act(() => host().props.onHoverIn({}))
      check('#00aa00')
      renderer.act(() => host().props.onHoverOut({}))
      check('#1355bb')
    } finally {
      renderer.act(() => tree?.unmount())
    }
  }
  assert.deepEqual(counts.slice(0, 3), [2, 4, 6])
  assert.deepEqual(counts.slice(3), counts.slice(0, 3))
  for (const props of [{}, { defaultSelected: false, onRemove: () => {} }]) {
    let tree: ReturnType<typeof renderer.create>
    try {
      assert.throws(
        () =>
          renderer.act(() => {
            tree = renderer.create(
              React.createElement(
                api.HozoChip,
                { ...props, hozoInheritedLabel: api.HozoInheritedLabel },
                'Label',
              ),
            )
          }),
        /requires both label and Text bindings/,
      )
    } finally {
      renderer.act(() => tree?.unmount())
    }
  }
})

test('generated composite Chip scopes resolved row and removal values to their actual owners', () => {
  const label = `import {Text} from '@hozo/core';import {memo,useState} from 'react';let next=0;export const Label=memo(({id,own})=>{const [token]=useState(()=>++next);return <Text testID={id} nativeID={'mount:'+token} style={own}>Label</Text>})`
  for (const selectable of [false, true]) {
    const source = `import {View,Chip} from '@hozo/core';import {Label} from 'fixture:label';export const Scene=({host,rowOwn,removeOwn,childOwn,onRemove,onSelectedChange,disabled})=> <View style={host}><Chip testID="row" ${selectable ? 'defaultSelected={false} onSelectedChange={onSelectedChange}' : ''} onRemove={onRemove} disabled={disabled} accessibilityLabel="Filter" className="p-4 text-[#1355bb] text-[18px] hover:text-[#00aa00] active:text-[#cc0000] focus:font-semibold" style={rowOwn} removeStyle={removeOwn} removeClassName="p-2 focus:text-[#eecc00] active:font-bold" removeIcon={<Label id="icon" own={childOwn}/>}><Label id="label"/></Chip></View>`
    const records = []
    for (const mode of ['reference', 'runtime', 'optimized']) {
      const fixture = graph(
        mode !== 'reference',
        source,
        mode === 'optimized',
        label,
        undefined,
        true,
        true,
      )
      let tree: ReturnType<typeof renderer.create>
      let host = REST,
        rowOwn: object | undefined,
        removeOwn: object | undefined,
        childOwn: object | undefined,
        disabled = false
      const removed = [],
        changes = [],
        stages = []
      const onRemove = () => removed.push(true)
      const onSelectedChange = (value) => changes.push(value)
      const scene = () =>
        React.createElement(fixture.Scene, {
          host,
          rowOwn,
          removeOwn,
          childOwn,
          disabled,
          onRemove,
          onSelectedChange,
        })
      try {
        renderer.act(() => {
          tree = renderer.create(scene())
        })
        const text = (id) =>
          tree.root.findAll((node) => node.type === 'NativeText' && node.props.testID === id)[0]
        const control = (role) =>
          tree.root.findAll(
            (node) => node.type === 'Pressable' && node.props.accessibilityRole === role,
          )[0]
        const row = () =>
          tree.root.findAll((node) => node.type === 'NativeView' && node.props.testID === 'row')[0]
        const firstLabel = text('label'),
          firstIcon = text('icon'),
          firstRemove = control('button'),
          firstRow = row()
        const check = (rowState = {}, removeState = {}) => {
          const frame = {
            ...Object.fromEntries(TEXT_REFERENCE_FIELDS.map((key) => [key, host[key]])),
            color: '#1355bb',
            fontSize: 18,
            ...rowState,
            ...rowOwn,
          }
          assert.deepEqual(flatten(text('label').props.style), frame, `${mode}: label`)
          const expectedIcon = { ...frame, ...removeState, ...removeOwn, ...childOwn }
          assert.deepEqual(flatten(text('icon').props.style), expectedIcon, `${mode}: removal icon`)
          assert.equal(text('label') === firstLabel, true)
          assert.equal(text('icon') === firstIcon, true)
          assert.equal(control('button') === firstRemove, true)
          assert.equal(row() === firstRow, true)
          assert.equal(tree.root.findAllByType('Pressable').length, selectable ? 2 : 1)
          assert.equal(tree.root.findAllByType('NativeView').length, 2)
          assert.equal(
            tree.root.findAllByType('NativeText').length,
            selectable ? 3 : 4,
            'only the existing passive/icon Text wrappers',
          )
          const rowBox = flatten(row().props.style)
          assert.equal(rowBox.padding ?? rowBox.paddingTop, 16)
          const removeBox = flatten(control('button').props.style({ pressed: false }))
          assert.equal(removeBox.padding ?? removeBox.paddingTop, 8)
          assert.equal(removeBox.color, undefined)
          const hidden = tree.root.findAll(
            (node) => node.type === 'NativeText' && node.props.accessibilityElementsHidden,
          )[0]
          assert.equal(hidden.props.importantForAccessibility, 'no-hide-descendants')
          assert.equal(control('button').props.accessibilityLabel, 'Remove Filter')
          assert.deepEqual(control('button').props.accessibilityState, { disabled })
          assert.equal(fixture.shipped.native.Animated.__hozoTimings.length, 0)
          stages.push({ label: frame, icon: expectedIcon })
        }
        check()
        renderer.act(() => control('button').props.onFocus({}))
        check({}, { color: '#eecc00' })
        renderer.act(() => control('button').props.onHoverIn({}))
        check({ color: '#00aa00' }, { color: '#eecc00' })
        renderer.act(() => control('button').props.onPressIn({}))
        check({ color: '#cc0000' }, { color: '#eecc00', fontWeight: '700' })
        renderer.act(() => control('button').props.onPress({}))
        assert.deepEqual(removed, [true])
        assert.deepEqual(changes, [], 'removing does not toggle')
        renderer.act(() => control('button').props.onPressOut({}))
        check({ color: '#00aa00' }, { color: '#eecc00' })
        if (selectable) {
          renderer.act(() => control('togglebutton').props.onFocus({}))
          check({ color: '#00aa00' }, { color: '#eecc00' })
          renderer.act(() => control('togglebutton').props.onHoverIn({}))
          renderer.act(() => control('button').props.onHoverOut({}))
          check({ color: '#00aa00' }, { color: '#eecc00' })
          renderer.act(() => control('togglebutton').props.onPress({}))
          assert.deepEqual(changes, [true])
          assert.equal(control('togglebutton').props.accessibilityState.checked, true)
          renderer.act(() => control('togglebutton').props.onHoverOut({}))
        } else {
          renderer.act(() => control('button').props.onHoverOut({}))
        }
        check({}, { color: '#eecc00' })
        rowOwn = OWN
        removeOwn = { color: '#ff00aa', fontSize: 12 }
        renderer.act(() => tree.update(scene()))
        check({}, { color: '#eecc00' })
        childOwn = { color: '#222222', fontSize: 10 }
        host = NEXT
        renderer.act(() => tree.update(scene()))
        check({}, { color: '#eecc00' })
        renderer.act(() => control('button').props.onBlur({}))
        check()
        rowOwn = undefined
        removeOwn = undefined
        childOwn = undefined
        renderer.act(() => tree.update(scene()))
        check()
        renderer.act(() => row().props.onPointerEnter({}))
        check({ color: '#00aa00' })
        const touch = { nativeEvent: { changedTouches: [{ identifier: 1 }] } }
        renderer.act(() => row().props.onTouchStartCapture(touch))
        check({ color: '#cc0000' })
        disabled = true
        renderer.act(() => tree.update(scene()))
        check({ color: '#00aa00' })
        renderer.act(() => row().props.onPointerLeave({}))
        check()
      } finally {
        renderer.act(() => tree?.unmount())
      }
      assert.equal(stages.length, selectable ? 16 : 14)
      records.push(stages)
    }
    assert.deepEqual(records[1], records[0])
    assert.deepEqual(records[2], records[0])
  }
})

test('Chip row integration preserves ordinary resolver counts, host topology and scalar normalization', () => {
  const api = loadTextInheritanceRuntime(React.createContext(14), undefined, true, true)
  for (const selectable of [false, true]) {
    for (const removable of [false, true]) {
      const records = []
      for (const inherit of [false, true]) {
        let tree: ReturnType<typeof renderer.create>
        const counts = { row: 0, remove: 0 },
          stages = []
        try {
          renderer.act(() => {
            tree = renderer.create(
              React.createElement(
                api.HozoChip,
                {
                  ...(selectable ? { defaultSelected: false } : {}),
                  onRemove: removable ? () => {} : undefined,
                  removeIcon: 0,
                  hozoInheritedLabel: inherit ? api.HozoInheritedLabel : undefined,
                  hozoInheritedText: inherit ? api.HozoInheritedText : undefined,
                  hozoStyle: (state) => {
                    counts.row++
                    return { color: state.hovered ? '#00aa00' : '#1355bb', padding: 4 }
                  },
                  hozoRemoveStyle: (state) => {
                    counts.remove++
                    return { color: state.focused ? '#ff00aa' : '#abcdef', padding: 8 }
                  },
                },
                'Label',
              ),
            )
          })
          const controls = () => tree.root.findAllByType('Pressable')
          const check = () => {
            for (const control of controls()) {
              const style = flatten(control.props.style({ pressed: false }))
              assert.deepEqual(
                style,
                control.props.accessibilityRole === 'button'
                  ? { padding: 8 }
                  : removable
                    ? {}
                    : { padding: 4 },
              )
            }
            const hosts = tree.root.findAll((node) => typeof node.type === 'string')
            assert.equal(controls().length, Number(selectable) + Number(removable))
            assert.equal(
              tree.root.findAllByType('NativeView').length,
              selectable && !removable ? 0 : 1,
            )
            assert.equal(tree.root.findAllByType('NativeText').length, removable ? 2 : 1)
            const text = (value) =>
              tree.root.findAll(
                (node) => node.type === 'NativeText' && node.children[0] === value,
              )[0]
            assert.ok(text('Label'))
            if (removable) assert.ok(text('0'))
            stages.push({
              counts: { ...counts },
              hosts: hosts.map((node) => node.type),
              label: flatten(text('Label').props.style).color,
              icon: removable ? flatten(text('0').props.style).color : null,
            })
          }
          check()
          if (removable) {
            const remove = () =>
              controls().find((node) => node.props.accessibilityRole === 'button')
            renderer.act(() => remove().props.onHoverIn({}))
            check()
            renderer.act(() => remove().props.onFocus({}))
            check()
            renderer.act(() => {
              remove().props.onHoverOut({})
              remove().props.onBlur({})
            })
            check()
          }
        } finally {
          renderer.act(() => tree?.unmount())
        }
        records.push(stages)
      }
      assert.deepEqual(
        records[1],
        records[0],
        `${selectable}/${removable}: ordinary versus contextual`,
      )
    }
  }
})

test('passive Chip retains its existing Text host and inherits across an opaque label', () => {
  const source = `import {View,Chip} from '@hozo/core';import {Label} from 'fixture:label';export const Scene=({host})=><View style={host}><Chip testID="row" className="text-[#1355bb]"><Label/></Chip></View>`
  for (const mode of ['reference', 'runtime', 'optimized']) {
    const fixture = graph(
      mode !== 'reference',
      source,
      mode === 'optimized',
      sources.label,
      undefined,
      true,
      true,
    )
    let tree: ReturnType<typeof renderer.create>
    try {
      renderer.act(() => {
        tree = renderer.create(React.createElement(fixture.Scene, { host: REST }))
      })
      const target = () =>
        tree.root.findAll((node) => node.type === 'NativeText' && node.props.testID === 'label')[0]
      const first = target()
      const check = (host) => {
        assert.equal(target() === first, true)
        assert.deepEqual(flatten(target().props.style), {
          ...Object.fromEntries(TEXT_REFERENCE_FIELDS.map((key) => [key, host[key]])),
          color: '#1355bb',
        })
        assert.equal(tree.root.findAllByType('NativeText').length, 3)
        assert.equal(tree.root.findAllByType('NativeView').length, 2)
        assert.equal(tree.root.findAllByType('Pressable').length, 0)
      }
      check(REST)
      renderer.act(() => tree.update(React.createElement(fixture.Scene, { host: NEXT })))
      check(NEXT)
    } finally {
      renderer.act(() => tree?.unmount())
    }
  }
})

test('the ordinary Native Chip graph imports no inheritance helpers', () => {
  const result = buildSync({
    entryPoints: [fileURLToPath(new URL('../../patterns/src/chip.native.tsx', import.meta.url))],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'node',
    format: 'cjs',
    external: ['react', 'react/*', 'react-native', '@hozo/behaviors', '@hozo/engine'],
  })
  const files = Object.keys(result.metafile!.inputs)
  assert.ok(files.some((file) => file.endsWith('patterns/src/pressable.native.tsx')))
  assert.ok(
    files.every((file) => !file.includes('inherited-') && !file.includes('text-inheritance')),
  )
})

test('generated portal labels inherit the rendered destination, with inline fallback and stable updates', () => {
  const label = `import {Text,Small} from '@hozo/core';import {memo,useState} from 'react';let next=0;export const Label=memo(({own})=>{const [token]=useState(()=>++next);return <Text testID="label" nativeID={'mount:'+token} style={own}>Label<Small testID="small">Small</Small></Text>})`
  for (const provider of [false, true]) {
    for (const disabled of [false, true]) {
      const records = []
      for (const mode of ['reference', 'runtime', 'optimized']) {
        const content = `<View testID="opener" style={opener}><Portal disabled={disabled}><View testID="content"><Label own={own}/></View></Portal></View>`
        const source = `import {View} from '@hozo/core';import {Portal,PortalProvider} from '@hozo/behaviors';import {Label} from 'fixture:label';export const Scene=({host,opener,own,disabled})=> <View testID="destination" style={host}>${provider ? `<PortalProvider>${content}</PortalProvider>` : content}</View>`
        const fixture = graph(mode !== 'reference', source, mode === 'optimized', label)
        let tree: ReturnType<typeof renderer.create>
        let host = REST,
          opener = { ...REST, ...OWN },
          own: object | undefined
        const scene = () => React.createElement(fixture.Scene, { host, opener, own, disabled })
        const stages = []
        try {
          renderer.act(() => {
            tree = renderer.create(scene())
          })
          const text = (id: string) =>
            tree.root.findAll((node) => node.type === 'NativeText' && node.props.testID === id)[0]
          const first = text('label'),
            small = text('small'),
            marker = first.props.nativeID
          const registered = provider && !disabled
          const check = () => {
            const frame = registered ? host : opener
            const expected = {
              ...Object.fromEntries(TEXT_REFERENCE_FIELDS.map((key) => [key, frame[key]])),
              ...own,
            }
            assert.deepEqual(
              flatten(text('label').props.style),
              expected,
              `${mode}, provider=${provider}, disabled=${disabled}`,
            )
            const smallStyle = flatten(text('small').props.style)
            assert.equal(smallStyle.color, expected.color)
            assert.equal(smallStyle.fontSize, Math.round(Number(expected.fontSize) * (5 / 6)))
            assert.equal(text('label'), first)
            assert.equal(text('small'), small)
            assert.equal(first.props.nativeID, marker)
            assert.equal(tree.root.findAllByType('NativeView').length, registered ? 4 : 3)
            stages.push(expected)
          }
          check()
          opener = { ...opener, color: '#eecc00', fontSize: 42 }
          renderer.act(() => tree.update(scene()))
          check()
          host = NEXT
          renderer.act(() => tree.update(scene()))
          check()
          own = OWN
          renderer.act(() => tree.update(scene()))
          check()
          own = undefined
          renderer.act(() => tree.update(scene()))
          check()
        } finally {
          renderer.act(() => tree?.unmount())
        }
        records.push(stages)
      }
      assert.deepEqual(records[1], records[0])
      assert.deepEqual(records[2], records[0])
    }
  }
})

test('an explicitly rendered Native PortalHost uses its own compiled ancestor frame', () => {
  const source = `import {View} from '@hozo/core';import {PortalHost} from '@hozo/behaviors';export const Scene=({frame,items})=> <View style={frame}><PortalHost items={items}/></View>`
  const label = `import {Text} from '@hozo/core';import {memo,useState} from 'react';let next=0;export const Label=memo(()=>{const [token]=useState(()=>++next);return <Text testID="custom" nativeID={token}>Custom</Text>})`
  for (const mode of ['reference', 'runtime', 'optimized']) {
    const fixture = graph(mode !== 'reference', source, mode === 'optimized', label)
    const child = React.createElement(fixture.getLabel())
    const items = new Map([['same-entry', child]])
    let tree: ReturnType<typeof renderer.create>
    try {
      renderer.act(() => {
        tree = renderer.create(React.createElement(fixture.Scene, { frame: REST, items }))
      })
      const first = tree.root.findByType('NativeText'),
        marker = first.props.nativeID
      assert.equal(flatten(first.props.style).color, REST.color)
      renderer.act(() => tree.update(React.createElement(fixture.Scene, { frame: NEXT, items })))
      assert.equal(tree.root.findByType('NativeText'), first)
      assert.equal(first.props.nativeID, marker)
      assert.deepEqual(
        flatten(first.props.style),
        Object.fromEntries(TEXT_REFERENCE_FIELDS.map((key) => [key, NEXT[key]])),
      )
    } finally {
      renderer.act(() => tree?.unmount())
    }
  }
})

test('nested Native portal providers choose the nearest rendered destination without opener capture', () => {
  const source = `import {View} from '@hozo/core';import {Portal,PortalProvider} from '@hozo/behaviors';import {Label} from 'fixture:label';export const Scene=({outer,inner,opener})=> <View style={outer}><PortalProvider><View style={inner}><PortalProvider><View style={opener}><Portal><Label/></Portal></View></PortalProvider></View></PortalProvider></View>`
  const label = `import {Text} from '@hozo/core';import {memo,useState} from 'react';let next=0;export const Label=memo(()=>{const [token]=useState(()=>++next);return <Text testID="nearest" nativeID={token}>Nearest</Text>})`
  for (const mode of ['reference', 'runtime', 'optimized']) {
    const fixture = graph(mode !== 'reference', source, mode === 'optimized', label)
    let tree: ReturnType<typeof renderer.create>
    let outer = REST,
      inner: object = { ...REST, color: '#1355bb', fontSize: 24 }
    const scene = () => React.createElement(fixture.Scene, { outer, inner, opener: OWN })
    try {
      renderer.act(() => {
        tree = renderer.create(scene())
      })
      const first = tree.root.findByType('NativeText'),
        marker = first.props.nativeID
      const check = (frame: object) => {
        assert.equal(tree.root.findByType('NativeText'), first)
        assert.equal(first.props.nativeID, marker)
        assert.deepEqual(
          flatten(first.props.style),
          Object.fromEntries(TEXT_REFERENCE_FIELDS.map((key) => [key, frame[key]])),
        )
      }
      check(inner)
      outer = NEXT
      renderer.act(() => tree.update(scene()))
      check(inner)
      inner = { ...inner, color: undefined, fontSize: undefined }
      renderer.act(() => tree.update(scene()))
      check({ ...inner, color: NEXT.color, fontSize: NEXT.fontSize })
    } finally {
      renderer.act(() => tree?.unmount())
    }
  }
})

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

test('semantic relative owners publish effective typography through opaque memo/View boundaries', () => {
  const scene = `import {View,Text} from '@hozo/core';import {Heading,Small,Strong} from '@hozo/typography';import {Label} from 'fixture:label';
export function Scene({frame,own,smallRef}) {return <View testID="outer" style={frame}><Heading level={2} testID="heading"><Small ref={smallRef} testID="small" className="text-[#1355bb]" style={own}><Strong testID="strong"><View testID="inside"><Label/></View></Strong></Small></Heading></View>}`
  const label = `import {Text} from '@hozo/core';import {memo,useState} from 'react';let next=0;export const Label=memo(function Label(){const [id]=useState(()=>++next);return <Text testID="label" nativeID={'mount:'+id}>Label</Text>})`
  for (const preflight of [false, true]) {
    const records = []
    for (const mode of ['reference', 'runtime', 'optimized']) {
      const fixture = graph(mode !== 'reference', scene, mode === 'optimized', label, preflight)
      let tree: ReturnType<typeof renderer.create>
      const stages = []
      const smallRef = React.createRef()
      let smallInstance: unknown
      let first: unknown
      try {
        for (const [frame, own] of [
          [REST, undefined],
          [NEXT, undefined],
          [NEXT, { fontSize: 30, color: '#abcdef' }],
          [REST, { fontSize: 30, color: '#abcdef' }],
          [REST, { fontSize: undefined, color: undefined }],
          [REST, undefined],
        ] as const) {
          renderer.act(() => {
            const element = React.createElement(fixture.Scene, { frame, own, smallRef })
            if (tree) tree.update(element)
            else
              tree = renderer.create(element, {
                createNodeMock: (node: { props: { testID?: string } }) => ({
                  id: node.props.testID,
                }),
              })
          })
          const text = (id: string) =>
            tree.root.findAll(
              (node: { type: unknown; props: { testID?: string } }) =>
                node.type === 'NativeText' && node.props.testID === id,
            )[0]
          const heading = text('heading'),
            small = text('small'),
            strong = text('strong'),
            leaf = text('label')
          first ??= leaf
          smallInstance ??= smallRef.current
          assert.deepEqual(smallRef.current, { id: 'small' })
          assert.equal(smallRef.current, smallInstance, 'relative owner forwards a stable ref')
          assert.equal(leaf, first, 'ancestor changes and removing an override preserve the host')
          assert.equal(leaf.props.nativeID, 'mount:1')
          assert.equal(heading.props.accessibilityRole, 'header')
          const headingSize = preflight ? frame.fontSize : Math.round(frame.fontSize * 1.5)
          // RN flatten keeps explicitly present undefined fields, erasing
          // earlier own declarations. That differs from removing the style
          // object entirely (the next stage), which restores the class/ratio.
          const cleared = own !== undefined && own.fontSize === undefined
          const smallSize = cleared
            ? headingSize
            : (own?.fontSize ?? Math.round(headingSize * (preflight ? 0.8 : 1 / 1.2)))
          const color = cleared ? frame.color : (own?.color ?? '#1355bb')
          const expected = {
            ...Object.fromEntries(
              Object.entries(frame).filter(([name]) =>
                TEXT_REFERENCE_FIELDS.includes(name as (typeof TEXT_REFERENCE_FIELDS)[number]),
              ),
            ),
            fontSize: smallSize,
            fontWeight: '700',
            color,
          }
          assert.equal(flatten(heading.props.style).fontSize, headingSize)
          assert.equal(
            flatten(heading.props.style).fontWeight,
            preflight ? frame.fontWeight : '700',
          )
          assert.equal(flatten(small.props.style).fontSize, smallSize, `${mode}: small size`)
          assert.equal(flatten(small.props.style).color, color, `${mode}: small color`)
          for (const node of [strong, leaf])
            assert.deepEqual(flatten(node.props.style), expected, `${mode}: ${node.props.testID}`)
          const views = tree.root.findAll((node: { type: unknown }) => node.type === 'NativeView')
          assert.equal(views.length, 2, 'no added native layout hosts')
          assert.deepEqual(views[0].props.style, { width: 240, padding: 12 })
          assert.deepEqual(views[1].props.style, {})
          stages.push({
            heading: flatten(heading.props.style),
            small: flatten(small.props.style),
            strong: flatten(strong.props.style),
            label: flatten(leaf.props.style),
          })
        }
      } finally {
        renderer.act(() => tree?.unmount())
      }
      assert.equal(smallRef.current, null)
      records.push(stages)
    }
    assert.deepEqual(records[1], records[0], 'shipped helper agrees with independent reference')
    assert.deepEqual(records[2], records[0], 'unproved semantic roots retain runtime correctness')
  }
})

test('generated Button labels inherit across an opaque memo/View without duplicating the event owner', () => {
  const scene = `import {View,Button} from '@hozo/core';import {Label} from 'fixture:label';export const Scene=({frame,own,press,buttonRef})=> <View style={frame}><Button ref={buttonRef} testID="button" accessibilityLabel="Save" onPress={press} className="text-[#1355bb] text-[18px] p-4" style={own}><View><Label tick={0}/></View>Raw{0}</Button></View>`
  const records = []
  for (const mode of ['reference', 'runtime', 'optimized']) {
    const fixture = graph(
      mode !== 'reference',
      scene,
      mode === 'optimized',
      sources.label,
      undefined,
      true,
    )
    const buttonRef = React.createRef()
    const press = () => {}
    let tree: ReturnType<typeof renderer.create>
    let first: unknown, buttonInstance: unknown
    const stages = []
    try {
      for (const [frame, own] of [
        [REST, undefined],
        [NEXT, undefined],
        [NEXT, OWN],
        [REST, OWN],
        [REST, undefined],
      ] as const) {
        renderer.act(() => {
          const element = React.createElement(fixture.Scene, { frame, own, press, buttonRef })
          if (tree) tree.update(element)
          else
            tree = renderer.create(element, {
              createNodeMock: (node: { props: { testID?: string } }) => ({ id: node.props.testID }),
            })
        })
        const button = tree.root.findByType('Pressable')
        const label = tree.root.findAll(
          (node: { type: unknown; props: { testID?: string } }) =>
            node.type === 'NativeText' && node.props.testID === 'label',
        )[0]
        first ??= label
        buttonInstance ??= buttonRef.current
        assert.equal(label, first)
        assert.equal(buttonRef.current, buttonInstance)
        assert.deepEqual(buttonRef.current, { id: 'button' })
        assert.equal(button.props.onPress, press)
        assert.equal(button.props.accessibilityRole, 'button')
        assert.equal(button.props.accessibilityLabel, 'Save')
        assert.equal(button.props.hozoTextStyle, undefined)
        assert.equal(tree.root.findAllByType(fixture.shipped.HozoPressable).length, 1)
        assert.equal(tree.root.findAllByType('NativeView').length, 2)
        const expected = {
          ...Object.fromEntries(
            Object.entries(frame).filter(([name]) =>
              TEXT_REFERENCE_FIELDS.includes(name as (typeof TEXT_REFERENCE_FIELDS)[number]),
            ),
          ),
          fontSize: own?.fontSize ?? 18,
          color: own?.color ?? '#1355bb',
        }
        assert.deepEqual(flatten(label.props.style), expected)
        const style = button.props.style({ pressed: false })
        if (mode !== 'reference') {
          assert.deepEqual(flatten(style), {
            paddingTop: 16,
            paddingRight: 16,
            paddingBottom: 16,
            paddingLeft: 16,
          })
          const texts = tree.root.findAllByType('NativeText')
          assert.ok(texts.some((node: { children: unknown[] }) => node.children.includes('Raw')))
          assert.ok(texts.some((node: { children: unknown[] }) => node.children.includes('0')))
        }
        stages.push(flatten(label.props.style))
      }
    } finally {
      renderer.act(() => tree?.unmount())
    }
    assert.equal(buttonRef.current, null)
    records.push(stages)
  }
  assert.deepEqual(records[1], records[0])
  assert.deepEqual(records[2], records[0])
})

test('inherited label scope uses one committed owner snapshot and isolates nested and sibling controls', () => {
  const renders: Record<string, number> = {}
  const runtime = loadTextInheritanceRuntime(
    React.createContext(14),
    {
      View: 'NativeView',
      Text(props: { testID: string }) {
        renders[props.testID] = (renders[props.testID] ?? 0) + 1
        return React.createElement('NativeText', props)
      },
    },
    true,
  )
  const snapshots: Record<string, { pressed: boolean; hovered: boolean; focused: boolean }[]> = {
    first: [],
    second: [],
    nested: [],
  }
  const resolve =
    (id: string) => (state: { pressed: boolean; hovered: boolean; focused: boolean }) => {
      snapshots[id].push({ ...state })
      return {
        color:
          id === 'first'
            ? state.pressed
              ? '#cc0000'
              : state.hovered
                ? '#00aa00'
                : '#1355bb'
            : '#abcdef',
        fontWeight: '500',
      }
    }
  const label = (id: string) => React.createElement(runtime.HozoInheritedText, { testID: id }, id)
  const Opaque = React.memo(({ id }: { id: string }) =>
    React.createElement(runtime.HozoInheritedView, null, label(id)),
  )
  const nested = React.createElement(
    runtime.HozoInheritedPressable,
    {
      key: 'nested',
      testID: 'nested-button',
      hozoTextStyle: resolve('nested'),
      style: { fontSize: 11 },
    },
    React.createElement(Opaque, { id: 'nested' }),
  )
  let childCalls = 0
  const children = [
    React.createElement(
      runtime.HozoInheritedPressable,
      {
        key: 'a',
        testID: 'first-button',
        hozoTextStyle: resolve('first'),
        style: { fontSize: 22, fontWeight: '700', padding: 4 },
      },
      () => {
        childCalls++
        return [React.createElement(Opaque, { key: 'label', id: 'first' }), nested]
      },
    ),
    React.createElement(
      runtime.HozoInheritedPressable,
      {
        key: 'b',
        testID: 'second-button',
        hozoTextStyle: resolve('second'),
        style: { fontSize: 24 },
      },
      React.createElement(Opaque, { id: 'second' }),
    ),
  ]
  let tree: ReturnType<typeof renderer.create>
  try {
    renderer.act(() => {
      tree = renderer.create(
        React.createElement(runtime.HozoInheritedView, { style: REST }, children),
      )
    })
    const button = (id: string) =>
      tree.root.findAll(
        (node: { type: unknown; props: { testID?: string } }) =>
          node.type === 'Pressable' && node.props.testID === `${id}-button`,
      )[0]
    const text = (id: string) =>
      tree.root.findAll(
        (node: { type: unknown; props: { testID?: string } }) =>
          node.type === 'NativeText' && node.props.testID === id,
      )[0]
    const first = text('first')
    assert.equal(childCalls, 1)
    assert.equal(snapshots.first.length, 1)
    assert.equal(snapshots.second.length, 1)
    assert.equal(snapshots.nested.length, 1)
    assert.equal(tree.root.findAllByType(runtime.HozoPressable).length, 3)
    assert.equal(tree.root.findAllByType('Pressable').length, 3)
    assert.equal(runtime.native.Animated.__hozoTimings.length, 0)
    assert.equal(
      flatten(first.props.style).fontWeight,
      '700',
      'explicit owner style follows its class label',
    )
    const secondRenders = renders.second
    renderer.act(() => button('first').props.onHoverIn({}))
    assert.equal(snapshots.first.length, 2, 'resolve once for the existing committed owner update')
    assert.equal(childCalls, 2, 'RN executes the authored function child once')
    assert.equal(flatten(text('first').props.style).color, '#00aa00')
    assert.equal(renders.second, secondRenders)
    assert.equal(snapshots.second.length, 1)
    assert.equal(snapshots.nested.at(-1)!.hovered, false, 'nested owner does not borrow hover')
    renderer.act(() => button('first').props.onPressIn({}))
    assert.equal(snapshots.first.length, 3)
    assert.equal(flatten(text('first').props.style).color, '#cc0000')
    assert.equal(snapshots.nested.at(-1)!.pressed, false, 'nested owner does not borrow press')
    assert.equal(renders.second, secondRenders)
    renderer.act(() => button('first').props.onPressOut({}))
    assert.equal(snapshots.first.length, 4)
    assert.equal(flatten(text('first').props.style).color, '#00aa00')
    const shielded = { ...renders }
    renderer.act(() =>
      tree.update(
        React.createElement(
          runtime.HozoInheritedView,
          { style: { ...REST, color: '#eecc00' } },
          children,
        ),
      ),
    )
    assert.deepEqual(
      renders,
      shielded,
      'effective local colors shield all three stable Text children',
    )
    assert.equal(text('first'), first)
    assert.equal(runtime.native.Animated.__hozoTimings.length, 0)
    assert.deepEqual(button('first').props.style({ pressed: false }), { padding: 4 })
  } finally {
    renderer.act(() => tree?.unmount())
  }
})

test('generated stateful labels update opaque text from real owner events and preserve child overrides', () => {
  const classes =
    'text-[#1355bb] text-[18px] hover:text-[#00aa00] active:text-[#cc0000] focus:font-semibold focus-visible:tracking-[2px] hover:active:text-[22px]'
  const source = `import {View,Button} from '@hozo/core';import {Label} from 'fixture:label';export const Scene=({frame,own})=> <View style={frame}><Button testID="owner" className="${classes}"><View><Label id="target" own={own}/></View></Button><Button testID="sibling" className="text-[#abcdef] text-[24px]"><Label id="other"/></Button></View>`
  const label = `import {Text} from '@hozo/core';import {memo,useState} from 'react';let next=0;export const Label=memo(({id,own})=>{const [token]=useState(()=>++next);return <Text testID={id} nativeID={'mount:'+token} style={own}>Label</Text>})`
  const records = []
  for (const mode of ['reference', 'runtime', 'optimized']) {
    const fixture = graph(
      mode !== 'reference',
      source,
      mode === 'optimized',
      label,
      undefined,
      true,
    )
    let tree: ReturnType<typeof renderer.create>
    let own: object | undefined
    const scene = () => React.createElement(fixture.Scene, { frame: REST, own })
    const stages = []
    try {
      renderer.act(() => {
        tree = renderer.create(scene())
      })
      const button = () =>
        tree.root.findAll(
          (node: { type: unknown; props: { testID?: string } }) =>
            node.type === 'Pressable' && node.props.testID === 'owner',
        )[0]
      const text = (id: string) =>
        tree.root.findAll(
          (node: { type: unknown; props: { testID?: string } }) =>
            node.type === 'NativeText' && node.props.testID === id,
        )[0]
      const initial = text('target'),
        sibling = text('other'),
        owner = button()
      const marker = initial.props.nativeID
      const expected = (style: object) => ({
        ...Object.fromEntries(
          Object.entries(REST).filter(([name]) =>
            TEXT_REFERENCE_FIELDS.includes(name as (typeof TEXT_REFERENCE_FIELDS)[number]),
          ),
        ),
        fontSize: 18,
        color: '#1355bb',
        ...style,
      })
      const check = (style = {}) => {
        assert.equal(text('target'), initial)
        assert.equal(text('other'), sibling)
        assert.equal(button(), owner)
        assert.equal(initial.props.nativeID, marker)
        assert.deepEqual(flatten(initial.props.style), expected(style), mode)
        assert.deepEqual(flatten(sibling.props.style), expected({ color: '#abcdef', fontSize: 24 }))
        stages.push(flatten(initial.props.style))
      }
      check()
      renderer.act(() => button().props.onHoverIn({}))
      check({ color: '#00aa00' })
      renderer.act(() => {
        button().props.onPointerDown({})
        button().props.onFocus({})
        button().props.onPressIn({})
      })
      check({ color: '#cc0000', fontSize: 22, fontWeight: '600' })
      renderer.act(() => button().props.onPressOut({}))
      check({ color: '#00aa00', fontWeight: '600' })
      renderer.act(() => button().props.onHoverOut({}))
      check({ fontWeight: '600' })
      renderer.act(() => button().props.onBlur({}))
      check()
      renderer.act(() => {
        button().props.onKeyDown({})
        button().props.onFocus({})
      })
      check({ fontWeight: '600', letterSpacing: 2 })
      own = { color: '#abcdef', fontSize: 10 }
      renderer.act(() => tree.update(scene()))
      check({ color: '#abcdef', fontSize: 10, fontWeight: '600', letterSpacing: 2 })
      own = undefined
      renderer.act(() => tree.update(scene()))
      check({ fontWeight: '600', letterSpacing: 2 })
      renderer.act(() => button().props.onPointerDown({}))
      check({ fontWeight: '600', letterSpacing: 1 })
    } finally {
      renderer.act(() => tree?.unmount())
    }
    records.push(stages)
  }
  assert.deepEqual(records[1], records[0])
  assert.deepEqual(records[2], records[0])
})

test('label callbacks receive disposable snapshots, not the shared interaction value', () => {
  const runtime = loadTextInheritanceRuntime(React.createContext(14), undefined, true)
  function Observe() {
    const state = React.useContext(runtime.HozoInteractionContext)
    return React.createElement('Observer', { hovered: state.hovered })
  }
  let tree: ReturnType<typeof renderer.create>
  try {
    renderer.act(() => {
      tree = renderer.create(
        React.createElement(
          runtime.HozoInheritedPressable,
          {
            hozoTextStyle(state: { hovered: boolean }) {
              state.hovered = false
              return { color: '#1355bb' }
            },
          },
          React.createElement(Observe),
        ),
      )
    })
    renderer.act(() => tree.root.findByType('Pressable').props.onHoverIn({}))
    assert.equal(tree.root.findByType('Observer').props.hovered, true)
  } finally {
    renderer.act(() => tree?.unmount())
  }
})

test('a color-only owner shares one timeline through opaque text, overrides and late joins', () => {
  const source = `import {View,Button,Text} from '@hozo/core';import {Label} from 'fixture:label';export const Scene=({frame,own,late,ownerOwn,note})=><View style={frame}><Button testID="motion-owner" className="text-[#000000] hover:text-[#ff0000] transition-[color] duration-100 delay-20 ease-linear" style={ownerOwn}><View><Label id="target" own={own} note={note}/>{late&&<Label id="late" note={note}/>}</View>{0}</Button><Text testID="outside">Outside</Text></View>`
  const label = `import {Text} from '@hozo/core';import {memo,useContext,useState} from 'react';import {HozoInheritedMetricsContext,HozoInheritedPaintContext} from '@hozo/engine/generated/text-inheritance-protocol';const Metrics=memo(({id,note})=>{note('metrics',id,useContext(HozoInheritedMetricsContext));return null});const Paint=memo(({id,note})=>{note('paint',id,useContext(HozoInheritedPaintContext));return null});export const Label=memo(({id,own,note})=>{const [token]=useState(()=>id);return <Text testID={id} nativeID={token} style={own}>Label<Metrics id={id} note={note}/><Paint id={id} note={note}/></Text>})`
  for (const textStatic of [false, true]) {
    const fixture = graph(true, source, textStatic, label, undefined, true)
    const Animated = fixture.shipped.native.Animated
    const Original = Animated.Value
    const nodes = [],
      notes = []
    Animated.Value = class extends Original {
      constructor(value) {
        super(value)
        nodes.push(this)
      }
    }
    Animated.__hozoResetTimings()
    let tree: ReturnType<typeof renderer.create>
    let own: object | undefined,
      ownerOwn: object | undefined,
      late = false
    const note = (kind, id, value) => notes.push({ kind, id, value })
    const scene = () =>
      React.createElement(fixture.Scene, { frame: REST, own, ownerOwn, late, note })
    const text = (id) =>
      tree.root.findAll((node) => node.type === 'NativeText' && node.props.testID === id)[0]
    const owner = () =>
      tree.root.findAll(
        (node) => node.type === 'Pressable' && node.props.testID === 'motion-owner',
      )[0]
    const color = (id) => flatten(text(id).props.style).color
    const range = (id) => color(id).__animatedInterpolation
    const { blendColor } = require('../../engine/src/color-transition.ts')
    try {
      renderer.act(() => {
        tree = renderer.create(scene())
      })
      const first = text('target')
      assert.equal(nodes.length, 1)
      assert.equal(nodes[0].listeners.size, 1)
      assert.equal(Animated.__hozoTimings.length, 0)
      assert.deepEqual(range('target').outputRange, ['#000000', '#000000'])
      assert.equal(color('outside'), REST.color)
      renderer.act(() => owner().props.onHoverIn({}))
      assert.equal(Animated.__hozoTimings.length, 1)
      assert.equal(Animated.__hozoTimings[0].config.useNativeDriver, false)
      const count = notes.length
      renderer.act(() => {
        for (let i = 1; i <= 50; i++) nodes[0].setValue(i / 100)
      })
      assert.equal(notes.length, count, 'frame progress must not notify Context readers')
      late = true
      renderer.act(() => tree.update(scene()))
      assert.equal(
        color('target') === color('late'),
        true,
        'late text joins the existing live node',
      )
      assert.equal(nodes.length, 1)
      assert.equal(Animated.__hozoTimings.length, 1)
      own = { color: '#00ff00' }
      renderer.act(() => tree.update(scene()))
      assert.equal(color('target'), '#00ff00')
      assert.equal(
        notes.filter((entry) => entry.kind === 'paint' && entry.id === 'target').at(-1).value.motion
          .color,
        null,
      )
      const shielded = notes.length
      renderer.act(() => nodes[0].setValue(0.75))
      assert.equal(notes.length, shielded)
      assert.equal(color('target'), '#00ff00')
      const ownReads = notes.filter(
        (entry) => entry.kind === 'paint' && entry.id === 'target',
      ).length
      renderer.act(() => owner().props.onHoverOut({}))
      renderer.act(() => owner().props.onHoverIn({}))
      assert.equal(
        notes.filter((entry) => entry.kind === 'paint' && entry.id === 'target').length,
        ownReads,
        'local colour shields paint notifications during retargets too',
      )
      assert.deepEqual(range('late').outputRange, [
        blendColor('#000000', '#ff0000', 0.75),
        '#ff0000',
      ])
      renderer.act(() => nodes[0].setValue(1))
      own = undefined
      renderer.act(() => tree.update(scene()))
      assert.equal(
        color('target') === color('late'),
        true,
        'override removal rejoins current progress, not a new timeline',
      )
      assert.equal(text('target') === first, true)
      const zero = tree.root.findAll(
        (node) => node.type === 'NativeText' && node.children[0] === '0',
      )[0]
      assert.ok(zero)
      assert.equal(flatten(zero.props.style).color === color('late'), true)
      renderer.act(() => owner().props.onHoverOut({}))
      const current = blendColor(blendColor('#000000', '#ff0000', 0.75), '#ff0000', 0.25)
      assert.deepEqual(range('target'), {
        inputRange: [1, 2],
        outputRange: [current, '#000000'],
      })
      assert.equal(color('target') === color('late'), true)
      renderer.act(() => nodes[0].setValue(1.5))
      const reversed = blendColor(current, '#000000', 0.5)
      ownerOwn = { color: '#0000ff' }
      renderer.act(() => tree.update(scene()))
      assert.deepEqual(range('target'), {
        inputRange: [1.5, 2.5],
        outputRange: [reversed, '#0000ff'],
      })
      ownerOwn = undefined
      renderer.act(() => tree.update(scene()))
      assert.equal(range('target').outputRange[1], '#000000')
      assert.equal(nodes.length, 1)
      assert.equal(tree.root.findAllByType('Pressable').length, 1)
      assert.equal(tree.root.findAllByType('NativeView').length, 2)
      assert.equal(text('target') === first, true)
      for (const id of ['target', 'late']) {
        assert.equal(notes.filter((entry) => entry.kind === 'metrics' && entry.id === id).length, 1)
        assert.ok(
          notes
            .filter((entry) => entry.kind === 'paint' && entry.id === id)
            .every((entry) => Object.isFrozen(entry.value)),
        )
      }
    } finally {
      renderer.act(() => tree?.unmount())
      assert.equal(nodes[0]?.listeners.size, 0)
      Animated.Value = Original
    }
  }
})

test('class-owned background motion keeps one event owner and shares label paint through opaque children', () => {
  const source = `import {View,Button} from '@hozo/core';import {Label} from 'fixture:label';export const Scene=({late,note,onHoverIn,onPressIn})=><Button testID="paint-owner" onHoverIn={onHoverIn} onPressIn={onPressIn} className="text-[#000000] hover:text-[#ff0000] bg-[#ffffff] hover:bg-[#000000] active:bg-[#0000ff] focus:bg-[#00ff00] focus-visible:bg-[#ffff00] transition-colors duration-100 delay-20 ease-linear"><View><Label id="target" note={note}/>{late&&<Label id="late" note={note}/>}</View>{0}</Button>`
  const label = `import {Text} from '@hozo/core';import {memo,useContext} from 'react';import {HozoInheritedPaintContext} from '@hozo/engine/generated/text-inheritance-protocol';export const Label=memo(({id,note})=>{note(useContext(HozoInheritedPaintContext));return <Text testID={id}>Label</Text>})`
  for (const textStatic of [false, true]) {
    const fixture = graph(true, source, textStatic, label, undefined, true)
    const Animated = fixture.shipped.native.Animated
    const Original = Animated.Value
    const nodes = [],
      notes = [],
      callbacks = []
    Animated.Value = class extends Original {
      constructor(value) {
        super(value)
        nodes.push(this)
      }
    }
    Animated.__hozoResetTimings()
    let tree: ReturnType<typeof renderer.create>
    let late = false
    const scene = () =>
      React.createElement(fixture.Scene, {
        late,
        note: (paint) => notes.push(paint),
        onHoverIn: () => callbacks.push(Animated.__hozoTimings.length),
        onPressIn: () => callbacks.push(Animated.__hozoTimings.length),
      })
    const owner = () =>
      tree.root.findAll(
        (node) => node.type === 'Pressable' && node.props.testID === 'paint-owner',
      )[0]
    const paint = () => flatten(owner().props.style).backgroundColor.__animatedInterpolation
    const text = (id) =>
      tree.root.findAll((node) => node.type === 'NativeText' && node.props.testID === id)[0]
    const color = (id) => flatten(text(id).props.style).color
    const { blendColor } = require('../../engine/src/color-transition.ts')
    try {
      renderer.act(() => {
        tree = renderer.create(scene())
      })
      const first = text('target')
      assert.notEqual(typeof owner().props.style, 'function', 'Animated receives a resolved array')
      assert.deepEqual(paint().outputRange, ['#ffffff', '#ffffff'])
      assert.equal(Animated.__hozoTimings.length, 0)
      const active = nodes.filter((node) => node.listeners.size > 0)
      assert.equal(active.length, 2, 'existing box timeline plus one shared text timeline')
      renderer.act(() => owner().props.onHoverIn({}))
      assert.deepEqual(callbacks, [1], 'existing box driver runs before the author callback')
      assert.equal(Animated.__hozoTimings.length, 2)
      assert.deepEqual(paint().outputRange, [blendColor('#ffffff', '#ffffff', 0), '#000000'])
      assert.deepEqual(color('target').__animatedInterpolation.outputRange, [
        blendColor('#000000', '#000000', 0),
        '#ff0000',
      ])
      for (const timing of Animated.__hozoTimings) {
        assert.equal(timing.config.useNativeDriver, false)
        assert.equal(timing.config.duration, 100)
        assert.equal(timing.config.delay, 20)
      }
      const reads = notes.length
      renderer.act(() => {
        for (let i = 1; i <= 50; i++) for (const node of active) node.setValue(i / 100)
      })
      assert.equal(notes.length, reads, 'neither timeline sends per-frame Context updates')
      late = true
      renderer.act(() => tree.update(scene()))
      assert.equal(color('target') === color('late'), true)
      assert.equal(Animated.__hozoTimings.length, 2)
      const zero = tree.root.findAll(
        (node) => node.type === 'NativeText' && node.children[0] === '0',
      )[0]
      assert.equal(flatten(zero.props.style).color === color('target'), true)
      assert.equal(nodes.filter((node) => node.listeners.size > 0).length, 2)
      renderer.act(() => owner().props.onPressIn({}))
      // The existing focus-visible owner publishes modality-clear then pressed
      // facts synchronously. Both invoke its box driver; neither restarts text.
      assert.deepEqual(callbacks, [1, 4])
      assert.equal(Animated.__hozoTimings.length, 4)
      assert.equal(Animated.__hozoTimings[2].value === Animated.__hozoTimings[0].value, true)
      assert.equal(Animated.__hozoTimings[3].value === Animated.__hozoTimings[0].value, true)
      assert.deepEqual(paint().outputRange, [blendColor('#ffffff', '#000000', 0.5), '#0000ff'])
      renderer.act(() => owner().props.onFocus({}))
      assert.equal(paint().outputRange[1], '#00ff00')
      renderer.act(() => owner().props.onBlur({}))
      assert.equal(paint().outputRange[1], '#0000ff')
      renderer.act(() => owner().props.onPressOut({}))
      assert.equal(paint().outputRange[1], '#000000')
      renderer.act(() => owner().props.onHoverOut({}))
      assert.equal(paint().outputRange[1], '#ffffff')
      assert.equal(color('target').__animatedInterpolation.outputRange[1], '#000000')
      renderer.act(() => {
        owner().props.onKeyDown({})
        owner().props.onFocus({})
      })
      assert.equal(paint().outputRange[1], '#ffff00')
      renderer.act(() => owner().props.onPointerDown({}))
      assert.equal(paint().outputRange[1], '#00ff00')
      assert.equal(text('target') === first, true)
      assert.equal(tree.root.findAllByType('Pressable').length, 1)
      assert.equal(tree.root.findAllByType('NativeView').length, 1)
    } finally {
      renderer.act(() => tree?.unmount())
      assert.ok(nodes.every((node) => node.listeners.size === 0))
      Animated.Value = Original
    }
  }
})

test('unassessed label transitions and host style callbacks fail without evaluating a callback', () => {
  const runtime = loadTextInheritanceRuntime(React.createContext(14), undefined, true)
  let calls = 0
  for (const props of [
    {
      style: () => {
        calls++
        return {}
      },
    },
    {
      hozoTransition: {
        duration: 100,
        easing: 'linear',
        opacity: false,
        transform: false,
        colors: true,
      },
    },
    {
      style: { color: '#123456' },
      hozoTransition: {
        duration: 100,
        easing: 'linear',
        opacity: true,
        transform: false,
        colors: true,
      },
    },
    {
      style: { color: 'tomato' },
      hozoTransition: {
        duration: 100,
        easing: 'linear',
        opacity: false,
        transform: false,
        colors: true,
      },
    },
  ]) {
    assert.throws(
      () =>
        renderer.act(() =>
          renderer.create(React.createElement(runtime.HozoInheritedPressable, props, 'Label')),
        ),
      /does not assess/,
    )
  }
  assert.equal(calls, 0)
})

test('motion box callbacks cannot smuggle inherited text or opaque background colours', () => {
  const runtime = loadTextInheritanceRuntime(React.createContext(14), undefined, true)
  for (const style of [{ color: '#123456' }, { backgroundColor: 'tomato' }]) {
    assert.throws(
      () =>
        renderer.act(() =>
          renderer.create(
            React.createElement(runtime.HozoInheritedPressable, {
              style: () => style,
              hozoTextStyle: () => ({ color: '#000000' }),
              hozoTransition: {
                duration: 100,
                easing: 'linear',
                opacity: false,
                transform: false,
                colors: true,
              },
            }),
          ),
        ),
      /does not assess/,
    )
  }
})

test('the inherited non-motion path stays allocation-free and motion presence changes refuse explicitly', () => {
  const api = loadTextInheritanceRuntime(React.createContext(14), undefined, true)
  const Animated = api.native.Animated
  const Original = Animated.Value
  let nodes = 0,
    resolutions = 0
  Animated.Value = class extends Original {
    constructor(value) {
      super(value)
      nodes++
    }
  }
  let tree: ReturnType<typeof renderer.create>
  const motion = { duration: 100, easing: 'linear', opacity: false, transform: false, colors: true }
  const scene = (transition?) =>
    React.createElement(
      api.HozoInheritedPressable,
      {
        hozoTransition: transition,
        hozoTextStyle: (state) => {
          resolutions++
          return { color: state.hovered ? '#ff0000' : '#000000' }
        },
      },
      React.createElement(api.HozoInheritedText, null, 'Label'),
    )
  try {
    renderer.act(() => {
      tree = renderer.create(scene())
    })
    renderer.act(() => tree.root.findByType('Pressable').props.onHoverIn({}))
    assert.equal(nodes, 0)
    renderer.act(() => tree.unmount())
    resolutions = 0
    renderer.act(() => {
      tree = renderer.create(scene(motion))
    })
    assert.equal(nodes, 1)
    assert.equal(resolutions, 1)
    renderer.act(() => tree.root.findByType('Pressable').props.onHoverIn({}))
    assert.equal(resolutions, 2, 'the motion commit pass must not resolve label classes again')
    assert.throws(() => renderer.act(() => tree.update(scene())), /changing transition presence/)
  } finally {
    renderer.act(() => tree?.unmount())
    Animated.Value = Original
  }
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
