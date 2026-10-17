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
const otpCellFocusClasses =
  'border-2 opacity-50 font-normal focus:outline-4 focus-visible:font-bold focus:focus-visible:border-4'
const otpUnsupportedFocusClasses =
  'not-focus:opacity-50 not-focus-visible:font-normal not-focus:not-focus-visible:border-2'
const swatchSemanticClasses =
  'aria-checked:border-2 aria-selected:outline-4 aria-disabled:border-4 disabled:opacity-25 aria-checked:hover:opacity-50'
const selectedSwatchSemanticClasses = 'aria-checked:rounded-lg disabled:opacity-50'
const commandSemanticClasses =
  'disabled:mt-8 aria-selected:border-2 aria-selected:font-bold aria-selected:text-hozo-accent-text aria-disabled:opacity-25 aria-checked:outline-4 aria-selected:hover:opacity-50'
const activeCommandSemanticClasses = 'aria-selected:border-4'
const shortcutSemanticClasses =
  'disabled:mt-8 aria-selected:border-2 aria-disabled:opacity-25 aria-checked:outline-4'
const otpSemanticClasses =
  'disabled:opacity-25 read-only:outline-2 read-only:focus:outline-4 aria-disabled:border-4 aria-selected:mt-8'
cache.scanFile(
  'tab-state-look.ts',
  `export const c = '${interactionClasses} ${otpCellFocusClasses} ${otpUnsupportedFocusClasses} ${otpSemanticClasses} ${swatchSemanticClasses} ${selectedSwatchSemanticClasses} ${commandSemanticClasses} ${activeCommandSemanticClasses} ${shortcutSemanticClasses} aria-checked:border-2 aria-expanded:border-2 aria-selected:border-2 disabled:opacity-25 hover:border-2 active:font-bold aria-pressed:border-2 aria-pressed:hover:opacity-50 aria-checked:outline-4 aria-disabled:border-4 aria-disabled:opacity-25 aria-selected:outline-4'`,
  1,
)
for (const file of ['toggle.tsx', 'radio.tsx', 'tree.tsx']) {
  cache.scanFile(file, readFileSync(path.join(uiRoot, 'src', file), 'utf8'), 1)
}
const moduleSource = cache
  .renderNativeModule(theme)
  .replace(/^import .*$/gm, '')
  .replace(/\bexport /g, '')
// The module reads the direction from React Native once, so a resolver is
// per direction, as it is per app run on a device.
const resolverFor = (isRTL) =>
  new Function(
    'createClassResolver',
    'hozoTransformStyles',
    'I18nManager',
    `${moduleSource}\nreturn hozoClasses`,
  )(createClassResolver, hozoTransformStyles, { isRTL })
const hozoClasses = resolverFor(false)
const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
const NativeView = (props) => React.createElement('NativeView', props, props.children)
const NativeText = (props) => React.createElement('NativeText', props, props.children)
const NativeTextInput = (props) => React.createElement('NativeTextInput', props)
const NativeModal = ({ visible, ...props }) =>
  visible ? React.createElement('NativeModal', props, props.children) : null
const announcements = []
const openedURLs = []
// Animation and responder scheduling are host facilities here, not GPU or
// gesture-system evidence. The actual pattern callbacks still run unchanged.
const NativeAnimatedView = (props) =>
  React.createElement('NativeAnimatedView', props, props.children)
