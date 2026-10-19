import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { compileTextGraph } from './text-inheritance-baseline.ts'
import { proveClosedText } from './text-inheritance-closed-proof.ts'
import { CLOSED_STYLE, captureClosedTextProof } from './text-inheritance-closed-workload.ts'
import { resetTextCounts, textCounts } from './text-inheritance-host.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const stub = require('./react-native-stub.js')
const source = (
  style = CLOSED_STYLE,
  child = 'Label',
  attrs = '',
) => `import {Text} from 'react-native'; import {memo} from 'react'
export const Label=memo(function Label(){return <Text ${attrs} style={${style}}>${child}</Text>})`

test('complete scalar Text leaf restores the original Text binding without rewriting any source', () => {
  for (const input of [
    source(),
    source().replaceAll('Text', 'NativeLabel').replace('{NativeLabel}', '{Text as NativeLabel}'),
    source(CLOSED_STYLE, "{'Label'}{12}{/* comment */}"),
  ]) {
    const result = proveClosedText(input)
    assert.equal(result.plainText, true)
    assert.equal(result.code, input)
    assert.equal(result.decisions.length, 1)
    assert.equal(result.decisions[0].disposition, 'closed-leaf')
    assert.ok(result.boundary.bindings.every((entry) => entry.covered))
  }
})

test('each missing or dynamic inherited field keeps the contextual path', () => {
  const fields = [
    "color:'#102030'",
    'fontSize:12',
    "fontWeight:'600'",
    'lineHeight:18',
    'letterSpacing:1',
    "textAlign:'left'",
    "textTransform:'uppercase'",
  ]
  for (const field of fields) {
    const missing = CLOSED_STYLE.replace(`${field},`, '').replace(`,${field}`, '')
    assert.notEqual(missing, CLOSED_STYLE)
    assert.equal(proveClosedText(source(missing)).plainText, false, field)
    const name = field.slice(0, field.indexOf(':'))
    assert.equal(
      proveClosedText(source(CLOSED_STYLE.replace(field, `${name}:value`))).plainText,
      false,
      field,
    )
  }
  for (const style of [
    'props.style',
    `[${CLOSED_STYLE}]`,
    `{...props.style,...${CLOSED_STYLE}}`,
    CLOSED_STYLE.replace('fontSize:12', 'fontSize:undefined'),
    CLOSED_STYLE.replace("color:'#102030'", "color:'currentColor'"),
    CLOSED_STYLE.replace("color:'#102030'", "color:'#12345'"),
    CLOSED_STYLE.replace('opacity:0.5', 'get opacity(){return 0.5}'),
    CLOSED_STYLE.replace('opacity:0.5', '[key]:value'),
  ])
    assert.equal(proveClosedText(source(style)).plainText, false, style)
})

test('opaque children and prop routes cannot lose the frame they might consume', () => {
  for (const input of [
    source(CLOSED_STYLE, '<Child/>'),
    source(CLOSED_STYLE, '{children}'),
    source(CLOSED_STYLE, '<><Child/></>'),
    source(CLOSED_STYLE, '', 'children={children}'),
    source(CLOSED_STYLE, 'Label', '{...props}'),
    source(CLOSED_STYLE, 'Label', 'className={classes}'),
  ]) {
    assert.equal(proveClosedText(input).plainText, false)
    assert.equal(proveClosedText(input).code, input)
  }
})

test('mixed, escaped and indirect Text references prevent module binding elision', () => {
  for (const suffix of [
    `export const Open=memo(()=> <Text>Open</Text>)`,
    `export const Alias=Text`,
    `export {Text}`,
    `const x=consume(Text)`,
    `export * from 'react-native'`,
    `export {Text as Other} from 'react-native'`,
    `import * as RN from 'react-native'; export const Other=RN.Text`,
    `import RN from 'react-native'; export const Other=RN.Text`,
    `const r=require; const x=r('react-native')`,
    `const x=import('react-native')`,
  ]) {
    const input = `${source()}\n${suffix}`
    const result = proveClosedText(input)
    assert.equal(result.plainText, false, suffix)
    assert.ok(result.decisions.every((decision) => decision.disposition === 'reference'))
    assert.equal(result.code, input)
  }
})

