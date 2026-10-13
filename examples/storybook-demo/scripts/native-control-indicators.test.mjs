// No browser, GPU, Metro or device is launched here. Execute the real UI
// and Native patterns with React state and a real themed candidate module.
// Only the Native hosts are stand-ins; do not hand-copy a control's styles.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { openCandidateCache } from '@hozo/compiler'
import { createClassResolver } from '@hozo/engine'
import { loadTheme } from '@hozo/tailwind'
import { build } from 'esbuild'
import React, { act } from 'react'
import { create } from 'react-test-renderer'
import { hozoTransformStyles } from '../../../packages/engine/src/transform-slots.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../../../', import.meta.url))
const filename = (relative) => path.join(root, relative).replaceAll('\\', '/')
const uiRoot = path.join(root, 'packages/ui')
const theme = await loadTheme('@import "tailwindcss"; @import "./src/theme.css";', uiRoot)
const cache = openCandidateCache()
for (const file of ['toggle.tsx', 'radio.tsx']) {
  cache.scanFile(file, readFileSync(path.join(uiRoot, 'src', file), 'utf8'), 1)
}
const moduleSource = cache
  .renderNativeModule(theme)
  .replace(/^import .*$/gm, '')
  .replace(/\bexport /g, '')
const hozoClasses = new Function(
  'createClassResolver',
  'hozoTransformStyles',
  `${moduleSource}\nreturn hozoClasses`,
)(createClassResolver, hozoTransformStyles)
const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
const NativeView = (props) => React.createElement('NativeView', props, props.children)
const NativeText = (props) => React.createElement('NativeText', props, props.children)
const NativePressable = ({ children, style, disabled, ...props }) => {
  const state = { pressed: false }
  return React.createElement(
    'NativePressable',
    {
      ...props,
      disabled,
      onPress: disabled ? undefined : props.onPress,
      style: typeof style === 'function' ? style(state) : style,
    },
    typeof children === 'function' ? children(state) : children,
  )
}
const bundled = await build({
  stdin: {
    contents: `export { HozoCheckbox, HozoSwitch } from ${JSON.stringify(filename('packages/ui/src/toggle.tsx'))}; export { HozoRadioGroup } from ${JSON.stringify(filename('packages/ui/src/radio.tsx'))};`,
    resolveDir: root,
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  plugins: [
    {
      name: 'native-patterns',
      setup(builder) {
        builder.onResolve({ filter: /^@hozo\/patterns$/ }, () => ({
          path: 'native-patterns',
          namespace: 'probe',
        }))
        builder.onLoad({ filter: /.*/, namespace: 'probe' }, () => ({
          contents: `export { HozoCheckbox as Checkbox, HozoSwitch as Switch } from ${JSON.stringify(filename('packages/patterns/src/toggle.native.tsx'))}; export { HozoRadioGroup as RadioGroup } from ${JSON.stringify(filename('packages/patterns/src/radio.native.tsx'))};`,
          loader: 'ts',
          resolveDir: root,
        }))
      },
    },
  ],
})
const module = { exports: {} }
new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(
  (name) => {
    if (name === 'react-native')
      return {
        View: NativeView,
        Text: NativeText,
        Pressable: NativePressable,
        StyleSheet: { flatten: flat },
      }
    if (name === '@hozo/engine/project') return { hozoClasses }
    return require(name)
  },
  module,
  module.exports,
)
const { HozoCheckbox, HozoSwitch, HozoRadioGroup } = module.exports
const color = (token) => theme.colors.find((value) => value.token === token)?.hex
assert.ok(color('hozo-accent'), 'load the real theme, not empty token stand-ins')
const indicators = (tree) =>
  tree.root
    .findAllByType('NativeView')
    .filter((node) => node.props.importantForAccessibility === 'no-hide-descendants')
async function mount(t, Component, props) {
  let tree
  await act(() => {
    tree = create(React.createElement(Component, props, 'Updates'))
  })
  t.after(async () => {
    await act(() => tree.unmount())
  })
  return tree
}
const press = async (node) => {
  await act(() => node.props.onPress?.())
}

test('Native checkbox paints all three real indicators, also when disabled', async (t) => {
  for (const disabled of [false, true])
    for (const checked of [false, true, 'mixed']) {
      const tree = await mount(t, HozoCheckbox, { checked, disabled })
      assert.equal(
        tree.root.findByType('NativePressable').props.accessibilityState.checked,
        checked,
      )
      const [indicator] = indicators(tree)
      assert.ok(indicator)
      assert.equal(indicator.props.accessible, false)
      assert.equal(indicator.props.accessibilityElementsHidden, true)
      assert.equal(indicator.props.pointerEvents, 'none')
      const control = tree.root.findByType('NativePressable')
      assert.equal(flat(control.props.style).paddingTop, 8)
      assert.equal(flat(control.props.style).paddingBottom, 8)
      assert.equal(flat(tree.root.findByType('NativeText').props.style).lineHeight, 24)
      const style = flat(indicator.props.style)
      assert.equal(style.top, 12)
      assert.equal(style.start, 8)
      assert.equal(style.width, 16)
      assert.equal(style.height, 16)
      assert.equal(style.borderWidth ?? style.borderTopWidth, 2)
      assert.equal(
        style.backgroundColor,
        color(
          disabled || !checked
            ? 'hozo-surface'
            : checked === 'mixed'
              ? 'hozo-accent-subtle'
              : 'hozo-accent',
        ),
      )
      const marks = indicator.findAllByType('NativeView').filter((node) => node !== indicator)
      assert.equal(marks.length, checked ? 1 : 0)
      if (checked === 'mixed') {
        assert.equal(flat(marks[0].props.style).height, 4)
        assert.equal(flat(marks[0].props.style).width, 8)
      } else if (checked) {
        assert.deepEqual(flat(marks[0].props.style).transform, [{ rotate: '45deg' }])
        assert.equal(flat(marks[0].props.style).borderBottomWidth, 2)
      }
      assert.equal(tree.root.findByType('NativeText').children.join(''), 'Updates')
    }
})

test('Native uncontrolled checkbox changes its mark; a controlled one waits for its owner', async (t) => {
  const tree = await mount(t, HozoCheckbox, { defaultChecked: 'mixed' })
  await press(tree.root.findByType('NativePressable'))
  assert.equal(tree.root.findByType('NativePressable').props.accessibilityState.checked, true)
  assert.deepEqual(flat(indicators(tree)[0].findAllByType('NativeView')[1].props.style).transform, [
    { rotate: '45deg' },
  ])
  await press(tree.root.findByType('NativePressable'))
  assert.equal(indicators(tree)[0].findAllByType('NativeView').length, 1)
  const notified = []
  const controlled = await mount(t, HozoCheckbox, {
    checked: false,
    onCheckedChange: (state) => notified.push(state),
  })
  await press(controlled.root.findByType('NativePressable'))
  assert.deepEqual(notified, [true])
  assert.equal(
    controlled.root.findByType('NativePressable').props.accessibilityState.checked,
    false,
  )
  await act(() =>
    controlled.update(React.createElement(HozoCheckbox, { checked: true }, 'Updates')),
  )
  assert.equal(indicators(controlled)[0].findAllByType('NativeView').length, 2)
})

test('Native switch moves its knob inside the real track, while disabled blocks a press', async (t) => {
  const tree = await mount(t, HozoSwitch, { defaultChecked: false })
  const knob = () => flat(indicators(tree)[0].findAllByType('NativeView')[1].props.style)
  assert.equal(knob().start, 4)
  assert.equal(knob().width, 8)
  await press(tree.root.findByType('NativePressable'))
  assert.equal(knob().start, 16)
  assert.equal(tree.root.findByType('NativePressable').props.accessibilityState.checked, true)
  const disabled = await mount(t, HozoSwitch, { defaultChecked: false, disabled: true })
  await press(disabled.root.findByType('NativePressable'))
  assert.equal(disabled.root.findByType('NativePressable').props.accessibilityState.checked, false)
})

test('Native radio options have a real dot only for the selected option', async (t) => {
  const tree = await mount(t, HozoRadioGroup, {
    defaultValue: 'a',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C', disabled: true },
    ],
  })
  const counts = () => indicators(tree).map((node) => node.findAllByType('NativeView').length)
  assert.deepEqual(counts(), [2, 1, 1])
  await press(tree.root.findAllByType('NativePressable')[1])
  assert.deepEqual(counts(), [1, 2, 1])
  await press(tree.root.findAllByType('NativePressable')[2])
  assert.deepEqual(counts(), [1, 2, 1])
  assert.equal(
    flat(indicators(tree)[1].findAllByType('NativeView')[1].props.style).backgroundColor,
    color('hozo-accent'),
  )
})
