// Independent marker delivery through real Tabs/Pressable hooks. These marker
// functions are not a compiler producer; RN hosts are stand-ins, not OS proof.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { after, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { prepareTabsProbe, tabsProbeRoot } from '../../../scripts/style-slots/tabs-probe.mjs'
import { loadNativeModule } from './native-render.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const rn = require('react-native')
const fixture = await prepareTabsProbe()
const project = mkdtempSync(
  path.join(tabsProbeRoot, 'packages/tailwind-conformance/.tabs-prepared-'),
)
const sheet = path.join(project, 'node_modules/.hozo/candidates.native.js')
const trace = path.join(path.dirname(sheet), 'trace.js')
mkdirSync(path.dirname(sheet), { recursive: true })
writeFileSync(sheet, fixture.native)
writeFileSync(
  trace,
  `export * from './candidates.native.js';
import {hozoClasses as resolve} from './candidates.native.js';export const requests=[];
export function hozoClasses(value,state){requests.push(value);return resolve(value,state)}`,
)
const hook = registerHooks({
  resolve(specifier, context, next) {
    const url = pathToFileURL(trace).href
    if (specifier === '@hozo/engine/project') return { url, shortCircuit: true }
    const resolved = next(specifier, context)
    return resolved.url === pathToFileURL(sheet).href && context.parentURL !== url
      ? { url, shortCircuit: true }
      : resolved
  },
})
after(() => {
  hook.deregister()
  rmSync(project, { recursive: true, force: true })
})
const app = loadNativeModule(
  `import {View} from '@hozo/primitives';export const Sentinel=()=> <View/>;export {Tabs as Raw} from '@hozo/patterns';`,
  project,
  { root: project },
)
const requests = (require(trace) as { requests: unknown[] }).requests
type Host = { type: unknown; props: Record<string, unknown> }
type Tree = {
  root: { findAll: (fn: (node: Host) => boolean) => Host[] }
  update: (element: unknown) => void
  unmount: () => void
}
const options = [
  { label: 'A', content: 'one' },
  { label: 'B', content: 'two' },
  { label: 'C', content: 'three', disabled: true },
]
function render(props: Record<string, unknown>): Tree {
  let tree!: Tree
  renderer.act(() => {
    tree = renderer.create(React.createElement(app.Raw, { tabs: options, ...props }))
  })
  return tree
}
const tabs = (tree: Tree) =>
  tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'tab')
const labels = (tree: Tree) => tree.root.findAll((node) => node.type === 'Text')
function style(node: Host) {
  return (
    rn.StyleSheet.flatten(
      typeof node.props.style === 'function'
        ? node.props.style({ pressed: false })
        : node.props.style,
    ) ?? {}
  )
}
function event(node: Host, name: string) {
  const handler = node.props[name]
  assert.equal(typeof handler, 'function')
  renderer.act(() => (handler as (event: object) => void)({}))
}

test('prepared markers receive independent semantic/interaction snapshots and retain host identity', () => {
  const seen: Record<string, unknown>[] = []
  const plan = (state: Record<string, unknown>) => {
    seen.push({ ...state })
    return {
      padding: state['aria-selected'] ? 12 : 8,
      opacity: state.disabled ? 0.5 : 1,
      borderRadius: state.hovered ? 7 : 0,
      color: state['aria-selected'] ? 'blue' : 'red',
    }
  }
  requests.length = 0
  const tree = render({ index: 0, hozoTabStyle: plan })
  try {
    const original = tabs(tree)
    assert.equal(original.length, 3)
    assert.deepEqual(
      original.map((n) => style(n).padding),
      [12, 8, 8],
    )
    assert.deepEqual(
      original.map((n) => style(n).opacity),
      [1, 1, 0.5],
    )
    assert.deepEqual(
      labels(tree)
        .slice(0, 3)
        .map((n) => style(n).color),
      ['blue', 'red', 'red'],
    )
    event(original[1], 'onHoverIn')
    assert.deepEqual(
      tabs(tree).map((n) => style(n).borderRadius),
      [0, 7, 0],
    )
    renderer.act(() =>
      tree.update(React.createElement(app.Raw, { tabs: options, index: 2, hozoTabStyle: plan })),
    )
    assert.deepEqual(tabs(tree), original)
    assert.deepEqual(
      tabs(tree).map((n) => style(n).padding),
      [8, 8, 12],
    )
    assert.deepEqual(
      labels(tree)
        .slice(0, 3)
        .map((n) => style(n).color),
      ['red', 'red', 'blue'],
    )
    assert.ok(seen.every((s) => s.disabled === s['aria-disabled']))
    assert.ok(seen.some((s) => s.disabled && s['aria-selected']))
    assert.ok(
      requests.every((value) => value === undefined),
      'prepared owner must not resolve the removed class string',
    )
  } finally {
    renderer.act(() => tree.unmount())
  }
  requests.length = 0
  const ordinary = render({ tabClassName: fixture.classes })
  try {
    tabs(ordinary).forEach(style)
    assert.ok(
      requests.includes(fixture.classes),
      'positive control must actually resolve the ordinary class carrier',
    )
  } finally {
    renderer.act(() => ordinary.unmount())
  }
})

test('prepared classes retain the existing author normalization/evaluation boundary and restore on removal', () => {
  let reads = 0
  const authored = Object.freeze({
    gap: 7,
    get opacity() {
      reads++
      return 0.8
    },
  })
  const plan = () => Object.freeze({ rowGap: 2, columnGap: 3, opacity: 0.2, color: 'blue' })
  const tree = render({ hozoTabStyle: plan, tabStyle: [null, authored] })
  try {
    assert.equal(
      reads,
      0,
      'authors are normalized at actual style evaluation, not eager label evaluation',
    )
    const original = tabs(tree)
    for (const node of original) {
      const selected = style(node)
      assert.equal(selected.rowGap, 7)
      assert.equal(selected.columnGap, 7)
      assert.equal(selected.opacity, 0.8)
    }
    assert.equal(reads, 3, 'one own author read per evaluated tab host')
    renderer.act(() =>
      tree.update(React.createElement(app.Raw, { tabs: options, hozoTabStyle: plan })),
    )
    assert.deepEqual(tabs(tree), original)
    for (const node of tabs(tree)) {
      const selected = style(node)
      assert.equal(selected.rowGap, 2)
      assert.equal(selected.columnGap, 3)
      assert.equal(selected.opacity, 0.2)
    }
    assert.equal(reads, 3)
    assert.deepEqual(
      labels(tree)
        .slice(0, 3)
        .map((n) => style(n).color),
      ['blue', 'blue', 'blue'],
    )
  } finally {
    renderer.act(() => tree.unmount())
  }
})

test('prepared snapshot mutation cannot change real sibling facts and double application is rejected', () => {
  const tree = render({
    index: 0,
    hozoTabStyle: (state: Record<string, unknown>) => {
      state.disabled = true
      state['aria-selected'] = false
      state.hovered = true
      return { padding: 8 }
    },
  })
  try {
    tabs(tree).forEach(style)
    assert.deepEqual(
      tabs(tree).map((n) => n.props.disabled === true),
      [false, false, true],
    )
    assert.deepEqual(
      tabs(tree).map((n) => (n.props.accessibilityState as { selected: boolean }).selected),
      [true, false, false],
    )
  } finally {
    renderer.act(() => tree.unmount())
  }
  assert.throws(
    () => render({ tabClassName: 'p-2', hozoTabStyle: () => ({}) }),
    /must consume tabClassName/,
  )
})
