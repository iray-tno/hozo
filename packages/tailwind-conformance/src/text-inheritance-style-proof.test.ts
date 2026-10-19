import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { compileTextGraph } from './text-inheritance-baseline.ts'
import { proveClosedText } from './text-inheritance-closed-proof.ts'
import {
  CLOSED_CLASS,
  CLOSED_STYLE,
  captureClosedTextProof,
} from './text-inheritance-closed-workload.ts'

const source = (
  style = 'styles.label',
  suffix = '',
) => `import {Text,StyleSheet} from 'react-native';import {memo} from 'react';
const styles=StyleSheet.create({label:${CLOSED_STYLE}});
export const Label=memo(function Label(){return <Text style={${style}}>Label</Text>});${suffix}`

test('trusted non-escaping registered styles and static arrays preserve source and precedence', () => {
  for (const input of [
    source(),
    source("styles['label']"),
    source(`[null,false,[styles.label,{color:'#abcdef'}]]`),
    source(`[{color:value},styles.label]`),
    source()
      .replace('StyleSheet}', 'StyleSheet as Sheet}')
      .replace('StyleSheet.create', 'Sheet.create'),
    `import {Text} from 'react-native';import {memo} from 'react';export const Label=memo(()=> <Text style={[${CLOSED_STYLE}]}>Label</Text>)`,
  ]) {
    const result = proveClosedText(input)
    assert.equal(result.plainText, true, input)
    assert.equal(result.code, input)
  }
  for (const style of [
    `[styles.label,{color:undefined}]`,
    `[styles.label,{fontSize:value}]`,
    `[styles.label,props.style]`,
    `[styles.label,...layers]`,
    `[styles.label,,]`,
    `condition ? styles.label : null`,
    `styles[key]`,
    `StyleSheet.flatten(styles.label)`,
  ])
    assert.equal(proveClosedText(source(style)).plainText, false, style)
})

test('registry mutation, aliases, exports and unknown consumers invalidate even a const binding', () => {
  for (const suffix of [
    `styles.label.color=undefined`,
    `styles.label={}`,
    `delete styles.label.color`,
    `styles['label'].fontSize++`,
    `Object.assign(styles.label,{color:undefined})`,
    `const alias=styles`,
    `const {label}=styles`,
    `export {styles}`,
    `consume(styles.label)`,
    `export const Other=()=> <Unknown style={styles.label}/>`,
    `export const Other=()=> <Text other={styles.label}/>`,
    `StyleSheet.create=other`,
    `const alias=StyleSheet`,
    `Object.defineProperty(StyleSheet,'create',{value:other})`,
  ])
    assert.equal(proveClosedText(source('styles.label', suffix)).plainText, false, suffix)
  for (const input of [
    source().replace("from 'react-native'", "from 'other'"),
    source().replace('const styles=', 'export const styles='),
    source().replace('const styles=', 'let styles='),
    source().replace('opacity:0.5', 'opacity:readValue()'),
    source().replace('opacity:0.5', 'get opacity(){return 0.5}'),
    source().replace('opacity:0.5', '...other'),
    source().replace('label:', '[key]:'),
    source().replace('label:', '__proto__:'),
    source().replace('StyleSheet.create', 'other.create'),
    source().replace('styles.label', '(styles.label as any)'),
  ])
    assert.equal(proveClosedText(input).plainText, false, input)
})

