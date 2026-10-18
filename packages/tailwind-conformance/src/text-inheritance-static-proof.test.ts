import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { compileTextGraph } from './text-inheritance-baseline.ts'
import { resetTextCounts, textCounts } from './text-inheritance-host.ts'
import { proveTextPaint } from './text-inheritance-static-proof.ts'
import { captureStaticPaintProof } from './text-inheritance-static-workload.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const stub = require('./react-native-stub.js')
const selected = (source: string) =>
  proveTextPaint(source).decisions.filter((decision) => decision.disposition === 'masked-paint')
const label = (style: string, attributes = '') => `import { Text } from 'react-native'
import {memo} from 'react'
export const Label = memo(() => <Text ${attributes} style={${style}}>Label</Text>)`

test('proof uses import binding and an unconditional own color, not the component name or a rendered value', () => {
  const source = `import { Text as NativeLabel } from 'react-native'
import {memo as stable} from 'react'
export const Label = stable(({size}) => <NativeLabel style={{color:'#123456',fontSize:size}}>Label</NativeLabel>)`
  const result = proveTextPaint(source)
  assert.equal(selected(source).length, 1)
  assert.equal(result.decisions[0].subject, "<NativeLabel style={{color:'#123456',fontSize:size}}>")
  assert.match(result.code, /fixture:paint-masked-text/)
  // The two channels are not interchangeable: size may still depend on the
  // caller and all other metric fields still inherit.
  assert.match(result.decisions[0].reason, /keep Metrics and descendant providers/)
  for (const source of [
    `import { Text } from 'other'; import {memo} from 'react'; const Label=memo(()=> <Text style={{color:'red'}}/>)`,
    `import { Text } from 'react-native'; import {memo} from 'react'; const Label=memo(function Label(Text){return <Text style={{color:'red'}}/>})`,
    `import { Text } from 'react-native'; import {memo} from 'react'; Text=Other; const Label=memo(()=> <Text style={{color:'red'}}/>)`,
    `import type { Text } from 'react-native'; import {memo} from 'react'; const Label=memo(()=> <Text style={{color:'red'}}/>)`,
    `import * as RN from 'react-native'; import {memo} from 'react'; const Label=memo(()=> <RN.Text style={{color:'red'}}/>)`,
  ]) {
    assert.equal(selected(source).length, 0)
    assert.equal(proveTextPaint(source).code, source, 'failed proofs preserve exact source bytes')
  }
})

test('unknown style shapes and prop spreads retain reference B, with reasons', () => {
  for (const source of [
    label('props.style'),
    label('[{color:"red"},props.style]'),
    label('alternate ? {color:"red"} : undefined'),
    label('{color: alternate ? "red" : undefined}'),
    label('{fontSize:12}'),
    label('{color:undefined}'),
    label('{color:null}'),
    label('{color}'),
    label('{color:"red",...props.style}'),
    label('{...props.style,color:"red"}'),
    label('{color:"red",[key]:value}'),
    label('{get color(){return "red"}}'),
    label('{color:"red",color:undefined}'),
    label('{color:"red",__proto__:other}'),
    label('{color:"red"}', '{...props}'),
    label('{color:"red"}', 'style={props.style}'),
    label('{color:"red"}', 'className={classes}'),
    `import { Text } from 'react-native'; import {memo} from 'react'; const Label=memo(()=> <Text style={{color:'red'}} {...props}/>)`,
  ]) {
    const result = proveTextPaint(source)
    assert.equal(selected(source).length, 0, source)
    assert.equal(result.code, source)
    assert.equal(result.decisions.length, 1, source)
    assert.equal(result.decisions[0].disposition, 'reference')
    assert.ok(result.decisions[0].reason)
  }
})

test('different source sites sharing a React position cannot acquire different helper identities', () => {
  for (const body of [
    `if(alternate) return <Text style={{color:'red'}}><Child/></Text>; return <Text><Child/></Text>`,
    `return alternate ? <Text style={{color:'red'}}><Child/></Text> : <Text><Child/></Text>`,
    `return <View>{alternate ? <Text style={{color:'red'}}><Child/></Text> : <Text><Child/></Text>}</View>`,
    `const leaked=register(Label); return <Text style={{color:'red'}}><Child/></Text>`,
  ]) {
    const source = `import {Text,View} from 'react-native'; import {memo} from 'react';
export const Label=memo(function Label({alternate}){${body}})`
    assert.equal(selected(source).length, 0)
    assert.equal(proveTextPaint(source).code, source)
  }
  assert.equal(
    selected(
      `import {Text} from 'react-native'; export const Label=()=> <Text style={{color:'red'}}/>`,
    ).length,
    0,
    'ordinary render functions may be called',
  )
  assert.equal(
    selected(`import {Text} from 'react-native'; import {memo} from 'other';
export const Label=memo(()=> <Text style={{color:'red'}}>Label</Text>)`).length,
    0,
  )
})

