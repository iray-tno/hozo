// Actual Native backend carrier -> existing Tabs -> existing Pressable owners.
// RN hosts remain stand-ins. This is delivery evidence, not an audited contract.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { evidenceSource } from '../../../scripts/style-slots/evidence-source.mjs'
import {
  expectedTabRows,
  prepareTabsProbe,
  tabClasses,
  tabPhases,
  tabsProbeRoot,
} from '../../../scripts/style-slots/tabs-probe.mjs'
import { createCompiler } from '../../compiler/src/index.ts'
import { loadNativeModule } from './native-render.ts'

type Host = {
  type: unknown
  props: {
    accessibilityRole?: string
    accessibilityState: { selected: boolean }
    disabled?: boolean
    style: (state: { pressed: boolean }) => unknown
  } & Record<'onHoverIn' | 'onFocus' | 'onPressIn' | 'onPressOut' | 'onPress', (e: object) => void>
}
type Tree = {
  root: { findAll: (fn: (node: Host) => boolean) => Host[] }
  unmount: () => void
}

test('compiled tab carrier matches opaque candidate resolution at all 18 actual owner observations', async () => {
  const evidence = {
    schema: 1,
    ...evidenceSource(),
    passed: false,
    scope: 'native-tabs-compiled-owner-component-host-model',
    fingerprint: '',
    declarations: ['disabled', 'aria-selected', 'aria-disabled'],
    carrier: '',
    stylesheetCreates: 0,
    observations: [] as unknown[],
    requests: { opaque: 0, prepared: 0 },
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
  try {
    const compiler = createCompiler()
    const input = `import {Pressable} from '@hozo/primitives';export const Plan=()=> <Pressable className=${JSON.stringify(tabClasses)}/>`
    const retained = compiler.prepareNativeModule(input, undefined, undefined, {
      ownerStyle: true,
      ownerFacts: ['disabled', 'aria-selected', 'aria-disabled'],
    })
    const fixture = await prepareTabsProbe([
      { id: 'Plan.native.tsx', revision: 'one', module: retained },
    ])
    const component = fixture.modules[0].output.components[0]
    const carrier = component.ownerStyle
    assert.ok(carrier?.callback)
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
      `import {View} from '@hozo/primitives';export const Sentinel=()=> <View/>;export {Tabs as Raw} from '@hozo/patterns';`,
      project,
      { root: project },
    )
    const requests: unknown[] = require(trace).requests
    const tabs = [
      { label: 'A', content: 'one' },
      { label: 'B', content: 'two' },
      { label: 'C', content: 'three', disabled: true },
    ]
    for (const route of ['opaque', 'prepared'] as const) {
      const changes: number[] = []
      let select!: (at: number) => void
      function Screen() {
        const [index, setIndex] = React.useState(0)
        select = setIndex
        return React.createElement(app.Raw, {
          tabs,
          index,
          onIndexChange(at: number) {
            changes.push(at)
            setIndex(at)
          },
          ...(route === 'prepared' ? { hozoTabStyle: plan } : { tabClassName: tabClasses }),
        })
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
      assert.equal(original.length, 3)
      const record = (phase: string) => {
        assert.deepEqual(owners(), original, `${route}: positional host identity`)
        const rows = owners().map((node) => {
          const style = rn.StyleSheet.flatten(node.props.style({ pressed: false }))
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
        evidence.observations.push({ route, phase, rows })
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
      evidence.requests[route] = requests.filter((value) => value === tabClasses).length
      if (route === 'prepared')
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
    assert.equal(evidence.observations.length, 12, 'six phases on both routes')
    evidence.passed = true
  } catch (error) {
    Object.assign(evidence, { error: String(error) })
    throw error
  } finally {
    for (const tree of trees) renderer.act(() => tree.unmount())
    hook?.deregister()
    rmSync(project, { recursive: true, force: true })
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, `${JSON.stringify(evidence, null, 2)}\n`)
  }
})
