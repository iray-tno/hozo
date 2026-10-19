// Equal-feature B/C: all fields are independently expected, including the
// partial/open cases that must retain inheritance and owner publication.
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
import { proveClosedText } from './text-inheritance-closed-proof.ts'
import { resetTextCounts, textCounts } from './text-inheritance-host.ts'
import {
  referenceExecutions,
  referenceReads,
  resetReferenceExecutions,
} from './text-inheritance-reference.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const stub = require('./react-native-stub.js')

// Keep the source literal separate from expected values. Changing a source
// value must not automatically change the measurement's oracle.
export const CLOSED_STYLE = `{color:'#102030',fontSize:12,fontWeight:'600',lineHeight:18,letterSpacing:1,textAlign:'left',textTransform:'uppercase',opacity:0.5}`
export const CLOSED_CLASS =
  'text-[#102030] text-[12px] font-semibold leading-[18px] tracking-[1px] text-left uppercase opacity-50'
type StyleForm = 'inline' | 'registered'
export const CLOSED_EXPECTED = {
  color: '#102030',
  fontSize: 12,
  fontWeight: '600',
  lineHeight: 18,
  letterSpacing: 1,
  textAlign: 'left',
  textTransform: 'uppercase',
}
const RESTING = {
  color: '#112233',
  fontSize: 20,
  fontWeight: '400',
  lineHeight: 28,
  letterSpacing: 2,
  textAlign: 'center',
  textTransform: 'lowercase',
}
const COLOR = { ...RESTING, color: '#654321' }
const METRICS = {
  color: '#654321',
  fontSize: 24,
  fontWeight: '700',
  lineHeight: 32,
  letterSpacing: 3,
  textAlign: 'right',
  textTransform: 'capitalize',
}

const modules = {
  scene: `import {View} from '@hozo/core'; import {Fragment} from 'react'
import {Closed} from 'fixture:closed'; import {Partial} from 'fixture:partial'
import {Open} from 'fixture:open'; import {Owner} from 'fixture:owner'
export function Scene({rows,frame,opacity,tick}) {return <View style={{...frame,opacity}}>
{Array.from({length:rows},(_,index)=><Fragment key={index}><Closed index={index} accessibilityLabel={'tick'+tick}/><Partial index={index}/><Open index={index}/><Owner index={index}/></Fragment>)}
</View>}`,
  closed: `import {Text} from '@hozo/core'; import {memo} from 'react'
export const Closed=memo(function Closed({index,accessibilityLabel}) {return <Text testID={'closed-'+index} accessibilityLabel={accessibilityLabel} style={${CLOSED_STYLE}}>Closed</Text>})`,
  partial: `import {Text} from '@hozo/core'; import {memo} from 'react'
export const Partial=memo(function Partial({index}) {return <Text testID={'partial-'+index} style={{color:'#102030',fontSize:12}}>Partial</Text>})`,
  open: `import {Text} from '@hozo/core'; import {memo} from 'react'
export const Open=memo(function Open({index}) {return <Text testID={'open-'+index}>Open</Text>})`,
  owner: `import {Text} from '@hozo/core'; import {memo} from 'react'; import {Child} from 'fixture:child'
export const Owner=memo(function Owner({index}) {return <Text testID={'owner-'+index} style={${CLOSED_STYLE}}><Child index={index}/></Text>})`,
  child: `import {Text} from '@hozo/core'; import {memo} from 'react'
export const Child=memo(function Child({index}) {return <Text testID={'child-'+index}>Opaque</Text>})`,
}
const delta = (before: Record<string, number>, after: Record<string, number>) =>
  Object.fromEntries(Object.entries(after).map(([key, value]) => [key, value - (before[key] ?? 0)]))

