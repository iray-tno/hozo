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
const interactionClasses =
  'p-4 hover:bg-hozo-accent hover:text-hozo-accent-text focus:opacity-75 focus-visible:outline-2 focus-visible:outline-hozo-focus focus-visible:font-bold active:opacity-50'
cache.scanFile(
  'tab-state-look.ts',
  `export const c = '${interactionClasses} aria-checked:border-2 aria-expanded:border-2 aria-selected:border-2 disabled:opacity-25'`,
  1,
)
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
const NativeTextInput = (props) => React.createElement('NativeTextInput', props)
const NativeModal = ({ visible, ...props }) =>
  visible ? React.createElement('NativeModal', props, props.children) : null
const announcements = []
const openedURLs = []
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
const exportsFrom = (names, relative) =>
  `export { ${names} } from ${JSON.stringify(filename(relative))};`
const probeSources = [
  exportsFrom('HozoCheckbox, HozoSwitch', 'packages/ui/src/toggle.tsx'),
  exportsFrom('HozoRadioGroup', 'packages/ui/src/radio.tsx'),
  exportsFrom('HozoTabs', 'packages/patterns/src/tabs.native.tsx'),
  exportsFrom(
    'HozoCheckbox as CheckboxPattern, HozoSwitch as SwitchPattern',
    'packages/patterns/src/toggle.native.tsx',
  ),
  exportsFrom('HozoRadioGroup as RadioPattern', 'packages/patterns/src/radio.native.tsx'),
  ...['Accordion', 'Menu', 'Listbox', 'Combobox', 'Tree'].map((name) =>
    exportsFrom(`Hozo${name}`, `packages/patterns/src/${name.toLowerCase()}.native.tsx`),
  ),
  exportsFrom('HozoCommandPalette', 'packages/patterns/src/command-palette.native.tsx'),
  exportsFrom('HozoPagination', 'packages/patterns/src/pagination.native.tsx'),
  exportsFrom('HozoNavigationProvider', 'packages/engine/src/navigation-context.tsx'),
  exportsFrom('usePressableInteraction', 'packages/behaviors/src/pressable-interaction.ts'),
]
const bundled = await build({
  stdin: {
    contents: probeSources.join('\n'),
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
        builder.onResolve({ filter: /^@hozo\/behaviors$/ }, () => ({
          path: filename('packages/behaviors/src/i18n.ts'),
        }))
        builder.onResolve({ filter: /^@hozo\/engine\/navigation$/ }, () => ({
          path: filename('packages/engine/src/navigation-entry.native.ts'),
        }))
        builder.onResolve({ filter: /^@hozo\/behaviors\/pressable-interaction$/ }, () => ({
          path: filename('packages/behaviors/src/pressable-interaction.ts'),
        }))
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
        TextInput: NativeTextInput,
        Modal: NativeModal,
        ScrollView: NativeView,
        AccessibilityInfo: { announceForAccessibility: (message) => announcements.push(message) },
        Linking: { openURL: (url) => openedURLs.push(url) },
        Pressable: NativePressable,
        StyleSheet: { flatten: flat },
      }
    if (name === '@hozo/engine/project') return { hozoClasses }
    return require(name)
  },
  module,
  module.exports,
)
const { HozoCheckbox, HozoSwitch, HozoRadioGroup, HozoTabs } = module.exports
const { CheckboxPattern, SwitchPattern, RadioPattern, HozoAccordion } = module.exports
const { HozoMenu, HozoListbox, HozoCombobox, HozoTree } = module.exports
const { HozoCommandPalette, HozoPagination, HozoNavigationProvider } = module.exports
const { usePressableInteraction } = module.exports
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