test('paired B/C fixture semantics, lifecycle and owner event work remain equal while masked paint work drops', () => {
  const report = captureStaticPaintProof(4)
  assert.equal(report.validated, true)
  assert.equal(report.timingAssessed, false)
  assert.equal(report.control.cases.length, 10)
  assert.equal(report.optimized.cases.length, 10)
  assert.ok(report.control.summary.supported >= 8)
  const { before, after } = report.maskedWorkload
  const operation = (data: typeof before, name: string) =>
    data.operations.find((operation) => operation.name === name)!
  for (const data of [before, after]) {
    for (const name of ['equal-values', 'unrelated-parent-style'])
      for (const counts of Object.values(operation(data, name).textExecutions))
        assert.equal(counts.renders, 0)
    for (const name of ['metrics-change', 'restore'])
      for (const counts of Object.values(operation(data, name).textExecutions))
        assert.equal(counts.renders, 1, 'do not mask metrics just because color is explicit')
  }
  for (let index = 0; index < 4; index += 1) {
    assert.equal(operation(before, 'color-only').textExecutions[`masked-${index}`].renders, 1)
    assert.equal(operation(after, 'color-only').textExecutions[`masked-${index}`].renders, 0)
    assert.equal(operation(after, 'color-only').textExecutions[`descendant-${index}`].renders, 0)
  }
  assert.equal(operation(before, 'color-only').helperExecutions.ReferenceText, 8)
  assert.equal(operation(after, 'color-only').helperExecutions.PaintMaskedText, 0)
  // React can attempt descendant functions before bailing out an unchanged
  // context read. Report those too; zero host executions is not zero work.
  assert.equal(operation(after, 'color-only').helperExecutions.ReferenceText, 4)
  assert.equal(
    operation(before, 'mount').contextReadHookCalls.paint -
      operation(after, 'mount').contextReadHookCalls.paint,
    4,
  )
  assert.equal(
    operation(before, 'mount').contextReadHookCalls.metrics,
    operation(after, 'mount').contextReadHookCalls.metrics,
  )
  const module = after.modules.label as {
    transformed: string
    experiment: { decisions: { disposition: string }[]; lowered: string }
  }
  assert.equal(module.experiment.decisions[0].disposition, 'masked-paint')
  assert.notEqual(module.transformed, module.experiment.lowered)
})

test('dynamic override removal stays generic and resumes inheritance without remounting', () => {
  resetTextCounts()
  const compiled = compileTextGraph(
    {
      scene: `import {View,Text} from '@hozo/core'
export function Scene({own}) {return <View style={{color:'#123456',fontSize:20}}><Text testID="label" style={own}>Label</Text></View>}`,
    },
    [],
    'reference',
    proveTextPaint,
  )
  let tree: ReturnType<typeof renderer.create>
  const scene = (own: object) => React.createElement(compiled.exports.Scene, { own })
  const style = () =>
    stub.StyleSheet.flatten(
      tree.root.findAll((node: { type: string }) => node.type === 'Text')[0].props.style,
    )
  try {
    renderer.act(() => {
      tree = renderer.create(scene({ color: '#abcdef' }))
    })
    assert.equal(style().color, '#abcdef')
    renderer.act(() => tree.update(scene({ color: undefined })))
    assert.equal(style().color, '#123456')
    assert.equal(style().fontSize, 20)
    assert.equal(textCounts().label.mounts, 1)
    assert.equal(textCounts().label.unmounts, 0)
  } finally {
    renderer.act(() => tree?.unmount())
  }
})