test('identity and imported ownership must be proved, not assumed from a Text name', () => {
  for (const input of [
    source().replace("'react-native'", "'other'"),
    source().replace("'react'", "'other'"),
    source().replace('function Label()', 'function Label(Text)'),
    source().replace('return <Text', `const leaked=register(Label); return <Text`),
    source()
      .replace('return <Text', 'return alternate ? <Text')
      .replace('</Text>})', '</Text> : <Text>Open</Text>})'),
    `import {Text} from 'react-native'; export function Label(){return <Text style={${CLOSED_STYLE}}>Label</Text>}`,
  ])
    assert.equal(proveClosedText(input).plainText, false)
})

test('paired corpus stays correct while complete leaves shed reads/publications and partial leaves remain live', () => {
  const report = captureClosedTextProof(4)
  assert.equal(report.validated, true)
  assert.equal(report.timingAssessed, false)
  assert.equal(report.control.summary.supported, 10)
  const { before, after } = report.closedWorkload
  const operation = (result: typeof before, name: string) =>
    result.operations.find((operation) => operation.name === name)!
  for (const name of ['color-only', 'metrics-change', 'restore'])
    for (let row = 0; row < 4; row += 1) {
      assert.equal(operation(before, name).textExecutions[`closed-${row}`].renders, 1)
      assert.equal(operation(after, name).textExecutions[`closed-${row}`].renders, 0)
      assert.equal(operation(after, name).textExecutions[`open-${row}`].renders, 1)
      assert.equal(operation(after, name).textExecutions[`partial-${row}`].renders, 1)
    }
  for (const name of ['mount', 'color-only', 'metrics-change']) {
    const old = operation(before, name)
    const current = operation(after, name)
    for (const channel of ['metrics', 'paint', 'legacySize'] as const)
      assert.equal(old.contextReadHookCalls[channel] - current.contextReadHookCalls[channel], 4)
    assert.equal(old.helperExecutions.Scope - current.helperExecutions.Scope, 4)
    assert.equal(old.helperExecutions.ReferenceText - current.helperExecutions.ReferenceText, 4)
  }
  for (const result of [before, after]) {
    for (const name of ['equal-values', 'unrelated-parent-style'])
      for (const counts of Object.values(operation(result, name).textExecutions))
        assert.equal(counts.renders, 0)
    for (let row = 0; row < 4; row += 1)
      assert.equal(
        operation(result, 'parent-driven-label-update').textExecutions[`closed-${row}`].renders,
        1,
      )
  }
})

test('a dynamic override can disappear without switching binding identity or losing state', () => {
  resetTextCounts()
  const compiled = compileTextGraph(
    {
      scene: `import {View,Text} from '@hozo/core'; import {memo,useState} from 'react'
let initialized=0; export const getInitializations=()=>initialized
const Label=memo(function Label({own}){const [value]=useState(()=>++initialized);return <Text testID="label" style={own} accessibilityLabel={String(value)}>Label</Text>})
export const Scene=({own})=><View style={{color:'#123456',fontSize:20}}><Label own={own}/></View>`,
    },
    [],
    'reference-intent',
    proveClosedText,
  )
  let tree: ReturnType<typeof renderer.create>
  const scene = (own?: object) => React.createElement(compiled.exports.Scene, { own })
  try {
    renderer.act(() => {
      tree = renderer.create(scene({ color: '#abcdef', fontSize: 12 }))
    })
    renderer.act(() => tree.update(scene()))
    const host = tree.root.findAll((node: { type: string }) => node.type === 'Text')[0]
    assert.equal(stub.StyleSheet.flatten(host.props.style).color, '#123456')
    assert.equal(stub.StyleSheet.flatten(host.props.style).fontSize, 20)
    assert.equal(compiled.exports.getInitializations(), 1)
    assert.equal(textCounts().label.mounts, 1)
  } finally {
    renderer.act(() => tree?.unmount())
  }
})