test('Native tabs deliver hover, keyboard focus-visible and press state to both box and label', async (t) => {
  const tree = await mount(t, HozoTabs, {
    tabs: [
      { label: 'One', content: 'Body' },
      { label: 'Two', content: 'Other', disabled: true },
    ],
    tabClassName:
      'p-4 hover:bg-hozo-accent hover:text-hozo-accent-text focus-visible:outline-2 focus-visible:outline-hozo-focus focus-visible:font-bold active:opacity-50',
  })
  const tab = () => tree.root.findAllByType('NativePressable')[0]
  const box = () => flat(tab().props.style)
  const text = () => flat(tab().findByType('NativeText').props.style)
  const event = async (name) => {
    await act(() => tab().props[name]({}))
  }
  assert.equal(box().backgroundColor, undefined)
  await event('onHoverIn')
  assert.equal(box().backgroundColor, color('hozo-accent'))
  assert.equal(text().color, color('hozo-accent-text'))
  await event('onHoverOut')
  assert.equal(box().backgroundColor, undefined)
  await event('onFocus')
  assert.equal(box().outlineWidth, 2)
  assert.equal(box().outlineColor, color('hozo-focus'))
  assert.equal(text().fontWeight, '700')
  await event('onPointerDown')
  assert.equal(box().outlineWidth, undefined, 'pointer modality clears the focus ring')
  await event('onKeyDown')
  assert.equal(box().outlineWidth, 2, 'a key on the focused host restores it')
  await event('onPressIn')
  assert.equal(box().opacity, 0.5)
  await event('onPressOut')
  assert.equal(box().opacity, undefined)
  await event('onBlur')
  assert.equal(box().outlineWidth, undefined)
  await event('onKeyDown')
  assert.equal(box().outlineWidth, undefined, 'a key does not focus a blurred host')
  const before = tree.root.findAllByType('NativePressable')[1].props.accessibilityState.selected
  await press(tree.root.findAllByType('NativePressable')[1])
  assert.equal(
    tree.root.findAllByType('NativePressable')[1].props.accessibilityState.selected,
    before,
  )
})

// Exercise RN events, not a fabricated resolver state. Each owner must deliver
// those facts to both callbacks, while retaining its separate semantic state.
async function checkInteraction(tree, index = 0) {
  const host = () => tree.root.findAllByType('NativePressable')[index]
  const box = () => flat(host().props.style)
  const text = () => flat(host().findAllByType('NativeText')[0].props.style)
  const event = async (name) => {
    await act(() => host().props[name]({}))
  }
  await event('onHoverIn')
  assert.equal(box().backgroundColor, color('hozo-accent'))
  assert.equal(text().color, color('hozo-accent-text'))
  await event('onHoverOut')
  assert.equal(box().backgroundColor, undefined)
  assert.equal(text().color, undefined)
  await event('onFocus')
  assert.equal(box().opacity, 0.75, 'focus: is independent of keyboard modality')
  assert.equal(box().outlineWidth, 2)
  assert.equal(box().outlineColor, color('hozo-focus'))
  assert.equal(text().fontWeight, '700')
  await event('onPointerDown')
  assert.equal(box().outlineWidth, undefined)
  assert.equal(box().opacity, 0.75, 'pointer input does not clear focused')
  assert.equal(text().fontWeight, undefined)
  await event('onKeyDown')
  assert.equal(box().outlineWidth, 2)
  assert.equal(text().fontWeight, '700')
  await event('onPressIn')
  assert.equal(box().opacity, 0.5)
  await event('onPressOut')
  assert.equal(box().opacity, 0.75)
  await event('onBlur')
  assert.equal(box().outlineWidth, undefined)
  assert.equal(box().opacity, undefined)
  assert.equal(text().fontWeight, undefined)
}

