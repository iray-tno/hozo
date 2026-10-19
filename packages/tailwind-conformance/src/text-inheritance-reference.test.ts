import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { captureTextBaseline } from './text-inheritance-baseline.ts'
import { compareTextBaselines } from './text-inheritance-comparison.ts'
import { resetTextCounts, textCounts } from './text-inheritance-host.ts'
import {
  ReferencePressable,
  ReferenceText,
  ReferenceView,
  useReferenceMetrics,
  useReferencePaint,
} from './text-inheritance-reference.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const stub = require('./react-native-stub.js')
const { HozoTextSizeContext } = require('@hozo/engine')
const style = (tree: ReturnType<typeof renderer.create>, id: string) =>
  stub.StyleSheet.flatten(
    tree.root.findAll(
      (node: { type: string; props: { testID?: string } }) =>
        node.type === 'Text' && node.props.testID === id,
    )[0].props.style,
  )

test('same compiled fixtures improve two gaps without changing normal codegen or hiding remaining gaps', () => {
  const baseline = captureTextBaseline(4)
  const reference = captureTextBaseline(4, 'reference')
  assert.equal(reference.measurementValid, true)
  assert.ok(reference.summary.supported >= baseline.summary.supported)
  for (const id of ['cross-module-opaque-label', 'dynamic-view-inline-style']) {
    assert.ok(
      reference.cases
        .find((entry) => entry.id === id)!
        .stages.every((stage) => stage.status === 'supported'),
      id,
    )
  }
  // Do not pin still-missing cases to failure. They retain the same independent
  // expectations and must be visible in the report until a real fix exists.
  assert.equal(reference.cases.length, baseline.cases.length)
  const comparison = compareTextBaselines(baseline, reference)
  assert.ok(comparison.changes.every((entry) => entry.change === 'fixed'))
  assert.ok(
    comparison.codeSize.every(
      (entry) => entry.transformedBytesDelta === 0 && entry.minifiedModuleBytesDelta === 0,
    ),
  )
  assert.ok(comparison.referenceModuleBytesDelta > 0, 'test wiring/runtime code is not free')
  assert.ok(comparison.executions[0].referenceExecutionDeltas.ReferencePressable > 0)
  assert.ok(comparison.executions[0].referenceExecutionDeltas.Scope > 0)
  assert.equal(comparison.timingAssessed, false)
  assert.equal(comparison.requiresReview, true)
  assert.equal(reference.experiment.mode, 'reference')
  const corrupt = structuredClone(reference)
  corrupt.experiment.referenceModule!.sha256 = 'incorrect'
  assert.throws(() => compareTextBaselines(baseline, corrupt))
  for (const field of ['sha256', 'sourceBytes', 'minifiedModuleBytes'] as const) {
    const copy = structuredClone(reference)
    const dependency = copy.experiment.referenceModule!.dependencies[0]
    if (field === 'sha256') dependency[field] = 'incorrect'
    else dependency[field] = -1
    assert.throws(() => compareTextBaselines(baseline, copy), field)
  }
  const missing = structuredClone(reference)
  missing.experiment.referenceModule!.dependencies = []
  assert.throws(() => compareTextBaselines(baseline, missing))
  const opaque = reference.workloads.find((entry) => entry.shape === 'opaque')!
  assert.equal(opaque.semantics.status, 'supported')
  assert.equal(opaque.retainedHost, true)
  const press = opaque.operations.find((entry) => entry.name === 'one-button-press')!
  assert.equal(press.textExecutions['label-0'].renders, 1)
  for (const [id, counts] of Object.entries(press.textExecutions))
    if (id !== 'label-0') assert.equal(counts.renders, 0)
  assert.equal(
    comparison.workloadSupport.find((entry) => entry.shape === 'opaque')!.equalFeatureWork,
    baseline.workloads.find((entry) => entry.shape === 'opaque')!.semantics.status === 'supported',
  )
})