test('class-generated style and final inline override are proved from actual Metro output', () => {
  const compiled = compileTextGraph(
    {
      scene: `import {Text} from '@hozo/core';import {memo} from 'react';
export const Label=memo(()=> <Text className="${CLOSED_CLASS}" style={{color:'#abcdef'}}>Label</Text>)`,
    },
    [],
    'reference-intent',
    proveClosedText,
  )
  const record = compiled.modules.scene as {
    transformed: string
    experiment: { plainText: boolean; lowered: string }
  }
  assert.match(record.transformed, /StyleSheet\.create/)
  assert.match(record.transformed, /style=\{\[/)
  assert.equal(record.experiment.plainText, true)
  assert.equal(record.transformed, record.experiment.lowered)
})

test('registered paired workload retains all semantics and removes only proved complete leaf work', () => {
  const report = captureClosedTextProof(4, 'registered')
  assert.equal(report.validated, true)
  assert.equal(report.kind, 'test-only-registered-text-fast-path')
  assert.equal(report.control.summary.supported, 10)
  assert.equal(report.timingAssessed, false)
  const record = report.closedWorkload.after.modules.closed as {
    experiment: { plainText: boolean }
    transformed: string
  }
  assert.equal(record.experiment.plainText, true)
  assert.match(record.transformed, /StyleSheet\.create/)
})

test('unknown array layers remain contextual when an own override disappears', () => {
  const require = createRequire(import.meta.url)
  const React = require('react')
  const renderer = require('react-test-renderer')
  const stub = require('./react-native-stub.js')
  const compiled = compileTextGraph(
    {
      scene: `import {View} from '@hozo/core';import {Label} from 'fixture:label';export const Scene=({own})=><View style={{color:'#abcdef'}}><Label own={own}/></View>`,
      label: `import {Text} from '@hozo/core';import {memo,useState} from 'react';let initialized=0;export const getInitializations=()=>initialized;
export const Label=memo(function Label({own}){const [state]=useState(()=>++initialized);return <Text className="${CLOSED_CLASS}" style={own} accessibilityLabel={String(state)}>Label</Text>})`,
    },
    [],
    'reference-intent',
    proveClosedText,
  )
  assert.equal(
    (compiled.modules.label as { experiment: { plainText: boolean } }).experiment.plainText,
    false,
  )
  let tree: ReturnType<typeof renderer.create>
  const scene = (own?: object) => React.createElement(compiled.exports.Scene, { own })
  try {
    renderer.act(() => {
      tree = renderer.create(scene({ color: undefined }))
    })
    const host = () => tree.root.findAll((node: { type: string }) => node.type === 'Text')[0]
    const first = host()
    assert.equal(stub.StyleSheet.flatten(first.props.style).color, '#abcdef')
    renderer.act(() => tree.update(scene()))
    assert.equal(host(), first)
    assert.equal(host().props.accessibilityLabel, '1')
    assert.equal(stub.StyleSheet.flatten(host().props.style).color, '#102030')
  } finally {
    renderer.act(() => tree?.unmount())
  }
})

test('registered arrays retain state and authored evaluations through StrictMode and prop updates', () => {
  const require = createRequire(import.meta.url)
  const React = require('react')
  const renderer = require('react-test-renderer')
  for (const strict of [false, true]) {
    const compiled = compileTextGraph(
      {
        scene: `import {View} from '@hozo/core';import {Label} from 'fixture:label';export {getCounts} from 'fixture:label';
export const Scene=({color,tick})=><View style={{color}}><Label tick={tick}/></View>`,
        label: `import {Text} from '@hozo/core';import {memo,useState} from 'react';let initialized=0;let evaluated=0;
export const getCounts=()=>({initialized,evaluated});function opacity(){evaluated++;return 0.5}
export const Label=memo(function Label({tick}){const [state]=useState(()=>++initialized);return <Text className="${CLOSED_CLASS}" style={{opacity:opacity()}} accessibilityLabel={state+':'+tick}>Label</Text>})`,
      },
      [],
      'reference-intent',
      proveClosedText,
    )
    assert.equal(
      (compiled.modules.label as { experiment: { plainText: boolean } }).experiment.plainText,
      true,
    )
    assert.deepEqual(compiled.exports.getCounts(), { initialized: 0, evaluated: 0 })
    let tree: ReturnType<typeof renderer.create>
    const scene = (color: string, tick: number) => {
      const child = React.createElement(compiled.exports.Scene, { color, tick })
      return strict ? React.createElement(React.StrictMode, null, child) : child
    }
    try {
      renderer.act(() => {
        tree = renderer.create(scene('#123456', 0))
      })
      const counts = compiled.exports.getCounts()
      const host = () => tree.root.findAll((node: { type: string }) => node.type === 'Text')[0]
      const first = host()
      const state = first.props.accessibilityLabel.split(':')[0]
      renderer.act(() => tree.update(scene('#abcdef', 0)))
      assert.deepEqual(compiled.exports.getCounts(), counts)
      assert.equal(host(), first)
      renderer.act(() => tree.update(scene('#abcdef', 1)))
      assert.equal(host(), first)
      assert.equal(host().props.accessibilityLabel, `${state}:1`)
      assert.equal(compiled.exports.getCounts().initialized, counts.initialized)
      assert.ok(compiled.exports.getCounts().evaluated > counts.evaluated)
      if (!strict) assert.deepEqual(compiled.exports.getCounts(), { initialized: 1, evaluated: 2 })
    } finally {
      renderer.act(() => tree?.unmount())
    }
  }
})