for (const [name, Component] of [
  ['checkbox', CheckboxPattern],
  ['switch', SwitchPattern],
]) {
  test(`Native ${name} delivers interaction facts to box, label and indicator without toggling`, async (t) => {
    const notifications = []
    const tree = await mount(t, Component, {
      defaultChecked: true,
      onCheckedChange: (state) => notifications.push(state),
      className: `${interactionClasses} aria-checked:border-2`,
      indicator: () => ({ className: interactionClasses, markClassName: interactionClasses }),
    })
    await checkInteraction(tree)
    const host = () => tree.root.findByType('NativePressable')
    assert.equal(host().props.accessibilityState.checked, true)
    assert.equal(flat(host().props.style).borderTopWidth, 2)
    assert.deepEqual(notifications, [], 'interaction alone does not change checked')
    await act(() => host().props.onHoverIn({}))
    const [outline, mark] = indicators(tree)[0].findAllByType('NativeView')
    assert.equal(flat(outline.props.style).backgroundColor, color('hozo-accent'))
    assert.equal(flat(mark.props.style).backgroundColor, color('hozo-accent'))
    await act(() => host().props.onKeyDown({}))
    await act(() => host().props.onFocus({}))
    assert.equal(flat(indicators(tree)[0].props.style).outlineWidth, 2)
    assert.equal(
      flat(indicators(tree)[0].findAllByType('NativeView')[1].props.style).outlineWidth,
      2,
    )
    await press(host())
    assert.equal(host().props.accessibilityState.checked, false)
    assert.equal(flat(host().props.style).borderTopWidth, undefined)
    assert.deepEqual(notifications, [false])
  })
}

test('Native radio interactions are per option and preserve selection and disabled guards', async (t) => {
  const notifications = []
  const tree = await mount(t, RadioPattern, {
    defaultValue: 'a',
    onValueChange: (value) => notifications.push(value),
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C', disabled: true },
    ],
    optionClassName: `${interactionClasses} aria-checked:border-2 disabled:opacity-25`,
    indicator: () => ({ className: interactionClasses, markClassName: interactionClasses }),
  })
  await checkInteraction(tree)
  const hosts = () => tree.root.findAllByType('NativePressable')
  assert.equal(hosts()[0].props.accessibilityState.checked, true)
  assert.equal(flat(hosts()[0].props.style).borderTopWidth, 2)
  assert.deepEqual(notifications, [])
  await act(() => hosts()[0].props.onHoverIn({}))
  assert.equal(flat(indicators(tree)[0].props.style).backgroundColor, color('hozo-accent'))
  assert.equal(
    flat(indicators(tree)[0].findAllByType('NativeView')[1].props.style).backgroundColor,
    color('hozo-accent'),
  )
  assert.equal(
    flat(hosts()[1].props.style).backgroundColor,
    undefined,
    'another option does not hover',
  )
  assert.equal(flat(indicators(tree)[1].props.style).backgroundColor, undefined)
  assert.equal(hosts()[2].props.disabled, true)
  assert.equal(flat(hosts()[2].props.style).opacity, 0.25)
  await press(hosts()[2])
  assert.deepEqual(notifications, [])
  await press(hosts()[1])
  assert.deepEqual(notifications, ['b'])
  assert.deepEqual(
    hosts().map((node) => node.props.accessibilityState.checked),
    [false, true, false],
  )
})

