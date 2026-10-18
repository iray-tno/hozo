// Paired B/C experiment, deliberately not enabled in application code.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import {
  captureTextBaseline,
  compileTextGraph,
  measureTextFixtures,
  measureTextWorkload,
} from './text-inheritance-baseline.ts'
import { resetTextCounts, textCounts } from './text-inheritance-host.ts'
import {
  referenceExecutions,
  referenceReads,
  resetReferenceExecutions,
} from './text-inheritance-reference.ts'
import { proveTextPaint } from './text-inheritance-static-proof.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const stub = require('./react-native-stub.js')
const modules = {
  scene: `import { View } from '@hozo/core'
import { Label } from 'fixture:label'
export function Scene({rows,color,size,weight,opacity}) {
  return <View style={{color,fontSize:size,fontWeight:weight,lineHeight:28,letterSpacing:2,textAlign:'center',textTransform:'uppercase',opacity}}>
    {Array.from({length:rows},(_,index)=><Label key={index} index={index}/>)}
  </View>
}`,
  label: `import { Text } from '@hozo/core'
import { memo } from 'react'
import { Descendant } from 'fixture:descendant'
export const Label = memo(function Label({index}) {
  return <Text testID={'masked-'+index} style={{color:'#000000',opacity:0.5}}><Descendant index={index}/></Text>
})`,
  descendant: `import { Text } from '@hozo/core'
import { memo } from 'react'
export const Descendant = memo(function Descendant({index}) {
  return <Text testID={'descendant-'+index}>Opaque descendant</Text>
})`,
}

const delta = (before: Record<string, number>, after: Record<string, number>) =>
  Object.fromEntries(Object.entries(after).map(([key, value]) => [key, value - (before[key] ?? 0)]))

export function measureMaskedPaint(rows = 8, optimize = false) {
  assert.ok(Number.isInteger(rows) && rows > 0 && rows <= 1000, 'rows must be 1..1000')
  const compiled = compileTextGraph(modules, [], 'reference', optimize ? proveTextPaint : undefined)
  resetTextCounts()
  resetReferenceExecutions()
  let tree: ReturnType<typeof renderer.create>
  const operations = []
  const props = { rows, color: '#112233', size: 20, weight: '600', opacity: 1 }
  const scene = () => React.createElement(compiled.exports.Scene, props)
  const perform = (name: string, update: () => void) => {
    const beforeText = textCounts()
    const beforeReads = referenceReads()
    const beforeExecutions = referenceExecutions()
    renderer.act(update)
    const actual: Record<string, unknown> = {}
    if (name !== 'unmount') {
      for (const node of tree.root.findAll((node: { type: string }) => node.type === 'Text'))
        actual[node.props.testID] = stub.StyleSheet.flatten(node.props.style)
    }
    operations.push({
      name,
      actual,
      textExecutions: Object.fromEntries(
        Object.entries(textCounts()).map(([id, counts]) => [
          id,
          delta(beforeText[id] ?? {}, counts),
        ]),
      ),
      contextReadHookCalls: delta(beforeReads, referenceReads()),
      helperExecutions: delta(beforeExecutions, referenceExecutions()),
    })
  }
  try {
    perform('mount', () => {
      tree = renderer.create(scene())
    })
    perform('color-only', () => {
      props.color = '#334455'
      tree.update(scene())
    })
    perform('equal-values', () => tree.update(scene()))
    perform('unrelated-parent-style', () => {
      props.opacity = 0.8
      tree.update(scene())
    })
    perform('metrics-change', () => {
      props.size = 24
      props.weight = '700'
      tree.update(scene())
    })
    perform('restore', () => {
      props.color = '#112233'
      props.size = 20
      props.weight = '600'
      tree.update(scene())
    })
    perform('unmount', () => {
      tree.unmount()
      tree = undefined
    })
    return { rows, optimize, modules: compiled.modules, operations, lifetime: textCounts() }
  } finally {
    if (tree) renderer.act(() => tree.unmount())
  }
}

export function captureStaticPaintProof(rows = 8) {
  const control = captureTextBaseline(rows, 'reference')
  assert.equal(
    control.measurementValid,
    true,
    'previously supported behavior must remain supported',
  )
  const optimizedCases = measureTextFixtures('reference', proveTextPaint)
  const optimizedWorkloads = [
    measureTextWorkload(rows, 'reference', 'closed', proveTextPaint),
    measureTextWorkload(rows, 'reference', 'opaque', proveTextPaint),
  ]
  const before = measureMaskedPaint(rows)
  const after = measureMaskedPaint(rows, true)
  // Compare the full applied property records, not only the fields that
  // improved. Independent expectations below stop B/C certifying a shared bug.
  for (const [index, entry] of optimizedCases.entries()) {
    assert.equal(entry.id, control.cases[index].id)
    assert.deepEqual(
      entry.stages.map(({ actual, expected, status }) => ({ actual, expected, status })),
      control.cases[index].stages.map(({ actual, expected, status }) => ({
        actual,
        expected,
        status,
      })),
    )
    assert.deepEqual(entry.lifetime, control.cases[index].lifetime)
  }
  for (const [index, workload] of optimizedWorkloads.entries()) {
    assert.deepEqual(workload.semantics, control.workloads[index].semantics)
    assert.equal(workload.semantics.status, 'supported')
    assert.equal(workload.retainedHost, true)
  }
  assert.equal(after.operations.length, before.operations.length)
  for (const [index, operation] of after.operations.entries()) {
    assert.equal(operation.name, before.operations[index].name)
    assert.deepEqual(operation.actual, before.operations[index].actual)
    if (operation.name === 'unmount') continue
    assert.equal(Object.keys(operation.actual).length, rows * 2)
    const changed = operation.name === 'metrics-change'
    for (const actual of Object.values(operation.actual)) {
      const style = actual as Record<string, unknown>
      assert.equal(style.color, '#000000', 'publish local paint to opaque descendants too')
      assert.equal(style.fontSize, changed ? 24 : 20)
      assert.equal(style.fontWeight, changed ? '700' : '600')
      assert.equal(style.lineHeight, 28)
      assert.equal(style.letterSpacing, 2)
      assert.equal(style.textAlign, 'center')
      assert.equal(style.textTransform, 'uppercase')
    }
  }
  for (const result of [before, after])
    for (const counts of Object.values(result.lifetime)) {
      assert.equal(counts.mounts, 1)
      assert.equal(counts.unmounts, 1)
    }
  const proof = readFileSync(new URL('./text-inheritance-static-proof.ts', import.meta.url), 'utf8')
  const driver = readFileSync(
    new URL('./text-inheritance-static-workload.ts', import.meta.url),
    'utf8',
  )
  return {
    schemaVersion: 1,
    kind: 'test-only-static-paint-proof',
    provenance: control.provenance,
    experimentDriverSha256: createHash('sha256').update(driver).update(proof).digest('hex'),
    babel: require('@babel/core/package.json').version,
    proof: { source: proof, sha256: createHash('sha256').update(proof).digest('hex') },
    control,
    optimized: { cases: optimizedCases, workloads: optimizedWorkloads },
    maskedWorkload: { before, after },
    validated: true,
    timingAssessed: false,
    limits: [
      'post-Metro private AST experiment, not production compiler integration',
      'only unconditional inline literal color at a stable React.memo root; no metric or provider elimination',
      'read hook calls are render-time invocations, not live subscription counts',
      'unchanged simulated-host evidence limits; no device, timing or bundle claim',
      'two reference corpus gaps remain visible; no default rollout',
    ],
  }
}
