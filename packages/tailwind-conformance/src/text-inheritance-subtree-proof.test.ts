import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { compileTextGraph } from './text-inheritance-baseline.ts'
import { proveClosedText, proveTextSubtree } from './text-inheritance-closed-proof.ts'
import {
  CLOSED_CLASS,
  CLOSED_STYLE,
  captureClosedTextProof,
  NESTED_STYLE,
} from './text-inheritance-closed-workload.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const stub = require('./react-native-stub.js')

const source = (
  child = `<Text style={${NESTED_STYLE}}>Nested</Text>`,
) => `import {Text} from 'react-native';import {memo} from 'react';
export const Label=memo(function Label(){return <Text style={${CLOSED_STYLE}}>Outer${child}</Text>})`

test('nested Text with independently complete frames can erase both read and publication without rewriting', () => {
  for (const input of [
    source(),
    source(`<><Text style={${NESTED_STYLE}}>Nested</Text></>`),
    source(`<Text style={${NESTED_STYLE}}>Nested<Text style={${CLOSED_STYLE}}>Deep</Text></Text>`),
    source()
      .replace('import {Text}', 'import {Text,Text as Inner}')
      .replace(
        `<Text style={${NESTED_STYLE}}>Nested</Text>`,
        `<Inner style={${NESTED_STYLE}}>Nested</Inner>`,
      ),
  ]) {
    assert.equal(proveClosedText(input).plainText, false)
    const result = proveTextSubtree(input)
    assert.equal(result.plainText, true, input)
    assert.equal(result.code, input)
    assert.ok(result.decisions.every((decision) => decision.disposition === 'closed-subtree'))
    assert.ok(result.boundary.bindings.every((entry) => entry.covered))
  }
})

test('one partial, dynamic or opaque descendant retains the contextual region including its owner', () => {
  for (const child of [
    '<Text>Inherited</Text>',
    '<Text style={{fontSize:12}}>Partial</Text>',
    '<Text style={own}>Dynamic</Text>',
    `<Text style={${NESTED_STYLE}}>{children}</Text>`,
    `<Text style={${NESTED_STYLE}} {...props}>Unknown props</Text>`,
    '<Unknown/>',
    `<View><Text style={${NESTED_STYLE}}>Nested</Text></View>`,
    '{children}',
    `{flag && <Text style={${NESTED_STYLE}}>Nested</Text>}`,
    `<><Text style={${NESTED_STYLE}}>Nested</Text><Unknown/></>`,
    `<Text style={${NESTED_STYLE}}>Nested<Text>Deep inherited</Text></Text>`,
  ]) {
    const input = source(child)
    const result = proveTextSubtree(input)
    assert.equal(result.plainText, false, child)
    assert.equal(result.code, input)
    assert.ok(result.decisions.every((decision) => decision.disposition === 'reference'))
  }
})

test('nested proof keeps identity, imported ownership and import-wide escape guards', () => {
  for (const input of [
    source()
      .replace('return <Text', 'return flag ? <Text')
      .replace('</Text>})', '</Text> : <Text>Open</Text>})'),
    source().replace('memo(function Label()', 'memo(function Label(Text)'),
    source().replace("from 'react-native'", "from 'other'"),
    `${source()};export const Alias=Text`,
    `${source()};export const Open=memo(()=> <Text>Open</Text>)`,
    source().replace('return <Text', 'const escaped=consume(Label);return <Text'),
    source(`<Inner style={${NESTED_STYLE}}>Nested</Inner>`).replace(
      'import {memo}',
      "import {Inner} from 'other';import {memo}",
    ),
  ])
    assert.equal(proveTextSubtree(input).plainText, false, input)
})