test('Native accordion heading and trigger share interaction facts without opening a panel', async (t) => {
  const notifications = []
  const tree = await mount(t, HozoAccordion, {
    items: [
      { id: 'a', header: 'One', content: 'Body' },
      { id: 'b', header: 'Two', content: 'Other', disabled: true },
    ],
    headingClassName: interactionClasses,
    triggerClassName: 'aria-expanded:border-2 disabled:opacity-25',
    onExpandedChange: (value) => notifications.push(value),
  })
  await checkInteraction(tree)
  const hosts = () => tree.root.findAllByType('NativePressable')
  assert.equal(hosts()[0].props.accessibilityState.expanded, false)
  assert.deepEqual(notifications, [])
  await press(hosts()[1])
  assert.deepEqual(notifications, [])
  await press(hosts()[0])
  assert.equal(hosts()[0].props.accessibilityState.expanded, true)
  assert.equal(flat(hosts()[0].props.style).borderTopWidth, 2)
  assert.deepEqual(notifications, ['a'])
  await press(hosts()[0])
  assert.equal(hosts()[0].props.accessibilityState.expanded, false)
  assert.equal(flat(hosts()[0].props.style).borderTopWidth, undefined)
  assert.deepEqual(notifications, ['a', null])
  const triggerOnly = await mount(t, HozoAccordion, {
    items: [{ header: 'One', content: 'Body' }],
    triggerClassName: interactionClasses,
  })
  await checkInteraction(triggerOnly)
  // Trigger classes still follow heading classes; explicit author styles last.
  const override = await mount(t, HozoAccordion, {
    items: [{ header: 'One', content: 'Body' }],
    headingClassName: interactionClasses,
    triggerClassName: 'hover:bg-hozo-surface-hover',
    triggerStyle: { backgroundColor: '#123456' },
    triggerTextStyle: { color: '#abcdef' },
  })
  const host = () => override.root.findByType('NativePressable')
  await act(() => host().props.onHoverIn({}))
  assert.equal(flat(host().props.style).backgroundColor, '#123456')
  assert.equal(flat(host().findByType('NativeText').props.style).color, '#abcdef')
})

test('the styled Native controls use their actual UI hover and keyboard-focus classes', async (t) => {
  for (const Component of [HozoCheckbox, HozoSwitch, HozoRadioGroup]) {
    const tree = await mount(t, Component, { options: [{ value: 'a', label: 'A' }] })
    const host = () => tree.root.findByType('NativePressable')
    await act(() => host().props.onHoverIn({}))
    assert.equal(flat(host().props.style).backgroundColor, color('hozo-surface-hover'))
    await act(() => host().props.onFocus({}))
    assert.equal(flat(host().props.style).outlineColor, color('hozo-focus'))
    assert.equal(flat(host().props.style).outlineWidth, 2)
  }
})

test('Native Menu trigger and items deliver interaction facts independently of opening and selection', async (t) => {
  const selected = []
  const tree = await mount(t, HozoMenu, {
    trigger: 'Actions',
    triggerClassName: `${interactionClasses} aria-expanded:border-2`,
    itemClassName: `${interactionClasses} disabled:opacity-25`,
    items: [
      { label: 'Run', onSelect: () => selected.push('run') },
      { label: 'Blocked', disabled: true, onSelect: () => selected.push('blocked') },
    ],
  })
  await checkInteraction(tree)
  const hosts = () => tree.root.findAllByType('NativePressable')
  assert.equal(hosts().length, 1, 'interaction alone does not open the modal')
  await press(hosts()[0])
  assert.equal(hosts()[0].props.accessibilityState.expanded, true)
  assert.equal(flat(hosts()[0].props.style).borderTopWidth, 2)
  assert.equal(hosts().length, 4, 'trigger, dismiss target, two menu items')
  await checkInteraction(tree, 2)
  assert.deepEqual(selected, [])
  await act(() => hosts()[2].props.onHoverIn({}))
  assert.equal(flat(hosts()[0].props.style).backgroundColor, undefined)
  assert.equal(flat(hosts()[3].props.style).backgroundColor, undefined)
  assert.equal(hosts()[3].props.disabled, true)
  await press(hosts()[3])
  assert.deepEqual(selected, [])
  assert.equal(hosts().length, 4, 'disabled selection does not dismiss')
  await press(hosts()[2])
  assert.deepEqual(selected, ['run'])
  assert.equal(hosts().length, 1)
})

