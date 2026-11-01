// Actual Native backend carrier -> existing Tabs -> existing Pressable owners.
// RN hosts remain stand-ins. This is delivery evidence, not an audited contract.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { evidenceSource } from '../../../scripts/style-slots/evidence-source.mjs'
import { tabsProbeOwnerShadow } from '../../../scripts/style-slots/tabs-owner-shadow.mjs'
import {
  expectedTabRows,
  prepareTabsProbe,
  tabLabelClasses,
  tabPhases,
  tabsProbeRoot,
} from '../../../scripts/style-slots/tabs-probe.mjs'
import { createCompiler } from '../../compiler/src/index.ts'
import { prepareOwnerLiteralCallers } from '../../compiler/src/owner-caller-plan.ts'
import {
  captureOwnerManifests,
  collectOwnerPackageContributions,
  InstanceOwnerCallerProject,
  OwnerManifestEpoch,
  readResolvedOwnerManifest,
} from '../../compiler/src/project.ts'
import { loadNativeModule } from './native-render.ts'

type Host = {
  type: unknown
  props: {
    accessibilityRole?: string
    accessibilityState: { selected: boolean }
    disabled?: boolean
    [key: string]: unknown
    style: (state: { pressed: boolean }) => unknown
  } & Record<'onHoverIn' | 'onFocus' | 'onPressIn' | 'onPressOut' | 'onPress', (e: object) => void>
}
type Tree = {
  root: { findAll: (fn: (node: Host) => boolean) => Host[] }
  unmount: () => void
}