test('paired nested workload preserves independent styles and live open readers', () => {
  const report = captureClosedTextProof(4, 'subtree')
  assert.equal(report.validated, true)
  assert.equal(report.kind, 'test-only-self-contained-text-subtree')
  assert.equal(report.control.summary.supported, 10)
  const before = report.closedWorkload.before.operations.find(
    (operation) => operation.name === 'color-only',
  )!
  const after = report.closedWorkload.after.operations.find(
    (operation) => operation.name === 'color-only',
  )!
  assert.equal(before.textExecutions['nested-0'].renders, 0)
  assert.equal(after.textExecutions['nested-0'].renders, 0)
  assert.equal(before.helperExecutions.ReferenceText - after.helperExecutions.ReferenceText, 8)
  assert.equal(before.helperExecutions.Scope - after.helperExecutions.Scope, 4)
})

test('nested plain Text preserves host identity, state and authored evaluation under StrictMode', () => {
  for (const strict of [false, true]) {
    const compiled = compileTextGraph(
      {
        scene: `import {View} from '@hozo/core';import {Label} from 'fixture:label';export {counts} from 'fixture:label';
export const Scene=({color,tick})=><View style={{color,fontSize:30}}><Label tick={tick}/></View>`,
        label: `import {Text} from '@hozo/core';import {memo,useState} from 'react';let initialized=0;let evaluated=0;
export const counts=()=>({initialized,evaluated});function opacity(){evaluated++;return 0.5}
export const Label=memo(function Label({tick}){const [state]=useState(()=>++initialized);return <Text className="${CLOSED_CLASS}" testID="root" accessibilityLabel={state+':'+tick}>Outer<Text testID="nested" style={${NESTED_STYLE.replace("textTransform:'lowercase'", "textTransform:'lowercase',opacity:opacity()")}}>Nested</Text></Text>})`,
      },
      [],
      'reference-intent',
      proveTextSubtree,
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
      assert.equal(stub.StyleSheet.flatten(hosts()[0].props.style).color, '#102030')
      assert.equal(stub.StyleSheet.flatten(hosts()[1].props.style).color, '#8899aa')
      assert.equal(hosts()[0].findAll((node: { type: string }) => node.type === 'Text').length, 2)
    } finally {
      renderer.act(() => tree?.unmount())
    }
  }
})

test('a dynamic nested override resumes its owner frame without changing host or component state', () => {
  const compiled = compileTextGraph(
    {
      scene: `import {View} from '@hozo/core';import {Label} from 'fixture:label';export {initializations} from 'fixture:label';
export const Scene=({own})=><View style={{color:'#fedcba',fontSize:40}}><Label own={own}/></View>`,
      label: `import {Text} from '@hozo/core';import {memo,useState} from 'react';let initialized=0;export const initializations=()=>initialized;
export const Label=memo(function Label({own}){const [state]=useState(()=>++initialized);return <Text style={${CLOSED_STYLE}} accessibilityLabel={String(state)}>Owner<Text style={own}>Nested</Text></Text>})`,
    },
    [],
    'reference-intent',
    proveTextSubtree,
  )
  assert.equal(
    (compiled.modules.label as { experiment: { plainText: boolean } }).experiment.plainText,
    false,
  )
  let tree: ReturnType<typeof renderer.create>
  const scene = (own?: object) => React.createElement(compiled.exports.Scene, { own })
  try {
    renderer.act(() => {
      tree = renderer.create(scene({ color: '#abcdef', fontSize: 18 }))
    })
    const hosts = () => tree.root.findAll((node: { type: string }) => node.type === 'Text')
    const first = hosts()
    assert.equal(stub.StyleSheet.flatten(first[1].props.style).color, '#abcdef')
    renderer.act(() => tree.update(scene()))
    for (const [index, host] of hosts().entries()) assert.equal(host, first[index])
    assert.equal(compiled.exports.initializations(), 1)
    assert.equal(stub.StyleSheet.flatten(hosts()[1].props.style).color, '#102030')
    assert.equal(stub.StyleSheet.flatten(hosts()[1].props.style).fontSize, 12)
  } finally {
    renderer.act(() => tree?.unmount())
  }
})