test('Native Listbox keeps single, multiple and controlled selection separate from interaction', async (t) => {
  const options = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
    { value: 'c', label: 'C', disabled: true },
  ]
  const tree = await mount(t, HozoListbox, {
    options,
    defaultValue: 'a',
    optionClassName: `${interactionClasses} aria-selected:border-2`,
  })
  await checkInteraction(tree)
  const hosts = () => tree.root.findAllByType('NativePressable')
  assert.deepEqual(
    hosts().map((node) => node.props.accessibilityState.selected),
    [true, false, false],
  )
  assert.equal(flat(hosts()[0].props.style).borderTopWidth, 2)
  await press(hosts()[2])
  assert.equal(hosts()[2].props.disabled, true)
  assert.equal(hosts()[0].props.accessibilityState.selected, true)
  await press(hosts()[1])
  assert.deepEqual(
    hosts().map((node) => node.props.accessibilityState.selected),
    [false, true, false],
  )
  const multiple = await mount(t, HozoListbox, { options, multiple: true, defaultValue: ['a'] })
  await press(multiple.root.findAllByType('NativePressable')[1])
  assert.deepEqual(
    multiple.root
      .findAllByType('NativePressable')
      .map((node) => node.props.accessibilityState.selected),
    [true, true, false],
  )
  const notified = []
  const controlled = await mount(t, HozoListbox, {
    options,
    value: 'a',
    onValueChange: (value) => notified.push(value),
  })
  await press(controlled.root.findAllByType('NativePressable')[1])
  assert.deepEqual(notified, ['b'])
  assert.deepEqual(
    controlled.root
      .findAllByType('NativePressable')
      .map((node) => node.props.accessibilityState.selected),
    [true, false, false],
  )
})

test('Native Combobox options deliver interaction facts and retain filtering, disabled and commit behavior', async (t) => {
  const selected = []
  const tree = await mount(t, HozoCombobox, {
    options: [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
      { value: 'c', label: 'Blocked', disabled: true },
    ],
    optionClassName: interactionClasses,
    onValueChange: (value) => selected.push(value),
  })
  const input = () => tree.root.findByType('NativeTextInput')
  const hosts = () => tree.root.findAllByType('NativePressable')
  await act(() => input().props.onFocus({}))
  await checkInteraction(tree)
  assert.deepEqual(selected, [])
  assert.equal(input().props.value, '')
  assert.equal(input().props.accessibilityState.expanded, true)
  await press(hosts()[2])
  assert.equal(hosts()[2].props.disabled, true)
  assert.deepEqual(selected, [])
  await act(() => input().props.onChangeText('Be'))
  assert.equal(hosts().length, 1)
  assert.equal(hosts()[0].findByType('NativeText').children.join(''), 'Beta')
  await checkInteraction(tree)
  await press(hosts()[0])
  assert.deepEqual(selected, ['b'])
  assert.equal(input().props.value, 'Beta')
  assert.equal(input().props.accessibilityState.expanded, false)
  assert.equal(hosts().length, 0)
})

test('Native Tree interaction does not expand branches or select leaves', async (t) => {
  const selected = []
  const tree = await mount(t, HozoTree, {
    nodes: [
      { id: 'folder', label: 'Folder', children: [{ id: 'leaf', label: 'Leaf' }] },
      {
        id: 'blocked',
        label: 'Blocked',
        disabled: true,
        children: [{ id: 'hidden', label: 'Hidden' }],
      },
    ],
    selectedId: 'leaf',
    rowClassName: `${interactionClasses} aria-expanded:border-2 aria-selected:border-2`,
    onSelect: (id) => selected.push(id),
  })
  const hosts = () => tree.root.findAllByType('NativePressable')
  await checkInteraction(tree)
  assert.equal(hosts().length, 2)
  assert.equal(hosts()[0].props.accessibilityState.expanded, false)
  assert.deepEqual(selected, [])
  await press(hosts()[1])
  assert.equal(hosts()[1].props.disabled, true)
  assert.equal(hosts().length, 2)
  await press(hosts()[0])
  assert.equal(hosts().length, 3)
  assert.equal(hosts()[0].props.accessibilityState.expanded, true)
  assert.equal(flat(hosts()[0].props.style).borderTopWidth, 2)
  await checkInteraction(tree, 1)
  assert.equal(hosts()[1].props.accessibilityState.selected, true)
  assert.equal(flat(hosts()[1].props.style).borderTopWidth, 2)
  assert.deepEqual(selected, [])
  await press(hosts()[1])
  assert.deepEqual(selected, ['leaf'])
  await press(hosts()[0])
  assert.equal(hosts().length, 2)
})

