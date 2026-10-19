import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { compileTextGraph } from './text-inheritance-baseline.ts'
import { proveNativeTextRegion, proveTextSubtree } from './text-inheritance-closed-proof.ts'
import {
  CLOSED_CLASS,
  CLOSED_STYLE,
  captureClosedTextProof,
} from './text-inheritance-closed-workload.ts'
import { projectNativeText, type TextHostJson } from './text-inheritance-native-projection.ts'

const source = (child = '<Text>Nested</Text>', style = CLOSED_STYLE) =>
  `import {Text} from 'react-native';import {memo} from 'react';export const Label=memo(function Label(){return <Text style={${style}}>Outer${child}</Text>})`

test('a complete static native Text root can delegate partial descendants to RN without source changes', () => {
  for (const input of [
    source(),
    source(
      '<><Text style={{color:"#8899aa"}}>Nested<Text style={{fontWeight:"500"}}>Deep</Text></Text></>',
    ),
    source('<Text style={[null,{fontSize:14}]}>Nested</Text>'),
  ]) {
    assert.equal(proveTextSubtree(input).plainText, false)
    const result = proveNativeTextRegion(input)
    assert.equal(result.plainText, true, input)
    assert.equal(result.code, input)
    assert.ok(result.decisions.every((decision) => decision.disposition === 'native-region'))
  }
})

test('partial roots, dynamic descendants and opaque boundaries still require the contextual path', () => {
  for (const input of [
    source('<Text>Nested</Text>', "{color:'#102030'}"),
    source('<Text style={own}>Nested</Text>'),
    source('<Text style={{color:value}}>Nested</Text>'),
    source('<Text {...props}>Nested</Text>'),
    source('<Text>{children}</Text>'),
    source('<View><Text>Nested</Text></View>'),
    source('<Unknown/>'),
    source('{flag && <Text>Nested</Text>}'),
    `${source()};export const Alias=Text`,
    `${source()};export const Open=memo(()=> <Text>Open</Text>)`,
    source().replace("from 'react-native'", "from 'other'"),
    source()
      .replace('return <Text', 'return flag ? <Text')
      .replace('</Text>})', '</Text> : <Text>Other</Text>})'),
  ]) {
    const result = proveNativeTextRegion(input)
    assert.equal(result.plainText, false, input)
    assert.ok(result.decisions.every((decision) => decision.disposition === 'reference'))
  }
  for (const name of [
    'color',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'textAlign',
    'textTransform',
  ])
    assert.equal(
      proveNativeTextRegion(source(`<Text style={{${name}:value}}>Nested</Text>`)).plainText,
      false,
      name,
    )
})

test('the evidence projection inherits only the seven fields through nested Text, never through a View', () => {
  const tree: TextHostJson = {
    type: 'Text',
    props: {
      testID: 'root',
      style: {
        color: '#102030',
        fontSize: 12,
        lineHeight: 18,
        letterSpacing: 1,
        fontWeight: '600',
        textAlign: 'left',
        textTransform: 'uppercase',
        opacity: 0.5,
      },
    },
    children: [
      {
        type: 'Text',
        props: { testID: 'nested', style: { fontWeight: '500', letterSpacing: 0 } },
        children: [
          {
            type: 'Text',
            props: { testID: 'deep', style: { color: '#8899aa', textTransform: 'none' } },
            children: ['Deep'],
          },
        ],
      },
      {
        type: 'View',
        props: { style: { fontSize: 40 } },
        children: [{ type: 'Text', props: { testID: 'outside' }, children: ['Outside'] }],
      },
    ],
  }
  const original = structuredClone(tree)
  const result = projectNativeText(tree, (style) => (style as Record<string, unknown>) ?? {})
  assert.deepEqual(result.nested, {
    color: '#102030',
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0,
    fontWeight: '500',
    textAlign: 'left',
    textTransform: 'uppercase',
  })
  assert.deepEqual(result.deep, {
    color: '#8899aa',
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0,
    fontWeight: '500',
    textAlign: 'left',
    textTransform: 'none',
  })
  assert.deepEqual(result.outside, {})
  assert.equal(result.nested.opacity, undefined)
  assert.deepEqual(tree, original)
})

test('paired native-region evidence distinguishes declared props, projected values and ordinary module bytes', () => {
  const report = captureClosedTextProof(4, 'native-region')
  assert.equal(report.validated, true)
  assert.equal(report.kind, 'test-only-native-text-inheritance-region')
  assert.equal(
    report.effectiveStyleSource,
    'seven-field-native-attribute-projection-not-device-rendering',
  )
  assert.equal(report.control.summary.supported, 10)
  assert.equal(report.timingAssessed, false)
  const before = report.closedWorkload.before.operations[0]
  const after = report.closedWorkload.after.operations[0]
  assert.equal(before.actual['nested-0'].fontSize, 12)
  assert.deepEqual(after.actual['nested-0'], { color: '#8899aa', fontWeight: '500' })
  assert.equal(after.projectedNativeAttributes!['nested-0'].fontSize, 12)
  assert.deepEqual(before.projectedNativeAttributes, after.projectedNativeAttributes)
  const module = report.closedWorkload.after.modules.closed as { transformed: string }
  assert.equal(module.transformed, report.ordinaryModule!.transformed)
})