export function measureClosedText(rows = 8, optimize = false, styleForm: StyleForm = 'inline') {
  assert.ok(Number.isInteger(rows) && rows > 0 && rows <= 1000, 'rows must be 1..1000')
  const sources =
    styleForm === 'inline'
      ? modules
      : {
          ...modules,
          // The class is lowered by the real compiler. A final own override also
          // exercises the generated registered-style/inline array in source order.
          closed: modules.closed.replace(
            `style={${CLOSED_STYLE}}`,
            `className="${CLOSED_CLASS.replace('text-[#102030]', 'text-[#445566]')}" style={{color:'#102030'}}`,
          ),
          partial: modules.partial.replace(
            "style={{color:'#102030',fontSize:12}}",
            'className="text-[#102030] text-[12px]"',
          ),
          owner: modules.owner.replace(`style={${CLOSED_STYLE}}`, `className="${CLOSED_CLASS}"`),
        }
  const compiled = compileTextGraph(
    sources,
    [],
    'reference-intent',
    optimize ? proveClosedText : undefined,
  )
  resetTextCounts()
  resetReferenceExecutions()
  let tree: ReturnType<typeof renderer.create>
  const operations = []
  const props = { rows, frame: RESTING, opacity: 1, tick: 0 }
  const scene = () => React.createElement(compiled.exports.Scene, props)
  const perform = (name: string, expectedFrame: typeof RESTING, work: () => void) => {
    const before = textCounts()
    const reads = referenceReads()
    const helpers = referenceExecutions()
    renderer.act(work)
    const actual: Record<string, Record<string, unknown>> = {}
    if (name !== 'unmount') {
      const hosts = tree.root.findAll((node: { type: string }) => node.type === 'Text')
      assert.equal(hosts.length, rows * 5)
      for (const node of hosts) {
        const id = node.props.testID as string
        assert.ok(!Object.hasOwn(actual, id), `duplicate host ${id}`)
        actual[id] = stub.StyleSheet.flatten(node.props.style)
      }
    }
    operations.push({
      name,
      expectedFrame,
      actual,
      textExecutions: Object.fromEntries(
        Object.entries(textCounts()).map(([id, counts]) => [id, delta(before[id] ?? {}, counts)]),
      ),
      contextReadHookCalls: delta(reads, referenceReads()),
      helperExecutions: delta(helpers, referenceExecutions()),
    })
  }
  try {
    perform('mount', RESTING, () => {
      tree = renderer.create(scene())
    })
    perform('color-only', COLOR, () => {
      props.frame = COLOR
      tree.update(scene())
    })
    perform('metrics-change', METRICS, () => {
      props.frame = METRICS
      tree.update(scene())
    })
    perform('equal-values', METRICS, () => tree.update(scene()))
    perform('unrelated-parent-style', METRICS, () => {
      props.opacity = 0.8
      tree.update(scene())
    })
    perform('parent-driven-label-update', METRICS, () => {
      props.tick += 1
      tree.update(scene())
    })
    perform('restore', RESTING, () => {
      props.frame = RESTING
      tree.update(scene())
    })
    perform('unmount', RESTING, () => {
      tree.unmount()
      tree = undefined
    })
    return {
      rows,
      optimize,
      styleForm,
      modules: compiled.modules,
      operations,
      lifetime: textCounts(),
    }
  } finally {
    if (tree) renderer.act(() => tree.unmount())
  }
}

