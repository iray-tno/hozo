// Actual Hozo hooks/components and candidate resolver; RN hosts are stand-ins,
// not proof that an OS delivers focus, presses or disabled transitions.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { evidenceSource } from '../../../scripts/style-slots/evidence-source.mjs'
import {
  expectedTabRows,
  prepareTabsProbe,
  tabPhases,
  tabsProbeRoot,
} from '../../../scripts/style-slots/tabs-probe.mjs'
import { loadNativeModule } from './native-render.ts'

type TabHost = {
  type: unknown
  props: {
    accessibilityRole?: string
    accessibilityState: { selected: boolean }
    disabled?: boolean
    style: (state: { pressed: boolean }) => unknown
  } & Record<
    'onHoverIn' | 'onFocus' | 'onPressIn' | 'onPressOut' | 'onPress',
    (event: object) => void
  >
}
type Tree = {
  root: { findAll: (predicate: (node: TabHost) => boolean) => TabHost[] }
  unmount: () => void
}

test('repeated Native tabs resolve selected/disabled and interaction facts only on their actual owners', async () => {
  const evidence = {
    schema: 1,
    ...evidenceSource(),
    passed: false,
    scope: 'native-tabs-component-host-model',
    fingerprint: '',
    observations: [] as unknown[],
  }
  const destination = path.join(tabsProbeRoot, 'artifacts/style-fact-model/tabs-native.json')
  const project = mkdtempSync(
    path.join(tabsProbeRoot, 'packages/tailwind-conformance/.tabs-owner-'),
  )
  const require = createRequire(import.meta.url)
  const React = require('react')
  const renderer = require('react-test-renderer')
  const rn = require('react-native')
  let tree: Tree | undefined
  let hook: ReturnType<typeof registerHooks> | undefined
  try {
    const fixture = await prepareTabsProbe()
    evidence.fingerprint = fixture.fingerprint
    const sheet = path.join(project, 'candidates.js')
    writeFileSync(sheet, fixture.native)
    hook = registerHooks({
      resolve(specifier, context, next) {
        return specifier === '@hozo/engine/project'
          ? { url: pathToFileURL(sheet).href, shortCircuit: true }
          : next(specifier, context)
      },
    })
    const source = `import {useState} from 'react';import {Tabs} from '@hozo/patterns';import {View} from '@hozo/primitives';export const Sentinel=()=> <View/>;
export const actions={};export const changes=[];
export function App(){const [index,setIndex]=useState(0);actions.select=setIndex;
return <Tabs index={index} onIndexChange={at=>{changes.push(at);setIndex(at)}} tabClassName={${JSON.stringify(fixture.classes)}} tabs={[{label:'A',content:'one'},{label:'B',content:'two'},{label:'C',content:'three',disabled:true}]}/>}`
    const app = loadNativeModule(source, project, { root: project })
    renderer.act(() => {
      tree = renderer.create(React.createElement(app.App))
    })
    const tabs = () =>
      tree!.root.findAll(
        (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'tab',
      )
    const original = tabs()
    assert.equal(original.length, 3)
    const record = (phase: string) => {
      const current = tabs()
      assert.deepEqual(
        current,
        original,
        'owner identity is by existing positional key, not its selected state',
      )
      const selected = current.map((node) => {
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
      evidence.observations.push({ phase, selected })
      assert.deepEqual(selected, expectedTabRows(phase))
    }
    record(tabPhases[0])
    renderer.act(() => original[1].props.onHoverIn({}))
    record(tabPhases[1])
    renderer.act(() => tabs()[1].props.onFocus({}))
    record(tabPhases[2])
    renderer.act(() => tabs()[1].props.onPressIn({}))
    record(tabPhases[3])
    renderer.act(() => {
      tabs()[1].props.onPressOut({})
      tabs()[1].props.onPress({})
    })
    record(tabPhases[4])
    assert.deepEqual(app.changes, [1])
    // Even bypassing RN's input suppression cannot select an unavailable tab.
    renderer.act(() => tabs()[2].props.onPress({}))
    assert.deepEqual(app.changes, [1])
    renderer.act(() => app.actions.select(2))
    record(tabPhases[5])
    assert.deepEqual(app.changes, [1], 'controlled input is not a user activation')
    assert.equal(evidence.observations.length, 6)
    assert.equal(readFileSync(sheet, 'utf8'), fixture.native, 'state updates never rebuild the map')
    evidence.passed = true
  } catch (error) {
    Object.assign(evidence, { error: String(error) })
    throw error
  } finally {
    if (tree) renderer.act(() => tree.unmount())
    hook?.deregister()
    rmSync(project, { recursive: true, force: true })
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, `${JSON.stringify(evidence, null, 2)}\n`)
  }
})