test('proof rewriting preserves single authored evaluation and helper name hygiene', () => {
  resetTextCounts()
  const compiled = compileTextGraph(
    {
      scene: `import {Text} from '@hozo/core'
import {memo} from 'react'
let evaluations=0
function size(){ evaluations++; return 12 }
export const getEvaluations=()=>evaluations
export const Scene=memo(function Scene(){const _PaintMaskedText=123; return <Text testID="label" style={{color:'#abcdef',fontSize:size()}}>{_PaintMaskedText}</Text>})`,
    },
    [],
    'reference',
    proveTextPaint,
  )
  assert.match((compiled.modules.scene as { transformed: string }).transformed, /_PaintMaskedText2/)
  let tree: ReturnType<typeof renderer.create>
  try {
    renderer.act(() => {
      tree = renderer.create(React.createElement(compiled.exports.Scene))
    })
    assert.equal(compiled.exports.getEvaluations(), 1)
    const host = tree.root.findAll((node: { type: string }) => node.type === 'Text')[0]
    assert.equal(host.props.children, 123)
    assert.equal(stub.StyleSheet.flatten(host.props.style).fontSize, 12)
    assert.equal(stub.StyleSheet.flatten(host.props.style).color, '#abcdef')
  } finally {
    renderer.act(() => tree?.unmount())
  }
})

test('alternate Text sites keep child state instead of remounting when an own override disappears', () => {
  resetTextCounts()
  const compiled = compileTextGraph(
    {
      scene: `import {Text,View} from '@hozo/core'
import {memo,useState} from 'react'
let initializations=0
export const getInitializations=()=>initializations
function Child(){const [value]=useState(()=>++initializations); return <Text testID="child">{value}</Text>}
const Label=memo(function Label({own}){
  return own ? <Text style={{color:'#abcdef'}}><Child/></Text> : <Text><Child/></Text>
})
export function Scene({own}){return <View style={{color:'#123456'}}><Label own={own}/></View>}`,
    },
    [],
    'reference',
    proveTextPaint,
  )
  let tree: ReturnType<typeof renderer.create>
  try {
    renderer.act(() => {
      tree = renderer.create(React.createElement(compiled.exports.Scene, { own: true }))
    })
    assert.equal(compiled.exports.getInitializations(), 1)
    renderer.act(() => tree.update(React.createElement(compiled.exports.Scene, { own: false })))
    assert.equal(compiled.exports.getInitializations(), 1)
    assert.equal(textCounts().child.mounts, 1)
    const child = tree.root.findAll(
      (node: { type: string; props: { testID?: string } }) =>
        node.type === 'Text' && node.props.testID === 'child',
    )[0]
    assert.equal(stub.StyleSheet.flatten(child.props.style).color, '#123456')
    assert.equal(child.props.children, 1)
  } finally {
    renderer.act(() => tree?.unmount())
  }
})

test('StrictMode keeps a proved helper stable through metrics changes without leaking an outer paint value', () => {
  resetTextCounts()
  const compiled = compileTextGraph(
    {
      scene: `import {View} from '@hozo/core'; import {Label} from 'fixture:label'
export const Scene=({color,size})=><View style={{color,fontSize:size}}><Label/></View>`,
      label: `import {Text} from '@hozo/core'; import {memo,useState} from 'react'
let initializations=0
export const getInitializations=()=>initializations
export const Label=memo(function Label(){const [value]=useState(()=>++initializations); return <Text testID="label" style={{color:'#abcdef'}}>{value}</Text>})`,
    },
    [],
    'reference',
    proveTextPaint,
  )
  const scene = (color: string, size: number) =>
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(compiled.exports.Scene, { color, size }),
    )
  assert.match(
    (compiled.modules.label as { transformed: string }).transformed,
    /fixture:paint-masked-text/,
  )
  let tree: ReturnType<typeof renderer.create>
  try {
    renderer.act(() => {
      tree = renderer.create(scene('#112233', 20))
    })
    const mounted = textCounts().label.mounts
    const children = tree.root.findAll((node: { type: string }) => node.type === 'Text')[0].props
      .children
    renderer.act(() => tree.update(scene('#334455', 24)))
    const host = tree.root.findAll((node: { type: string }) => node.type === 'Text')[0]
    assert.equal(stub.StyleSheet.flatten(host.props.style).color, '#abcdef')
    assert.equal(stub.StyleSheet.flatten(host.props.style).fontSize, 24)
    assert.equal(textCounts().label.mounts, mounted)
    assert.equal(host.props.children, children)
  } finally {
    renderer.act(() => tree?.unmount())
  }
  assert.equal(textCounts().label.mounts, textCounts().label.unmounts)
})
