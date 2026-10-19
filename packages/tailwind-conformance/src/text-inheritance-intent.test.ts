import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { captureTextBaseline, compileTextGraph } from './text-inheritance-baseline.ts'
import { compareTextBaselines } from './text-inheritance-comparison.ts'
import { resetTextCounts, textCounts } from './text-inheritance-host.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const stub = require('./react-native-stub.js')

test('retained compiler intent repairs both selected gaps without relabeling baseline or old reference', () => {
  const old = captureTextBaseline(4, 'reference')
  const current = captureTextBaseline(4, 'reference-intent')
  assert.equal(current.measurementValid, true)
  assert.equal(current.compatibilityComplete, true)
  assert.equal(current.summary.supported, current.summary.cases)
  assert.equal(current.cases.length, old.cases.length)
  const comparison = compareTextBaselines(old, current)
  assert.ok(comparison.changes.length > 0)
  assert.ok(comparison.changes.every((entry) => entry.change === 'fixed'))
  assert.ok(comparison.intentModuleBytesDelta > 0, 'actual helper/adapter sources must be counted')
  assert.equal(current.experiment.intentModules.length, 2)
  const corrupt = structuredClone(current)
  corrupt.experiment.intentModules[0].sha256 = 'bad'
  assert.throws(() => compareTextBaselines(old, corrupt))
  const wrongMode = structuredClone(current)
  wrongMode.experiment.compilerTextReference = false
  assert.throws(() => compareTextBaselines(old, wrongMode))
  assert.equal(comparison.timingAssessed, false)
  for (const workload of current.workloads) {
    assert.equal(workload.semantics.status, 'supported')
    assert.equal(workload.retainedHost, true)
    const press = workload.operations.find((entry) => entry.name === 'one-button-press')!
    assert.equal(press.textExecutions['label-0'].renders, 1)
    for (const [id, counts] of Object.entries(press.textExecutions))
      if (id !== 'label-0') assert.equal(counts.renders, 0)
  }
})

test('relative owner publishes computed metrics to opaque descendants, compounds and keeps explicit overrides', () => {
  resetTextCounts()
  const compiled = compileTextGraph(
    {
      owner: `import {View} from '@hozo/core'
export const Owner=({children,size,color})=><View className="text-[20px] text-red-500" style={{fontSize:size,color}}>{children}</View>`,
      label: `import {Small,Text} from '@hozo/core'
export const Label=()=> <Small testID="small"><Text testID="inner">Nested</Text><Small testID="nested">Smaller</Small><Small testID="explicit" style={{fontSize:9}}>Own</Small></Small>`,
      scene: `import {Owner} from 'fixture:owner'; import {Label} from 'fixture:label'
export const Scene=({size,color})=><Owner size={size} color={color}><Label/></Owner>`,
    },
    [],
    'reference-intent',
  )
  let tree: ReturnType<typeof renderer.create>
  const scene = (size: number, color: string) =>
    React.createElement(compiled.exports.Scene, { size, color })
  const styles = () =>
    Object.fromEntries(
      tree.root
        .findAll((node: { type: string }) => node.type === 'Text')
        .map((node: { props: { testID: string; style: unknown } }) => [
          node.props.testID,
          stub.StyleSheet.flatten(node.props.style),
        ]),
    )
  try {
    renderer.act(() => {
      tree = renderer.create(scene(24, '#123456'))
    })
    let actual = styles()
    assert.equal(actual.small.fontSize, 20)
    assert.equal(actual.inner.fontSize, 20, 'not the outer 24 or default 14')
    assert.equal(actual.nested.fontSize, 17)
    assert.equal(actual.explicit.fontSize, 9)
    for (const value of Object.values(actual)) assert.equal(value.color, '#123456')
    renderer.act(() => tree.update(scene(36, '#654321')))
    actual = styles()
    assert.equal(actual.small.fontSize, 30)
    assert.equal(actual.inner.fontSize, 30)
    assert.equal(actual.nested.fontSize, 25)
    assert.equal(actual.explicit.fontSize, 9)
    for (const value of Object.values(actual)) assert.equal(value.color, '#654321')
    for (const counts of Object.values(textCounts())) {
      assert.equal(counts.mounts, 1)
      assert.equal(counts.unmounts, 0)
    }
  } finally {
    renderer.act(() => tree?.unmount())
  }
  for (const counts of Object.values(textCounts())) assert.equal(counts.mounts, counts.unmounts)
})