test('Native CommandPalette items and shortcuts receive host facts without changing the return-key target', async (t) => {
  const selected = []
  const changes = []
  const tree = await mount(t, HozoCommandPalette, {
    open: true,
    commands: [
      { id: 'blocked', label: 'Blocked', disabled: true, onSelect: () => selected.push('blocked') },
      { id: 'alpha', label: 'Alpha', shortcut: '⌘A', onSelect: () => selected.push('alpha') },
      { id: 'beta', label: 'Beta', onSelect: () => selected.push('beta') },
    ],
    onOpenChange: (open) => changes.push(open),
    scrimClassName: interactionClasses,
    itemClassName: `${interactionClasses} disabled:opacity-25`,
    activeItemClassName: 'border-2',
    shortcutClassName: interactionClasses,
  })
  const hosts = () => tree.root.findAllByType('NativePressable')
  const alpha = () => hosts().find((node) => node.props.accessibilityLabel === 'Alpha')
  assert.equal(
    flat(alpha().props.style).borderTopWidth,
    2,
    'first enabled command is the return-key target',
  )
  const index = hosts().findIndex((node) => node.props.accessibilityLabel === 'Alpha')
  await checkInteraction(tree, index)
  assert.deepEqual(selected, [])
  assert.deepEqual(changes, [])
  await act(() => alpha().props.onHoverIn({}))
  const shortcut = () => alpha().findByType('NativeView')
  assert.equal(flat(shortcut().props.style).backgroundColor, color('hozo-accent'))
  assert.equal(
    flat(shortcut().findByType('NativeText').props.style).color,
    color('hozo-accent-text'),
  )
  assert.equal(shortcut().props.importantForAccessibility, 'no-hide-descendants')
  await act(() => alpha().props.onKeyDown({}))
  await act(() => alpha().props.onFocus({}))
  assert.equal(flat(shortcut().props.style).outlineWidth, 2)
  assert.equal(flat(shortcut().findByType('NativeText').props.style).fontWeight, '700')
  await act(() => alpha().props.onPressIn({}))
  assert.equal(flat(shortcut().props.style).opacity, 0.5)
  await act(() => alpha().props.onPressOut({}))
  const blocked = hosts().find((node) => node.props.accessibilityLabel === 'Blocked')
  assert.equal(blocked.props.disabled, true)
  assert.equal(flat(blocked.props.style).opacity, 0.25)
  await press(blocked)
  assert.deepEqual(selected, [])
  const input = () => tree.root.findByType('NativeTextInput')
  await act(() => input().props.onSubmitEditing())
  assert.deepEqual(selected, ['alpha'], 'hover/focus/press do not change the return-key target')
  assert.deepEqual(changes, [false])
  const announcementStart = announcements.length
  await act(() => input().props.onChangeText('Beta'))
  assert.equal(announcements.length, announcementStart + 1)
  assert.equal(hosts().filter((node) => node.props.accessibilityRole === 'button').length, 1)
  await act(() => input().props.onSubmitEditing())
  assert.deepEqual(selected, ['alpha', 'beta'])
  await act(() => hosts()[0].props.onHoverIn({}))
  assert.equal(flat(hosts()[0].props.style).backgroundColor, color('hozo-accent'))
  assert.equal(flat(hosts()[0].props.style).position, 'absolute')
  await press(hosts()[0])
  assert.deepEqual(changes, [false, false, false])
})