test('native inherited descendants retain hosts and state under StrictMode without duplicating authored evaluation', () => {
  const require = createRequire(import.meta.url)
  const React = require('react')
  const renderer = require('react-test-renderer')
  const stub = require('./react-native-stub.js')
  for (const strict of [false, true]) {
    const compiled = compileTextGraph(
      {
        scene: `import {View} from '@hozo/core';import {Label} from 'fixture:label';export {counts} from 'fixture:label';export const Scene=({color,tick})=><View style={{color,fontSize:40}}><Label tick={tick}/></View>`,
        label: `import {Text} from '@hozo/core';import {memo,useState} from 'react';let initialized=0;let evaluated=0;export const counts=()=>({initialized,evaluated});function opacity(){evaluated++;return 0.5}
export const Label=memo(function Label({tick}){const [state]=useState(()=>++initialized);return <Text testID="root" className="${CLOSED_CLASS}" accessibilityLabel={state+':'+tick}>Root<Text testID="nested" style={{color:'#8899aa',opacity:opacity()}}>Nested</Text></Text>})`,
      },
      [],
      'reference-intent',
      proveNativeTextRegion,
    )
    assert.equal(
      (compiled.modules.label as { experiment: { plainText: boolean } }).experiment.plainText,
      true,
    )
    assert.deepEqual(compiled.exports.counts(), { initialized: 0, evaluated: 0 })
    let tree: ReturnType<typeof renderer.create>
    const scene = (color: string, tick: number) => {
      const child = React.createElement(compiled.exports.Scene, { color, tick })
      return strict ? React.createElement(React.StrictMode, null, child) : child
    }
    try {
      renderer.act(() => {
        tree = renderer.create(scene('#abcdef', 0))
      })
      const hosts = () => tree.root.findAll((node: { type: string }) => node.type === 'Text')
      const first = hosts()
      const counts = compiled.exports.counts()
      const state = first[0].props.accessibilityLabel.split(':')[0]
      renderer.act(() => tree.update(scene('#654321', 0)))
      assert.deepEqual(compiled.exports.counts(), counts)
      for (const [index, host] of hosts().entries()) assert.equal(host, first[index])
      renderer.act(() => tree.update(scene('#654321', 1)))
      for (const [index, host] of hosts().entries()) assert.equal(host, first[index])
      assert.equal(hosts()[0].props.accessibilityLabel, `${state}:1`)
      assert.equal(compiled.exports.counts().initialized, counts.initialized)
      if (!strict) assert.deepEqual(compiled.exports.counts(), { initialized: 1, evaluated: 2 })
      assert.equal(stub.StyleSheet.flatten(hosts()[1].props.style).fontSize, undefined)
      assert.equal(projectNativeText(tree.toJSON(), stub.StyleSheet.flatten).nested.fontSize, 12)
    } finally {
      renderer.act(() => tree?.unmount())
    }
  }
})

test('opaque View boundaries and dynamic overrides retain Context and resume the actual owner frame', () => {
  const require = createRequire(import.meta.url)
  const React = require('react')
  const renderer = require('react-test-renderer')
  const stub = require('./react-native-stub.js')
  const compiled = compileTextGraph(
    {
      scene: `import {View} from '@hozo/core';import {Label} from 'fixture:label';export {initializations} from 'fixture:child';export const Scene=({own})=><View style={{color:'#fedcba',fontSize:40}}><Label own={own}/></View>`,
      label: `import {View} from '@hozo/core';import {memo} from 'react';import {Child} from 'fixture:child';export const Label=memo(function Label({own}){return <View className="${CLOSED_CLASS}" style={own}><Child/></View>})`,
      child: `import {View,Text} from '@hozo/core';import {memo,useState} from 'react';let initialized=0;export const initializations=()=>initialized;export const Child=memo(function Child(){const [state]=useState(()=>++initialized);return <View><Text testID="child" accessibilityLabel={String(state)}>Nested</Text></View>})`,
    },
    [],
    'reference-intent',
    proveNativeTextRegion,
  )
  for (const module of Object.values(compiled.modules) as { experiment: { plainText: boolean } }[])
    assert.equal(module.experiment.plainText, false)
  let tree: ReturnType<typeof renderer.create>
  const scene = (own?: object) => React.createElement(compiled.exports.Scene, { own })
  try {
    renderer.act(() => {
      tree = renderer.create(scene({ color: '#abcdef', fontSize: 18 }))
    })
    const host = () =>
      tree.root.findAll(
        (node: { type: string; props: { testID?: string } }) =>
          node.type === 'Text' && node.props.testID === 'child',
      )[0]
    const first = host()
    assert.equal(stub.StyleSheet.flatten(first.props.style).color, '#abcdef')
    renderer.act(() => tree.update(scene()))
    assert.equal(host(), first)
    assert.equal(compiled.exports.initializations(), 1)
    assert.equal(stub.StyleSheet.flatten(host().props.style).color, '#102030')
    assert.equal(stub.StyleSheet.flatten(host().props.style).fontSize, 12)
  } finally {
    renderer.act(() => tree?.unmount())
  }
})