test('StrictMode and parent-driven updates retain a closed leaf host and state', () => {
  resetTextCounts()
  const compiled = compileTextGraph(
    {
      scene: `import {View} from '@hozo/core';import {Label} from 'fixture:label';export const Scene=({color,size,tick})=><View style={{color,fontSize:size}}><Label tick={tick}/></View>`,
      label: `import {Text} from '@hozo/core';import {memo,useState} from 'react';let evaluations=0;let initialized=0;
export const getEvaluations=()=>evaluations;export const getInitializations=()=>initialized;
function opacity(){evaluations++;return 0.5}
export const Label=memo(function Label({tick}){const [state]=useState(()=>++initialized);return <Text testID="label" accessibilityLabel={String(state)+tick} style={${CLOSED_STYLE.replace('opacity:0.5', 'opacity:opacity()')}}>Label</Text>})`,
    },
    [],
    'reference-intent',
    proveClosedText,
  )
  assert.equal(
    (compiled.modules.label as { experiment: { plainText: boolean } }).experiment.plainText,
    true,
  )
  let tree: ReturnType<typeof renderer.create>
  const scene = (color: string, size: number, tick: number) =>
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(compiled.exports.Scene, { color, size, tick }),
    )
  try {
    renderer.act(() => {
      tree = renderer.create(scene('#123456', 20, 0))
    })
    const counts = { ...textCounts().label }
    const host = () => tree.root.findAll((node: { type: string }) => node.type === 'Text')[0]
    const first = host()
    const state = first.props.accessibilityLabel
    renderer.act(() => tree.update(scene('#abcdef', 30, 0)))
    assert.equal(host(), first)
    assert.equal(host().props.accessibilityLabel, state)
    assert.equal(textCounts().label.renders, counts.renders)
    renderer.act(() => tree.update(scene('#abcdef', 30, 1)))
    assert.equal(host(), first)
    assert.equal(textCounts().label.mounts, counts.mounts)
    assert.equal(stub.StyleSheet.flatten(host().props.style).fontSize, 12)
  } finally {
    renderer.act(() => tree?.unmount())
  }
  assert.equal(textCounts().label.mounts, textCounts().label.unmounts)
})

test('binding elision neither duplicates nor hoists an authored style evaluation', () => {
  const compiled = compileTextGraph(
    {
      scene: `import {View} from '@hozo/core';import {Label} from 'fixture:label';
export {getEvaluations} from 'fixture:label';
export const Scene=({color,tick})=><View style={{color}}><Label tick={tick}/></View>`,
      label: `import {Text} from '@hozo/core';import {memo} from 'react';let evaluations=0;
export const getEvaluations=()=>evaluations;
function opacity(){evaluations++;return 0.5}
export const Label=memo(function Label({tick}){return <Text accessibilityLabel={String(tick)} style={${CLOSED_STYLE.replace('opacity:0.5', 'opacity:opacity()')}}>Label</Text>})`,
    },
    [],
    'reference-intent',
    proveClosedText,
  )
  assert.equal(compiled.exports.getEvaluations(), 0)
  let tree: ReturnType<typeof renderer.create>
  const scene = (color: string, tick: number) =>
    React.createElement(compiled.exports.Scene, { color, tick })
  try {
    renderer.act(() => {
      tree = renderer.create(scene('#123456', 0))
    })
    assert.equal(compiled.exports.getEvaluations(), 1)
    renderer.act(() => tree.update(scene('#abcdef', 0)))
    assert.equal(compiled.exports.getEvaluations(), 1)
    renderer.act(() => tree.update(scene('#abcdef', 1)))
    assert.equal(compiled.exports.getEvaluations(), 2)
  } finally {
    renderer.act(() => tree?.unmount())
  }
})