test('Native CommandPalette active slot delivers interaction facts and keeps explicit style order', async (t) => {
  const commands = [{ id: 'a', label: 'Alpha', onSelect: () => {} }]
  const tree = await mount(t, HozoCommandPalette, {
    open: true,
    commands,
    activeItemClassName: interactionClasses,
  })
  await checkInteraction(tree, 1)
  const override = await mount(t, HozoCommandPalette, {
    open: true,
    commands,
    itemClassName: interactionClasses,
    itemStyle: { backgroundColor: '#111111', color: '#222222' },
    activeItemStyle: { backgroundColor: '#333333', color: '#444444' },
  })
  const item = () => override.root.findAllByType('NativePressable')[1]
  await act(() => item().props.onHoverIn({}))
  assert.equal(flat(item().props.style).backgroundColor, '#333333')
  assert.equal(flat(item().findByType('NativeText').props.style).color, '#444444')
})

test('Native Pagination delivers interaction facts to item/current/disabled slots and still navigates', async (t) => {
  const navigated = []
  const changed = []
  function RoutedPagination(props) {
    return React.createElement(
      HozoNavigationProvider,
      {
        adapter: {
          navigate: (request) => {
            navigated.push(request.href)
            return true
          },
        },
      },
      React.createElement(HozoPagination, props),
    )
  }
  const tree = await mount(t, RoutedPagination, {
    pageCount: 3,
    defaultPage: 2,
    getPageHref: (page) => `/pages/${page}`,
    onPageChange: (page) => changed.push(page),
    itemClassName: interactionClasses,
    currentItemClassName: 'aria-selected:border-2',
    disabledItemClassName: 'disabled:opacity-25',
  })
  await checkInteraction(tree)
  assert.deepEqual(navigated, [])
  assert.deepEqual(changed, [])
  const hosts = () => tree.root.findAllByType('NativePressable')
  assert.equal(hosts()[2].props.accessibilityState.selected, true)
  assert.equal(flat(hosts()[2].props.style).borderTopWidth, 2)
  assert.equal(hosts()[0].props.accessibilityRole, 'link')
  await press(hosts()[0])
  assert.deepEqual(changed, [1])
  assert.deepEqual(navigated, ['/pages/1'])
  assert.equal(hosts()[0].props.disabled, true)
  assert.equal(flat(hosts()[0].props.style).opacity, 0.25)
  await press(hosts()[0])
  assert.deepEqual(changed, [1])
  for (const slot of ['currentItemClassName', 'disabledItemClassName']) {
    const slotted = await mount(t, HozoPagination, { pageCount: 3, [slot]: interactionClasses })
    await checkInteraction(slotted, slot === 'currentItemClassName' ? 1 : 0)
  }
  const start = openedURLs.length
  const fallback = await mount(t, HozoPagination, {
    pageCount: 3,
    getPageHref: (page) => `/fallback/${page}`,
  })
  await press(fallback.root.findAllByType('NativePressable').at(-1))
  assert.deepEqual(openedURLs.slice(start), ['/fallback/2'])
})

test('the shared tracker notifies the animation driver synchronously and can omit focus-visible inference', async (t) => {
  const seen = []
  function Probe() {
    const interaction = usePressableInteraction({ onChange: (state) => seen.push(state) })
    return React.createElement('InteractionProbe', interaction)
  }
  const tree = await mount(t, Probe, {})
  const current = () => tree.root.findByType('InteractionProbe').props
  await act(() => {
    current().handlers.hoverIn()
    assert.equal(seen.at(-1).hovered, true, 'the native driver does not wait for a React commit')
    current().handlers.focus()
    current().handlers.keyDown()
  })
  assert.equal(current().state.focused, true)
  assert.equal(current().state.focusVisible, false, 'inference is opt-in for the primitive')
  await act(() => current().handlers.pressIn())
  assert.equal(current().state.pressed, true)
  await act(() => current().handlers.pressOut())
  assert.equal(current().state.pressed, false)
})