const nativeAnimated = {
  View: NativeAnimatedView,
  Value: class {
    constructor(value) {
      this.value = value
    }
  },
  timing: (value, config) => ({
    start: (done) => {
      value.value = config.toValue
      done?.({ finished: true })
    },
    stop: () => {},
  }),
}
const nativePanResponder = {
  create: (config) => ({
    panHandlers: {
      onMoveShouldSetResponder: config.onMoveShouldSetPanResponder,
      onResponderGrant: config.onPanResponderGrant,
      onResponderMove: config.onPanResponderMove,
      onResponderRelease: config.onPanResponderRelease,
    },
  }),
}
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
  exportsFrom('HozoTree as UiTree', 'packages/ui/src/tree.tsx'),
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
  exportsFrom('HozoPopover', 'packages/patterns/src/popover.native.tsx'),
  exportsFrom('HozoDrawer', 'packages/patterns/src/drawer.native.tsx'),
  exportsFrom('HozoBottomSheet', 'packages/patterns/src/bottom-sheet.native.tsx'),
  exportsFrom('HozoColorPicker', 'packages/patterns/src/color-picker.native.tsx'),
  exportsFrom('HozoStepper', 'packages/patterns/src/stepper.native.tsx'),
  exportsFrom('HozoChip', 'packages/patterns/src/chip.native.tsx'),
  exportsFrom('HozoOtpInput', 'packages/patterns/src/otp-input.native.tsx'),
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
          path: 'public-behaviors',
          namespace: 'public-behaviors',
        }))
        builder.onLoad({ filter: /.*/, namespace: 'public-behaviors' }, () => ({
          contents: [
            exportsFrom('useHozoMessage, useHozoI18n', 'packages/behaviors/src/i18n.ts'),
            exportsFrom('hozoTextChildren', 'packages/behaviors/src/text-child.native.tsx'),
          ].join('\n'),
          loader: 'ts',
          resolveDir: root,
        }))
        builder.onResolve({ filter: /^@hozo\/behaviors\/native$/ }, () => ({
          path: 'native-behaviors',
          namespace: 'native-behaviors',
        }))
        builder.onLoad({ filter: /.*/, namespace: 'native-behaviors' }, () => ({
          contents: [
            exportsFrom(
              'FloatingPositioner',
              'packages/behaviors/src/floating-positioner.native.tsx',
            ),
            exportsFrom('Portal', 'packages/behaviors/src/portal.native.tsx'),
            exportsFrom('usePresence', 'packages/behaviors/src/presence.native.ts'),
          ].join('\n'),
          loader: 'ts',
          resolveDir: root,
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
          contents: `export { HozoCheckbox as Checkbox, HozoSwitch as Switch } from ${JSON.stringify(filename('packages/patterns/src/toggle.native.tsx'))}; export { HozoRadioGroup as RadioGroup } from ${JSON.stringify(filename('packages/patterns/src/radio.native.tsx'))}; export { HozoTree as Tree } from ${JSON.stringify(filename('packages/patterns/src/tree.native.tsx'))};`,
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
        Animated: nativeAnimated,
        Easing: { quad: (value) => value * value, out: (easing) => easing },
        PanResponder: nativePanResponder,
        I18nManager: { isRTL: false },
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
const { HozoPopover, HozoDrawer, HozoBottomSheet } = module.exports
const { HozoColorPicker, HozoStepper } = module.exports
const { HozoChip, HozoOtpInput } = module.exports
const { usePressableInteraction, UiTree } = module.exports
const color = (token) => theme.colors.find((value) => value.token === token)?.hex
assert.ok(color('hozo-accent'), 'load the real theme, not empty token stand-ins')
const indicators = (tree) =>
  tree.root
    .findAllByType('NativeView')
    .filter((node) => node.props.importantForAccessibility === 'no-hide-descendants')
async function mount(t, Component, props, options) {
  let tree
  await act(() => {
    tree = create(React.createElement(Component, props, 'Updates'), options)
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
async function checkInteraction(tree, index = 0, focusOwner = true) {
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
  assert.equal(box().opacity, focusOwner ? 0.75 : undefined, 'only the CSS focus owner sees focus')
  assert.equal(box().outlineWidth, focusOwner ? 2 : undefined)
  assert.equal(box().outlineColor, focusOwner ? color('hozo-focus') : undefined)
  assert.equal(text().fontWeight, focusOwner ? '700' : undefined)
  await event('onPointerDown')
  assert.equal(box().outlineWidth, undefined)
  assert.equal(box().opacity, focusOwner ? 0.75 : undefined, 'pointer input does not clear focused')
  assert.equal(text().fontWeight, undefined)
  await event('onKeyDown')
  assert.equal(box().outlineWidth, focusOwner ? 2 : undefined)
  assert.equal(text().fontWeight, focusOwner ? '700' : undefined)
  await event('onPressIn')
  assert.equal(box().opacity, 0.5)
  await event('onPressOut')
  assert.equal(box().opacity, focusOwner ? 0.75 : undefined)
  await event('onBlur')
  assert.equal(box().outlineWidth, undefined)
  assert.equal(box().opacity, undefined)
  assert.equal(text().fontWeight, undefined)
}

async function checkBoxInteraction(host) {
  const style = () => flat(host().props.style)
  const event = async (name) => {
    await act(() => host().props[name]({}))
  }
  await event('onHoverIn')
  assert.equal(style().backgroundColor, color('hozo-accent'))
  await event('onHoverOut')
  assert.equal(style().backgroundColor, undefined)
  await event('onFocus')
  assert.equal(style().opacity, 0.75)
  assert.equal(style().outlineWidth, 2)
  await event('onPointerDown')
  assert.equal(style().outlineWidth, undefined)
  await event('onKeyDown')
  assert.equal(style().outlineWidth, 2)
  await event('onPressIn')
  assert.equal(style().opacity, 0.5)
  await event('onPressOut')
  assert.equal(style().opacity, 0.75)
  await event('onBlur')
  assert.equal(style().opacity, undefined)
  assert.equal(style().outlineWidth, undefined)
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

test('Native UI Tree draws a real, hidden marker and keeps the row text style on its label', async (t) => {
  // #983: the marker was a `::before`, which React Native cannot draw, and a
  // `renderRow` never received the row's resolved text style.
  const tree = await mount(t, UiTree, {
    nodes: [
      { id: 'folder', label: 'Folder', children: [{ id: 'leaf', label: 'Leaf' }] },
      { id: 'file', label: 'File' },
    ],
    selectedId: 'file',
  })
  const rows = () => tree.root.findAllByType('NativePressable')
  const marker = (row) =>
    row.findAll((node) => node.type === 'NativeView' && node.props.importantForAccessibility)[0]
  const label = (row) => row.findAll((node) => node.type === 'NativeText')[0]
  const closed = flat(marker(rows()[0]).props.style)
  assert.equal(marker(rows()[0]).props.accessible, false)
  assert.equal(closed.borderBottomWidth, 2)
  // Logical, so the box mirrors in RTL with no help from the swap setting.
  assert.equal(closed.borderEndWidth, 2)
  assert.equal(closed.borderRightWidth, undefined)
  assert.deepEqual(closed.transform, [{ rotate: '-45deg' }])
  // A leaf reserves the same width and draws no border.
  const leaf = flat(marker(rows()[1]).props.style)
  assert.equal(leaf.width, closed.width)
  assert.equal(leaf.borderBottomWidth, undefined)
  // The selected row's own text style reaches its label.
  assert.equal(label(rows()[1]).props.children, 'File')
  assert.equal(flat(label(rows()[1]).props.style).fontWeight, '600')
  assert.equal(flat(label(rows()[0]).props.style).fontWeight, undefined)
  await press(rows()[0])
  assert.deepEqual(flat(marker(rows()[0]).props.style).transform, [{ rotate: '45deg' }])
})

test('Native UI Tree turns its marker the other way in an RTL run, decided once', () => {
  // The mirrored box's apex is south-west, so closed turns west with +45°
  // and open turns south with -45°: the same two angles, swapped.
  const source = readFileSync(path.join(uiRoot, 'src', 'tree.tsx'), 'utf8')
  const look = (name) => new RegExp(`const ${name} = '([^']*)'`).exec(source)?.[1] ?? ''
  const rtl = resolverFor(true)
  const warn = console.warn
  const warnings = []
  console.warn = (message) => warnings.push(message)
  try {
    assert.deepEqual(flat(rtl(look('CLOSED'))).transform, [{ rotate: '45deg' }])
    assert.deepEqual(flat(rtl(look('OPEN'))).transform, [{ rotate: '-45deg' }])
    assert.deepEqual(flat(hozoClasses(look('CLOSED'))).transform, [{ rotate: '-45deg' }])
    assert.deepEqual(flat(hozoClasses(look('OPEN'))).transform, [{ rotate: '45deg' }])
    // No element state is asked for: the direction is the module's.
    assert.equal(rtl(look('CLOSED')), rtl(look('CLOSED')))
  } finally {
    console.warn = warn
  }
  assert.deepEqual(warnings, [])
})

test('Native CommandPalette current item and shortcut receive host facts independently of activation', async (t) => {
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
    itemClassName: `${interactionClasses} aria-disabled:opacity-25`,
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
  await checkInteraction(tree, index, false)
  assert.deepEqual(selected, [])
  assert.deepEqual(changes, [])
  await act(() => alpha().props.onHoverIn({}))
  const shortcut = () => alpha().findByType('NativeView')
  assert.equal(
    flat(shortcut().props.style).backgroundColor,
    undefined,
    'shortcut does not borrow option hover',
  )
  assert.equal(
    flat(shortcut().findByType('NativeText').props.style).color,
    color('hozo-accent-text'),
  )
  assert.equal(shortcut().props.importantForAccessibility, 'no-hide-descendants')
  await act(() => alpha().props.onKeyDown({}))
  await act(() => alpha().props.onFocus({}))
  assert.equal(flat(shortcut().props.style).outlineWidth, undefined)
  assert.equal(
    flat(shortcut().findByType('NativeText').props.style).fontWeight,
    undefined,
    'option div has no focus typography to inherit to the shortcut',
  )
  await act(() => alpha().props.onPressIn({}))
  assert.equal(
    flat(shortcut().props.style).opacity,
    undefined,
    'no second active opacity on the shortcut',
  )
  assert.equal(
    flat(alpha().props.style).opacity,
    0.5,
    'the actual option still dims its whole subtree',
  )
  await act(() => alpha().props.onPressOut({}))
  const blocked = hosts().find((node) => node.props.accessibilityLabel === 'Blocked')
  assert.equal(blocked.props.disabled, true)
  assert.equal(flat(blocked.props.style).opacity, 0.25)
  await press(blocked)
  assert.deepEqual(selected, [])
  const input = () => tree.root.findByType('NativeTextInput')
  await act(() => input().props.onSubmitEditing())
  assert.deepEqual(selected, ['alpha'], 'interaction with the current item does not select another')
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

test('Native CommandPalette shortcuts do not borrow item focus or become another control', async (t) => {
  const selected = []
  const changed = []
  const props = {
    open: true,
    commands: [
      { id: 'alpha', label: 'Alpha', shortcut: 'A', onSelect: () => selected.push('alpha') },
      { id: 'beta', label: 'Beta', shortcut: 'B', onSelect: () => selected.push('beta') },
    ],
    onOpenChange: (open) => changed.push(open),
    itemClassName: 'focus:outline-4 focus-visible:font-bold',
    activeItemClassName: 'border-2',
    shortcutClassName:
      'border-2 focus:outline-4 focus-visible:font-bold focus:focus-visible:border-4',
  }
  const tree = await mount(t, HozoCommandPalette, props)
  const item = (label) =>
    tree.root
      .findAllByType('NativePressable')
      .find((node) => node.props.accessibilityLabel === label)
  const shortcut = (label) => item(label).findByType('NativeView')
  const assertShortcut = (label) => {
    assert.equal(flat(shortcut(label).props.style).outlineWidth, undefined, label)
    assert.equal(flat(shortcut(label).props.style).borderTopWidth, 2, label)
    assert.equal(
      flat(shortcut(label).findByType('NativeText').props.style).fontWeight,
      flat(item(label).findAllByType('NativeText')[0].props.style).fontWeight,
      `${label}: typography is inherited; shortcut focus predicates remain false`,
    )
    assert.equal(shortcut(label).props.accessibilityElementsHidden, true)
    assert.equal(shortcut(label).props.importantForAccessibility, 'no-hide-descendants')
  }
  for (const label of ['Alpha', 'Beta']) {
    await act(() => item(label).props.onKeyDown({}))
    await act(() => item(label).props.onFocus({}))
    assert.equal(
      flat(item(label).props.style).outlineWidth,
      undefined,
      'Native button focus is not Web option focus',
    )
    assert.equal(flat(item(label).findAllByType('NativeText')[0].props.style).fontWeight, undefined)
    assertShortcut(label)
    await act(() => item(label).props.onPointerDown({}))
    assertShortcut(label)
    await act(() => item(label).props.onBlur({}))
    assertShortcut(label)
  }
  assert.deepEqual(selected, [])
  assert.deepEqual(changed, [])
  await act(() => item('Beta').props.onHoverIn({}))
  assert.equal(
    flat(item('Beta').props.style).borderTopWidth,
    2,
    'hover still chooses the return-key target',
  )
  await act(() => tree.root.findByType('NativeTextInput').props.onSubmitEditing())
  assert.deepEqual(selected, ['beta'])
  assert.deepEqual(changed, [false])
  const override = await mount(t, HozoCommandPalette, {
    ...props,
    shortcutStyle: { outlineWidth: 7, fontWeight: '500', color: '#123456' },
  })
  const host = override.root.findAllByType('NativePressable')[1]
  await act(() => host.props.onKeyDown({}))
  await act(() => host.props.onFocus({}))
  assert.equal(flat(host.findByType('NativeView').props.style).outlineWidth, 7)
  assert.equal(
    flat(host.findByType('NativeView').findByType('NativeText').props.style).fontWeight,
    '500',
  )
})

test('Native CommandPalette active slot delivers interaction facts and keeps explicit style order', async (t) => {
  const commands = [{ id: 'a', label: 'Alpha', onSelect: () => {} }]
  const tree = await mount(t, HozoCommandPalette, {
    open: true,
    commands,
    activeItemClassName: interactionClasses,
  })
  await checkInteraction(tree, 1, false)
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

test('Native CommandPalette runtime semantics distinguish option attributes from buttons and shortcut spans', async (t) => {
  const selected = []
  const changes = []
  const commands = ['Blocked', 'Alpha', 'Beta'].map((label) => ({
    id: label,
    label,
    shortcut: label[0],
    disabled: label === 'Blocked',
    onSelect: () => selected.push(label),
  }))
  const props = {
    open: true,
    commands,
    onOpenChange: (open) => changes.push(open),
    itemClassName: commandSemanticClasses,
    activeItemClassName: activeCommandSemanticClasses,
    shortcutClassName: shortcutSemanticClasses,
  }
  const tree = await mount(t, HozoCommandPalette, props)
  const items = () =>
    tree.root
      .findAllByType('NativePressable')
      .filter((node) => node.props.accessibilityRole === 'button')
  const item = (label) => items().find((node) => node.props.accessibilityLabel === label)
  const input = () => tree.root.findByType('NativeTextInput')
  const check = (current, disabled = ['Blocked']) => {
    for (const node of items()) {
      const active = node.props.accessibilityLabel === current
      const blocked = disabled.includes(node.props.accessibilityLabel)
      assert.deepEqual(node.props.accessibilityState, { disabled: blocked })
      assert.equal(Boolean(node.props.disabled), blocked)
      assert.equal(flat(node.props.style).marginTop, undefined, 'Web option is not :disabled')
      assert.equal(flat(node.props.style).borderTopWidth, active ? 4 : undefined)
      assert.equal(flat(node.props.style).opacity, blocked ? 0.25 : undefined)
      assert.equal(flat(node.props.style).outlineWidth, undefined, 'option has no aria-checked')
      const shortcut = node.findByType('NativeView')
      assert.equal(flat(shortcut.props.style).marginTop, undefined)
      assert.equal(
        flat(shortcut.props.style).borderTopWidth,
        undefined,
        'span has no aria-selected',
      )
      assert.equal(flat(shortcut.props.style).opacity, undefined, 'span has no aria-disabled')
      assert.equal(flat(shortcut.props.style).outlineWidth, undefined)
      assert.equal(shortcut.props.accessibilityElementsHidden, true)
      const texts = node.findAllByType('NativeText')
      for (const text of texts) {
        assert.equal(flat(text.props.style).fontWeight, active ? '700' : undefined)
        assert.equal(
          flat(text.props.style).color,
          active ? color('hozo-accent-text') : undefined,
          'selected typography inherits without selecting the shortcut',
        )
      }
    }
  }
  check('Alpha')
  await press(item('Blocked'))
  assert.deepEqual(selected, [])
  await act(() => item('Beta').props.onHoverIn({}))
  assert.equal(flat(item('Beta').props.style).opacity, 0.5, 'selected stack follows pointer target')
  assert.equal(flat(item('Alpha').props.style).opacity, undefined)
  await act(() => item('Beta').props.onHoverOut({}))
  check('Beta')
  await act(() => input().props.onSubmitEditing())
  assert.deepEqual(selected, ['Beta'])
  assert.deepEqual(changes, [false])
  await act(() => input().props.onChangeText('Alpha'))
  check('Alpha')
  assert.equal(items().length, 1)
  await act(() => input().props.onChangeText(''))
  await act(() =>
    tree.update(
      React.createElement(HozoCommandPalette, {
        ...props,
        commands: commands.map((command) => ({ ...command, disabled: true })),
      }),
    ),
  )
  check(null, ['Blocked', 'Alpha', 'Beta'])
  await act(() => input().props.onSubmitEditing())
  assert.deepEqual(selected, ['Beta'])
  await act(() => tree.update(React.createElement(HozoCommandPalette, { ...props, open: false })))
  await act(() => tree.update(React.createElement(HozoCommandPalette, props)))
  check('Alpha')
  await act(() =>
    tree.update(
      React.createElement(HozoCommandPalette, {
        ...props,
        itemStyle: { color: '#123456', opacity: 0.9 },
        activeItemStyle: { color: '#654321', opacity: 0.8 },
        shortcutStyle: { color: '#abcdef', fontWeight: '400' },
      }),
    ),
  )
  assert.equal(flat(item('Alpha').props.style).opacity, 0.8)
  assert.equal(flat(item('Beta').props.style).opacity, 0.9)
  assert.equal(flat(item('Alpha').findAllByType('NativeText')[0].props.style).color, '#654321')
  assert.equal(flat(item('Alpha').findAllByType('NativeText')[1].props.style).color, '#abcdef')
  assert.equal(flat(item('Alpha').findAllByType('NativeText')[1].props.style).fontWeight, '400')
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
    currentItemClassName: 'border-2',
    disabledItemClassName: 'aria-disabled:opacity-25',
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

test('Native Pagination semantic candidates distinguish buttons from links without borrowing selected', async (t) => {
  for (const link of [false, true]) {
    const changed = []
    const tree = await mount(t, HozoPagination, {
      pageCount: 3,
      onPageChange: (page) => changed.push(page),
      ...(link ? { getPageHref: (page) => `/semantic/${page}` } : {}),
      itemClassName: 'disabled:opacity-25 aria-disabled:border-4 aria-selected:outline-4',
      currentItemClassName: 'border-2 aria-selected:outline-4',
      disabledItemClassName: 'disabled:opacity-25 aria-disabled:border-4',
    })
    const controls = () => tree.root.findAllByType('NativePressable')
    const check = (disabledIndex, page) => {
      for (const [index, button] of controls().entries()) {
        assert.equal(
          flat(button.props.style).opacity,
          !link && index === disabledIndex ? 0.25 : undefined,
        )
        assert.equal(
          flat(button.props.style).borderTopWidth,
          link && index === disabledIndex ? 4 : index === page ? 2 : undefined,
        )
        assert.equal(flat(button.props.style).outlineWidth, undefined)
      }
      assert.equal(controls()[page].props.accessibilityState.selected, true)
      assert.equal(
        controls()[disabledIndex].props.disabled,
        true,
        'Native host still blocks boundary activation',
      )
    }
    check(0, 1)
    await press(controls()[0])
    assert.deepEqual(changed, [])
    await press(controls()[3])
    check(4, 3)
    assert.deepEqual(changed, [3])
    await press(controls()[4])
    assert.deepEqual(changed, [3])
  }
})

test('Native Popover trigger interaction keeps controlled opening and disabled behavior', async (t) => {
  const changes = []
  const props = {
    trigger: 'Show',
    triggerClassName: `${interactionClasses} aria-expanded:border-2`,
    onOpenChange: (value) => changes.push(value),
  }
  const tree = await mount(t, HozoPopover, props)
  await checkInteraction(tree)
  const host = () => tree.root.findByType('NativePressable')
  assert.equal(host().props.accessibilityState.expanded, false)
  assert.deepEqual(changes, [])
  await press(host())
  assert.equal(host().props.accessibilityState.expanded, true)
  assert.equal(flat(host().props.style).borderTopWidth, 2)
  assert.equal(tree.root.findAllByType('NativeAnimatedView').length, 1)
  await press(host())
  assert.deepEqual(changes, [true, false])
  assert.equal(tree.root.findAllByType('NativeAnimatedView').length, 0)
  const controlled = await mount(t, HozoPopover, { ...props, open: false })
  await press(controlled.root.findByType('NativePressable'))
  assert.equal(
    controlled.root.findByType('NativePressable').props.accessibilityState.expanded,
    false,
  )
  const disabled = await mount(t, HozoPopover, { ...props, disabled: true })
  const before = changes.length
  await press(disabled.root.findByType('NativePressable'))
  assert.equal(changes.length, before)
})

for (const [name, Component] of [
  ['Drawer', HozoDrawer],
  ['BottomSheet', HozoBottomSheet],
]) {
  test(`Native ${name} scrim receives interaction without dismissing, and keeps native close paths`, async (t) => {
    const closed = []
    const tree = await mount(t, Component, {
      open: true,
      scrimClassName: interactionClasses,
      onClose: () => closed.push(true),
    })
    const scrim = () => tree.root.findAllByType('NativePressable')[0]
    await checkBoxInteraction(scrim)
    assert.deepEqual(closed, [])
    assert.equal(scrim().props.accessibilityElementsHidden, true)
    assert.equal(scrim().props.importantForAccessibility, 'no-hide-descendants')
    await press(scrim())
    await act(() => tree.root.findByType('NativeModal').props.onRequestClose())
    const panel = tree.root
      .findAllByType('NativeView')
      .find((node) => node.props.accessibilityViewIsModal)
    await act(() => panel.props.onAccessibilityAction({ nativeEvent: { actionName: 'escape' } }))
    assert.equal(closed.length, 3)
    const override = await mount(t, Component, {
      open: true,
      scrimClassName: interactionClasses,
      scrimStyle: { backgroundColor: '#123456' },
    })
    const own = () => override.root.findAllByType('NativePressable')[0]
    await act(() => own().props.onHoverIn({}))
    assert.equal(flat(own().props.style).backgroundColor, '#123456')
  })
}

test('Native BottomSheet handle keeps detent and responder callbacks while delivering interaction', async (t) => {
  const tree = await mount(t, HozoBottomSheet, {
    open: true,
    detents: [0.5, 1],
    defaultDetent: 0.5,
    handleClassName: interactionClasses,
  })
  const handle = () => tree.root.findAllByType('NativePressable')[1]
  const panel = () =>
    tree.root.findAllByType('NativeView').find((node) => node.props.accessibilityViewIsModal)
  await act(() => panel().props.onLayout({ nativeEvent: { layout: { height: 400 } } }))
  const travel = () => flat(panel().props.style).transform[0].translateY
  assert.equal(travel(), 200)
  await checkBoxInteraction(handle)
  assert.equal(travel(), 200, 'interaction alone does not change the detent')
  await press(handle())
  assert.equal(travel(), 0)
  await press(handle())
  assert.equal(travel(), 200)
  assert.equal(handle().props.onMoveShouldSetResponder({}, { dy: 3 }), true)
  await act(() => handle().props.onResponderGrant({}))
  await act(() => handle().props.onResponderMove({}, { dy: -200 }))
  assert.equal(travel(), 0, 'shared pressable forwards the existing responder handlers')
})

test('Native ColorPicker swatches deliver interaction to both slots without changing the sample colour', async (t) => {
  const changes = []
  const swatchClasses =
    'hover:border-2 focus:opacity-75 focus-visible:outline-2 focus-visible:outline-hozo-focus active:opacity-50'
  for (const slot of ['swatchClassName', 'selectedSwatchClassName']) {
    const beforeInteraction = changes.length
    const tree = await mount(t, HozoColorPicker, {
      accessibilityLabel: 'Colour',
      presets: ['#ff0000', '#0000ff'],
      defaultValue: '#ff0000',
      onChange: (hex) => changes.push(hex),
      [slot]: swatchClasses,
    })
    const hosts = () => tree.root.findAllByType('NativePressable')
    const swatch = () => hosts()[0]
    const box = () => flat(swatch().props.style)
    const event = async (name) => {
      await act(() => swatch().props[name]({}))
    }
    await event('onHoverIn')
    assert.equal(box().borderTopWidth, 2)
    assert.equal(
      box().backgroundColor,
      '#ff0000',
      'the sample always paints the preset, not a hover colour',
    )
    assert.equal(flat(hosts()[1].props.style).borderTopWidth, undefined)
    await event('onHoverOut')
    assert.equal(box().borderTopWidth, undefined)
    await event('onFocus')
    assert.equal(box().opacity, 0.75)
    assert.equal(box().outlineWidth, 2)
    await event('onPointerDown')
    assert.equal(box().outlineWidth, undefined)
    await event('onKeyDown')
    assert.equal(box().outlineWidth, 2)
    await event('onPressIn')
    assert.equal(box().opacity, 0.5)
    await event('onPressOut')
    await event('onBlur')
    assert.equal(box().opacity, undefined)
    assert.equal(swatch().props.accessibilityState.checked, true)
    assert.equal(changes.length, beforeInteraction, 'interaction alone does not select a colour')
    const before = changes.length
    await press(hosts()[1])
    assert.equal(changes.length, before + 1)
    assert.equal(changes.at(-1), '#0000ff')
    assert.deepEqual(
      hosts().map((node) => node.props.accessibilityState.checked),
      [false, true],
    )
  }
})

test('Native ColorPicker preserves disabled guards and selected slot style priority', async (t) => {
  const changes = []
  const tree = await mount(t, HozoColorPicker, {
    accessibilityLabel: 'Colour',
    presets: ['#ff0000', '#0000ff'],
    defaultValue: '#ff0000',
    disabled: true,
    onChange: (hex) => changes.push(hex),
    swatchClassName: 'disabled:opacity-25',
    swatchStyle: { borderTopWidth: 3 },
    selectedSwatchStyle: { borderTopWidth: 5 },
  })
  const hosts = tree.root.findAllByType('NativePressable')
  assert.equal(flat(hosts[0].props.style).borderTopWidth, 5)
  assert.equal(flat(hosts[1].props.style).borderTopWidth, 3)
  assert.equal(flat(hosts[0].props.style).opacity, 0.25)
  await press(hosts[1])
  assert.deepEqual(changes, [])
  assert.equal(tree.root.findByType('NativeTextInput').props.editable, false)
})

test('Native ColorPicker runtime semantics share radio ownership without invented ARIA attributes', async (t) => {
  const changes = []
  const props = {
    presets: ['#ff0000', '#0000ff'],
    defaultValue: '#0000ff',
    accessibilityLabel: 'Colour',
    onChange: (hex) => changes.push(hex),
    swatchClassName: swatchSemanticClasses,
    selectedSwatchClassName: selectedSwatchSemanticClasses,
  }
  const tree = await mount(t, HozoColorPicker, props)
  const hosts = () =>
    tree.root
      .findAllByType('NativePressable')
      .filter((node) => node.props.accessibilityRole === 'radio')
  const check = (selected, disabled) => {
    for (const [index, radio] of hosts().entries()) {
      assert.deepEqual(radio.props.accessibilityState, { checked: index === selected, disabled })
      assert.equal(flat(radio.props.style).borderTopWidth, index === selected ? 2 : undefined)
      assert.equal(flat(radio.props.style).outlineWidth, undefined, 'no aria-selected attribute')
      assert.equal(flat(radio.props.style).borderRadius, index === selected ? 8 : undefined)
      assert.equal(
        flat(radio.props.style).opacity,
        disabled ? (index === selected ? 0.5 : 0.25) : undefined,
      )
      assert.equal(flat(radio.props.style).backgroundColor, props.presets[index])
    }
  }
  check(1, false)
  await act(() => hosts()[0].props.onHoverIn({}))
  assert.equal(
    flat(hosts()[0].props.style).opacity,
    undefined,
    'hovered unchecked radio stays unchecked',
  )
  await act(() => hosts()[1].props.onHoverIn({}))
  assert.equal(flat(hosts()[1].props.style).opacity, 0.5)
  await press(hosts()[0])
  assert.deepEqual(changes, ['#ff0000'])
  assert.equal(flat(hosts()[0].props.style).opacity, 0.5, 'checked hover follows selection')
  assert.equal(flat(hosts()[1].props.style).opacity, undefined)
  await act(() => hosts()[0].props.onHoverOut({}))
  await act(() => hosts()[1].props.onHoverOut({}))
  check(0, false)
  await act(() => tree.update(React.createElement(HozoColorPicker, { ...props, disabled: true })))
  check(0, true)
  await press(hosts()[1])
  assert.deepEqual(changes, ['#ff0000'], 'real disabled guard remains')
  await act(() =>
    tree.update(
      React.createElement(HozoColorPicker, {
        ...props,
        value: '#0000ff',
        disabled: true,
      }),
    ),
  )
  check(1, true)
  await act(() =>
    tree.update(
      React.createElement(HozoColorPicker, {
        ...props,
        value: '#0000ff',
        disabled: false,
      }),
    ),
  )
  check(1, false)
  await press(hosts()[0])
  assert.equal(changes.at(-1), '#ff0000')
  check(1, false)
  await act(() =>
    tree.update(
      React.createElement(HozoColorPicker, {
        ...props,
        value: '#ff0000',
        disabled: true,
        swatchStyle: { opacity: 0.8, borderTopWidth: 3, backgroundColor: '#000' },
        selectedSwatchStyle: { opacity: 0.9, borderTopWidth: 5, backgroundColor: '#fff' },
      }),
    ),
  )
  assert.equal(flat(hosts()[0].props.style).opacity, 0.9)
  assert.equal(flat(hosts()[1].props.style).opacity, 0.8)
  assert.equal(flat(hosts()[0].props.style).borderTopWidth, 5)
  assert.equal(flat(hosts()[1].props.style).borderTopWidth, 3)
  assert.equal(flat(hosts()[0].props.style).backgroundColor, '#ff0000', 'preset meaning stays last')
  for (const [value, expected] of [
    ['#ff0000', [true, false, false, false]],
    ['#000000', [false, false, false, true]],
  ]) {
    await act(() =>
      tree.update(
        React.createElement(HozoColorPicker, {
          ...props,
          presets: ['#f00', '#ff0000', 'not-a-colour', '#000000'],
          value,
        }),
      ),
    )
    assert.deepEqual(
      hosts().map((node) => node.props.accessibilityState.checked),
      expected,
    )
    for (const [index, radio] of hosts().entries()) {
      assert.equal(flat(radio.props.style).borderTopWidth, expected[index] ? 2 : undefined)
      assert.equal(flat(radio.props.style).borderRadius, expected[index] ? 8 : undefined)
    }
  }
})

test('Native clickable Stepper keeps focus on the button, not its decorative mark or description', async (t) => {
  const pressed = []
  const tree = await mount(t, HozoStepper, {
    steps: [
      { label: 'Profile', description: 'Your details' },
      { label: 'Confirm', disabled: true },
    ],
    activeStep: 0,
    onStepPress: (index) => pressed.push(index),
    stepClassName: interactionClasses,
    indicatorClassName: interactionClasses,
    descriptionClassName: interactionClasses,
  })
  await checkInteraction(tree)
  const hosts = () => tree.root.findAllByType('NativePressable')
  await act(() => hosts()[0].props.onHoverIn({}))
  assert.deepEqual(
    hosts()[0]
      .findAllByType('NativeText')
      .map((node) => flat(node.props.style).color),
    [color('hozo-accent-text'), color('hozo-accent-text'), color('hozo-accent-text')],
  )
  assert.equal(flat(hosts()[1].props.style).backgroundColor, undefined)
  await act(() => hosts()[0].props.onKeyDown({}))
  await act(() => hosts()[0].props.onFocus({}))
  assert.equal(
    hosts()[0]
      .findAllByType('NativeView')
      .filter((node) => flat(node.props.style).outlineWidth === 2).length,
    0,
    'decorative mark and description cannot borrow focus-visible',
  )
  assert.equal(flat(hosts()[0].props.style).outlineWidth, 2, 'the button keeps its own ring')
  assert.deepEqual(
    hosts()[0]
      .findAllByType('NativeText')
      .map((node) => flat(node.props.style).fontWeight),
    ['700', '700', '700'],
    'parent focus typography is inherited, not a child focus predicate',
  )
  assert.deepEqual(pressed, [])
  assert.equal(hosts()[0].props.accessibilityState.selected, true)
  await press(hosts()[1])
  assert.deepEqual(pressed, [])
  await press(hosts()[0])
  assert.deepEqual(pressed, [0])
  assert.equal(
    hosts()[0].props.accessibilityState.selected,
    true,
    'activeStep remains owner-controlled',
  )
})

test('Native Stepper step status slots get interaction but decorative status slots do not borrow it', async (t) => {
  for (const [status, prefix] of [
    ['completed', 'completed'],
    ['current', 'current'],
    ['error', 'error'],
  ]) {
    for (const part of ['Step', 'Indicator']) {
      const tree = await mount(t, HozoStepper, {
        steps: [{ label: 'One', status }],
        activeStep: 0,
        onStepPress: () => {},
        [`${prefix}${part}ClassName`]: interactionClasses,
      })
      const host = () => tree.root.findByType('NativePressable')
      await act(() => host().props.onHoverIn({}))
      const box = part === 'Step' ? host() : host().findAllByType('NativeView')[0]
      assert.equal(
        flat(box.props.style).backgroundColor,
        part === 'Step' ? color('hozo-accent') : undefined,
      )
      assert.equal(
        flat(host().findAllByType('NativeText')[0].props.style).color,
        part === 'Step' ? color('hozo-accent-text') : undefined,
      )
      await act(() => host().props.onFocus({}))
      assert.equal(
        flat((part === 'Step' ? host() : host().findAllByType('NativeView')[0]).props.style)
          .outlineWidth,
        part === 'Step' ? 2 : undefined,
      )
    }
  }
  const staticTree = await mount(t, HozoStepper, {
    steps: [{ label: 'One', description: 'Info' }],
    activeStep: 0,
    currentStepClassName: 'p-4',
    indicatorClassName: 'p-4',
  })
  assert.equal(staticTree.root.findAllByType('NativePressable').length, 0)
  assert.equal(staticTree.root.findAllByType('NativeText')[1].children.join(''), 'One')
  assert.equal(flat(staticTree.root.findAllByType('NativeView')[1].props.style).paddingTop, 16)
})

test('Native Stepper decorative status slots retain base and explicit styles without borrowing focus', async (t) => {
  for (const status of ['upcoming', 'completed', 'current', 'error']) {
    const changes = []
    const props = {
      steps: [{ label: 'One', description: 'Info', status }],
      activeStep: 0,
      onStepPress: (index) => changes.push(index),
      stepClassName: 'focus:outline-4 focus-visible:font-bold',
      indicatorClassName: otpCellFocusClasses,
      descriptionClassName: otpCellFocusClasses,
      ...(status === 'upcoming' ? {} : { [`${status}IndicatorClassName`]: otpCellFocusClasses }),
    }
    const tree = await mount(t, HozoStepper, props)
    const host = () => tree.root.findByType('NativePressable')
    const decorations = () => {
      const views = host().findAllByType('NativeView')
      const texts = host().findAllByType('NativeText')
      return [
        [views[0], texts[0]],
        [views[2], texts[2]],
      ]
    }
    const check = () => {
      for (const [box, text] of decorations()) {
        assert.equal(flat(box.props.style).outlineWidth, undefined, status)
        assert.equal(flat(box.props.style).borderTopWidth, 2, status)
        assert.equal(flat(text.props.style).fontWeight, '400', status)
      }
    }
    check()
    await act(() => host().props.onKeyDown({}))
    await act(() => host().props.onFocus({}))
    assert.equal(flat(host().props.style).outlineWidth, 4)
    assert.equal(flat(host().findAllByType('NativeText')[1].props.style).fontWeight, '700')
    check()
    await act(() => host().props.onBlur({}))
    assert.equal(flat(host().props.style).outlineWidth, undefined)
    check()
    await act(() =>
      tree.update(
        React.createElement(HozoStepper, {
          ...props,
          indicatorStyle: { outlineWidth: 6, fontWeight: '500' },
          descriptionStyle: { outlineWidth: 7, fontWeight: '600' },
          ...(status === 'upcoming'
            ? {}
            : {
                [`${status}IndicatorStyle`]: { outlineWidth: 8, fontWeight: '800' },
              }),
        }),
      ),
    )
    await act(() => host().props.onKeyDown({}))
    await act(() => host().props.onFocus({}))
    const [[mark, markText], [description, descriptionText]] = decorations()
    assert.equal(flat(mark.props.style).outlineWidth, status === 'upcoming' ? 6 : 8)
    assert.equal(flat(markText.props.style).fontWeight, status === 'upcoming' ? '500' : '800')
    assert.equal(flat(description.props.style).outlineWidth, 7)
    assert.equal(flat(descriptionText.props.style).fontWeight, '600')
    assert.deepEqual(changes, [], 'focus does not activate or advance a step')
    await press(host())
    assert.deepEqual(changes, [0])
  }
})

test('Native Stepper runtime semantics follow the class owner, not selected or disabled announcements', async (t) => {
  const semantics = 'disabled:opacity-25 aria-disabled:border-4 aria-selected:outline-4'
  const steps = ['completed', 'current', 'error', 'upcoming'].map((status) => ({
    label: status,
    description: 'Details',
    status,
    disabled: true,
  }))
  const changes = []
  const props = {
    steps,
    activeStep: 0,
    onStepPress: (index) => changes.push(index),
    stepClassName: semantics,
    completedStepClassName: semantics,
    currentStepClassName: semantics,
    errorStepClassName: semantics,
    indicatorClassName: semantics,
    completedIndicatorClassName: semantics,
    currentIndicatorClassName: semantics,
    errorIndicatorClassName: semantics,
    descriptionClassName: semantics,
  }
  const tree = await mount(t, HozoStepper, props)
  const hosts = () => tree.root.findAllByType('NativePressable')
  const check = (row, disabled) => {
    assert.equal(flat(row.props.style).opacity, disabled ? 0.25 : undefined)
    assert.equal(flat(row.props.style).borderTopWidth, undefined, 'no aria-disabled attribute')
    assert.equal(flat(row.props.style).outlineWidth, undefined, 'selected is not aria-selected')
    const views = row.findAllByType('NativeView')
    // In descriptive mode findAll also includes the row itself.
    const decorations = views.filter((node) => node !== row)
    for (const node of decorations) {
      assert.equal(flat(node.props.style).opacity, undefined, 'spans are never disabled')
      assert.equal(flat(node.props.style).borderTopWidth, undefined)
      assert.equal(flat(node.props.style).outlineWidth, undefined)
    }
  }
  for (const [index, row] of hosts().entries()) {
    assert.deepEqual(row.props.accessibilityState, { selected: index === 1, disabled: true })
    check(row, true)
    await press(row)
  }
  assert.deepEqual(changes, [], 'disabled activation is still suppressed')
  await act(() =>
    tree.update(
      React.createElement(HozoStepper, {
        ...props,
        steps: steps.map((step) => ({ ...step, disabled: false })),
      }),
    ),
  )
  for (const row of hosts()) check(row, false)
  await press(hosts()[3])
  assert.deepEqual(changes, [3])
  await act(() =>
    tree.update(React.createElement(HozoStepper, { ...props, onStepPress: undefined })),
  )
  assert.equal(hosts().length, 0)
  const rows = tree.root.findAllByType('NativeView').filter((node) => node.props.accessible)
  assert.equal(rows.length, 4)
  assert.deepEqual(rows[1].props.accessibilityState, { selected: true })
  for (const row of rows) check(row, false)
  await act(() =>
    tree.update(
      React.createElement(HozoStepper, {
        ...props,
        stepStyle: { opacity: 0.9 },
        currentStepStyle: { opacity: 0.8 },
        indicatorStyle: { opacity: 0.7 },
        descriptionStyle: { opacity: 0.6 },
      }),
    ),
  )
  assert.equal(flat(hosts()[1].props.style).opacity, 0.8)
  assert.equal(flat(hosts()[3].props.style).opacity, 0.9)
  assert.equal(flat(hosts()[1].findAllByType('NativeView')[0].props.style).opacity, 0.7)
  assert.equal(flat(hosts()[1].findAllByType('NativeView')[2].props.style).opacity, 0.6)
})

test('Native Chip standalone toggle delivers interaction without changing selection and preserves controlled state', async (t) => {
  const changed = []
  const tree = await mount(t, HozoChip, {
    defaultSelected: true,
    className: `${interactionClasses} aria-pressed:border-2`,
    onSelectedChange: (value) => changed.push(value),
  })
  await checkInteraction(tree)
  const host = () => tree.root.findByType('NativePressable')
  assert.deepEqual(changed, [])
  assert.equal(host().props.accessibilityState.checked, true)
  assert.equal(flat(host().props.style).borderTopWidth, 2)
  await press(host())
  assert.deepEqual(changed, [false])
  assert.equal(host().props.accessibilityState.checked, false)
  const controlled = await mount(t, HozoChip, {
    selected: true,
    onSelectedChange: (value) => changed.push(value),
  })
  await press(controlled.root.findByType('NativePressable'))
  assert.equal(controlled.root.findByType('NativePressable').props.accessibilityState.checked, true)
  const disabled = await mount(t, HozoChip, {
    defaultSelected: true,
    disabled: true,
    onSelectedChange: (value) => changed.push(value),
  })
  const before = changed.length
  await press(disabled.root.findByType('NativePressable'))
  assert.equal(changed.length, before)
})

test('Native Chip semantic candidates follow the Web class owner, not RN checked announcements', async (t) => {
  for (const selectable of [false, true]) {
    for (const removable of [false, true]) {
      for (const disabled of [false, true]) {
        const changed = []
        const removed = []
        const tree = await mount(t, HozoChip, {
          ...(selectable
            ? { defaultSelected: true, onSelectedChange: (on) => changed.push(on) }
            : {}),
          ...(removable ? { onRemove: () => removed.push(true) } : {}),
          disabled,
          className:
            'p-4 aria-pressed:border-2 disabled:opacity-25 aria-checked:outline-4 aria-disabled:border-4',
          removeClassName:
            'p-4 aria-pressed:border-2 disabled:opacity-25 aria-checked:outline-4 aria-disabled:border-4',
        })
        const buttons = () => tree.root.findAllByType('NativePressable')
        const owner = () =>
          selectable && !removable ? buttons()[0] : tree.root.findAllByType('NativeView')[0]
        const check = (selected) => {
          assert.equal(
            flat(owner().props.style).borderTopWidth,
            selectable && !removable && selected ? 2 : undefined,
          )
          assert.equal(
            flat(owner().props.style).opacity,
            selectable && !removable && disabled ? 0.25 : undefined,
          )
          assert.equal(
            flat(owner().props.style).outlineWidth,
            undefined,
            'aria-checked is absent on Web',
          )
          if (selectable) assert.equal(buttons()[0].props.accessibilityState.checked, selected)
          if (removable) {
            const remove = buttons().at(-1)
            assert.equal(flat(remove.props.style).borderTopWidth, undefined)
            assert.equal(flat(remove.props.style).opacity, disabled ? 0.25 : undefined)
            assert.equal(flat(remove.props.style).outlineWidth, undefined)
          }
        }
        check(selectable)
        if (selectable) {
          await press(buttons()[0])
          check(disabled)
          assert.deepEqual(changed, disabled ? [] : [false])
        }
        if (removable) {
          await press(buttons().at(-1))
          assert.deepEqual(removed, disabled ? [] : [true])
        }
      }
    }
  }
})

test('Native Chip removal is independent and never lends child focus to the composite row', async (t) => {
  const removed = []
  const tree = await mount(t, HozoChip, {
    defaultSelected: false,
    onRemove: () => removed.push(true),
    className: `${interactionClasses} active:font-bold`,
    removeClassName: interactionClasses,
  })
  await checkInteraction(tree, 1)
  const hosts = () => tree.root.findAllByType('NativePressable')
  const row = () => tree.root.findByType('NativeView')
  await act(() => hosts()[0].props.onHoverIn({}))
  assert.equal(flat(row().props.style).backgroundColor, color('hozo-accent'))
  const hoveredBox = flat(row().props.style)
  await act(() => hosts()[0].props.onFocus({}))
  assert.deepEqual(
    flat(row().props.style),
    hoveredBox,
    'child focus cannot give the hovered row a focus ring',
  )
  assert.equal(
    flat(hosts()[0].findByType('NativeText').props.style).fontWeight,
    undefined,
    'the row is not focused when its child is',
  )
  assert.equal(hosts()[0].props.accessibilityState.checked, false)
  assert.deepEqual(removed, [])
  await act(() => hosts()[0].props.onPressIn({}))
  assert.equal(flat(row().props.style).opacity, 0.5, 'activation reaches the ancestor box too')
  assert.equal(
    flat(hosts()[0].findByType('NativeText').props.style).fontWeight,
    '700',
    'ancestor active text is still inherited',
  )
  await act(() => hosts()[0].props.onPressOut({}))
  await press(hosts()[1])
  assert.deepEqual(removed, [true])
  assert.equal(hosts()[0].props.accessibilityState.checked, false)
  const disabled = await mount(t, HozoChip, { disabled: true, onRemove: () => removed.push(true) })
  await press(disabled.root.findByType('NativePressable'))
  assert.equal(removed.length, 1)
  const plain = await mount(t, HozoChip, {})
  assert.equal(plain.root.findAllByType('NativePressable').length, 0)
  assert.equal(plain.root.findByType('NativeText').children.join(''), 'Updates')
})

test('Native Chip row aggregates sibling hover/press without adding a third control or borrowing focus', async (t) => {
  const toggled = [],
    removed = []
  const props = {
    defaultSelected: false,
    onSelectedChange: (value) => toggled.push(value),
    onRemove: () => removed.push(true),
    className: `${interactionClasses} active:font-bold`,
    removeClassName: 'focus-visible:outline-2',
  }
  const tree = await mount(t, HozoChip, props)
  const row = () => tree.root.findByType('NativeView')
  const hosts = () => tree.root.findAllByType('NativePressable')
  const event = async (at, name) => {
    await act(() => hosts()[at].props[name]({}))
  }
  assert.equal(hosts().length, 2)
  assert.equal(row().props.onPress, undefined)
  assert.equal(row().props.accessibilityRole, undefined)
  assert.equal(
    row().props.onStartShouldSetResponderCapture,
    undefined,
    'observation does not take the responder',
  )
  await event(0, 'onHoverIn')
  await event(1, 'onHoverIn')
  await event(0, 'onHoverOut')
  assert.equal(
    flat(row().props.style).backgroundColor,
    color('hozo-accent'),
    'the remove button still hovers',
  )
  assert.equal(
    flat(hosts()[0].findByType('NativeText').props.style).color,
    color('hozo-accent-text'),
    'the label inherits the row, not just its own toggle',
  )
  await event(1, 'onHoverOut')
  assert.equal(flat(row().props.style).backgroundColor, undefined)
  await act(() => row().props.onPointerEnter({}))
  await event(0, 'onHoverIn')
  await event(0, 'onHoverOut')
  assert.equal(
    flat(row().props.style).backgroundColor,
    color('hozo-accent'),
    'padding between controls still belongs to the row',
  )
  await event(1, 'onHoverIn')
  await act(() => row().props.onPointerLeave({}))
  assert.equal(
    flat(row().props.style).backgroundColor,
    undefined,
    'ancestor exit clears even a missing child exit',
  )
  await event(0, 'onFocus')
  await event(1, 'onFocus')
  assert.equal(flat(row().props.style).outlineWidth, undefined)
  assert.equal(flat(row().props.style).opacity, undefined)
  assert.equal(
    flat(hosts()[1].props.style).outlineWidth,
    2,
    'the remove button still owns its focus',
  )
  await event(0, 'onPressIn')
  await event(1, 'onPressIn')
  await event(0, 'onPressOut')
  assert.equal(
    flat(row().props.style).opacity,
    0.5,
    'one release cannot clear the other activation',
  )
  await event(1, 'onPressOut')
  assert.equal(flat(row().props.style).opacity, undefined)
  assert.deepEqual(toggled, [])
  assert.deepEqual(removed, [])
  await press(hosts()[0])
  await press(hosts()[1])
  assert.deepEqual(toggled, [true])
  assert.deepEqual(removed, [true])
  await event(0, 'onPressIn')
  await act(() =>
    tree.update(React.createElement(HozoChip, { ...props, disabled: true }, 'Updates')),
  )
  assert.equal(
    flat(row().props.style).opacity,
    undefined,
    'disable clears a press whose release may never arrive',
  )
  await act(() => tree.update(React.createElement(HozoChip, props, 'Updates')))
  await event(0, 'onHoverIn')
  await act(() =>
    tree.update(
      React.createElement(
        HozoChip,
        { onRemove: props.onRemove, className: props.className },
        'Updates',
      ),
    ),
  )
  assert.equal(hosts().length, 1)
  assert.equal(
    flat(row().props.style).backgroundColor,
    undefined,
    'an absent toggle cannot keep hovering',
  )
})

test('Native Chip non-focusable row observes touch contacts and cancels without stealing child actions', async (t) => {
  const removed = []
  const tree = await mount(t, HozoChip, {
    onRemove: () => removed.push(true),
    className: interactionClasses,
  })
  const row = () => tree.root.findByType('NativeView')
  const touch = async (name, identifiers) => {
    await act(() =>
      row().props[name]({
        nativeEvent: { changedTouches: identifiers.map((identifier) => ({ identifier })) },
      }),
    )
  }
  await touch('onTouchStartCapture', [10, 20])
  assert.equal(flat(row().props.style).opacity, 0.5)
  await touch('onTouchEndCapture', [10])
  assert.equal(flat(row().props.style).opacity, 0.5, 'the second contact still belongs to the row')
  await touch('onTouchCancelCapture', [20])
  assert.equal(flat(row().props.style).opacity, undefined)
  assert.deepEqual(removed, [])
  await press(tree.root.findByType('NativePressable'))
  assert.deepEqual(removed, [true])
  const plain = await mount(t, HozoChip, { className: interactionClasses })
  await act(() => plain.root.findByType('NativeView').props.onPointerEnter({}))
  assert.equal(
    flat(plain.root.findByType('NativeView').props.style).backgroundColor,
    color('hozo-accent'),
  )
  assert.equal(
    flat(plain.root.findByType('NativeText').props.style).color,
    color('hozo-accent-text'),
  )
  assert.equal(plain.root.findAllByType('NativePressable').length, 0)
})

test('Native OTP input focus determines the active decoration without focusing virtual cells', async (t) => {
  let focusRequests = 0
  const tree = await mount(
    t,
    HozoOtpInput,
    {
      accessibilityLabel: 'Code',
      length: 3,
      defaultValue: '1',
      className: interactionClasses,
      cellClassName: interactionClasses,
      activeCellClassName: 'border-2',
      inputClassName: 'focus-visible:outline-2 focus:opacity-75',
      filledCellClassName: 'aria-disabled:opacity-25',
    },
    {
      createNodeMock: (node) =>
        node.type === 'NativeTextInput'
          ? {
              focus: () => {
                focusRequests += 1
              },
            }
          : null,
    },
  )
  const wrapper = () => tree.root.findByType('NativePressable')
  const input = () => tree.root.findByType('NativeTextInput')
  const cells = () =>
    tree.root
      .findAllByType('NativeView')
      .filter(
        (node) => node.props.accessibilityElementsHidden && node.props.pointerEvents !== 'none',
      )
  const frame = () =>
    tree.root.findAllByType('NativeView').find((node) => node.props.pointerEvents === 'none')
  assert.equal(wrapper().props.accessible, false)
  assert.equal(wrapper().props.focusable, false)
  await act(() => wrapper().props.onHoverIn({}))
  assert.equal(flat(wrapper().props.style).backgroundColor, color('hozo-accent'))
  assert.equal(flat(cells()[0].props.style).backgroundColor, color('hozo-accent'))
  assert.equal(
    flat(cells()[0].findByType('NativeText').props.style).color,
    color('hozo-accent-text'),
  )
  await act(() => wrapper().props.onFocus({}))
  assert.equal(
    cells().some((node) => flat(node.props.style).outlineWidth === 2),
    false,
    'wrapper focus cannot invent input focus',
  )
  assert.equal(flat(wrapper().props.style).outlineWidth, undefined)
  assert.equal(flat(frame().props.style).outlineWidth, undefined)
  await act(() => input().props.onFocus({}))
  assert.deepEqual(
    cells().map((node) => flat(node.props.style).outlineWidth),
    [undefined, undefined, undefined],
  )
  assert.equal(flat(frame().props.style).outlineWidth, 2)
  assert.equal(flat(cells()[1].props.style).borderTopWidth, 2, 'active decoration remains explicit')
  assert.equal(flat(cells()[1].findByType('NativeText').props.style).fontWeight, undefined)
  await act(() => input().props.onPointerDown({}))
  assert.equal(flat(frame().props.style).outlineWidth, 2)
  assert.equal(
    flat(frame().props.style).opacity,
    0.75,
    'pointer input does not blur a typing field or remove its visible focus',
  )
  await act(() => input().props.onKeyDown({}))
  assert.equal(flat(frame().props.style).outlineWidth, 2)
  await act(() => input().props.onChangeText('12'))
  assert.deepEqual(
    cells().map((node) => flat(node.props.style).borderTopWidth),
    [undefined, undefined, 2],
  )
  assert.equal(flat(frame().props.style).outlineWidth, 2)
  await act(() => wrapper().props.onPressIn({}))
  assert.equal(flat(cells()[2].props.style).opacity, 0.5)
  await act(() => wrapper().props.onPressOut({}))
  await press(wrapper())
  assert.equal(focusRequests, 1, 'the ref still receives a focus request')
  await act(() => input().props.onBlur({}))
  assert.equal(
    cells().some((node) => flat(node.props.style).outlineWidth === 2),
    false,
  )
  assert.equal(input().props.value, '12')
  assert.equal(flat(input().props.style).opacity, 0.011)
  assert.equal(input().props.autoComplete, 'sms-otp')
})

test('Native OTP virtual cells never acquire input focus through any runtime class slot', async (t) => {
  for (const slot of ['cellClassName', 'activeCellClassName', 'filledCellClassName']) {
    const tree = await mount(t, HozoOtpInput, {
      accessibilityLabel: 'Code',
      length: 3,
      defaultValue: '1',
      [slot]: otpCellFocusClasses,
      inputClassName: 'focus:outline-4 focus-visible:font-bold',
    })
    const input = () => tree.root.findByType('NativeTextInput')
    const cells = () =>
      tree.root
        .findAllByType('NativeView')
        .filter(
          (node) => node.props.accessibilityElementsHidden && node.props.pointerEvents !== 'none',
        )
    const frame = () =>
      tree.root.findAllByType('NativeView').find((node) => node.props.pointerEvents === 'none')
    const assertCells = () => {
      for (const cell of cells()) {
        assert.equal(
          flat(cell.props.style).outlineWidth,
          undefined,
          `${slot}: cells cannot take focus`,
        )
        assert.notEqual(
          flat(cell.findAllByType('NativeText')[0].props.style).fontWeight,
          '700',
          slot,
        )
        assert.equal(cell.props.importantForAccessibility, 'no-hide-descendants')
      }
      assert.equal(tree.root.findAllByType('NativeTextInput').length, 1)
    }
    assertCells()
    await act(() => input().props.onPointerDown({}))
    await act(() => input().props.onFocus({}))
    assert.equal(flat(frame().props.style).outlineWidth, 4, 'the input still receives focus')
    assertCells()
    const target = slot === 'activeCellClassName' ? 1 : 0
    assert.equal(flat(cells()[target].props.style).opacity, 0.5, `${slot}: base styles remain`)
    assert.equal(
      flat(cells()[target].props.style).borderTopWidth,
      2,
      `${slot}: stacked focus stays off`,
    )
    assert.equal(
      flat(cells()[target].findAllByType('NativeText')[0].props.style).fontWeight,
      '400',
      slot,
    )
    await act(() => input().props.onKeyDown({}))
    assertCells()
    await act(() =>
      input().props.onSelectionChange({ nativeEvent: { selection: { start: 0, end: 0 } } }),
    )
    assertCells()
    const caret = tree.root.findByProps({ testID: 'hozo-otp-caret' })
    assert.equal(caret.props.pointerEvents, 'none')
    assert.equal(caret.props.accessible, false)
    assert.equal(caret.parent, cells()[0], 'the virtual caret follows the actual selection')
    assert.notEqual(
      flat(caret.props.style).fontWeight,
      '700',
      'caret is not a second focused field',
    )
    await act(() =>
      input().props.onSelectionChange({ nativeEvent: { selection: { start: 0, end: 1 } } }),
    )
    assert.equal(tree.root.findAllByProps({ testID: 'hozo-otp-caret' }).length, 0)
    assertCells()
    await act(() => input().props.onBlur({}))
    assert.equal(flat(frame().props.style).outlineWidth, undefined)
    assertCells()
  }
})

test('Native OTP explicit cell styles still win without borrowing input focus', async (t) => {
  for (const [slot, styleSlot, target] of [
    ['cellClassName', 'cellStyle', 0],
    ['activeCellClassName', 'activeCellStyle', 1],
    ['filledCellClassName', 'filledCellStyle', 0],
  ]) {
    const tree = await mount(t, HozoOtpInput, {
      accessibilityLabel: 'Code',
      length: 3,
      defaultValue: '1',
      [slot]: 'focus:outline-4 focus-visible:font-bold',
      [styleSlot]: { outlineWidth: 7, fontWeight: '500', opacity: 0.8 },
    })
    const input = () => tree.root.findByType('NativeTextInput')
    await act(() => input().props.onFocus({}))
    const cell = tree.root.findAllByType('NativeView')[target]
    assert.equal(flat(cell.props.style).outlineWidth, 7, slot)
    assert.equal(flat(cell.props.style).opacity, 0.8, slot)
    assert.equal(flat(cell.findByType('NativeText').props.style).fontWeight, '500', slot)
    assert.equal(tree.root.findAllByType('NativeTextInput').length, 1)
  }
})

test('Native OTP negated runtime focus variants keep their existing diagnostics', async (t) => {
  const warnings = []
  const warn = console.warn
  console.warn = (message) => warnings.push(String(message))
  try {
    const tree = await mount(t, HozoOtpInput, {
      accessibilityLabel: 'Code',
      length: 3,
      defaultValue: '1',
      cellClassName: otpUnsupportedFocusClasses,
    })
    const input = () => tree.root.findByType('NativeTextInput')
    const assertNoStyles = () => {
      for (const cell of tree.root.findAllByType('NativeView')) {
        assert.equal(flat(cell.props.style).opacity, undefined)
        assert.equal(flat(cell.props.style).borderTopWidth, undefined)
        assert.equal(flat(cell.findByType('NativeText').props.style).fontWeight, undefined)
      }
    }
    assertNoStyles()
    await act(() => input().props.onFocus({}))
    assertNoStyles()
    await act(() => input().props.onBlur({}))
    assertNoStyles()
    for (const candidate of otpUnsupportedFocusClasses.split(' ')) {
      assert.equal(warnings.filter((message) => message.includes(`\`${candidate}\``)).length, 1)
    }
  } finally {
    console.warn = warn
  }
})

test('Native OTP runtime input focus paints an independent, noninteractive field decoration', async (t) => {
  const tree = await mount(t, HozoOtpInput, {
    accessibilityLabel: 'Code',
    length: 3,
    defaultValue: '1',
    inputClassName: 'focus-visible:outline-2 focus-visible:outline-hozo-focus focus:opacity-75',
  })
  const input = () => tree.root.findByType('NativeTextInput')
  const wrapper = () => tree.root.findByType('NativePressable')
  const frame = () =>
    tree.root.findAllByType('NativeView').find((node) => node.props.pointerEvents === 'none')
  assert.equal(tree.root.findAllByType('NativeTextInput').length, 1)
  assert.equal(frame().props.accessible, false)
  assert.equal(frame().props.importantForAccessibility, 'no-hide-descendants')
  assert.equal(flat(frame().props.style).outlineWidth, undefined)
  await act(() => wrapper().props.onFocus({}))
  assert.equal(flat(frame().props.style).outlineWidth, undefined, 'wrapper is not input focus')
  await act(() => input().props.onFocus({}))
  assert.equal(flat(frame().props.style).outlineWidth, 2)
  assert.equal(flat(frame().props.style).outlineColor, color('hozo-focus'))
  assert.equal(flat(frame().props.style).opacity, 0.75)
  assert.equal(flat(input().props.style).opacity, 0.011)
  assert.equal(flat(input().props.style).color, 'transparent')
  for (const cell of tree.root.findAllByType('NativeView').filter((node) => node !== frame())) {
    assert.equal(
      flat(cell.props.style).outlineWidth,
      undefined,
      'no virtual cell takes input focus',
    )
  }
  await act(() => input().props.onPointerDown({}))
  assert.equal(flat(frame().props.style).outlineWidth, 2)
  assert.equal(flat(frame().props.style).opacity, 0.75, 'pointer modality does not blur')
  await act(() => input().props.onKeyDown({}))
  assert.equal(flat(frame().props.style).outlineWidth, 2)
  await act(() => input().props.onChangeText('12'))
  assert.equal(flat(frame().props.style).outlineWidth, 2)
  await act(() => input().props.onBlur({}))
  assert.equal(flat(frame().props.style).outlineWidth, undefined)
  assert.equal(flat(frame().props.style).opacity, undefined)
})

test('Native OTP active and filled slots receive their real state; controlled, masked and disabled input contracts remain', async (t) => {
  for (const slot of ['activeCellClassName', 'filledCellClassName']) {
    const tree = await mount(t, HozoOtpInput, {
      accessibilityLabel: 'Code',
      length: 2,
      defaultValue: '1',
      [slot]: interactionClasses,
    })
    const wrapper = () => tree.root.findByType('NativePressable')
    const input = () => tree.root.findByType('NativeTextInput')
    await act(() => input().props.onFocus({}))
    await act(() => wrapper().props.onHoverIn({}))
    const cells = tree.root.findAllByType('NativeView')
    const at = slot === 'activeCellClassName' ? 1 : 0
    assert.equal(flat(cells[at].props.style).backgroundColor, color('hozo-accent'))
  }
  const changed = [],
    completed = []
  const tree = await mount(t, HozoOtpInput, {
    accessibilityLabel: 'Code',
    length: 2,
    value: '1',
    mask: true,
    onChange: (value) => changed.push(value),
    onComplete: (value) => completed.push(value),
  })
  const input = () => tree.root.findByType('NativeTextInput')
  await act(() => input().props.onChangeText('1a2'))
  assert.deepEqual(changed, ['12'])
  assert.deepEqual(completed, ['12'])
  assert.equal(input().props.value, '1', 'the owner still controls the code')
  assert.equal(input().props.secureTextEntry, true)
  assert.equal(tree.root.findAllByType('NativeText')[0].children.join(''), '•')
  const disabled = await mount(t, HozoOtpInput, { accessibilityLabel: 'Code', disabled: true })
  assert.equal(disabled.root.findByType('NativeTextInput').props.editable, false)
  assert.equal(disabled.root.findByType('NativePressable').props.disabled, true)
})

test('Native OTP runtime semantics keep mutability on the real input, never its wrapper or cells', async (t) => {
  for (const disabled of [false, true])
    for (const readOnly of [false, true]) {
      const props = {
        accessibilityLabel: 'Code',
        length: 3,
        value: '1',
        disabled,
        readOnly,
        className: otpSemanticClasses,
        inputClassName: otpSemanticClasses,
        cellClassName: otpSemanticClasses,
        filledCellClassName: otpSemanticClasses,
        activeCellClassName: otpSemanticClasses,
      }
      const tree = await mount(t, HozoOtpInput, props)
      const field = () => tree.root.findByType('NativeTextInput')
      const wrapper = () => tree.root.findByType('NativePressable')
      const decorations = () => tree.root.findAllByType('NativeView')
      const frame = () => decorations().find((node) => node.props.pointerEvents === 'none')
      const cells = () => decorations().filter((node) => node.props.pointerEvents !== 'none')
      const check = () => {
        assert.equal(flat(wrapper().props.style).opacity, undefined)
        assert.equal(
          flat(wrapper().props.style).outlineWidth,
          2,
          'non-editable div matches read-only',
        )
        assert.equal(flat(wrapper().props.style).borderTopWidth, undefined)
        for (const cell of cells()) {
          assert.equal(
            flat(cell.props.style).outlineWidth,
            2,
            'spans are read-only, not disabled/enabled inputs',
          )
          assert.equal(flat(cell.props.style).opacity, undefined)
          assert.equal(flat(cell.props.style).borderTopWidth, undefined)
          assert.equal(flat(cell.props.style).marginTop, undefined)
        }
      }
      check()
      assert.equal(flat(frame().props.style).outlineWidth, disabled || readOnly ? 2 : undefined)
      assert.equal(flat(frame().props.style).opacity, disabled ? 0.25 : undefined)
      assert.equal(field().props.editable, !disabled && !readOnly)
      assert.deepEqual(field().props.accessibilityState, { disabled })
      if (!disabled) {
        await act(() => field().props.onFocus({}))
        assert.equal(flat(frame().props.style).outlineWidth, readOnly ? 4 : undefined)
        check()
        await act(() => field().props.onBlur({}))
      }
      assert.equal(flat(field().props.style).opacity, 0.011)
      assert.equal(flat(field().props.style).color, 'transparent')
      await act(() =>
        tree.update(
          React.createElement(HozoOtpInput, {
            ...props,
            inputStyle: { outlineWidth: 7 },
            cellStyle: { outlineWidth: 6 },
            filledCellStyle: { outlineWidth: 8 },
          }),
        ),
      )
      assert.equal(flat(frame().props.style).outlineWidth, 7)
      assert.equal(flat(cells()[0].props.style).outlineWidth, 8)
      assert.equal(flat(cells()[2].props.style).outlineWidth, 6)
    }
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