test('direct, caller and instance-prepared tabs match opaque resolution across state and author updates', async () => {
  const evidence = {
    schema: 1,
    ...evidenceSource(),
    passed: false,
    scope: 'native-tabs-compiled-owner-component-host-model',
    fingerprint: '',
    declarations: ['disabled', 'aria-selected', 'aria-disabled'],
    carrier: '',
    splitText: false,
    classes: '',
    stylesheetCreates: 0,
    observations: [] as unknown[],
    authorObservations: [] as unknown[],
    requests: { opaque: 0, prepared: 0, caller: 0, instance: 0 },
    callerHoistedStyleSites: 0,
    instance: null as unknown,
  }
  const project = mkdtempSync(
    path.join(tabsProbeRoot, 'packages/tailwind-conformance/.tabs-compiled-'),
  )
  const destination = path.join(
    tabsProbeRoot,
    'artifacts/style-fact-model/tabs-compiled-native.json',
  )
  const require = createRequire(import.meta.url)
  const React = require('react')
  const renderer = require('react-test-renderer')
  const rn = require('react-native')
  const trees: Tree[] = []
  let hook: ReturnType<typeof registerHooks> | undefined
  let instanceProject: InstanceOwnerCallerProject | undefined
  try {
    const compiler = createCompiler()
    const classes = tabLabelClasses
    const packageRoot = path.join(tabsProbeRoot, 'packages/patterns')
    const metadata = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
    // The selected Native entry and actual manifest are read, not a fixture's
    // one-contract JSON. The packed test separately verifies this transport.
    const edge = {
      importer: path.join(project, 'InstanceCaller.native.tsx'),
      specifier: '@hozo/patterns',
    }
    const entry = realpathSync(
      path.join(packageRoot, metadata.exports['.']['react-native'].default),
    )
    const observation = readResolvedOwnerManifest(edge, {
      packageRoot,
      entry,
      declaredManifest: metadata.hozo.manifest,
    })
    const epoch = new OwnerManifestEpoch()
    epoch.adopt(
      captureOwnerManifests([edge], [observation], {
        platform: 'ios',
        epoch: 'tabs-actual-owner-delivery',
      }),
    )
    const lease = epoch.lease()
    const packages = collectOwnerPackageContributions(lease.capture)
    assert.equal(packages.status, 'complete')
    if (packages.status !== 'complete') throw new Error('Missing package candidate facts')
    evidence.classes = classes
    const input = `import {Pressable} from '@hozo/primitives';export const Plan=()=> <Pressable className=${JSON.stringify(classes)}/>`
    const retained = compiler.prepareNativeModule(input, undefined, undefined, {
      ownerStyle: true,
      ownerFacts: ['disabled', 'aria-selected', 'aria-disabled'],
      ownerText: 'split',
    })
    const caller = prepareOwnerLiteralCallers(
      `import {Tabs} from '@hozo/patterns';export function Caller({tabs,index,onIndexChange,tabStyle}){return <Tabs tabs={tabs} index={index} onIndexChange={onIndexChange} tabStyle={tabStyle} tabClassName=${JSON.stringify(classes)}/>}`,
      compiler,
      { source: '@hozo/patterns', imported: 'Tabs', shadow: tabsProbeOwnerShadow },
    )
    const fixture = await prepareTabsProbe(
      [
        { id: 'Plan.native.tsx', revision: 'one', module: retained },
        { id: 'Caller.native.tsx', revision: 'one', module: caller },
      ],
      classes,
      packages.candidates,
    )
    let instanceContextPreparations = 0
    instanceProject = new InstanceOwnerCallerProject(lease, compiler, async (names) => {
      instanceContextPreparations++
      // Replay the one actually prepared full namespace, not a second order
      // calculation. The normal project API validates and owns its capability.
      assert.deepEqual(
        [...names],
        JSON.parse(fixture.orderSnapshot).candidates.map(
          (row: { candidate: string }) => row.candidate,
        ),
      )
      return fixture.orderSnapshot
    })
    const instance = await instanceProject.emit(
      `import {Tabs} from '@hozo/patterns';export function InstanceCaller({tabs,index,onIndexChange,tabStyle}){return <Tabs tabs={tabs} index={index} onIndexChange={onIndexChange} tabStyle={tabStyle} tabClassName=${JSON.stringify(classes)}/>}`,
      { ...edge, entry, imported: 'Tabs', classProp: 'tabClassName' },
    )
    assert.equal(instance.preview.findings[0]!.disposition, 'prepared-literal')
    assert.equal(instance.preview.contextFingerprint, fixture.fingerprint)
    assert.equal(instance.identity.owner, 'Tabs.Tab')
    assert.equal(instance.identity.instance, realpathSync(packageRoot))
    assert.equal(instanceContextPreparations, 1)
    evidence.instance = {
      identity: instance.identity,
      contextPreparations: instanceContextPreparations,
      contextFingerprint: instance.preview.contextFingerprint,
      stylesheetSites: instance.preview.code.split('.create(').length - 1,
    }
    assert.equal(instance.preview.code.split('.create(').length - 1, 1)
    const component = fixture.modules.find(
      (entry: { id: string }) => entry.id === 'Plan.native.tsx',
    )!.output.components[0]
    const carrier = component.ownerStyle
    const preview = fixture.modules.find(
      (entry: { id: string }) => entry.id === 'Caller.native.tsx',
    )!.output
    assert.equal(preview.scope, 'explicit-collected-compiler-preview')
    assert.equal(preview.contextFingerprint, fixture.fingerprint)
    assert.equal(preview.findings[0].disposition, 'prepared-literal')
    assert.ok(!preview.code.includes('tabClassName='))
    evidence.callerHoistedStyleSites = preview.code.split('.create(').length - 1
    assert.equal(evidence.callerHoistedStyleSites, 1)
    assert.ok(carrier?.callback)
    assert.equal(carrier.splitText, true)
    evidence.splitText = carrier.splitText
    assert.deepEqual(carrier.facts, evidence.declarations)
    assert.deepEqual(component.prelude, [])
    assert.ok(component.runtimeImports.every((name: string) => name === 'HozoPressable'))
    assert.ok(!carrier.expression.includes('hozoClasses'))
    evidence.fingerprint = fixture.fingerprint
    evidence.carrier = carrier.expression
    const plan = new Function(
      'StyleSheet',
      `const hozoStyles=StyleSheet.create(${component.styles});return (${carrier.expression})`,
    )({
      create(styles: unknown) {
        evidence.stylesheetCreates++
        for (const value of Object.values(styles as object)) Object.freeze(value)
        return rn.StyleSheet.create(styles)
      },
    })
    const sheet = path.join(project, 'node_modules/.hozo/candidates.native.js')
    const trace = path.join(path.dirname(sheet), 'trace.js')
    mkdirSync(path.dirname(sheet), { recursive: true })
    writeFileSync(sheet, fixture.native)
    writeFileSync(
      trace,
      `export * from './candidates.native.js';import {hozoClasses as resolve} from './candidates.native.js';
export const requests=[];export function hozoClasses(value,state){requests.push(value);return resolve(value,state)}`,
    )
    hook = registerHooks({
      resolve(specifier, context, next) {
        const url = pathToFileURL(trace).href
        if (specifier === '@hozo/engine/project') return { url, shortCircuit: true }
        const resolved = next(specifier, context)
        return resolved.url === pathToFileURL(sheet).href && context.parentURL !== url
          ? { url, shortCircuit: true }
          : resolved
      },
    })
    const app = loadNativeModule(
      `import {View} from '@hozo/primitives';export const Sentinel=()=> <View/>;export {Tabs as Raw} from '@hozo/patterns';${preview.code}`,
      project,
      { root: project },
    )
    const instanceApp = loadNativeModule(
      `import {View} from '@hozo/primitives';export const Sentinel=()=> <View/>;${instance.preview.code}`,
      project,
      { root: project },
    )
    const requests: unknown[] = require(trace).requests
    const tabs = [
      { label: 'A', content: 'one' },
      { label: 'B', content: 'two' },
      { label: 'C', content: 'three', disabled: true },
    ]
    for (const route of ['opaque', 'prepared', 'caller', 'instance'] as const) {
      const changes: number[] = []
      let select!: (at: number) => void
      let setAuthor!: (style: unknown) => void
      function Screen() {
        const [index, setIndex] = React.useState(0)
        const [author, updateAuthor] = React.useState(undefined)
        select = setIndex
        setAuthor = updateAuthor
        return React.createElement(
          route === 'instance'
            ? instanceApp.InstanceCaller
            : route === 'caller'
              ? app.Caller
              : app.Raw,
          {
            tabs,
            index,
            tabStyle: author,
            onIndexChange(at: number) {
              changes.push(at)
              setIndex(at)
            },
            ...(route === 'prepared'
              ? { hozoTabStyle: plan }
              : route === 'opaque'
                ? { tabClassName: classes }
                : {}),
          },
        )
      }
      requests.length = 0
      let tree!: Tree
      renderer.act(() => {
        tree = renderer.create(React.createElement(Screen))
      })
      trees.push(tree)
      const owners = () =>
        tree.root.findAll((n) => n.type === 'Pressable' && n.props.accessibilityRole === 'tab')
      const original = owners()
      const suppliedPlan = tree.root.findAll((node) => node.type === app.Raw)[0]!.props.hozoTabStyle
      if (route !== 'opaque') assert.equal(typeof suppliedPlan, 'function')
      assert.equal(original.length, 3)
      const readLabels = (phase: string) => {
        const labels = tree.root.findAll((node) => node.type === 'Text').slice(0, 3)
        assert.deepEqual(
          labels.map((node) => node.props.children),
          ['A', 'B', 'C'],
        )
        const expected = expectedTabRows(phase)
        return labels.map((node, at) => {
          const style = rn.StyleSheet.flatten(node.props.style)
          const actual = {
            color: style.color,
            size: style.fontSize,
            weight: style.fontWeight ?? '400',
            spacing: style.letterSpacing ?? 0,
          }
          assert.deepEqual(actual, {
            color: expected[at].selected ? '#445566' : '#334455',
            size: 18,
            weight: expected[at].disabled ? '700' : '400',
            spacing: at === 1 && phase !== 'initial' ? 1 : 0,
          })
          return actual
        })
      }
      const record = (phase: string) => {
        assert.deepEqual(owners(), original, `${route}: positional host identity`)
        assert.equal(
          tree.root.findAll((node) => node.type === app.Raw)[0]!.props.hozoTabStyle,
          suppliedPlan,
        )
        const rows = owners().map((node) => {
          const style = rn.StyleSheet.flatten(node.props.style({ pressed: false }))
          assert.equal(style.color, undefined, 'label paint must not stay on the box')
          assert.equal(style.fontSize, undefined, 'label metrics must not stay on the box')
          return {
            selected: node.props.accessibilityState.selected,
            disabled: node.props.disabled === true,
            padding: style.paddingTop ?? style.padding,
            background: style.backgroundColor,
            opacity: style.opacity ?? 1,
            border: style.borderTopWidth ?? style.borderWidth ?? 0,
            radius: style.borderTopLeftRadius ?? style.borderRadius ?? 0,
            width: style.width ?? null,
            height: style.height ?? null,
          }
        })
        assert.deepEqual(rows, expectedTabRows(phase), `${route}: ${phase}`)
        evidence.observations.push({ route, phase, rows, labels: readLabels(phase) })
      }
      const event = (name: keyof Host['props']) =>
        renderer.act(() => (owners()[1]!.props[name] as (e: object) => void)({}))
      record(tabPhases[0])
      event('onHoverIn')
      record(tabPhases[1])
      event('onFocus')
      record(tabPhases[2])
      event('onPressIn')
      record(tabPhases[3])
      event('onPressOut')
      event('onPress')
      record(tabPhases[4])
      renderer.act(() => owners()[2]!.props.onPress({}))
      assert.deepEqual(changes, [1], 'disabled owner cannot activate')
      renderer.act(() => select(2))
      record(tabPhases[5])
      assert.deepEqual(changes, [1], 'controlled input is not user activation')
      let reads = 0
      const authored = Object.freeze({
        gap: 7,
        backgroundColor: '#abcdef',
        get opacity() {
          reads++
          return 0.8
        },
      })
      const authorArray = Object.freeze([false, null, Object.freeze({ rowGap: 5 }), authored])
      const recordAuthor = (phase: string, overridden: boolean) => {
        const before = reads
        assert.equal(
          tree.root.findAll((node) => node.type === app.Raw)[0]!.props.hozoTabStyle,
          suppliedPlan,
        )
        assert.deepEqual(owners(), original, `${route}: author changes retain actual hosts`)
        const rows = owners().map((node, at) => {
          const style = rn.StyleSheet.flatten(node.props.style({ pressed: false }))
          const expected = expectedTabRows('selected-disabled')[at]
          const actual = {
            rowGap: style.rowGap,
            columnGap: style.columnGap,
            background: style.backgroundColor,
            opacity: style.opacity ?? 1,
          }
          assert.deepEqual(actual, {
            rowGap: overridden ? 5 : 3,
            columnGap: overridden ? 7 : 2,
            background: overridden ? '#abcdef' : expected.background,
            opacity: overridden ? 0.8 : expected.opacity,
          })
          return actual
        })
        evidence.authorObservations.push({
          route,
          phase,
          rows,
          getterReads: reads,
          hostEvaluationGetterReads: reads - before,
          labels: readLabels('selected-disabled'),
        })
      }
      recordAuthor('before-author', false)
      renderer.act(() => setAuthor(authorArray))
      // React 19's development profiler also reads changed props to log their
      // diff. Count the actual host-style evaluations separately from it; the
      // independent initial-mount marker test checks eager label evaluation.
      const beforeHostEvaluation = reads
      recordAuthor('with-author', true)
      assert.equal(reads - beforeHostEvaluation, 3, 'one author read per evaluated tab host')
      renderer.act(() => setAuthor(undefined))
      const afterRemoval = reads
      recordAuthor('author-removed', false)
      assert.equal(reads, afterRemoval, 'host evaluation cannot read a retired author')
      assert.equal(authored.gap, 7)
      assert.ok(Object.isFrozen(authorArray) && Object.isFrozen(authored))
      evidence.requests[route] = requests.filter((value) => value === classes).length
      if (route !== 'opaque')
        assert.ok(
          requests.every((value) => value == null),
          'no class string on prepared owners',
        )
      else
        assert.ok(
          evidence.requests.opaque > 0,
          'the traced ordinary control must resolve its input',
        )
      renderer.act(() => tree.unmount())
      trees.pop()
    }
    assert.equal(
      evidence.stylesheetCreates,
      1,
      'stylesheet is built before rendering, never on state updates',
    )
    assert.equal(evidence.observations.length, 24, 'six phases on all four routes')
    assert.equal(evidence.authorObservations.length, 12, 'author add/remove on all four routes')
    evidence.passed = true
  } catch (error) {
    Object.assign(evidence, { error: String(error) })
    throw error
  } finally {
    instanceProject?.invalidate()
    for (const tree of trees) renderer.act(() => tree.unmount())
    hook?.deregister()
    rmSync(project, { recursive: true, force: true })
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, `${JSON.stringify(evidence, null, 2)}\n`)
  }
})
