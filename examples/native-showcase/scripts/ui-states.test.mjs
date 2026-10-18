// Fixture wiring and Native compiler evidence, not widget pixels or an OS run.
// Real pattern/host class delivery is tested by native-control-indicators.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createCompiler } from '../../../packages/compiler/src/index.ts'
import { transformHozoSource } from '../../../packages/metro/src/transform.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const React = require('react')
const { act } = React
const { create } = require('react-test-renderer')
const { transformSync } = require('esbuild')
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const sceneFile = path.join(root, '../showcase/src/ui-states.tsx')
const source = readFileSync(sceneFile, 'utf8')
const names = [
  'Tabs',
  'Accordion',
  'Radio',
  'Listbox',
  'Menu',
  'Chip',
  'Pagination',
  'Tree',
  'Checkbox',
  'Switch',
]
const ui = Object.fromEntries([...names, 'RadioGroup', 'Button'].map((name) => [name, `Ui${name}`]))
function evaluate(code, load) {
  const module = { exports: {} }
  const output = transformSync(code, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code
  new Function('require', 'module', 'exports', output)(load, module, module.exports)
  return module.exports
}
const { uiStateScenes } = evaluate(source, (name) => {
  if (name === 'react' || name === 'react/jsx-runtime') return require(name)
  if (name === '@hozo/primitives') return { View: 'View', Text: 'Text' }
  if (name === '@hozo/typography') return { Heading: 'Heading' }
  if (name === '@hozo/patterns') return { Chip: 'PatternChip' }
  if (name === '@hozo/ui') return ui
  throw new Error(`Unexpected shared UI dependency: ${name}`)
})
async function mount(t, name) {
  let tree
  await act(() => {
    tree = create(React.createElement(uiStateScenes[name]))
  })
  t.after(async () => {
    await act(() => tree.unmount())
  })
  return tree
}

test('both Storybook hosts publish the same ten real shared scene functions', () => {
  assert.deepEqual(Object.keys(uiStateScenes), names)
  assert.doesNotMatch(source, /from ['"](?:react-native|@storybook\/)|\b(?:window|document)\./)
  for (const host of ['src/UiStates.stories.tsx', '../storybook-demo/src/UiStates.stories.tsx']) {
    const stories = evaluate(readFileSync(path.join(root, host), 'utf8'), (name) => {
      if (name === '@hozo/example-showcase') return { uiStateScenes }
      if (name === 'react/jsx-runtime') return require(name)
      if (name === 'react-native') return { ScrollView: 'ScrollView' }
      throw new Error(`Unexpected story dependency: ${name}`)
    })
    assert.equal(stories.default.title, 'UI/Shared state checks')
    assert.deepEqual(
      Object.keys(stories)
        .filter((name) => name !== 'default')
        .sort(),
      [...names].sort(),
    )
    for (const name of names)
      assert.equal(stories[name].render, uiStateScenes[name], `${host}: ${name}`)
  }
})

test('shared reference matrices retain six checkbox and four switch states with live enabled rows', async (t) => {
  for (const [name, expected, boundary] of [
    ['Checkbox', [false, true, 'mixed', false, true, 'mixed'], 3],
    ['Switch', [false, true, false, true], 2],
  ]) {
    const tree = await mount(t, name)
    const controls = () => tree.root.findAllByType(`Ui${name}`)
    assert.deepEqual(
      controls().map((node) => node.props.checked),
      expected,
    )
    assert.deepEqual(
      controls().map((node) => node.props.disabled),
      expected.map((_, index) => index >= boundary),
    )
    assert.equal(
      new Set(controls().map((node) => node.props.accessibilityLabel)).size,
      expected.length,
    )
    await act(() => controls()[0].props.onCheckedChange(true))
    assert.deepEqual(
      controls().map((node) => node.props.checked),
      [true, ...expected.slice(1)],
    )
    assert.match(controls()[0].props.accessibilityLabel, name === 'Checkbox' ? /checked/ : /on/)
  }
})

test('shared selection screens expose deterministic defaults, disabled choices and live callbacks', async (t) => {
  for (const [name, host, prop, callback, initial, next] of [
    ['Tabs', 'UiTabs', 'index', 'onIndexChange', 0, 1],
    ['Radio', 'UiRadioGroup', 'value', 'onValueChange', 'express', 'standard'],
    ['Listbox', 'UiListbox', 'value', 'onValueChange', ['standard'], ['standard', 'express']],
    ['Tree', 'UiTree', 'selectedId', 'onSelect', 'intro', 'guide'],
    ['Pagination', 'UiPagination', 'page', 'onPageChange', 2, 3],
    ['Chip', 'PatternChip', 'selected', 'onSelectedChange', true, false],
  ]) {
    const tree = await mount(t, name)
    const control = () => tree.root.findAllByType(host)[0]
    assert.deepEqual(control().props[prop], initial, name)
    const choices = control().props.tabs ?? control().props.options ?? control().props.nodes
    if (choices) assert.equal(choices.at(-1).disabled, true, name)
    if (name === 'Tree') assert.deepEqual(control().props.defaultExpanded, ['docs'])
    if (name === 'Listbox') assert.equal(control().props.multiple, true)
    await act(() => control().props[callback](next))
    assert.deepEqual(control().props[prop], next, name)
    if (name === 'Pagination') {
      const buttons = tree.root.findAllByType('UiButton')
      await act(() => buttons[0].props.onPress())
      assert.equal(control().props.page, 1)
      await act(() => buttons[1].props.onPress())
      assert.equal(control().props.page, 5)
    }
    if (name === 'Chip') {
      assert.deepEqual(
        tree.root
          .findAllByType(host)
          .slice(2)
          .map((node) => node.props.disabled),
        [true, true],
      )
    }
  }
})

test('shared accordion and menu retain expanded, collapsed and disabled/action fixtures', async (t) => {
  const accordion = (await mount(t, 'Accordion')).root.findByType('UiAccordion')
  assert.equal(accordion.props.defaultExpanded, 'shipping')
  assert.equal(accordion.props.items.length, 3)
  assert.equal(accordion.props.items[2].disabled, true)
  const tree = await mount(t, 'Menu')
  const menu = tree.root.findByType('UiMenu')
  assert.equal(menu.props.items[2].disabled, true)
  assert.equal(menu.props.trigger, 'Open UI actions')
  await act(() => menu.props.items[1].onSelect())
  assert.ok(tree.root.findAllByType('Text').some((node) => node.children.includes('archive')))
})

test('the Native theme and lowering read real UI tokens and preserve the styled wrapper boundary', async () => {
  const metroRequire = createRequire(require.resolve('@hozo/metro'))
  const { loadProjectTheme } = metroRequire('@hozo/tailwind')
  const theme = await loadProjectTheme(root, { css: './src/index.css', warn: assert.fail })
  assert.ok(theme.colors.some((entry) => entry.token === 'hozo-accent'))
  assert.ok(theme.colors.some((entry) => entry.token === 'hozo-surface'))
  const compiler = createCompiler(theme)
  const result = transformHozoSource(source, sceneFile, root, compiler)
  assert.ok(result)
  assert.match(result, /from ['"]@hozo\/ui['"]/, 'UI wrappers must not become bare primitives')
  assert.match(result, /StyleSheet\.create/)
  assert.doesNotMatch(result, /<(?:View|Text|Heading)\b[^>]*className=/)
  assert.doesNotMatch(result, /<(?:div|span|button)\b/)
  const primitive = compiler.compileNative(
    'import {View} from "@hozo/primitives"; function C(){return <View className="bg-hozo-surface"/>}',
  )
  assert.equal(primitive.length, 1)
  assert.match(primitive[0].styles, /backgroundColor/)
  assert.equal(
    primitive[0].diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length,
    0,
  )
})