export function captureClosedTextProof(rows = 8, styleForm: StyleForm = 'inline') {
  const control = captureTextBaseline(rows, 'reference-intent')
  assert.equal(control.compatibilityComplete, true, 'the selected control corpus must still pass')
  const cases = measureTextFixtures('reference-intent', proveClosedText)
  const workloads = [
    measureTextWorkload(rows, 'reference-intent', 'closed', proveClosedText),
    measureTextWorkload(rows, 'reference-intent', 'opaque', proveClosedText),
  ]
  for (const [index, entry] of cases.entries()) {
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
  for (const [index, workload] of workloads.entries()) {
    assert.deepEqual(workload.semantics, control.workloads[index].semantics)
    assert.equal(workload.retainedHost, true)
    assert.deepEqual(workload.operations, control.workloads[index].operations)
  }
  const before = measureClosedText(rows, false, styleForm)
  const after = measureClosedText(rows, true, styleForm)
  for (const [index, operation] of after.operations.entries()) {
    assert.equal(operation.name, before.operations[index].name)
    assert.deepEqual(operation.actual, before.operations[index].actual)
    const previous = before.operations[index]
    if (['mount', 'color-only', 'metrics-change', 'restore'].includes(operation.name)) {
      for (const channel of ['metrics', 'paint', 'legacySize'])
        assert.equal(
          previous.contextReadHookCalls[channel] - operation.contextReadHookCalls[channel],
          rows,
        )
      for (const helper of ['Scope', 'ReferenceText'])
        assert.equal(previous.helperExecutions[helper] - operation.helperExecutions[helper], rows)
    }
    if (['color-only', 'metrics-change', 'restore'].includes(operation.name))
      for (let row = 0; row < rows; row += 1) {
        assert.equal(previous.textExecutions[`closed-${row}`].renders, 1)
        assert.equal(operation.textExecutions[`closed-${row}`].renders, 0)
        assert.equal(operation.textExecutions[`partial-${row}`].renders, 1)
        assert.equal(operation.textExecutions[`open-${row}`].renders, 1)
      }
    if (operation.name === 'unmount') continue
    for (let row = 0; row < rows; row += 1)
      for (const prefix of ['closed', 'partial', 'open', 'owner', 'child']) {
        const expected =
          prefix === 'open'
            ? operation.expectedFrame
            : prefix === 'partial'
              ? { ...operation.expectedFrame, color: '#102030', fontSize: 12 }
              : CLOSED_EXPECTED
        for (const [key, value] of Object.entries(expected))
          assert.equal(
            operation.actual[`${prefix}-${row}`][key],
            value,
            `${operation.name} ${prefix} ${key}`,
          )
      }
  }
  for (const result of [before, after])
    for (const counts of Object.values(result.lifetime)) {
      assert.equal(counts.mounts, 1)
      assert.equal(counts.unmounts, 1)
    }
  // The switch is loader wiring only, with no new runtime module or code
  // bytes. Record that switch so equal byte counts cannot hide a new path.
  for (const [name, value] of Object.entries(after.modules)) {
    const old = before.modules[name] as { transformed: string; minifiedModuleBytes: number }
    const current = value as {
      transformed: string
      minifiedModuleBytes: number
      experiment: { plainText: boolean }
    }
    assert.equal(current.transformed, old.transformed)
    assert.equal(current.minifiedModuleBytes, old.minifiedModuleBytes)
    assert.equal(current.experiment.plainText, name === 'closed')
  }
  const proofSources = [
    'text-inheritance-closed-proof.ts',
    'text-inheritance-proof-boundary.ts',
    'text-inheritance-style-proof.ts',
    'text-inheritance-closed-workload.ts',
  ].map((name) => {
    const source = readFileSync(new URL(name, import.meta.url), 'utf8')
    return { name, source, sha256: createHash('sha256').update(source).digest('hex') }
  })
  return {
    schemaVersion: 1,
    kind:
      styleForm === 'inline'
        ? 'test-only-closed-text-fast-path'
        : 'test-only-registered-text-fast-path',
    styleForm,
    provenance: control.provenance,
    babel: require('@babel/core/package.json').version,
    proofSources,
    control,
    optimized: { cases, workloads },
    closedWorkload: { before, after },
    validated: true,
    timingAssessed: false,
    limits: [
      'private post-Metro proof/loader wiring; no production enablement',
      'only complete scalar frames, literal children and stable memo roots; inline objects or non-escaping local StyleSheet.create members/static arrays',
      'all uses of the RN Text binding must be covered; mixed/escaped uses retain context',
      'the enclosing View and unrelated open Text remain contextual',
      'hook calls and helper executions are not live subscriptions, native commits or timing',
      'selected corpus only; existing simulated-host, concurrency, animation, portal and device limits remain',
    ],
  }
}