test('paint updates bypass memo only for paint/general readers, not metrics-only or legacy-size readers', () => {
  resetTextCounts()
  const reads = { metrics: 0, paint: 0, oldSize: 0 }
  const observed: Record<string, unknown> = {}
  const Metrics = React.memo(() => {
    reads.metrics += 1
    observed.metrics = useReferenceMetrics()
    return null
  })
  const Paint = React.memo(() => {
    reads.paint += 1
    observed.paint = useReferencePaint()
    return null
  })
  const OldSize = React.memo(() => {
    reads.oldSize += 1
    observed.oldSize = React.useContext(HozoTextSizeContext)
    return null
  })
  const MemoText = React.memo(ReferenceText)
  const children = React.createElement(
    React.Fragment,
    null,
    React.createElement(Metrics),
    React.createElement(Paint),
    React.createElement(OldSize),
    React.createElement(MemoText, { testID: 'general' }, 'Label'),
  )
  const scene = (color: string, fontSize: number) =>
    React.createElement(ReferenceView, { style: { color, fontSize } }, children)
  let tree: ReturnType<typeof renderer.create>
  try {
    renderer.act(() => {
      tree = renderer.create(scene('#112233', 20))
    })
    assert.deepEqual(reads, { metrics: 1, paint: 1, oldSize: 1 })
    renderer.act(() => tree.update(scene('#334455', 20)))
    assert.deepEqual(reads, { metrics: 1, paint: 2, oldSize: 1 })
    assert.equal(style(tree, 'general').color, '#334455')
    assert.equal(textCounts().general.renders, 2, 'memo does not block a real context update')
    renderer.act(() => tree.update(scene('#334455', 20)))
    assert.deepEqual(reads, { metrics: 1, paint: 2, oldSize: 1 })
    assert.equal(textCounts().general.renders, 2, 'equal scalar values keep stable records')
    renderer.act(() => tree.update(scene('#334455', 24)))
    assert.deepEqual(reads, { metrics: 2, paint: 2, oldSize: 2 })
    assert.equal(observed.oldSize, 24)
    assert.equal(style(tree, 'general').fontSize, 24)
    assert.equal(textCounts().general.mounts, 1)
  } finally {
    renderer.act(() => tree?.unmount())
  }
  assert.equal(textCounts().general.unmounts, 1)
})

test('inner effective overrides shield descendants; removing them resumes inheritance without remounting', () => {
  resetTextCounts()
  const MemoText = React.memo(ReferenceText)
  const label = React.createElement(MemoText, { testID: 'shielded' }, 'Label')
  const scene = (outer: string, own?: object) =>
    React.createElement(
      ReferenceView,
      { style: { color: outer, fontSize: 20 } },
      React.createElement(ReferenceView, { style: own }, label),
    )
  let tree: ReturnType<typeof renderer.create>
  try {
    const own = { color: '#abcdef', fontSize: 30 }
    renderer.act(() => {
      tree = renderer.create(scene('#112233', own))
    })
    const first = tree.root.findAll((node: { type: string }) => node.type === 'Text')[0]
    renderer.act(() => tree.update(scene('#334455', own)))
    assert.equal(textCounts().shielded.renders, 1)
    assert.equal(style(tree, 'shielded').color, '#abcdef')
    renderer.act(() => tree.update(scene('#334455')))
    assert.equal(style(tree, 'shielded').color, '#334455')
    assert.equal(style(tree, 'shielded').fontSize, 20)
    assert.equal(textCounts().shielded.mounts, 1)
    assert.equal(textCounts().shielded.unmounts, 0)
    assert.equal(tree.root.findAll((node: { type: string }) => node.type === 'Text')[0], first)
  } finally {
    renderer.act(() => tree?.unmount())
  }
})

test('generic Text still over-subscribes when its own color masks an ancestor; report rather than conceal that cost', () => {
  resetTextCounts()
  const MemoText = React.memo(ReferenceText)
  const own = { color: '#000000', fontSize: 12 }
  const child = React.createElement(MemoText, { testID: 'masked', style: own }, 'Label')
  const scene = (color: string) =>
    React.createElement(ReferenceView, { style: { color, fontSize: 20 } }, child)
  let tree: ReturnType<typeof renderer.create>
  try {
    renderer.act(() => {
      tree = renderer.create(scene('#112233'))
    })
    renderer.act(() => tree.update(scene('#334455')))
    assert.equal(style(tree, 'masked').color, '#000000')
    assert.equal(style(tree, 'masked').fontSize, 12)
    assert.equal(textCounts().masked.renders, 2, 'ordinary useContext is not property-selective')
    assert.equal(textCounts().masked.mounts, 1)
  } finally {
    renderer.act(() => tree?.unmount())
  }
})

test('absent local fields resume inheritance while style arrays keep explicit values and unrelated styles', () => {
  resetTextCounts()
  const scene = (own: object) =>
    React.createElement(
      ReferenceView,
      { style: { color: '#123456', fontSize: 20 } },
      React.createElement(
        ReferenceText,
        { testID: 'label', style: [{ opacity: 0.5 }, own] },
        'Label',
      ),
    )
  let tree: ReturnType<typeof renderer.create>
  try {
    renderer.act(() => {
      tree = renderer.create(scene({ color: '#abcdef', fontSize: 12 }))
    })
    assert.equal(style(tree, 'label').color, '#abcdef')
    assert.equal(style(tree, 'label').fontSize, 12)
    renderer.act(() => tree.update(scene({ color: undefined, fontSize: undefined })))
    assert.equal(style(tree, 'label').color, '#123456')
    assert.equal(style(tree, 'label').fontSize, 20)
    assert.equal(style(tree, 'label').opacity, 0.5)
    assert.equal(textCounts().label.mounts, 1)
  } finally {
    renderer.act(() => tree?.unmount())
  }
})

test('opaque label uses the real press owner and evaluates its compiler-style callback once per state update', () => {
  resetTextCounts()
  let resolutions = 0
  const MemoLabel = React.memo(() =>
    React.createElement(ReferenceText, { testID: 'label' }, 'Opaque'),
  )
  const resolve = ({ pressed }: { pressed: boolean }) => {
    resolutions += 1
    return { color: pressed ? '#abcdef' : '#123456', fontSize: 20 }
  }
  let tree: ReturnType<typeof renderer.create>
  try {
    renderer.act(() => {
      tree = renderer.create(
        React.createElement(
          ReferencePressable,
          { hozoTextStyle: resolve },
          React.createElement(MemoLabel),
        ),
      )
    })
    assert.equal(resolutions, 1)
    const host = () => tree.root.findAll((node: { type: string }) => node.type === 'Pressable')[0]
    renderer.act(() => host().props.onPressIn({ nativeEvent: {} }))
    assert.equal(resolutions, 2)
    assert.equal(style(tree, 'label').color, '#abcdef')
    renderer.act(() => host().props.onPressOut({ nativeEvent: {} }))
    assert.equal(resolutions, 3)
    assert.equal(style(tree, 'label').color, '#123456')
    assert.equal(textCounts().label.mounts, 1)
  } finally {
    renderer.act(() => tree?.unmount())
  }
})

test('unassessed animation and authored style callbacks are rejected, not silently certified', () => {
  assert.throws(() => ReferencePressable({ hozoTransition: {} }), /not assessed/)
  assert.throws(
    () => ReferencePressable({ style: () => ({ color: '#123456' }) }),
    /host style callbacks/,
  )
})

test('existing uncompiled relative typography reads the same resolved size and keeps explicit overrides', () => {
  resetTextCounts()
  const { Small } = require('../../typography/src/index.native.tsx')
  // Unlike the compiler-only bare-UA fixtures, the unconfigured runtime
  // project entry deliberately defaults to Tailwind preflight (0.8).
  assert.equal(require('@hozo/engine/project').hozoPreflight, true)
  const children = React.createElement(
    React.Fragment,
    null,
    React.createElement(Small, { testID: 'relative' }, 'Small'),
    React.createElement(Small, { testID: 'explicit', style: { fontSize: 9 } }, 'Explicit'),
  )
  const scene = (fontSize: number) =>
    React.createElement(ReferenceView, { style: { fontSize } }, children)
  let tree: ReturnType<typeof renderer.create>
  try {
    renderer.act(() => {
      tree = renderer.create(scene(20))
    })
    assert.equal(style(tree, 'relative').fontSize, 16)
    assert.equal(style(tree, 'explicit').fontSize, 9)
    renderer.act(() => tree.update(scene(30)))
    assert.equal(style(tree, 'relative').fontSize, 24)
    assert.equal(style(tree, 'explicit').fontSize, 9)
    assert.equal(textCounts().relative.mounts, 1)
  } finally {
    renderer.act(() => tree?.unmount())
  }
})

test('nested controls inherit resolved styles without borrowing the outer control state', () => {
  resetTextCounts()
  const label = (id: string) => React.createElement(ReferenceText, { testID: id }, id)
  const scene = React.createElement(
    ReferencePressable,
    {
      testID: 'outer',
      hozoTextStyle: ({ pressed }: { pressed: boolean }) => ({
        color: pressed ? '#222222' : '#111111',
      }),
    },
    label('outer-label'),
    React.createElement(
      ReferencePressable,
      {
        testID: 'inner',
        hozoTextStyle: ({ pressed }: { pressed: boolean }) => ({
          color: pressed ? '#444444' : '#333333',
        }),
      },
      label('inner-label'),
    ),
  )
  let tree: ReturnType<typeof renderer.create>
  const host = (id: string) =>
    tree.root.findAll(
      (node: { type: string; props: { testID?: string } }) =>
        node.type === 'Pressable' && node.props.testID === id,
    )[0]
  try {
    renderer.act(() => {
      tree = renderer.create(scene)
    })
    renderer.act(() => host('outer').props.onPressIn({ nativeEvent: {} }))
    assert.equal(style(tree, 'outer-label').color, '#222222')
    assert.equal(style(tree, 'inner-label').color, '#333333')
    renderer.act(() => host('inner').props.onPressIn({ nativeEvent: {} }))
    assert.equal(style(tree, 'outer-label').color, '#222222')
    assert.equal(style(tree, 'inner-label').color, '#444444')
    assert.equal(textCounts()['inner-label'].mounts, 1)
  } finally {
    renderer.act(() => tree?.unmount())
  }
})
