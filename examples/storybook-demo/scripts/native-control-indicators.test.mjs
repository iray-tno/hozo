// No browser, GPU, Metro or device is launched here. Execute the real UI
// and Native patterns with React state and a real themed candidate module.
// Only the Native hosts are stand-ins; do not hand-copy a control's styles.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { loadTheme } from '@hozo/tailwind'
import { build, transformSync } from 'esbuild'
import React, { act } from 'react'
import { create } from 'react-test-renderer'
import * as classResolverRuntime from '../../../packages/engine/src/generated/class-resolver.ts'
import * as transformRuntime from '../../../packages/engine/src/generated/transform-slots.ts'
import { transformHozoSource } from '../../../packages/metro/src/transform.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../../../', import.meta.url))
const filename = (relative) => path.join(root, relative).replaceAll('\\', '/')
const uiRoot = path.join(root, 'packages/ui')
const theme = await loadTheme('@import "tailwindcss"; @import "./src/theme.css";', uiRoot)
const compiler = createCompiler(theme)
// The colour-scheme hook is a platform fact in this host-render test, not
// evidence about OS subscription delivery. Both palettes run the real output.
let nativeDark = false
const nativePlatform = { OS: 'ios' }
const actionSheets = []
let nativeViewport = { width: 400, height: 800 }
// What an app's `<SafeAreaProvider>` reports; zeros are an app without one.
let nativeInsets = { top: 0, right: 0, bottom: 0, left: 0 }
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
// Distinct looks make a class sent to the wrong owner fail, not merely one
// dropped entirely. Explicit styles below override only the top edge.
const overlaySlotClasses = 'p-2 p-3 p-4 p-5 p-6 p-7 p-8 p-9 p-10 p-12'
const otpSemanticClasses =
  'disabled:opacity-25 read-only:outline-2 read-only:focus:outline-4 aria-disabled:border-4 aria-selected:mt-8'
cache.scanFile(
  'calendar-chrome.tsx',
  '<View className="text-hozo-text-subtle text-lg font-bold aria-disabled:opacity-25 data-[hozo-range-start]:border-2 data-[hozo-range-end]:border-4 data-[hozo-in-range]:opacity-75 data-[hozo-outside]:opacity-50" />',
  1,
)
cache.scanFile(
  'form-field.ts',
  "export const c = 'focus:opacity-75 disabled:opacity-25 read-only:border-4 aria-[invalid=true]:border-4 aria-required:outline-4 aria-expanded:mt-8 text-hozo-accent'",
  1,
)
// Missing-fact warnings are once per candidate for this resolver. Keep this
// ownership probe independent of warnings already emitted by other controls.
const dialogUnmeasuredClass = 'hover:text-[#13579b]'
cache.scanFile('picker-dialog-warning.tsx', `<View className="${dialogUnmeasuredClass}" />`, 1)
const timeValueClasses =
  'p-5 text-hozo-accent hover:bg-hozo-accent focus:opacity-75 focus-visible:font-bold aria-disabled:border-4 disabled:opacity-25 data-[hozo-disabled]:mt-8'
const timeActiveUnmeasuredClass = 'active:mt-[37px]'
const hiddenPeriodClass = 'md:bg-[#8a6b4c]'
const fileZoneClasses =
  'p-4 text-hozo-accent text-lg hover:bg-hozo-accent focus:opacity-75 focus-visible:font-bold active:opacity-50 disabled:opacity-25 disabled:border-4 aria-disabled:mt-8 aria-busy:mb-8'
cache.scanFile('file-zone.tsx', `<View className="${fileZoneClasses}" />`, 1)
const timeStepClasses =
  'absolute p-2 text-hozo-accent data-[hozo-step=increase]:top-0 data-[hozo-step=decrease]:bottom-0 data-[hozo-step]:border-2 data-[hozo-step=increase]:hover:opacity-50 data-[hozo-step=decrease]:hover:opacity-75 active:font-bold focus-visible:outline-2 disabled:opacity-25 aria-disabled:mt-8 data-[hozo-disabled]:mb-8'
cache.scanFile(
  'time-owners.tsx',
  `<View className="${timeValueClasses} ${timeActiveUnmeasuredClass} ${hiddenPeriodClass} ${timeStepClasses}" />`,
  1,
)
cache.scanFile(
  'slider-thumb.ts',
  "export const c = 'focus:outline-4 focus-visible:opacity-75 aria-disabled:border-4 disabled:mt-8 enabled:mb-8'",
  1,
)
cache.scanFile(
  'tab-state-look.ts',
  `export const c = '${interactionClasses} ${otpCellFocusClasses} ${otpUnsupportedFocusClasses} ${otpSemanticClasses} ${swatchSemanticClasses} ${selectedSwatchSemanticClasses} ${commandSemanticClasses} ${activeCommandSemanticClasses} ${shortcutSemanticClasses} ${overlaySlotClasses} aria-checked:border-2 aria-expanded:border-2 aria-selected:border-2 disabled:opacity-25 hover:border-2 active:font-bold aria-pressed:border-2 aria-pressed:hover:opacity-50 aria-checked:outline-4 aria-disabled:border-4 aria-disabled:opacity-25 aria-selected:outline-4'`,
  1,
)
for (const file of [
  'bottom-sheet.tsx',
  'toggle.tsx',
  'radio.tsx',
  'tree.tsx',
  'form.tsx',
  'text-area.tsx',
  'native-select.tsx',
  'calendar-look.ts',
  'date-picker.tsx',
  'date-range-picker.tsx',
  'date-time-picker.tsx',
  'time-picker.tsx',
  'file-dropzone.tsx',
  'accordion.tsx',
  'drawer.tsx',
  'color-picker.tsx',
]) {
  cache.scanFile(file, readFileSync(path.join(uiRoot, 'src', file), 'utf8'), 1)
}
cache.scanFile('metric-import-guard.ts', '"text-lg text-xl leading-6"', 1)
const moduleSource = transformSync(cache.renderNativeModule(theme), { format: 'cjs' }).code
// The module reads the direction from React Native once, so a resolver is
// per direction, as it is per app run on a device.
const resolverFor = (isRTL) => {
  const module = { exports: {} }
  // Keep real generated imports. Stripping them and listing individual
  // helper names made this host harness drift from the factory's public ABI.
  const generatedRequire = (id) => {
    if (id === '@hozo/core/generated/class-resolver') return classResolverRuntime
    if (id === '@hozo/core/generated/transform-slots') return transformRuntime
    if (id === 'react-native') return { I18nManager: { isRTL } }
    throw new Error(`Unexpected generated candidate import: ${id}`)
  }
  new Function('require', 'module', 'exports', moduleSource)(
    generatedRequire,
    module,
    module.exports,
  )
  return module.exports.hozoClasses
}
const hozoClasses = resolverFor(false)
const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))

test('the Native host harness links real generated helpers in both directions', () => {
  assert.match(moduleSource, /@hozo\/core\/generated\/class-resolver/)
  assert.match(moduleSource, /hozoTextMetricStyles/)
  for (const isRTL of [false, true]) {
    const style = flat(resolverFor(isRTL)('leading-6 text-lg'))
    assert.equal(style.fontSize, 18)
    assert.equal(style.lineHeight, 24)
  }
})
const NativeView = (props) => React.createElement('NativeView', props, props.children)
const NativeText = (props) => React.createElement('NativeText', props, props.children)
const NativeTextInput = (props) => React.createElement('NativeTextInput', props)
const NativeScrollView = (props) => React.createElement('NativeScrollView', props, props.children)
const NativeModal = ({ visible, ...props }) =>
  visible ? React.createElement('NativeModal', props, props.children) : null
const announcements = []
let keyboardDismissals = 0
const openedURLs = []
// Animation and responder scheduling are host facilities here, not GPU or
// gesture-system evidence. The actual pattern callbacks still run unchanged.
const NativeAnimatedView = (props) =>
  React.createElement('NativeAnimatedView', props, props.children)
const nativeAnimated = {
  createAnimatedComponent: (Component) => Component,
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
  exportsFrom(
    'HozoPressable as NativeOwnerPressable',
    'packages/primitives/src/pressable.native.tsx',
  ),
  exportsFrom(
    'Pressable as NativeCanonicalPressable',
    'packages/primitives/src/foundation.native.tsx',
  ),
  exportsFrom('HozoLink as NativeOwnerLink', 'packages/primitives/src/link.native.tsx'),
  exportsFrom('HozoFileDropzone', 'packages/form/src/file-dropzone.native.tsx'),
  exportsFrom('HozoFileDropzone as UiFileDropzone', 'packages/ui/src/file-dropzone.tsx'),
  exportsFrom('HozoTimePicker', 'packages/form/src/time-picker.native.tsx'),
  exportsFrom('HozoTimePicker as UiTimePicker', 'packages/ui/src/time-picker.tsx'),
  exportsFrom('HozoCalendar', 'packages/form/src/calendar.native.tsx'),
  exportsFrom('HozoCalendar as UiCalendar', 'packages/ui/src/calendar.tsx'),
  ...['DatePicker', 'DateRangePicker', 'DateTimePicker'].flatMap((name) => {
    const file = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).slice(1)
    return [
      exportsFrom(`Hozo${name}`, `packages/form/src/${file}.native.tsx`),
      exportsFrom(`Hozo${name} as Ui${name}`, `packages/ui/src/${file}.tsx`),
    ]
  }),
  exportsFrom('HozoNativeSelect as UiNativeSelect', 'packages/ui/src/native-select.tsx'),
  exportsFrom('HozoAccordion as UiAccordion', 'packages/ui/src/accordion.tsx'),
  exportsFrom(
    'HozoNativeSelect, NativeSelectProvider',
    'packages/form/src/native-select.native.tsx',
  ),
  exportsFrom('HozoForm as UiForm', 'packages/ui/src/form.tsx'),
  exportsFrom('HozoTextArea as UiTextArea', 'packages/ui/src/text-area.tsx'),
  exportsFrom('HozoForm, useFormSubmit', 'packages/form/src/form.native.tsx'),
  exportsFrom('HozoTextArea', 'packages/form/src/text-area.native.tsx'),
  transformHozoSource(
    `import { ColorPicker, cx } from '@hozo/core'
     export function CompiledThumbPicker({ thumbClassName, ...rest }) {
       return <ColorPicker {...rest} thumbClassName={cx('p-2 focus:outline-2 focus-visible:opacity-75 aria-disabled:border-4 disabled:mt-8 enabled:mb-8', thumbClassName)} />
     }`,
    filename('thumb-focus-fixture.tsx'),
    root,
    compiler,
  ),
  exportsFrom('HozoCheckbox, HozoSwitch', 'packages/ui/src/toggle.tsx'),
  exportsFrom('HozoRadioGroup', 'packages/ui/src/radio.tsx'),
  exportsFrom('HozoTree as UiTree', 'packages/ui/src/tree.tsx'),
  exportsFrom('HozoCombobox as UiCombobox', 'packages/ui/src/combobox.tsx'),
  exportsFrom('HozoListbox as UiListbox', 'packages/ui/src/listbox.tsx'),
  exportsFrom('HozoCommandPalette as UiCommandPalette', 'packages/ui/src/command-palette.tsx'),
  exportsFrom('HozoDialog as UiDialog', 'packages/ui/src/dialog.tsx'),
  exportsFrom('ColorPicker as UiColorPicker', 'packages/ui/src/color-picker.tsx'),
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
  exportsFrom('Dialog', 'packages/patterns/src/dialog.native.tsx'),
  exportsFrom('Tooltip', 'packages/patterns/src/tooltip.native.tsx'),
  exportsFrom('HozoSlider', 'packages/patterns/src/slider.native.tsx'),
  exportsFrom('HozoColorPicker', 'packages/patterns/src/color-picker.native.tsx'),
  exportsFrom('HozoStepper', 'packages/patterns/src/stepper.native.tsx'),
  exportsFrom('HozoChip', 'packages/patterns/src/chip.native.tsx'),
  exportsFrom('HozoOtpInput', 'packages/patterns/src/otp-input.native.tsx'),
  exportsFrom('HozoNavigationProvider', 'packages/engine/src/navigation-context.tsx'),
  exportsFrom(
    'usePressableInteraction, HozoInteractionContext',
    'packages/behaviors/src/pressable-interaction.ts',
  ),
]
const bundled = await build({
  stdin: {
    contents: probeSources.join('\n'),
    resolveDir: root,
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  packages: 'external',
  plugins: [
    {
      name: 'native-patterns',
      setup(builder) {
        builder.onResolve(
          { filter: /^@hozo\/(?:core|primitives)\/generated\/native-disabled$/ },
          () => ({
            path: filename('packages/primitives/src/generated/native-disabled.ts'),
          }),
        )
        builder.onResolve({ filter: /(?:^|\/)candidates\.native\.js$/ }, () => ({
          path: '@hozo/engine/project',
          external: true,
        }))
        builder.onLoad(
          {
            filter:
              /[/\\]ui[/\\]src[/\\](?:combobox|listbox|dialog|command-palette|color-picker)\.tsx$/,
          },
          ({ path: file }) => ({
            contents: transformHozoSource(readFileSync(file, 'utf8'), file, root, compiler),
            loader: 'tsx',
            resolveDir: path.dirname(file),
          }),
        )
        builder.onResolve(
          {
            filter:
              /^@hozo\/(?:core|patterns)\/generated\/(?:combobox|listbox|dialog|command-palette|color-picker)$/,
          },
          ({ path: specifier }) => ({
            path: filename(`packages/patterns/src/${specifier.split('/').at(-1)}.native.tsx`),
          }),
        )
        builder.onResolve({ filter: /^@hozo\/behaviors$/ }, () => ({
          path: 'public-behaviors',
          namespace: 'public-behaviors',
        }))
        builder.onLoad({ filter: /.*/, namespace: 'public-behaviors' }, () => ({
          contents: [
            exportsFrom('useHozoMessage, useHozoI18n', 'packages/behaviors/src/i18n.ts'),
            exportsFrom('hozoTextChildren', 'packages/behaviors/src/text-child.native.tsx'),
            exportsFrom('shouldRestoreFocus', 'packages/behaviors/src/focus-scope.native.tsx'),
            exportsFrom('useAnnounce', 'packages/behaviors/src/live-region.native.tsx'),
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
            exportsFrom('useDrag1D', 'packages/behaviors/src/drag-1d.native.ts'),
            exportsFrom('useHoverTrigger', 'packages/behaviors/src/hover-trigger.native.tsx'),
            exportsFrom(
              'moveAccessibilityFocus',
              'packages/behaviors/src/accessibility-focus.native.ts',
            ),
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
        builder.onResolve({ filter: /^@hozo\/form$/ }, () => ({
          path: 'native-form',
          namespace: 'native-form',
        }))
        builder.onLoad({ filter: /.*/, namespace: 'native-form' }, () => ({
          contents: [
            exportsFrom('Form, useFormSubmit', 'packages/form/src/form.native.tsx'),
            exportsFrom('TextArea', 'packages/form/src/text-area.native.tsx'),
            exportsFrom('NativeSelect', 'packages/form/src/native-select.native.tsx'),
            exportsFrom('Calendar', 'packages/form/src/calendar.native.tsx'),
            exportsFrom('DatePicker', 'packages/form/src/date-picker.native.tsx'),
            exportsFrom('DateRangePicker', 'packages/form/src/date-range-picker.native.tsx'),
            exportsFrom('DateTimePicker', 'packages/form/src/date-time-picker.native.tsx'),
            exportsFrom('TimePicker', 'packages/form/src/time-picker.native.tsx'),
            exportsFrom('FileDropzone', 'packages/form/src/file-dropzone.native.tsx'),
          ].join('\n'),
          loader: 'tsx',
          resolveDir: root,
        }))
        builder.onLoad({ filter: /.*/, namespace: 'probe' }, () => ({
          contents: `export { HozoCheckbox as Checkbox, HozoSwitch as Switch } from ${JSON.stringify(filename('packages/patterns/src/toggle.native.tsx'))}; export { HozoRadioGroup as RadioGroup } from ${JSON.stringify(filename('packages/patterns/src/radio.native.tsx'))}; export { HozoTree as Tree } from ${JSON.stringify(filename('packages/patterns/src/tree.native.tsx'))}; export { HozoAccordion as Accordion } from ${JSON.stringify(filename('packages/patterns/src/accordion.native.tsx'))};`,
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
        // Dialog installs this listener on mount. These style probes never
        // claim to exercise OS window focus or accessibility restoration.
        AppState: { addEventListener: () => ({ remove: () => {} }) },
        Platform: nativePlatform,
        ActionSheetIOS: {
          showActionSheetWithOptions: (options, choose) => actionSheets.push({ options, choose }),
        },
        ScrollView: NativeScrollView,
        AccessibilityInfo: { announceForAccessibility: (message) => announcements.push(message) },
        Linking: { openURL: (url) => openedURLs.push(url) },
        Animated: nativeAnimated,
        Easing: { quad: (value) => value * value, out: (easing) => easing },
        PanResponder: nativePanResponder,
        Keyboard: { dismiss: () => keyboardDismissals++ },
        I18nManager: { isRTL: false },
        Pressable: NativePressable,
        StyleSheet: { flatten: flat, create: (styles) => styles },
        // The floating positioner's flip/shift bounds; a phone-sized window,
        // large enough that no fixture here flips or shifts.
        useWindowDimensions: () => ({ width: 400, height: 800, scale: 1, fontScale: 1 }),
      }
    if (name === '@hozo/core/generated/environment')
      return { useHozoDark: () => nativeDark, useHozoViewport: () => nativeViewport }
    // No transition table: these probes read resting looks, so every control
    // indicator part is the plain View it is without motion.
    if (name === '@hozo/engine/project') return { hozoClasses, hozoClassTransitions: {} }
    if (name === '@hozo/engine/generated/animated') return { HozoAnimated: NativeView }
    if (name === '@hozo/engine/generated/environment') return { useHozoEnvironment: () => false }
    if (name === '@hozo/engine/generated/safe-area')
      return { useHozoProvidedSafeArea: () => nativeInsets }
    if (name === 'expo-document-picker') throw new Error('No document picker in this host probe')
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
const { Dialog, Tooltip, HozoSlider } = module.exports
const { HozoColorPicker, HozoStepper } = module.exports
const { UiColorPicker } = module.exports
const { CompiledThumbPicker } = module.exports
const { HozoChip, HozoOtpInput } = module.exports
const { UiCombobox, UiListbox, UiCommandPalette, UiDialog } = module.exports
const { usePressableInteraction, HozoInteractionContext, UiTree } = module.exports
const { HozoForm, HozoTextArea, UiForm, UiTextArea, useFormSubmit } = module.exports
const { HozoNativeSelect, NativeSelectProvider, UiNativeSelect, UiAccordion } = module.exports
const { HozoCalendar, UiCalendar } = module.exports
const { HozoTimePicker, UiTimePicker } = module.exports
const { HozoFileDropzone, UiFileDropzone } = module.exports
const { NativeOwnerPressable, NativeCanonicalPressable, NativeOwnerLink } = module.exports
const {
  HozoDatePicker,
  HozoDateRangePicker,
  HozoDateTimePicker,
  UiDatePicker,
  UiDateRangePicker,
  UiDateTimePicker,
} = module.exports
// The clock is an author-supplied seam, not part of these Calendar-slot probes.
const withoutClock = (Component) => (props) => React.createElement(Component, props, () => null)
const pickerCases = [
  ['DatePicker', HozoDatePicker, UiDatePicker, { year: 2026, month: 6, day: 12 }],
  [
    'DateRangePicker',
    HozoDateRangePicker,
    UiDateRangePicker,
    { start: { year: 2026, month: 6, day: 12 }, end: { year: 2026, month: 6, day: 15 } },
  ],
  [
    'DateTimePicker',
    withoutClock(HozoDateTimePicker),
    withoutClock(UiDateTimePicker),
    { year: 2026, month: 6, day: 12, hour: 9, minute: 10 },
  ],
]
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

// Inspect actual host props after real React hooks, pattern code and the
// generated candidate resolver have run. Native scheduling/painting is not
// emulated; a passing test is not device, focus-restoration or pixel evidence.
const views = (tree) => tree.root.findAllByType('NativeView')
const panel = (tree) => views(tree).find((node) => node.props.accessibilityViewIsModal)
const scrim = (tree) => tree.root.findAllByType('NativePressable')[0]
async function checkClassSlots(t, Component, initial, slots, options) {
  const props = { ...initial }
  for (const [classProp, , padding] of slots) props[classProp] = `p-${padding}`
  const tree = await mount(t, Component, props, options)
  const inspect = (target, overridden) => {
    for (const [classProp, , padding, select] of slots) {
      const nodes = [select(target)].flat()
      assert.ok(nodes.length > 0, `${classProp}: require a real host, not a vacuous match`)
      for (const node of nodes) {
        assert.ok(node, `${classProp}: missing host`)
        assert.equal(typeof node.type, 'string', `${classProp}: inspect the Native host props`)
        const style = flat(
          node.type === 'NativeScrollView' ? node.props.contentContainerStyle : node.props.style,
        )
        if (node.type === 'NativeScrollView')
          assert.equal(flat(node.props.style).paddingTop, undefined)
        assert.equal(style.paddingTop, overridden ? 100 + padding : padding * 4, classProp)
        assert.equal(style.paddingBottom, padding * 4, `${classProp}: unoverridden class survives`)
      }
    }
  }
  inspect(tree, false)
  const explicit = { ...props }
  for (const [, styleProp, padding] of slots) explicit[styleProp] = { paddingTop: 100 + padding }
  const override = await mount(t, Component, explicit, options)
  inspect(override, true)
  return { tree, props, override, explicit }
}

// Measurements here are supplied host fixtures, not simulator geometry. The
// real FloatingPositioner still computes and installs its position style.
// The floating view measures where it is parked (`-9999`) under a parent at
// the window's origin, as a real view would: the positioner reads its parent's
// origin back from that (#1326), so window and parent coordinates agree here.
const measuredHosts = {
  createNodeMock: (node) => ({
    measureInWindow: (done) =>
      node.type === 'NativePressable' || node.props.testID === 'tooltip-anchor'
        ? done(100, 200, 40, 20)
        : done(-9999, -9999, 80, 30),
  }),
}

test('Native canonical, enhanced and destination controls share unavailable behavior without losing authored state', async (t) => {
  for (const Component of [NativeCanonicalPressable, NativeOwnerPressable, NativeOwnerLink]) {
    for (const disabled of [undefined, false, true])
      for (const stateDisabled of [false, true]) {
        let calls = 0
        const before = openedURLs.length
        const tree = await mount(t, Component, {
          href: Component === NativeOwnerLink ? '/disabled-owner' : undefined,
          disabled,
          accessibilityState: { disabled: stateDisabled, selected: true, checked: 'mixed' },
          onPress: () => calls++,
        })
        const host = tree.root.findByType('NativePressable')
        const unavailable = Boolean(disabled || stateDisabled)
        assert.equal(Boolean(host.props.disabled), unavailable)
        assert.equal(Boolean(host.props.accessibilityState.disabled), unavailable)
        assert.equal(host.props.accessibilityState.selected, true)
        assert.equal(host.props.accessibilityState.checked, 'mixed')
        if (Component === NativeOwnerLink) {
          const event = { defaultPrevented: false }
          await act(() => tree.root.findByType(NativePressable).props.onPress(event))
          assert.equal(calls, unavailable ? 0 : 1)
          assert.equal(openedURLs.length, before + (unavailable ? 0 : 1))
        }
      }
  }
})

test('Native Form applies its own classes before explicit style and preserves submit ordering', async (t) => {
  const { tree } = await checkClassSlots(
    t,
    HozoForm,
    { accessibilityLabel: 'Delivery', testID: 'form' },
    [['className', 'style', 4, (tree) => views(tree)[0]]],
  )
  assert.equal(views(tree)[0].props.accessibilityLabel, 'Delivery')
  assert.equal(views(tree)[0].props.testID, 'form')
  const ui = await mount(t, UiForm, {})
  assert.equal(flat(views(ui)[0].props.style).gap, 16)
  assert.equal(flat(views(ui)[0].props.style).flexDirection, 'column')
  let submit
  const before = keyboardDismissals
  let submitted = 0
  function Submit() {
    submit = useFormSubmit()
    return null
  }
  let form
  await act(() => {
    form = create(
      React.createElement(
        HozoForm,
        {
          onSubmit: () => {
            assert.equal(keyboardDismissals, before + 1, 'dismiss before submitting')
            submitted++
          },
        },
        React.createElement(Submit),
      ),
    )
  })
  t.after(async () => act(() => form.unmount()))
  await act(() => submit())
  assert.equal(submitted, 1)
  assert.equal(keyboardDismissals, before + 1)
})

test('Native TextArea resolves wrapper/field/count classes and measures the field it draws', async (t) => {
  const { tree } = await checkClassSlots(
    t,
    HozoTextArea,
    { maxLength: 20, defaultValue: 'Hello', minRows: 2, maxRows: 3 },
    [
      ['className', 'style', 2, (tree) => views(tree)[0]],
      ['fieldClassName', 'fieldStyle', 3, (tree) => tree.root.findByType('NativeTextInput')],
      ['countClassName', 'countStyle', 4, (tree) => tree.root.findByType('NativeText')],
    ],
  )
  const ui = await mount(t, UiTextArea, { maxLength: 20, defaultValue: 'Hi', maxRows: 3 })
  const field = () => ui.root.findByType('NativeTextInput')
  const initial = flat(field().props.style)
  assert.equal(initial.lineHeight, 24)
  assert.equal(initial.paddingTop, 8)
  assert.equal(initial.paddingStart, 12)
  assert.equal(initial.height, 64, 'two 24px rows plus class-supplied padding')
  assert.equal(initial.color, color('hozo-text'))
  assert.equal(flat(ui.root.findByType('NativeText').props.style).fontSize, 12)
  await act(() =>
    field().props.onContentSizeChange({ nativeEvent: { contentSize: { height: 200 } } }),
  )
  assert.equal(flat(field().props.style).height, 88, 'three rows cap plus class padding')
  const counter = tree.root.findByType('NativeText')
  assert.equal(counter.props.accessibilityElementsHidden, true)
  assert.equal(counter.props.importantForAccessibility, 'no')
  await act(() => tree.update(React.createElement(HozoTextArea)))
  assert.equal(tree.root.findAllByType('NativeText').length, 0)
})

test('Native TextArea input predicates and focus do not leak to its wrapper or counter', async (t) => {
  const changes = []
  const events = []
  const props = {
    maxLength: 20,
    fieldClassName:
      'p-2 focus:opacity-75 focus-visible:outline-2 disabled:opacity-25 read-only:border-4 aria-[invalid=true]:border-4 aria-required:outline-4',
    className: 'p-3 disabled:opacity-25',
    countClassName: 'p-4 disabled:opacity-25',
    onFocus: () => events.push('focus'),
    onBlur: () => events.push('blur'),
    onChangeText: (value) => changes.push(value),
  }
  const tree = await mount(t, HozoTextArea, props)
  const input = () => tree.root.findByType('NativeTextInput')
  await act(() => input().props.onFocus())
  assert.equal(flat(input().props.style).opacity, 0.75)
  assert.equal(flat(input().props.style).outlineWidth, 2)
  assert.equal(flat(views(tree)[0].props.style).opacity, undefined)
  assert.equal(flat(tree.root.findByType('NativeText').props.style).opacity, undefined)
  await act(() => input().props.onChangeText('hello'))
  assert.deepEqual(changes, ['hello'])
  assert.equal(input().props.value, 'hello')
  await act(() => tree.update(React.createElement(HozoTextArea, { ...props, readOnly: true })))
  assert.equal(input().props.editable, false)
  assert.equal(flat(input().props.style).borderTopWidth, 4)
  assert.equal(flat(input().props.style).opacity, 0.75, 'read-only fields can retain focus')
  await act(() => tree.update(React.createElement(HozoTextArea, { ...props, disabled: true })))
  assert.equal(flat(input().props.style).opacity, 0.25)
  assert.equal(flat(input().props.style).outlineWidth, undefined)
  await act(() =>
    tree.update(
      React.createElement(HozoTextArea, { ...props, 'aria-invalid': true, 'aria-required': true }),
    ),
  )
  assert.equal(flat(input().props.style).opacity, undefined, 're-enabling does not invent focus')
  assert.equal(flat(input().props.style).borderTopWidth, 4)
  assert.equal(flat(input().props.style).outlineWidth, 4)
  await act(() => input().props.onFocus())
  await act(() => input().props.onBlur())
  assert.deepEqual(events, ['focus', 'focus', 'blur'])
  assert.deepEqual(changes, ['hello'], 'style/focus updates never edit text')
})

const selectOptions = [
  { value: 'slow', label: 'Standard' },
  { value: 'fast', label: 'Express' },
  { value: 'closed', label: 'Unavailable', disabled: true },
]
const selectControl = (tree) =>
  tree.root
    .findAllByType('NativePressable')
    .find((node) => node.props.accessibilityRole === 'combobox')

test('NativeSelect applies closed-control classes to the box and its owned value label', async (t) => {
  const ui = await mount(t, UiNativeSelect, {
    options: selectOptions,
    defaultValue: 'fast',
    accessibilityLabel: 'Courier',
  })
  const control = selectControl(ui)
  const box = flat(control.props.style)
  const label = control.findByType('NativeText')
  assert.equal(box.paddingStart, 12)
  assert.equal(box.paddingTop, 8)
  assert.equal(box.borderTopWidth, 1)
  assert.equal(box.backgroundColor, color('hozo-surface'))
  assert.equal(box.color, undefined, 'text properties do not land on a View')
  assert.equal(flat(label.props.style).color, color('hozo-text'))
  assert.equal(flat(label.props.style).fontSize, 14)
  assert.deepEqual(label.props.children, 'Express')
  assert.equal(control.props.accessibilityLabel, 'Courier')
  assert.deepEqual(control.props.accessibilityValue, { text: 'Express' })
  await act(() =>
    ui.update(
      React.createElement(UiNativeSelect, {
        options: selectOptions,
        defaultValue: 'fast',
        disabled: true,
      }),
    ),
  )
  assert.equal(flat(selectControl(ui).props.style).backgroundColor, color('hozo-surface-raised'))
  assert.equal(
    flat(selectControl(ui).findByType('NativeText').props.style).color,
    color('hozo-text-subtle'),
  )
  const custom = await mount(t, HozoNativeSelect, {
    options: selectOptions,
    className: 'p-4 text-hozo-accent',
    style: { paddingTop: 99 },
    textStyle: { color: '#abcdef' },
  })
  assert.equal(flat(selectControl(custom).props.style).paddingTop, 99)
  assert.equal(flat(selectControl(custom).props.style).paddingBottom, 16)
  assert.equal(flat(selectControl(custom).findByType('NativeText').props.style).color, '#abcdef')
})

// React Native has no `::after`, so a chevron drawn with one showed on the Web
// only (#1205). Both are now real nodes the patterns own and hide.
const chevronOf = (node) =>
  node
    .findAllByType('NativeView')
    .find(
      (view) =>
        view.props.accessibilityElementsHidden && flat(view.props.style).borderRightWidth === 2,
    )
const turn = (view) => flat(view.props.style).transform?.find((step) => 'rotate' in step)?.rotate

test('NativeSelect draws its chevron as a hidden node after the value', async (t) => {
  const ui = await mount(t, UiNativeSelect, {
    options: selectOptions,
    accessibilityLabel: 'Courier',
  })
  const chevron = chevronOf(selectControl(ui))
  assert.ok(chevron, 'the closed field has no chevron')
  assert.equal(flat(chevron.props.style).borderBottomWidth, 2)
  assert.equal(turn(chevron), '45deg')
  assert.equal(flat(selectControl(ui).props.style).flexDirection, 'row')
  const bare = await mount(t, HozoNativeSelect, { options: selectOptions })
  assert.equal(chevronOf(selectControl(bare)), undefined, 'no indicatorClassName, no chevron')
})

test('Accordion draws a chevron per header that turns when the section opens', async (t) => {
  const items = [
    { id: 'a', header: 'First', content: 'One' },
    { id: 'b', header: 'Second', content: 'Two' },
  ]
  const ui = await mount(t, UiAccordion, { items, defaultExpanded: 'a' })
  const headers = ui.root
    .findAllByType('NativePressable')
    .filter((node) => node.props.accessibilityRole === 'header')
  assert.equal(headers.length, 2)
  assert.deepEqual(
    headers.map((header) => turn(chevronOf(header))),
    ['-135deg', '45deg'],
  )
})

test('NativeSelect owns focus, pointer and form facts without changing its choice', async (t) => {
  const changes = []
  const events = []
  const props = {
    options: selectOptions,
    defaultValue: 'slow',
    className:
      'p-2 focus:opacity-75 focus-visible:outline-2 active:opacity-50 hover:bg-hozo-accent read-only:border-4 disabled:opacity-25 aria-[invalid=true]:border-4 aria-required:outline-4 aria-expanded:mt-8',
    onValueChange: (value) => changes.push(value),
    onFocus: () => events.push('focus'),
    onBlur: () => events.push('blur'),
  }
  const tree = await mount(t, HozoNativeSelect, props)
  const control = () => selectControl(tree)
  assert.equal(
    flat(control().props.style).borderTopWidth,
    4,
    'select is read-only without being disabled',
  )
  await act(() => control().props.onFocus())
  assert.equal(flat(control().props.style).opacity, 0.75)
  assert.equal(flat(control().props.style).outlineWidth, 2)
  await act(() => control().props.onHoverIn())
  assert.equal(flat(control().props.style).backgroundColor, color('hozo-accent'))
  await act(() => control().props.onPressIn())
  assert.equal(flat(control().props.style).opacity, 0.5)
  assert.equal(flat(control().props.style).outlineWidth, undefined)
  await act(() => control().props.onPressOut())
  await act(() => control().props.onKeyDown())
  assert.equal(flat(control().props.style).outlineWidth, 2)
  await act(() => tree.update(React.createElement(HozoNativeSelect, { ...props, disabled: true })))
  assert.equal(control().props.disabled, true)
  assert.equal(flat(control().props.style).opacity, 0.25)
  assert.equal(flat(control().props.style).outlineWidth, undefined)
  await press(control())
  await act(() =>
    tree.update(
      React.createElement(HozoNativeSelect, {
        ...props,
        'aria-invalid': true,
        'aria-required': true,
      }),
    ),
  )
  assert.equal(flat(control().props.style).opacity, undefined, 'enable does not revive focus/press')
  assert.equal(flat(control().props.style).outlineWidth, 4)
  assert.equal(flat(control().props.style).marginTop, undefined)
  await act(() => control().props.onBlur())
  assert.deepEqual(events, ['focus', 'blur'])
  assert.deepEqual(changes, [])
})

test('NativeSelect preserves iOS ActionSheet and controlled presenter paths', async (t) => {
  const start = actionSheets.length
  const changes = []
  const tree = await mount(t, HozoNativeSelect, {
    options: selectOptions,
    defaultValue: 'slow',
    onValueChange: (value) => changes.push(value),
  })
  await press(selectControl(tree))
  const sheet = actionSheets.at(-1)
  assert.equal(actionSheets.length, start + 1)
  assert.deepEqual(sheet.options.options, ['Standard', 'Express', 'Cancel'])
  await act(() => sheet.choose(sheet.options.cancelButtonIndex))
  assert.deepEqual(changes, [], 'cancel does not manufacture a selection')
  await act(() => sheet.choose(1))
  assert.deepEqual(changes, ['fast'])
  assert.equal(selectControl(tree).props.accessibilityValue.text, 'Express')
  const requests = []
  function Presented() {
    return React.createElement(
      NativeSelectProvider,
      { presenter: { present: (request) => requests.push(request) } },
      React.createElement(HozoNativeSelect, {
        options: selectOptions,
        value: 'slow',
        onValueChange: (value) => changes.push(value),
        className: 'p-4',
      }),
    )
  }
  const presented = await mount(t, Presented)
  await press(selectControl(presented))
  assert.equal(requests.length, 1)
  await act(() => requests[0].onSelect('fast'))
  assert.equal(
    selectControl(presented).props.accessibilityValue.text,
    'Standard',
    'controlled value is not overwritten',
  )
  assert.equal(actionSheets.length, start + 1, 'presenter bypasses ActionSheet')
})

test('NativeSelect fallback keeps popup lifecycle and disabled options independent of trigger classes', async (t) => {
  nativePlatform.OS = 'android'
  try {
    const tree = await mount(t, HozoNativeSelect, {
      options: selectOptions,
      className: 'p-4 aria-expanded:mt-8',
    })
    assert.equal(tree.root.findAllByType('NativeModal').length, 0)
    await press(selectControl(tree))
    assert.equal(tree.root.findAllByType('NativeModal').length, 1)
    assert.equal(selectControl(tree).props.accessibilityState.expanded, true)
    assert.equal(
      flat(selectControl(tree).props.style).marginTop,
      undefined,
      'RN expanded announcement is not an authored Web attribute',
    )
    const rows = tree.root
      .findAllByType('NativePressable')
      .filter((node) => node.props.accessibilityRole === 'menuitem')
    await press(rows[2])
    assert.equal(tree.root.findAllByType('NativeModal').length, 1)
    await press(rows[1])
    assert.equal(selectControl(tree).props.accessibilityValue.text, 'Express')
    assert.equal(tree.root.findAllByType('NativeModal').length, 0)
    await press(selectControl(tree))
    await act(() => tree.root.findByType('NativeModal').props.onRequestClose())
    assert.equal(tree.root.findAllByType('NativeModal').length, 0)
  } finally {
    nativePlatform.OS = 'ios'
  }
})

test('NativeSelect sheet and scrim classes style their own Native owners and preserve dismissal', async (t) => {
  nativePlatform.OS = 'android'
  try {
    const props = {
      options: selectOptions,
      defaultValue: 'slow',
      className: 'p-2',
      sheetClassName: 'p-4 text-sm text-hozo-accent',
      scrimClassName: 'p-3',
    }
    const tree = await mount(t, HozoNativeSelect, props)
    await press(selectControl(tree))
    const sheet = () => panel(tree)
    const rows = () =>
      tree.root
        .findAllByType('NativePressable')
        .filter((node) => node.props.accessibilityRole === 'menuitem')
    const backdrop = () =>
      tree.root
        .findAllByType('NativePressable')
        .find((node) => node.props.accessibilityElementsHidden)
    assert.equal(flat(selectControl(tree).props.style).paddingTop, 8)
    assert.equal(flat(sheet().props.style).paddingTop, 16)
    assert.equal(flat(backdrop().props.style).paddingTop, 12)
    assert.equal(flat(sheet().props.style).color, undefined)
    assert.equal(backdrop().props.importantForAccessibility, 'no-hide-descendants')
    assert.equal(flat(rows()[0].findByType('NativeText').props.style).color, color('hozo-accent'))
    assert.equal(flat(rows()[0].findByType('NativeText').props.style).fontSize, 14)
    await act(() =>
      tree.update(
        React.createElement(HozoNativeSelect, {
          ...props,
          sheetStyle: { paddingTop: 91 },
          scrimStyle: { paddingTop: 92 },
          optionStyle: { paddingTop: 93 },
          textStyle: { color: '#abcdef' },
        }),
      ),
    )
    assert.equal(flat(sheet().props.style).paddingTop, 91)
    assert.equal(flat(sheet().props.style).paddingBottom, 16)
    assert.equal(flat(backdrop().props.style).paddingTop, 92)
    assert.equal(flat(rows()[0].props.style).paddingTop, 93)
    assert.equal(flat(rows()[0].findByType('NativeText').props.style).color, '#abcdef')
    await press(rows()[2])
    assert.equal(tree.root.findAllByType('NativeModal').length, 1)
    await press(rows()[1])
    assert.equal(tree.root.findAllByType('NativeModal').length, 0)
    assert.equal(selectControl(tree).props.accessibilityValue.text, 'Express')
    await press(selectControl(tree))
    assert.equal(rows()[0].props.accessibilityState.selected, false)
    assert.equal(rows()[1].props.accessibilityState.selected, true)
    await press(backdrop())
    assert.equal(tree.root.findAllByType('NativeModal').length, 0)
  } finally {
    nativePlatform.OS = 'ios'
  }
})

test('NativeSelect never resolves popup classes while its own popup is absent', async (t) => {
  const warnings = []
  const original = console.warn
  console.warn = (message) => warnings.push(message)
  try {
    const props = {
      options: selectOptions,
      sheetClassName: 'hover:bg-hozo-accent',
      scrimClassName: 'focus:opacity-75',
      optionClassName: 'hover:bg-hozo-accent',
    }
    const ios = await mount(t, HozoNativeSelect, props)
    await press(selectControl(ios))
    assert.deepEqual(warnings, [])
    nativePlatform.OS = 'android'
    const android = await mount(t, HozoNativeSelect, props)
    assert.deepEqual(warnings, [], 'closed Android modal has no rendered class owner')
    await press(selectControl(android))
    assert.ok(warnings.some((message) => message.includes('needs state (hovered)')))
    assert.ok(warnings.some((message) => message.includes('needs state (focused)')))
  } finally {
    nativePlatform.OS = 'ios'
    console.warn = original
  }
})

test('NativeSelect option classes follow each Native row, not its trigger or siblings', async (t) => {
  nativePlatform.OS = 'android'
  try {
    const props = {
      options: selectOptions,
      defaultValue: 'slow',
      className: 'aria-selected:border-2',
      sheetClassName: 'text-sm text-hozo-accent aria-selected:border-2',
      optionClassName:
        'p-5 aria-selected:border-2 aria-selected:font-bold disabled:opacity-25 disabled:text-hozo-text-subtle active:opacity-50',
    }
    const tree = await mount(t, HozoNativeSelect, props)
    const rows = () =>
      tree.root
        .findAllByType('NativePressable')
        .filter((node) => node.props.accessibilityRole === 'menuitem')
    await press(selectControl(tree))
    assert.equal(flat(rows()[0].props.style).paddingTop, 20)
    assert.equal(flat(rows()[0].props.style).borderTopWidth, 2)
    assert.equal(flat(rows()[1].props.style).borderTopWidth, undefined)
    assert.equal(flat(rows()[2].props.style).opacity, 0.25)
    assert.equal(flat(selectControl(tree).props.style).borderTopWidth, undefined)
    assert.equal(flat(panel(tree).props.style).borderTopWidth, undefined)
    assert.equal(flat(rows()[0].findByType('NativeText').props.style).fontWeight, '700')
    assert.equal(flat(rows()[1].findByType('NativeText').props.style).fontWeight, undefined)
    assert.equal(flat(rows()[1].findByType('NativeText').props.style).color, color('hozo-accent'))
    assert.equal(flat(rows()[1].findByType('NativeText').props.style).fontSize, 14)
    assert.equal(
      flat(rows()[2].findByType('NativeText').props.style).color,
      color('hozo-text-subtle'),
    )
    // Snapshot evaluation checks the actual RN style/children callbacks;
    // this host stand-in does not certify platform gesture delivery.
    const callbacks = tree.root
      .findAllByType(NativePressable)
      .filter((node) => node.props.accessibilityRole === 'menuitem')
    assert.equal(flat(callbacks[0].props.style({ pressed: true })).opacity, 0.5)
    assert.equal(flat(callbacks[2].props.style({ pressed: true })).opacity, 0.25)
    const pressedLabel = callbacks[0].props.children({ pressed: true })
    assert.equal(flat(pressedLabel.props.style).fontWeight, '700')
    await act(() =>
      tree.update(
        React.createElement(HozoNativeSelect, {
          ...props,
          options: [selectOptions[1], selectOptions[0], selectOptions[2]],
          optionStyle: { paddingTop: 93, borderTopWidth: 9 },
          textStyle: { color: '#abcdef' },
        }),
      ),
    )
    assert.equal(rows()[0].props.accessibilityState.selected, false)
    assert.equal(rows()[1].props.accessibilityState.selected, true)
    assert.equal(flat(rows()[1].props.style).paddingTop, 93)
    assert.equal(flat(rows()[1].props.style).paddingBottom, 20)
    assert.equal(flat(rows()[1].props.style).borderTopWidth, 9)
    assert.equal(flat(rows()[1].props.style).borderBottomWidth, 2)
    assert.equal(flat(rows()[1].findByType('NativeText').props.style).color, '#abcdef')
    await press(rows()[2])
    assert.equal(tree.root.findAllByType('NativeModal').length, 1)
    await press(rows()[0])
    assert.equal(tree.root.findAllByType('NativeModal').length, 0)
    assert.equal(selectControl(tree).props.accessibilityValue.text, 'Express')
    await press(selectControl(tree))
    assert.equal(rows()[0].props.accessibilityState.selected, true)
    assert.equal(rows()[1].props.accessibilityState.selected, false)
    await act(() =>
      tree.update(React.createElement(HozoNativeSelect, { ...props, optionClassName: undefined })),
    )
    assert.equal(
      flat(rows()[0].props.style).paddingTop,
      undefined,
      'removing classes leaves no stale row look',
    )
  } finally {
    nativePlatform.OS = 'ios'
  }
})

test('NativeSelect row classes diagnose unmeasured focus/hover instead of borrowing the trigger', async (t) => {
  nativePlatform.OS = 'android'
  const warnings = []
  const original = console.warn
  console.warn = (message) => warnings.push(message)
  try {
    const tree = await mount(t, HozoNativeSelect, {
      options: selectOptions,
      optionClassName: 'focus-visible:opacity-75 hover:text-hozo-accent-text',
    })
    assert.deepEqual(warnings, [])
    await press(selectControl(tree))
    assert.ok(warnings.some((message) => message.includes('needs state (focusVisible)')))
    assert.ok(warnings.some((message) => message.includes('needs state (hovered)')))
  } finally {
    nativePlatform.OS = 'ios'
    console.warn = original
  }
})

const fileZoneHost = (tree) => tree.root.findByType('NativePressable')
const fileZoneProps = { accessibilityLabel: 'Upload photo', pickFiles: async () => null }

test('Native FileDropzone resolves its own button classes without borrowing drag or busy state', async (t) => {
  let picks = 0
  const props = {
    ...fileZoneProps,
    className: fileZoneClasses,
    activeClassName: 'p-12',
    pickFiles: async () => {
      picks++
      return null
    },
  }
  const tree = await mount(t, HozoFileDropzone, props)
  const host = () => fileZoneHost(tree)
  const box = () => flat(host().props.style)
  assert.equal(box().paddingTop, 16)
  assert.equal(box().borderTopWidth, undefined)
  assert.equal(box().marginTop, undefined)
  assert.equal(box().marginBottom, undefined)
  assert.equal(box().color, undefined)
  assert.equal(flat(host().findByType('NativeText').props.style).color, color('hozo-accent'))
  await act(() => host().props.onHoverIn())
  assert.equal(box().backgroundColor, color('hozo-accent'))
  await act(() => host().props.onFocus())
  assert.equal(box().opacity, 0.75)
  assert.equal(String(flat(host().findByType('NativeText').props.style).fontWeight), '700')
  await act(() => host().props.onPointerDown())
  assert.equal(flat(host().findByType('NativeText').props.style).fontWeight, undefined)
  await act(() => host().props.onKeyDown())
  assert.equal(String(flat(host().findByType('NativeText').props.style).fontWeight), '700')
  await act(() => host().props.onPressIn())
  assert.equal(box().opacity, 0.5)
  assert.equal(box().paddingTop, 16, 'press is not drag-active')
  assert.equal(picks, 0)
  await act(() =>
    tree.update(React.createElement(HozoFileDropzone, { ...props, disabled: true }, 'Updates')),
  )
  assert.equal(box().opacity, 0.25)
  assert.equal(box().borderTopWidth, 4)
  await press(host())
  assert.equal(picks, 0)
  await act(() => tree.update(React.createElement(HozoFileDropzone, props, 'Updates')))
  assert.equal(box().opacity, undefined, 'stale focus and press cleared')
  await act(() =>
    tree.update(
      React.createElement(
        HozoFileDropzone,
        { ...props, className: undefined, style: { paddingTop: 91 } },
        'Updates',
      ),
    ),
  )
  assert.equal(box().paddingTop, 91)
  assert.equal(box().paddingBottom, undefined)
})

test('Native FileDropzone styles literal labels without cloning opaque children or injecting a provider', async (t) => {
  const ownStyle = { color: '#123456' }
  const Opaque = () => React.createElement(NativeText, { style: ownStyle }, 'Custom')
  const opaque = React.createElement(Opaque, { key: 'opaque' })
  const WithChildren = (props) =>
    React.createElement(HozoFileDropzone, props, ['Raw', 0, false, opaque])
  const tree = await mount(t, WithChildren, {
    ...fileZoneProps,
    className: fileZoneClasses,
    style: { paddingTop: 91 },
  })
  const labels = fileZoneHost(tree).findAllByType('NativeText')
  assert.equal(labels.length, 3)
  assert.equal(flat(labels[0].props.style).color, color('hozo-accent'))
  assert.equal(flat(labels[1].props.style).fontSize, 18)
  assert.equal(labels[1].props.children, 0)
  assert.equal(labels[2].props.style, ownStyle)
  assert.deepEqual(tree.root.findByType(Opaque).props, {})
  assert.equal(flat(fileZoneHost(tree).props.style).paddingTop, 91)
  assert.equal(flat(fileZoneHost(tree).props.style).paddingBottom, 16)
})

test('Native FileDropzone keeps picker busy, cancellation, validation and announcements independent of styling', async (t) => {
  let finish
  let calls = 0
  const selected = [],
    rejected = []
  const before = announcements.length
  const props = {
    ...fileZoneProps,
    className: fileZoneClasses,
    activeClassName: 'p-12',
    accept: ['image/png'],
    pickFiles: () => {
      calls++
      return new Promise((resolve) => {
        finish = resolve
      })
    },
    onFilesSelected: (files) => selected.push(files),
    onRejected: (files) => rejected.push(files),
  }
  const tree = await mount(t, HozoFileDropzone, props)
  let pending
  await act(() => {
    pending = fileZoneHost(tree).props.onPress()
  })
  assert.equal(fileZoneHost(tree).props.accessibilityState.busy, true)
  assert.equal(fileZoneHost(tree).props.disabled, false, 'busy is not a disabled button')
  assert.equal(flat(fileZoneHost(tree).props.style).paddingTop, 16, 'busy is not drag-active')
  assert.equal(
    flat(fileZoneHost(tree).props.style).marginBottom,
    undefined,
    'Native busy announcement is not an authored aria-busy class fact',
  )
  await press(fileZoneHost(tree))
  assert.equal(calls, 1)
  const good = { name: 'photo.png', type: 'image/png', size: 100, uri: 'file:///photo.png' }
  const bad = { name: 'other.txt', type: 'text/plain', size: 20, uri: 'file:///other.txt' }
  await act(async () => {
    finish([good, bad])
    await pending
  })
  assert.deepEqual(selected, [[good]])
  assert.equal(rejected[0][0].reason, 'type')
  assert.equal(announcements.length, before + 1)
  assert.equal(fileZoneHost(tree).props.accessibilityState.busy, false)
  await act(() => {
    pending = fileZoneHost(tree).props.onPress()
  })
  await act(async () => {
    finish(null)
    await pending
  })
  assert.equal(announcements.length, before + 1, 'cancellation does not invent a selection')
  assert.equal(fileZoneHost(tree).props.accessibilityState.busy, false)
})

test('Native UI FileDropzone draws its real dashed box without applying its Web-only drag-active classes', async (t) => {
  const tree = await mount(t, UiFileDropzone, fileZoneProps)
  const box = flat(fileZoneHost(tree).props.style)
  assert.equal(box.borderStyle, 'dashed')
  assert.equal(box.borderTopWidth, 2)
  assert.equal(box.borderColor, color('hozo-border-strong'))
  assert.equal(box.backgroundColor, color('hozo-surface'))
  assert.equal(box.paddingTop, 32)
  assert.equal(box.paddingStart, 24)
  await act(() => fileZoneHost(tree).props.onHoverIn())
  assert.equal(flat(fileZoneHost(tree).props.style).backgroundColor, color('hozo-surface-hover'))
  await act(() =>
    tree.update(
      React.createElement(UiFileDropzone, { ...fileZoneProps, disabled: true }, 'Updates'),
    ),
  )
  assert.equal(
    flat(fileZoneHost(tree).findByType('NativeText').props.style).color,
    color('hozo-text-subtle'),
  )
})

test('Native FileDropzone unavailable picker remains disabled and styled without a fabricated drag state', async (t) => {
  const tree = await mount(t, HozoFileDropzone, {
    accessibilityLabel: 'Upload photo',
    className: fileZoneClasses,
  })
  assert.equal(fileZoneHost(tree).props.disabled, true)
  assert.equal(fileZoneHost(tree).props.accessibilityState.disabled, true)
  assert.equal(flat(fileZoneHost(tree).props.style).opacity, 0.25)
  assert.equal(fileZoneHost(tree).props.accessibilityHint, 'No file picker is available')
})

const timeProps = { defaultValue: { hour: 9, minute: 10 }, hour12: true, locale: 'en-US' }
const timeValues = (tree) =>
  views(tree).filter((node) => node.props.accessibilityRole === 'adjustable')
const timeGroup = (tree) => views(tree).find((node) => node.props.accessibilityRole === 'none')
const timeField = (value) => {
  let parent = value.parent
  while (parent && parent.type !== 'NativeView') parent = parent.parent
  return parent
}
const timePeriod = (tree) =>
  tree.root
    .findAllByType('NativePressable')
    .find((node) => node.props.accessibilityLabel === 'AM or PM')
const timeArrows = (tree) =>
  tree.root
    .findAllByType('NativePressable')
    .filter((node) => /^(Increase|Decrease) /.test(node.props.accessibilityLabel))

test('Native TimePicker steps apply direction predicates on their own buttons without moving values', async (t) => {
  const props = {
    ...timeProps,
    fieldClassName: 'text-hozo-text-subtle text-lg',
    stepClassName: timeStepClasses,
    stepStyle: { paddingTop: 91, color: '#123456' },
  }
  const tree = await mount(t, HozoTimePicker, props)
  for (const arrow of timeArrows(tree)) {
    const box = flat(arrow.props.style)
    const increase = arrow.props.accessibilityLabel.startsWith('Increase')
    assert.equal(box.position, 'absolute')
    assert.equal(box.top, increase ? 0 : undefined)
    assert.equal(box.bottom, increase ? undefined : 0)
    assert.equal(box.paddingTop, 91)
    assert.equal(box.paddingBottom, 8)
    assert.equal(box.borderTopWidth, 2)
    assert.equal(box.color, undefined)
    assert.equal(flat(arrow.props.children.props.style).color, '#123456')
    assert.equal(flat(arrow.props.children.props.style).fontSize, 18)
  }
  for (const value of timeValues(tree)) {
    assert.equal(flat(value.props.style).position, undefined)
    assert.equal(flat(value.props.style).borderTopWidth, undefined)
    assert.equal(flat(value.props.children.props.style).color, color('hozo-text-subtle'))
  }
  assert.equal(flat(timePeriod(tree).props.style).position, undefined)
  await act(() =>
    tree.update(React.createElement(HozoTimePicker, { ...props, stepClassName: undefined })),
  )
  for (const arrow of timeArrows(tree)) {
    assert.equal(flat(arrow.props.style).position, undefined)
    assert.equal(flat(arrow.props.style).paddingTop, 91)
    assert.equal(flat(arrow.props.style).paddingBottom, undefined)
  }
})

test('Native TimePicker step events stay local, use real button facts and retain stepping contracts', async (t) => {
  const changes = []
  const props = {
    ...timeProps,
    step: 5,
    stepClassName: timeStepClasses,
    onChange: (next) => changes.push(next),
  }
  const tree = await mount(t, HozoTimePicker, props)
  const arrows = timeArrows(tree)
  const rootStyle = timeGroup(tree).props.style
  for (const [index, arrow] of arrows.entries()) {
    await act(() => arrow.props.onHoverIn())
    assert.equal(flat(arrow.props.style).opacity, index % 2 === 0 ? 0.5 : 0.75)
    assert.equal(flat(arrows[(index + 1) % 4].props.style).opacity, undefined)
    await act(() => arrow.props.onFocus())
    assert.equal(flat(arrow.props.style).outlineWidth, 2)
    await act(() => arrow.props.onPointerDown())
    assert.equal(flat(arrow.props.style).outlineWidth, undefined)
    await act(() => arrow.props.onKeyDown())
    assert.equal(flat(arrow.props.style).outlineWidth, 2)
    await act(() => arrow.props.onPressIn())
    assert.equal(String(flat(arrow.props.children.props.style).fontWeight), '700')
    await act(() => {
      arrow.props.onHoverOut()
      arrow.props.onPressOut()
      arrow.props.onBlur()
    })
  }
  assert.equal(timeGroup(tree).props.style, rootStyle, 'step events do not rerender the clock')
  assert.deepEqual(changes, [])
  await press(arrows[0])
  await press(arrows[1])
  await press(arrows[2])
  await press(arrows[3])
  assert.deepEqual(
    changes.map(({ hour, minute }) => [hour, minute]),
    [
      [10, 10],
      [9, 10],
      [9, 15],
      [9, 10],
    ],
  )
  await act(() => {
    arrows[0].props.onFocus()
    arrows[0].props.onPressIn()
  })
  await act(() => tree.update(React.createElement(HozoTimePicker, { ...props, disabled: true })))
  for (const arrow of timeArrows(tree)) {
    assert.equal(arrow.props.disabled, true)
    assert.equal(arrow.props.accessibilityState.disabled, true)
    assert.equal(flat(arrow.props.style).opacity, 0.25)
    assert.equal(
      flat(arrow.props.style).marginTop,
      undefined,
      'no authored aria-disabled on the Web button',
    )
    assert.equal(flat(arrow.props.style).marginBottom, 32)
    assert.equal(flat(arrow.props.style).outlineWidth, undefined)
    assert.equal(flat(arrow.props.children.props.style).fontWeight, undefined)
    await press(arrow)
  }
  assert.equal(changes.length, 4)
  await act(() => tree.update(React.createElement(HozoTimePicker, props)))
  assert.equal(flat(timeArrows(tree)[0].props.style).opacity, undefined)
})

test('Native UI TimePicker positions four real 24px arrow targets and keeps their labels and disabled look', async (t) => {
  const tree = await mount(t, UiTimePicker, timeProps)
  assert.equal(timeArrows(tree).length, 4)
  for (const arrow of timeArrows(tree)) {
    const box = flat(arrow.props.style)
    const increase = arrow.props.accessibilityLabel.startsWith('Increase')
    assert.equal(box.position, 'absolute')
    assert.equal(box.end, 0)
    assert.equal(box.top, increase ? 0 : undefined)
    assert.equal(box.bottom, increase ? undefined : 0)
    assert.equal(box.width, 24)
    assert.equal(box.height, 24)
    assert.equal(flat(arrow.props.children.props.style).fontSize, 12)
    assert.equal(flat(arrow.props.children.props.style).color, color('hozo-text-muted'))
  }
  await act(() => tree.update(React.createElement(UiTimePicker, { ...timeProps, disabled: true })))
  for (const arrow of timeArrows(tree))
    assert.equal(flat(arrow.props.children.props.style).color, color('hozo-text-subtle'))
})

test('Native TimePicker styled steps retain controlled empty and bounded values', async (t) => {
  const changes = []
  const props = {
    locale: 'en-US',
    hour12: false,
    value: null,
    min: { hour: 8, minute: 15 },
    max: { hour: 8, minute: 30 },
    step: 15,
    stepClassName: timeStepClasses,
    onChange: (next) => changes.push(next),
  }
  const tree = await mount(t, HozoTimePicker, props)
  await press(timeArrows(tree)[2])
  assert.deepEqual(changes, [{ hour: 8, minute: 15 }])
  assert.equal(timeValues(tree)[1].props.accessibilityValue.now, undefined)
  await act(() => tree.update(React.createElement(HozoTimePicker, { ...props, value: changes[0] })))
  await press(timeArrows(tree)[2])
  assert.deepEqual(changes[1], { hour: 8, minute: 30, second: 0 })
  await act(() => tree.update(React.createElement(HozoTimePicker, { ...props, value: changes[1] })))
  await press(timeArrows(tree)[2])
  await press(timeArrows(tree)[0])
  assert.equal(changes.length, 2, 'neither minute nor hour steps cross the upper bound')
  assert.equal(timePeriod(tree), undefined)
})

test('Native TimePicker group and fields own different boxes and inherited text tiers', async (t) => {
  const props = {
    ...timeProps,
    disabled: true,
    className: 'p-4 text-hozo-accent font-bold disabled:opacity-25 aria-disabled:mt-8',
    fieldClassName: 'p-3 text-hozo-text-subtle text-lg disabled:opacity-25 aria-disabled:mt-8',
    style: { paddingTop: 91 },
    fieldStyle: { paddingTop: 92 },
    hozoInheritedTextStyle: { color: '#abcdef', fontSize: 30 },
  }
  const tree = await mount(t, HozoTimePicker, props)
  assert.equal(flat(timeGroup(tree).props.style).paddingTop, 91)
  assert.equal(flat(timeGroup(tree).props.style).paddingBottom, 16)
  assert.equal(flat(timeGroup(tree).props.style).color, undefined)
  assert.equal(flat(timeGroup(tree).props.style).opacity, undefined)
  assert.equal(flat(timeGroup(tree).props.style).marginTop, undefined)
  for (const value of timeValues(tree)) {
    const wrapper = timeField(value)
    assert.equal(flat(wrapper.props.style).paddingTop, 92)
    assert.equal(flat(wrapper.props.style).paddingBottom, 12)
    assert.equal(flat(wrapper.props.style).fontSize, undefined)
    assert.equal(flat(wrapper.props.style).opacity, undefined)
    assert.equal(flat(wrapper.props.style).marginTop, undefined)
    assert.equal(flat(value.props.children.props.style).color, color('hozo-text-subtle'))
    assert.equal(flat(value.props.children.props.style).fontSize, 18)
    assert.equal(String(flat(value.props.children.props.style).fontWeight), '700')
  }
  for (const arrow of timeArrows(tree))
    assert.equal(flat(arrow.props.children.props.style).color, color('hozo-text-subtle'))
  assert.equal(
    flat(timePeriod(tree).props.style).paddingBottom,
    undefined,
    'field class is not on the period button',
  )
  assert.equal(flat(timePeriod(tree).props.children.props.style).color, color('hozo-accent'))
  assert.equal(flat(timePeriod(tree).props.children.props.style).fontSize, 30)
  await act(() =>
    tree.update(
      React.createElement(HozoTimePicker, {
        ...props,
        className: undefined,
        fieldClassName: undefined,
      }),
    ),
  )
  assert.equal(flat(timeGroup(tree).props.style).paddingBottom, undefined)
  assert.equal(flat(timeValues(tree)[0].props.children.props.style).color, '#abcdef')
  assert.equal(flat(timeValues(tree)[0].props.children.props.style).fontWeight, undefined)
})

test('Native TimePicker explicit field text wins without turning ancestor text into child style', async (t) => {
  const props = {
    ...timeProps,
    className: 'text-hozo-accent',
    style: { color: '#123456', fontSize: 31 },
    fieldClassName: 'text-hozo-text-subtle text-lg',
    fieldStyle: { paddingTop: 91, color: '#654321' },
    fieldTextStyle: { color: '#fedcba' },
  }
  const tree = await mount(t, HozoTimePicker, props)
  for (const value of timeValues(tree)) {
    assert.equal(flat(value.props.children.props.style).color, '#fedcba')
    assert.equal(flat(value.props.children.props.style).fontSize, 18)
    assert.equal(flat(timeField(value).props.style).color, undefined)
  }
  assert.equal(flat(timeArrows(tree)[0].props.children.props.style).color, '#654321')
  assert.equal(flat(timePeriod(tree).props.children.props.style).color, '#fedcba')
  assert.equal(flat(timePeriod(tree).props.children.props.style).fontSize, 31)
})

test('Native UI TimePicker draws its real group and field chrome', async (t) => {
  const tree = await mount(t, UiTimePicker, timeProps)
  assert.equal(flat(timeGroup(tree).props.style).flexDirection, 'row')
  assert.equal(flat(timeGroup(tree).props.style).gap, 8)
  for (const value of timeValues(tree)) {
    const box = flat(timeField(value).props.style)
    assert.equal(box.minHeight, 48)
    assert.equal(box.paddingEnd, 24)
    assert.equal(box.backgroundColor, color('hozo-surface'))
    assert.equal(flat(value.props.children.props.style).fontSize, 14)
    assert.equal(flat(value.props.children.props.style).color, color('hozo-text'))
  }
})

test('Native TimePicker values own div form facts, local pointer focus and disabled ARIA', async (t) => {
  const changes = []
  const props = {
    ...timeProps,
    valueClassName: timeValueClasses,
    onChange: (value) => changes.push(value),
  }
  const tree = await mount(t, HozoTimePicker, props)
  const [hour, minute] = timeValues(tree)
  assert.equal(flat(hour.props.style).paddingTop, 20)
  assert.equal(flat(hour.props.style).color, undefined)
  assert.equal(flat(hour.props.children.props.style).color, color('hozo-accent'))
  const rootStyle = timeGroup(tree).props.style
  await act(() => hour.props.onPointerEnter())
  assert.equal(flat(hour.props.style).backgroundColor, color('hozo-accent'))
  assert.equal(flat(minute.props.style).backgroundColor, undefined)
  await act(() => hour.props.onFocus())
  assert.equal(flat(hour.props.style).opacity, 0.75)
  assert.equal(String(flat(hour.props.children.props.style).fontWeight), '700')
  await act(() => hour.props.onPointerDown())
  assert.equal(flat(hour.props.children.props.style).fontWeight, undefined)
  await act(() => hour.props.onKeyDown())
  assert.equal(String(flat(hour.props.children.props.style).fontWeight), '700')
  assert.equal(timeGroup(tree).props.style, rootStyle, 'value events do not rerender TimePicker')
  await act(() => tree.update(React.createElement(HozoTimePicker, { ...props, disabled: true })))
  assert.equal(
    flat(hour.props.style).opacity,
    0.75,
    'aria-disabled is not HTML :disabled and does not forcibly clear focus',
  )
  assert.equal(flat(hour.props.style).borderTopWidth, 4)
  assert.equal(flat(hour.props.style).marginTop, 32)
  assert.equal(flat(timeField(hour).props.style).borderTopWidth, undefined)
  await act(() => hour.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }))
  assert.deepEqual(changes, [])
  await act(() => {
    hour.props.onBlur()
    hour.props.onPointerLeave()
  })
  assert.equal(flat(hour.props.style).opacity, undefined)
  await act(() =>
    tree.update(React.createElement(HozoTimePicker, { ...props, valueClassName: undefined })),
  )
  assert.equal(flat(hour.props.style).paddingTop, undefined)
  assert.equal(flat(hour.props.children.props.style).color, undefined)
})

test('Native TimePicker value declarations stay above inherited field text and below explicit label styles', async (t) => {
  const props = {
    ...timeProps,
    className: 'text-hozo-accent',
    style: { color: '#123456', fontSize: 31 },
    fieldClassName: 'text-hozo-text-subtle text-lg',
    fieldStyle: { paddingTop: 91, color: '#654321', fontSize: 29 },
    valueClassName: 'p-5 text-hozo-text-body font-bold',
  }
  const tree = await mount(t, HozoTimePicker, props)
  const value = timeValues(tree)[0]
  assert.equal(flat(value.props.children.props.style).color, color('hozo-text-body'))
  assert.equal(flat(value.props.children.props.style).fontSize, 29)
  assert.equal(String(flat(value.props.children.props.style).fontWeight), '700')
  assert.equal(flat(value.props.style).paddingTop, 20)
  assert.equal(flat(timeField(value).props.style).paddingTop, 91)
  await act(() =>
    tree.update(
      React.createElement(HozoTimePicker, {
        ...props,
        fieldTextStyle: { color: '#abcdef', fontSize: 27 },
      }),
    ),
  )
  assert.equal(flat(value.props.children.props.style).color, '#abcdef')
  assert.equal(flat(value.props.children.props.style).fontSize, 27)
  assert.equal(flat(value.props.style).fontSize, undefined)
  await act(() =>
    tree.update(React.createElement(HozoTimePicker, { ...props, valueClassName: undefined })),
  )
  assert.equal(flat(value.props.children.props.style).color, '#654321')
  assert.equal(flat(value.props.children.props.style).fontWeight, undefined)
})

test('Native TimePicker period is an independent button and preserves explicit styles and commits', async (t) => {
  const changes = []
  const props = {
    ...timeProps,
    periodClassName: `${interactionClasses} disabled:opacity-25 aria-disabled:border-4 data-[hozo-disabled]:mt-8`,
    onChange: (value) => changes.push(value),
  }
  const tree = await mount(t, HozoTimePicker, props)
  const period = timePeriod(tree)
  const rootStyle = timeGroup(tree).props.style
  assert.equal(flat(period.props.style).paddingTop, 16)
  await act(() => period.props.onHoverIn())
  assert.equal(flat(period.props.style).backgroundColor, color('hozo-accent'))
  assert.equal(flat(period.props.children.props.style).color, color('hozo-accent-text'))
  await act(() => period.props.onFocus())
  assert.equal(flat(period.props.style).opacity, 0.75)
  await act(() => period.props.onPressIn())
  assert.equal(flat(period.props.style).opacity, 0.5)
  await act(() => period.props.onPressOut())
  assert.equal(timeGroup(tree).props.style, rootStyle, 'period events do not rerender the clock')
  assert.equal(flat(timeValues(tree)[0].props.style).opacity, undefined)
  await press(period)
  assert.deepEqual(changes, [{ hour: 21, minute: 10 }])
  assert.equal(period.props.children.props.children, 'PM')
  assert.ok(period.props.accessibilityValue.text.includes('PM'))
  await act(() => tree.update(React.createElement(HozoTimePicker, { ...props, disabled: true })))
  assert.equal(flat(period.props.style).opacity, 0.25)
  assert.equal(
    flat(period.props.style).borderTopWidth,
    undefined,
    'Native accessibility disabled is not an authored aria-disabled on this Web button',
  )
  assert.equal(flat(period.props.style).marginTop, 32)
  await press(period)
  assert.equal(changes.length, 1)
  await act(() =>
    tree.update(
      React.createElement(HozoTimePicker, {
        ...props,
        fieldStyle: { paddingTop: 91, color: '#123456' },
        fieldTextStyle: { color: '#abcdef' },
      }),
    ),
  )
  assert.equal(flat(period.props.style).paddingTop, 91)
  assert.equal(flat(period.props.style).paddingBottom, 16)
  assert.equal(
    flat(period.props.style).opacity,
    undefined,
    'disabled cleared stale focus and press',
  )
  assert.equal(flat(period.props.children.props.style).color, '#abcdef')
  await act(() =>
    tree.update(React.createElement(HozoTimePicker, { ...props, periodClassName: undefined })),
  )
  assert.equal(flat(period.props.style).paddingBottom, undefined)
})

test('Native TimePicker local class resolution keeps empty, bounded and controlled accessibility actions', async (t) => {
  const changes = []
  const props = {
    locale: 'en-US',
    hour12: false,
    value: null,
    min: { hour: 8, minute: 15 },
    max: { hour: 8, minute: 30 },
    step: 15,
    valueClassName: 'p-4',
    onChange: (value) => changes.push(value),
  }
  const tree = await mount(t, HozoTimePicker, props)
  const minute = timeValues(tree)[1]
  assert.equal(minute.props.accessible, true)
  assert.deepEqual(minute.props.accessibilityActions, [
    { name: 'increment' },
    { name: 'decrement' },
  ])
  assert.equal(minute.props.accessibilityValue.now, undefined)
  const action = async (name) =>
    act(() => minute.props.onAccessibilityAction({ nativeEvent: { actionName: name } }))
  await action('increment')
  assert.deepEqual(changes, [{ hour: 8, minute: 15 }])
  assert.equal(
    minute.props.accessibilityValue.now,
    undefined,
    'controlled empty value does not become internal state',
  )
  await act(() => tree.update(React.createElement(HozoTimePicker, { ...props, value: changes[0] })))
  await action('increment')
  assert.deepEqual(changes[1], { hour: 8, minute: 30, second: 0 })
  await act(() => tree.update(React.createElement(HozoTimePicker, { ...props, value: changes[1] })))
  await action('increment')
  await action('unknown')
  assert.equal(changes.length, 2)
  assert.equal(minute.props.accessibilityValue.now, 30)
})

test('Native UI TimePicker values and period use the real look; unmeasured active and hidden period stay honest', async (t) => {
  const ui = await mount(t, UiTimePicker, timeProps)
  for (const value of timeValues(ui)) {
    assert.equal(flat(value.props.style).minWidth, 32)
    assert.equal(flat(value.props.style).paddingStart, 12)
    assert.equal(flat(value.props.style).paddingEnd, 8)
    await act(() => value.props.onFocus())
    assert.equal(flat(value.props.style).outlineWidth, 2)
  }
  assert.equal(flat(timePeriod(ui).props.style).minHeight, 48)
  assert.equal(String(flat(timePeriod(ui).props.children.props.style).fontWeight), '600')
  const warnings = []
  const original = console.warn
  console.warn = (message) => warnings.push(message)
  try {
    const tree = await mount(t, HozoTimePicker, {
      ...timeProps,
      hour12: false,
      valueClassName: timeActiveUnmeasuredClass,
      periodClassName: hiddenPeriodClass,
    })
    assert.ok(warnings.some((message) => message.includes('needs state (pressed)')))
    assert.ok(!warnings.some((message) => message.includes(hiddenPeriodClass)))
    await act(() =>
      tree.update(
        React.createElement(HozoTimePicker, {
          ...timeProps,
          hour12: true,
          periodClassName: hiddenPeriodClass,
        }),
      ),
    )
    assert.ok(warnings.some((message) => message.includes(hiddenPeriodClass)))
  } finally {
    console.warn = original
  }
})

const calendarProps = {
  defaultMonth: { year: 2026, month: 6 },
  today: { year: 2026, month: 6, day: 15 },
  locale: 'en-US',
  weeks: 6,
}
const calendarDays = (tree) =>
  tree.root
    .findAllByType('NativePressable')
    .filter((node) => node.props.accessibilityLabel?.includes('2026'))
const calendarMonthButtons = (tree) =>
  tree.root
    .findAllByType('NativePressable')
    .filter((node) => !node.props.accessibilityLabel?.includes('2026'))
const calendarJuneDay = (tree, number) =>
  calendarDays(tree).find((node) => node.props.accessibilityLabel.includes(`June ${number},`))

for (const [name, Picker, , value] of pickerCases) {
  test(`Native ${name} forwards each Calendar class slot without restyling its dialog`, async (t) => {
    const props = {
      ...calendarProps,
      value,
      defaultOpen: true,
      calendarClassName: 'p-4',
      headerClassName: 'p-3',
      gridClassName: 'p-5',
      monthButtonClassName: 'p-6',
      dayClassName: 'p-7 aria-selected:border-2',
    }
    const tree = await mount(t, Picker, props)
    const calendar = views(tree).find((node) => node.props.accessibilityRole === 'grid')
    assert.ok(calendar)
    assert.equal(flat(calendar.props.style).paddingTop, 16)
    const heading = calendar.findByProps({ accessibilityLiveRegion: 'polite' })
    assert.equal(flat(heading.parent.parent.props.style).paddingTop, 12)
    const grid = calendar
      .findAllByType('NativeView')
      .find((node) => flat(node.props.style).paddingTop === 20)
    assert.ok(grid, 'one owned grid box, not repeated padding')
    for (const button of calendar
      .findAllByType('NativePressable')
      .filter((node) => !node.props.accessibilityLabel?.includes('2026')))
      assert.equal(flat(button.props.style).paddingTop, 24)
    assert.equal(flat(calendarJuneDay(tree, 12).props.style).paddingTop, 28)
    assert.equal(flat(calendarJuneDay(tree, 12).props.style).borderTopWidth, 2)
    assert.equal(
      flat(panel(tree).props.style).paddingTop,
      undefined,
      'Calendar classes do not belong to the dialog',
    )
    const modal = tree.root.findByType('NativeModal')
    await act(() => modal.props.onRequestClose())
    assert.equal(tree.root.findAllByType('NativeModal').length, 0)
    await press(tree.root.findAllByType('NativePressable')[0])
    assert.equal(flat(calendarJuneDay(tree, 12).props.style).paddingTop, 28)
    await act(() =>
      tree.update(
        React.createElement(Picker, {
          ...props,
          headerClassName: undefined,
          dayClassName: undefined,
        }),
      ),
    )
    assert.equal(flat(calendarJuneDay(tree, 12).props.style).paddingTop, undefined)
    assert.equal(
      flat(tree.root.findByProps({ accessibilityLiveRegion: 'polite' }).parent.parent.props.style)
        .paddingTop,
      undefined,
    )
  })
}

test('Native UI date pickers route the same Calendar look as standalone UI Calendar', async (t) => {
  for (const [name, , Picker, value] of pickerCases) {
    const tree = await mount(t, Picker, {
      ...calendarProps,
      value,
      defaultOpen: true,
      renderDay: (day) => day.date.day,
    })
    const heading = tree.root.findByProps({ accessibilityLiveRegion: 'polite' })
    assert.equal(flat(heading.props.style).fontSize, 14, name)
    const day = calendarJuneDay(tree, 12)
    assert.equal(flat(day.props.style).paddingTop, 8, name)
    assert.equal(flat(day.props.style).backgroundColor, color('hozo-accent'), name)
    assert.equal(flat(day.props.children.props.style).color, color('hozo-on-accent'), name)
    if (name === 'DateRangePicker')
      assert.equal(
        flat(calendarJuneDay(tree, 13).props.style).backgroundColor,
        color('hozo-accent-subtle'),
      )
  }
})

for (const [name, Picker, , value] of pickerCases) {
  test(`Native ${name} trigger owns interaction, expansion and disabled styling`, async (t) => {
    const opened = [],
      changed = []
    let dayCalls = 0
    const props = {
      ...calendarProps,
      value,
      accessibilityLabel: 'Departure',
      triggerClassName: `${interactionClasses} aria-expanded:border-2 disabled:opacity-25 aria-disabled:mt-8 aria-selected:mb-8`,
      onOpenChange: (next) => opened.push(next),
      onChange: (next) => changed.push(next),
      renderDay: (day) => {
        dayCalls++
        return day.date.day
      },
    }
    const tree = await mount(t, Picker, props)
    const trigger = tree.root.findAllByType('NativePressable')[0]
    const text = trigger.props.accessibilityValue.text
    assert.equal(trigger.props.accessibilityLabel, 'Departure')
    assert.ok(text.includes('2026'))
    assert.equal(flat(trigger.props.style).paddingTop, 16)
    assert.equal(flat(trigger.props.style).marginTop, undefined, 'not an authored aria-disabled')
    await act(() => trigger.props.onHoverIn())
    assert.equal(flat(trigger.props.style).backgroundColor, color('hozo-accent'))
    assert.equal(flat(trigger.props.children.props.style).color, color('hozo-accent-text'))
    assert.equal(flat(views(tree)[0].props.style).backgroundColor, undefined)
    await act(() => trigger.props.onFocus())
    assert.equal(flat(trigger.props.style).opacity, 0.75)
    assert.equal(String(flat(trigger.props.children.props.style).fontWeight), '700')
    await act(() => trigger.props.onPointerDown())
    assert.equal(flat(trigger.props.children.props.style).fontWeight, undefined)
    await act(() => trigger.props.onKeyDown())
    assert.equal(String(flat(trigger.props.children.props.style).fontWeight), '700')
    await act(() => trigger.props.onPressIn())
    assert.equal(flat(trigger.props.style).opacity, 0.5)
    await act(() => trigger.props.onPressOut())
    await press(trigger)
    assert.equal(trigger.props.accessibilityState.expanded, true)
    assert.equal(flat(trigger.props.style).borderTopWidth, 2)
    const before = dayCalls
    assert.ok(before >= 42)
    await act(() => {
      trigger.props.onHoverOut()
      trigger.props.onHoverIn()
    })
    assert.equal(dayCalls, before, 'local trigger events do not reevaluate Calendar renderers')
    assert.equal(flat(calendarJuneDay(tree, 12).props.style).borderTopWidth, undefined)
    await press(calendarJuneDay(tree, 12))
    if (name === 'DateRangePicker') {
      assert.equal(tree.root.findAllByType('NativeModal').length, 1, 'first range press is pending')
      await press(calendarJuneDay(tree, 15))
    } else if (name === 'DateTimePicker') {
      assert.equal(
        tree.root.findAllByType('NativeModal').length,
        1,
        'day does not close the clock picker',
      )
      await act(() => tree.root.findByType('NativeModal').props.onRequestClose())
    }
    assert.equal(changed.length, 1)
    assert.deepEqual(opened, [true, false])
    assert.equal(flat(trigger.props.style).borderTopWidth, undefined)
    await act(() => {
      trigger.props.onPressIn()
      tree.update(React.createElement(Picker, { ...props, disabled: true }))
    })
    assert.equal(trigger.props.accessibilityState.disabled, true)
    assert.equal(flat(trigger.props.style).opacity, 0.25)
    assert.equal(flat(trigger.props.style).outlineWidth, undefined)
    await press(trigger)
    assert.deepEqual(opened, [true, false])
    await act(() => tree.update(React.createElement(Picker, props)))
    assert.equal(
      flat(trigger.props.style).opacity,
      undefined,
      'disabled clears stale focus and press',
    )
    const explicit = {
      ...props,
      triggerStyle: { paddingTop: 91 },
      triggerTextStyle: { color: '#abcdef' },
    }
    await act(() => tree.update(React.createElement(Picker, explicit)))
    assert.equal(flat(trigger.props.style).paddingTop, 91)
    assert.equal(flat(trigger.props.style).paddingBottom, 16)
    assert.equal(flat(trigger.props.children.props.style).color, '#abcdef')
    await act(() =>
      tree.update(React.createElement(Picker, { ...explicit, triggerClassName: undefined })),
    )
    assert.equal(flat(trigger.props.style).paddingBottom, undefined)
    assert.equal(flat(trigger.props.style).paddingTop, 91)
    assert.equal(trigger.props.accessibilityValue.text, text)
  })
}

test('Native UI date-picker triggers draw their shared real look', async (t) => {
  for (const [name, , Picker, value] of pickerCases) {
    const tree = await mount(t, Picker, { ...calendarProps, value })
    const trigger = tree.root.findAllByType('NativePressable')[0]
    assert.equal(flat(trigger.props.style).paddingTop, 12, name)
    assert.equal(flat(trigger.props.style).paddingStart, 16, name)
    assert.equal(flat(trigger.props.children.props.style).fontSize, 14, name)
    assert.equal(flat(trigger.props.children.props.style).color, color('hozo-text-body'), name)
  }
})

const dateTimeDone = (tree) =>
  panel(tree)
    .findAllByType('NativePressable')
    .find((node) => node.props.children?.props?.children === 'Done')

test('Native DateTime Done owns button facts and interaction without reopening or committing', async (t) => {
  const Picker = withoutClock(HozoDateTimePicker)
  const opened = [],
    changed = []
  let dayCalls = 0
  const props = {
    ...calendarProps,
    defaultOpen: true,
    disabled: true,
    doneClassName: `${interactionClasses} disabled:opacity-25 aria-expanded:border-2 aria-disabled:mt-8`,
    onOpenChange: (next) => opened.push(next),
    onChange: (next) => changed.push(next),
    renderDay: (day) => {
      dayCalls++
      return day.date.day
    },
  }
  const tree = await mount(t, Picker, props)
  const done = dateTimeDone(tree)
  assert.ok(done)
  assert.equal(
    Boolean(done.props.disabled),
    false,
    'outer disabled does not disable the open dialog exit',
  )
  assert.equal(
    done.props.accessibilityState?.expanded,
    undefined,
    'Done is not an expansion trigger',
  )
  assert.equal(flat(done.props.style).paddingTop, 16)
  assert.equal(flat(done.props.style).marginTop, undefined)
  assert.equal(flat(done.props.style).borderTopWidth, undefined)
  const before = dayCalls
  await act(() => done.props.onHoverIn())
  assert.equal(flat(done.props.style).backgroundColor, color('hozo-accent'))
  assert.equal(flat(done.props.children.props.style).color, color('hozo-accent-text'))
  await act(() => done.props.onFocus())
  assert.equal(flat(done.props.style).opacity, 0.75)
  assert.equal(String(flat(done.props.children.props.style).fontWeight), '700')
  await act(() => done.props.onPointerDown())
  assert.equal(flat(done.props.children.props.style).fontWeight, undefined)
  await act(() => done.props.onKeyDown())
  assert.equal(String(flat(done.props.children.props.style).fontWeight), '700')
  await act(() => done.props.onPressIn())
  assert.equal(flat(done.props.style).opacity, 0.5)
  await act(() => {
    done.props.onPressOut()
    done.props.onBlur()
    done.props.onHoverOut()
  })
  assert.equal(dayCalls, before, 'Done events stay out of Calendar rendering')
  const trigger = tree.root.findAllByType('NativePressable')[0]
  assert.equal(flat(trigger.props.style).backgroundColor, undefined)
  await press(done)
  assert.deepEqual(opened, [false])
  assert.deepEqual(changed, [], 'Done only closes; changes are already committed')
  assert.equal(tree.root.findAllByType('NativeModal').length, 0)
  await act(() => tree.update(React.createElement(Picker, { ...props, disabled: false })))
  await press(tree.root.findAllByType('NativePressable')[0])
  assert.equal(
    flat(dateTimeDone(tree).props.style).opacity,
    undefined,
    'reopen has no stale press/focus',
  )
})

test('Native DateTime Done splits typography and preserves explicit overrides and class removal', async (t) => {
  const Picker = withoutClock(HozoDateTimePicker)
  const props = {
    ...calendarProps,
    defaultOpen: true,
    doneClassName: 'p-4 text-hozo-accent font-bold',
    doneStyle: { paddingTop: 91, color: '#123456' },
    doneTextStyle: { color: '#abcdef' },
  }
  const tree = await mount(t, Picker, props)
  const done = dateTimeDone(tree)
  assert.equal(flat(done.props.style).paddingTop, 91)
  assert.equal(flat(done.props.style).paddingBottom, 16)
  assert.equal(flat(done.props.style).color, undefined)
  assert.equal(flat(done.props.children.props.style).paddingTop, undefined)
  assert.equal(flat(done.props.children.props.style).color, '#abcdef')
  assert.equal(String(flat(done.props.children.props.style).fontWeight), '700')
  await act(() => tree.update(React.createElement(Picker, { ...props, doneClassName: undefined })))
  assert.equal(flat(done.props.style).paddingTop, 91)
  assert.equal(flat(done.props.style).paddingBottom, undefined)
  assert.equal(flat(done.props.children.props.style).fontWeight, undefined)
})

test('Native UI DateTime Done draws its actual accent look', async (t) => {
  const tree = await mount(t, withoutClock(UiDateTimePicker), {
    ...calendarProps,
    defaultOpen: true,
  })
  const done = dateTimeDone(tree)
  assert.equal(flat(done.props.style).paddingTop, 12)
  assert.equal(flat(done.props.style).paddingStart, 16)
  assert.equal(flat(done.props.style).backgroundColor, color('hozo-accent'))
  assert.equal(flat(done.props.children.props.style).fontSize, 14)
  assert.equal(flat(done.props.children.props.style).color, color('hozo-on-accent'))
  await act(() => done.props.onHoverIn())
  assert.equal(flat(done.props.style).backgroundColor, color('hozo-accent-hover'))
})

for (const [name, Picker, , value] of pickerCases) {
  test(`Native ${name} frame owns its boxes and routes inherited text below child declarations`, async (t) => {
    const props = {
      ...calendarProps,
      value,
      defaultOpen: true,
      disabled: true,
      className: 'p-4 text-hozo-accent font-bold disabled:opacity-25 aria-disabled:mt-8',
      dialogClassName: 'p-6 text-hozo-text-subtle text-lg disabled:opacity-25 aria-disabled:mt-8',
      style: { paddingTop: 91 },
      dialogStyle: { paddingTop: 92 },
    }
    const tree = await mount(t, Picker, props)
    const root = views(tree)[0]
    const trigger = tree.root.findAllByType('NativePressable')[0]
    const heading = () => tree.root.findByProps({ accessibilityLiveRegion: 'polite' })
    assert.equal(flat(root.props.style).paddingTop, 91)
    assert.equal(flat(root.props.style).paddingBottom, 16)
    assert.equal(flat(root.props.style).color, undefined)
    assert.equal(flat(root.props.style).opacity, undefined, 'wrapper is not the disabled control')
    assert.equal(flat(root.props.style).marginTop, undefined)
    assert.equal(flat(panel(tree).props.style).paddingTop, 92)
    assert.equal(flat(panel(tree).props.style).paddingBottom, 24)
    assert.equal(flat(panel(tree).props.style).fontSize, undefined)
    assert.equal(flat(panel(tree).props.style).opacity, undefined)
    assert.equal(flat(panel(tree).props.style).marginTop, undefined)
    assert.equal(flat(trigger.props.children.props.style).color, color('hozo-accent'))
    assert.equal(flat(heading().props.style).color, color('hozo-text-subtle'))
    assert.equal(flat(heading().props.style).fontSize, 18)
    assert.equal(String(flat(heading().props.style).fontWeight), '700')
    assert.equal(
      flat(calendarJuneDay(tree, 12).props.children.props.style).color,
      color('hozo-text-subtle'),
    )
    const own = {
      ...props,
      calendarClassName: 'text-hozo-text-body',
      triggerClassName: 'text-hozo-text-body',
      doneClassName: 'text-hozo-text-body',
    }
    await act(() => tree.update(React.createElement(Picker, own)))
    assert.equal(
      flat(heading().props.style).color,
      color('hozo-text-body'),
      'child declaration beats inherited panel text',
    )
    assert.equal(flat(trigger.props.children.props.style).color, color('hozo-text-body'))
    assert.equal(
      flat(calendarJuneDay(tree, 12).props.children.props.style).color,
      color('hozo-text-body'),
    )
    if (name === 'DateTimePicker')
      assert.equal(
        flat(dateTimeDone(tree).props.children.props.style).color,
        color('hozo-text-body'),
      )
    await act(() =>
      tree.update(
        React.createElement(Picker, {
          ...own,
          style: { paddingTop: 91, color: '#123456', fontSize: 31 },
          dialogStyle: { paddingTop: 92, color: '#654321', fontSize: 29 },
          triggerTextStyle: { color: '#fedcba' },
          doneTextStyle: { color: '#fedcba' },
        }),
      ),
    )
    assert.equal(flat(trigger.props.children.props.style).color, '#fedcba')
    assert.equal(flat(trigger.props.children.props.style).fontSize, 31)
    assert.equal(
      flat(heading().props.style).color,
      color('hozo-text-body'),
      'own class beats even explicit ancestor style',
    )
    assert.equal(flat(heading().props.style).fontSize, 29)
    if (name === 'DateTimePicker')
      assert.equal(flat(dateTimeDone(tree).props.children.props.style).color, '#fedcba')
    await act(() =>
      tree.update(
        React.createElement(Picker, { ...props, className: undefined, dialogClassName: undefined }),
      ),
    )
    assert.equal(flat(root.props.style).paddingBottom, undefined)
    assert.equal(flat(panel(tree).props.style).paddingBottom, undefined)
    assert.equal(flat(heading().props.style).color, undefined)
    assert.equal(flat(heading().props.style).fontWeight, undefined)
    assert.equal(flat(root.props.style).paddingTop, 91)
    assert.equal(flat(panel(tree).props.style).paddingTop, 92)
  })
}

test('Native date-picker frame leaves custom day and clock layouts caller-owned', async (t) => {
  const customDay = React.createElement(
    NativeText,
    { testID: 'custom-day', style: { color: '#123456' } },
    'Custom day',
  )
  const clock = React.createElement(
    NativeText,
    { testID: 'custom-clock', style: { color: '#abcdef' } },
    'Custom clock',
  )
  const Picker = (props) => React.createElement(HozoDateTimePicker, props, () => clock)
  const tree = await mount(t, Picker, {
    ...calendarProps,
    defaultOpen: true,
    dialogClassName: 'text-hozo-accent',
    renderDay: () => customDay,
  })
  for (const node of tree.root
    .findAllByType('NativeText')
    .filter((node) => node.props.testID === 'custom-day'))
    assert.deepEqual(node.props.style, { color: '#123456' })
  assert.equal(
    tree.root.findAllByType('NativeText').filter((node) => node.props.testID === 'custom-day')
      .length,
    42,
  )
  assert.deepEqual(
    tree.root.findAllByType('NativeText').find((node) => node.props.testID === 'custom-clock').props
      .style,
    { color: '#abcdef' },
  )
})

test('Native UI date-picker panels consume their real chrome without overriding the child look', async (t) => {
  for (const [name, , Picker, value] of pickerCases) {
    const tree = await mount(t, Picker, {
      ...calendarProps,
      value,
      defaultOpen: true,
      className: 'text-lg font-bold',
      renderDay: (day) => day.date.day,
    })
    assert.equal(flat(panel(tree).props.style).paddingTop, 8, name)
    assert.equal(flat(panel(tree).props.style).backgroundColor, color('hozo-surface'), name)
    const trigger = tree.root.findAllByType('NativePressable')[0]
    assert.equal(flat(trigger.props.children.props.style).fontSize, 14, name)
    const heading = tree.root.findByProps({ accessibilityLiveRegion: 'polite' })
    assert.equal(flat(heading.props.style).fontSize, 14, name)
    assert.equal(flat(heading.props.style).color, color('hozo-text'), name)
  }
})

test('Native DateTime frame reaches the default owned clock, not only Calendar and Done', async (t) => {
  const Picker = (props) => React.createElement(HozoDateTimePicker, props, undefined)
  const tree = await mount(t, Picker, {
    ...calendarProps,
    defaultOpen: true,
    hour12: true,
    className: 'font-bold',
    dialogClassName: 'text-hozo-accent text-lg',
  })
  const clock = views(tree).find(
    (node) => node.props.accessibilityRole === 'none' && !node.props.accessibilityViewIsModal,
  )
  assert.ok(clock)
  for (const text of clock.findAllByType('NativeText')) {
    assert.equal(flat(text.props.style).color, color('hozo-accent'))
    assert.equal(flat(text.props.style).fontSize, 18)
    assert.equal(String(flat(text.props.style).fontWeight), '700')
  }
  assert.equal(clock.findAllByType('NativeText').length, 7)
  assert.equal(flat(dateTimeDone(tree).props.children.props.style).color, color('hozo-accent'))
})

test('Native date-picker dialog classes are resolved only while that owner exists', async (t) => {
  const warnings = []
  const original = console.warn
  console.warn = (message) => warnings.push(message)
  try {
    const tree = await mount(t, HozoDatePicker, {
      ...calendarProps,
      dialogClassName: dialogUnmeasuredClass,
    })
    assert.deepEqual(warnings, [])
    await press(tree.root.findAllByType('NativePressable')[0])
    assert.ok(warnings.some((message) => message.includes('needs state (hovered)')))
    assert.equal(flat(panel(tree).props.style).color, undefined)
  } finally {
    console.warn = original
  }
})

test('Native UI Calendar draws selected single days, range caps, interiors and unavailable days', async (t) => {
  const tree = await mount(t, UiCalendar, {
    ...calendarProps,
    value: { year: 2026, month: 6, day: 12 },
    renderDay: (day) => day.date.day,
    min: { year: 2026, month: 6, day: 10 },
    max: { year: 2026, month: 6, day: 20 },
  })
  const selected = calendarJuneDay(tree, 12)
  assert.equal(flat(selected.props.style).paddingTop, 8)
  assert.equal(flat(selected.props.style).minWidth, 36)
  assert.equal(flat(selected.props.style).backgroundColor, color('hozo-accent'))
  assert.equal(flat(selected.props.children.props.style).color, color('hozo-on-accent'))
  assert.equal(String(flat(selected.props.children.props.style).fontWeight), '600')
  assert.equal(flat(calendarJuneDay(tree, 13).props.style).backgroundColor, undefined)
  assert.equal(
    flat(calendarJuneDay(tree, 9).props.children.props.style).color,
    color('hozo-text-subtle'),
  )
  assert.equal(
    flat(calendarDays(tree)[0].props.children.props.style).color,
    color('hozo-text-subtle'),
  )
  const changes = []
  const props = {
    ...calendarProps,
    range: true,
    renderDay: (day) => day.date.day,
    onChange: (value) => changes.push(value),
  }
  const range = await mount(t, UiCalendar, props)
  await press(calendarJuneDay(range, 12))
  assert.deepEqual(changes, [])
  assert.equal(flat(calendarJuneDay(range, 12).props.style).backgroundColor, color('hozo-accent'))
  await press(calendarJuneDay(range, 15))
  assert.deepEqual(changes, [
    { start: { year: 2026, month: 6, day: 12 }, end: { year: 2026, month: 6, day: 15 } },
  ])
  await act(() => range.update(React.createElement(UiCalendar, { ...props, value: changes[0] })))
  for (const end of [12, 15]) {
    assert.equal(
      flat(calendarJuneDay(range, end).props.style).backgroundColor,
      color('hozo-accent'),
    )
    assert.equal(
      flat(calendarJuneDay(range, end).props.children.props.style).color,
      color('hozo-on-accent'),
    )
  }
  for (const inside of [13, 14]) {
    assert.equal(
      flat(calendarJuneDay(range, inside).props.style).backgroundColor,
      color('hozo-accent-subtle'),
    )
    assert.equal(
      flat(calendarJuneDay(range, inside).props.children.props.style).color,
      color('hozo-accent-text'),
    )
    assert.equal(calendarJuneDay(range, inside).props.accessibilityState.selected, true)
  }
})

test('Native Calendar day events are local and td facts do not become button form predicates', async (t) => {
  let calls = 0
  const props = {
    ...calendarProps,
    dayClassName: `${interactionClasses} disabled:mt-8 enabled:mb-8 aria-disabled:border-4`,
    renderDay: (day) => {
      calls++
      return day.date.day
    },
  }
  const tree = await mount(t, HozoCalendar, props)
  const a = calendarJuneDay(tree, 12),
    b = calendarJuneDay(tree, 13)
  await act(() => a.props.onHoverIn())
  assert.equal(flat(a.props.style).backgroundColor, color('hozo-accent'))
  assert.equal(flat(b.props.style).backgroundColor, undefined)
  assert.equal(flat(a.props.children.props.style).color, color('hozo-accent-text'))
  await act(() => a.props.onFocus())
  assert.equal(flat(a.props.style).opacity, 0.75)
  await act(() => a.props.onPressIn())
  assert.equal(flat(a.props.style).opacity, 0.5)
  await act(() => {
    a.props.onPressOut()
    a.props.onKeyDown()
  })
  assert.equal(flat(a.props.style).outlineWidth, 2)
  assert.equal(calls, 42, 'a day interaction must not reevaluate all renderDay callbacks')
  await act(() =>
    tree.update(
      React.createElement(HozoCalendar, { ...props, min: { year: 2026, month: 6, day: 15 } }),
    ),
  )
  assert.equal(a.props.accessibilityState.disabled, true)
  assert.equal(flat(a.props.style).borderTopWidth, 4)
  assert.equal(flat(a.props.style).marginTop, undefined, 'aria-disabled td is not :disabled')
  assert.equal(flat(a.props.style).marginBottom, undefined, 'td is not :enabled')
  assert.equal(flat(a.props.style).opacity, 0.75, 'aria-disabled does not blur a Web td')
  await act(() => {
    a.props.onBlur()
    a.props.onHoverOut()
  })
  assert.equal(flat(a.props.style).opacity, undefined)
})

test('Native Calendar data-presence facts distinguish range start, end, interior and outside', async (t) => {
  const props = {
    ...calendarProps,
    range: true,
    value: { start: { year: 2026, month: 6, day: 12 }, end: { year: 2026, month: 6, day: 15 } },
    dayClassName:
      'aria-disabled:opacity-25 data-[hozo-range-start]:border-2 data-[hozo-range-end]:border-4 data-[hozo-in-range]:opacity-75 data-[hozo-outside]:opacity-50',
    min: { year: 2026, month: 6, day: 10 },
  }
  const tree = await mount(t, HozoCalendar, props)
  assert.equal(flat(calendarJuneDay(tree, 12).props.style).borderTopWidth, 2)
  assert.equal(flat(calendarJuneDay(tree, 15).props.style).borderTopWidth, 4)
  assert.equal(flat(calendarJuneDay(tree, 13).props.style).borderTopWidth, undefined)
  assert.equal(flat(calendarJuneDay(tree, 13).props.style).opacity, 0.75)
  assert.equal(flat(calendarJuneDay(tree, 11).props.style).opacity, undefined)
  assert.equal(flat(calendarJuneDay(tree, 9).props.style).opacity, 0.25)
  assert.equal(flat(calendarDays(tree)[0].props.style).opacity, 0.5)
  await act(() =>
    tree.update(
      React.createElement(HozoCalendar, {
        ...props,
        range: false,
        value: { year: 2026, month: 6, day: 12 },
      }),
    ),
  )
  assert.equal(calendarJuneDay(tree, 12).props.accessibilityState.selected, true)
  assert.equal(
    flat(calendarJuneDay(tree, 12).props.style).borderTopWidth,
    undefined,
    'single selection has neither range cap',
  )
})

test('Native Calendar day classes preserve explicit style priority and clear changed selection', async (t) => {
  const props = {
    ...calendarProps,
    value: { year: 2026, month: 6, day: 12 },
    dayClassName: 'p-2 aria-selected:border-2 aria-selected:font-bold',
    dayStyle: { paddingTop: 91, borderTopWidth: 9, fontSize: 23 },
    dayTextStyle: { fontSize: 25 },
  }
  const tree = await mount(t, HozoCalendar, props)
  const a = calendarJuneDay(tree, 12)
  assert.equal(flat(a.props.style).paddingBottom, 8)
  assert.equal(flat(a.props.style).paddingTop, 91)
  assert.equal(flat(a.props.style).borderTopWidth, 9)
  assert.equal(flat(a.props.style).borderBottomWidth, 2)
  assert.equal(flat(a.props.style).fontSize, undefined)
  assert.equal(flat(a.props.children.props.style).fontSize, 25)
  assert.equal(String(flat(a.props.children.props.style).fontWeight), '700')
  await act(() =>
    tree.update(
      React.createElement(HozoCalendar, { ...props, value: { year: 2026, month: 6, day: 13 } }),
    ),
  )
  assert.equal(flat(a.props.style).borderBottomWidth, undefined)
  assert.equal(flat(a.props.children.props.style).fontWeight, undefined)
  assert.equal(flat(calendarJuneDay(tree, 13).props.style).borderBottomWidth, 2)
  await act(() =>
    tree.update(React.createElement(HozoCalendar, { ...props, dayClassName: undefined })),
  )
  assert.equal(flat(a.props.style).paddingBottom, undefined)
  assert.equal(flat(a.props.style).paddingTop, 91)
})

test('Native Calendar month classes follow each actual button, not its sibling or chrome', async (t) => {
  let dayRenders = 0
  const tree = await mount(t, HozoCalendar, {
    ...calendarProps,
    monthButtonClassName: interactionClasses,
    renderDay: (day) => {
      dayRenders++
      return day.date.day
    },
  })
  const [back, next] = calendarMonthButtons(tree)
  assert.equal(flat(back.props.style).paddingTop, 16)
  await act(() => next.props.onHoverIn())
  assert.equal(flat(next.props.style).backgroundColor, color('hozo-accent'))
  assert.equal(flat(next.props.children.props.style).color, color('hozo-accent-text'))
  assert.equal(flat(back.props.style).backgroundColor, undefined)
  assert.equal(flat(views(tree)[0].props.style).backgroundColor, undefined)
  assert.equal(flat(calendarDays(tree)[0].props.style).backgroundColor, undefined)
  await act(() => next.props.onFocus())
  assert.equal(flat(next.props.style).opacity, 0.75)
  assert.equal(String(flat(next.props.children.props.style).fontWeight), '700')
  assert.equal(flat(back.props.style).opacity, undefined)
  await act(() => next.props.onPointerDown())
  assert.equal(flat(next.props.children.props.style).fontWeight, undefined)
  await act(() => next.props.onKeyDown())
  assert.equal(String(flat(next.props.children.props.style).fontWeight), '700')
  await act(() => next.props.onPressIn())
  assert.equal(flat(next.props.style).opacity, 0.5)
  await act(() => {
    next.props.onPressOut()
    next.props.onBlur()
    next.props.onHoverOut()
  })
  assert.equal(flat(next.props.style).opacity, undefined)
  assert.equal(flat(next.props.children.props.style).color, undefined)
  assert.equal(dayRenders, 42, 'button events do not rerender the entire calendar')
})

test('Native Calendar month bounds, explicit styles and disabling clear local interaction', async (t) => {
  const changes = []
  const props = {
    ...calendarProps,
    min: { year: 2026, month: 6, day: 1 },
    max: { year: 2026, month: 8, day: 31 },
    monthButtonClassName: `${interactionClasses} disabled:opacity-25`,
    monthButtonStyle: { paddingTop: 91, color: '#abcdef', fontSize: 23 },
    onMonthChange: (month) => changes.push(month),
  }
  const tree = await mount(t, HozoCalendar, props)
  const [back, next] = calendarMonthButtons(tree)
  assert.equal(back.props.accessibilityState.disabled, true)
  assert.equal(flat(back.props.style).opacity, 0.25)
  assert.equal(flat(next.props.style).paddingTop, 91)
  assert.equal(flat(next.props.style).paddingBottom, 16)
  assert.equal(flat(next.props.children.props.style).color, '#abcdef')
  assert.equal(flat(next.props.children.props.style).fontSize, 23)
  assert.equal(flat(next.props.style).color, undefined)
  await press(back)
  assert.deepEqual(changes, [])
  await press(next)
  assert.deepEqual(changes, [{ year: 2026, month: 7 }])
  assert.equal(back.props.accessibilityState.disabled, false)
  await act(() => {
    next.props.onFocus()
    next.props.onPressIn()
  })
  await act(() =>
    tree.update(
      React.createElement(HozoCalendar, { ...props, max: { year: 2026, month: 7, day: 31 } }),
    ),
  )
  assert.equal(next.props.accessibilityState.disabled, true)
  assert.equal(flat(next.props.style).opacity, 0.25)
  assert.equal(flat(next.props.style).outlineWidth, undefined)
  await act(() => tree.update(React.createElement(HozoCalendar, props)))
  assert.equal(
    flat(next.props.style).opacity,
    undefined,
    'reenabling does not revive old press/focus',
  )
  await act(() =>
    tree.update(React.createElement(HozoCalendar, { ...props, monthButtonClassName: undefined })),
  )
  assert.equal(flat(next.props.style).paddingBottom, undefined)
  assert.equal(flat(next.props.style).paddingTop, 91)
})

test('Native Calendar chrome keeps wrapper, header and grid classes on distinct owners', async (t) => {
  const tree = await mount(t, HozoCalendar, {
    ...calendarProps,
    className: 'p-2 text-hozo-accent font-bold',
    headerClassName: 'p-3 text-sm text-hozo-text-subtle',
    gridClassName: 'p-4 text-lg',
    dayTextStyle: { color: '#abcdef' },
  })
  const root = views(tree)[0]
  const header = root.findAllByType('NativeView')[1]
  // The grid needs one actual box, not the same padding repeated per week.
  const grid = views(tree).find((node) => flat(node.props.style).paddingTop === 16)
  assert.ok(grid, 'gridClassName styles a real grid container')
  assert.equal(flat(root.props.style).paddingTop, 8)
  assert.equal(flat(header.props.style).paddingTop, 12)
  assert.equal(grid.parent.parent, root)
  for (const box of [root, header, grid]) assert.equal(flat(box.props.style).color, undefined)
  const month = header.findByProps({ accessibilityLiveRegion: 'polite' })
  assert.equal(flat(month.props.style).color, color('hozo-text-subtle'))
  assert.equal(flat(month.props.style).fontSize, 14)
  assert.equal(String(flat(month.props.style).fontWeight), '700')
  const weekday = grid.findAllByType('NativeText')[0]
  assert.equal(flat(weekday.props.style).fontSize, 18)
  assert.equal(flat(weekday.props.style).color, color('hozo-accent'))
  assert.equal(flat(calendarDays(tree)[0].props.children.props.style).fontSize, 18)
  assert.equal(flat(calendarDays(tree)[0].props.children.props.style).color, '#abcdef')
  for (const row of grid.findAllByType('NativeView').slice(1)) {
    assert.equal(flat(row.props.style).flexDirection, 'row')
    assert.equal(flat(row.props.style).paddingTop, undefined, 'do not repeat grid padding')
  }
})

test('Native Calendar chrome preserves explicit styles and clears removed classes', async (t) => {
  const props = {
    ...calendarProps,
    className: 'p-2 text-hozo-accent',
    headerClassName: 'p-3 text-sm',
    gridClassName: 'p-4 text-lg',
    style: { paddingTop: 81, color: '#112233' },
    headerStyle: { paddingTop: 82, fontSize: 21 },
    weekStyle: { paddingTop: 83 },
  }
  const tree = await mount(t, HozoCalendar, props)
  assert.equal(flat(views(tree)[0].props.style).paddingTop, 81)
  assert.equal(flat(views(tree)[0].props.style).paddingBottom, 8)
  const month = tree.root.findByProps({ accessibilityLiveRegion: 'polite' })
  assert.equal(flat(month.props.style).fontSize, 21)
  assert.equal(flat(month.props.style).color, '#112233')
  assert.equal(flat(calendarDays(tree)[0].props.children.props.style).fontSize, 18)
  await act(() => tree.update(React.createElement(HozoCalendar, calendarProps)))
  assert.equal(flat(views(tree)[0].props.style).paddingTop, undefined)
  assert.equal(
    flat(tree.root.findByProps({ accessibilityLiveRegion: 'polite' }).props.style).fontSize,
    undefined,
  )
  assert.equal(flat(calendarDays(tree)[0].props.children.props.style).fontSize, undefined)
})

test('the UI Calendar supplies its real chrome classes to Native owners', async (t) => {
  const tree = await mount(t, UiCalendar, { ...calendarProps, renderDay: () => null })
  assert.equal(flat(views(tree)[0].props.style).paddingTop, 16)
  const month = tree.root.findByProps({ accessibilityLiveRegion: 'polite' })
  assert.equal(flat(month.props.style).fontSize, 14)
  assert.equal(String(flat(month.props.style).fontWeight), '600')
  const header = month.parent.parent
  assert.equal(flat(header.props.style).flexDirection, 'row')
  const grid = views(tree).find((node) => flat(node.props.style).width === '100%')
  assert.ok(grid, 'real gridClassName is not lost')
  assert.equal(grid.findAllByType('NativeView').length, 8, 'one grid and seven week rows')
  for (const button of calendarMonthButtons(tree)) {
    assert.equal(flat(button.props.style).width, 36)
    assert.equal(flat(button.props.style).height, 36)
    assert.equal(flat(button.props.children.props.style).color, color('hozo-text-muted'))
    assert.equal(flat(button.props.children.props.style).fontSize, 14)
  }
})

test('Native Calendar wraps primitive custom day labels in the same Text as its default', async (t) => {
  for (const renderDay of [
    undefined,
    (day) => day.date.day,
    (day) => `Day ${day.date.day}`,
    () => 0,
    () => '',
  ]) {
    let calls = 0
    const tree = await mount(t, HozoCalendar, {
      ...calendarProps,
      dayTextStyle: { color: '#123456', fontSize: 18 },
      renderDay:
        renderDay &&
        ((day) => {
          calls++
          return renderDay(day)
        }),
    })
    const days = calendarDays(tree)
    assert.equal(days.length, 42)
    for (const day of days) {
      const child = day.props.children
      assert.ok(React.isValidElement(child), 'Native day host must not receive raw text')
      assert.equal(child.type, NativeText)
      assert.equal(flat(child.props.style).color, '#123456')
      assert.equal(flat(child.props.style).fontSize, 18)
    }
    assert.equal(calls, renderDay ? 42 : 0, 'evaluate the custom renderer once per cell')
    if (renderDay) {
      const expected = renderDay({ date: { day: 31 } })
      if (typeof expected === 'number' && expected === 0)
        assert.equal(days[0].props.children.props.children, 0)
      if (expected === '') assert.equal(days[0].props.children.props.children, '')
    }
  }
})

test('Native Calendar leaves custom layout elements and absent day content alone', async (t) => {
  for (const content of [
    null,
    false,
    React.createElement(
      NativeView,
      { testID: 'custom-day' },
      React.createElement(NativeText, null, 'Custom'),
    ),
    React.createElement(React.Fragment, null, React.createElement(NativeText, null, 'Fragment')),
  ]) {
    const tree = await mount(t, HozoCalendar, { ...calendarProps, renderDay: () => content })
    assert.equal(calendarDays(tree).length, 42)
    for (const day of calendarDays(tree)) assert.equal(day.props.children, content)
  }
})

test('Native Calendar primitive labels preserve accessible names, bounds and complete range commits', async (t) => {
  const changes = []
  const props = {
    ...calendarProps,
    min: { year: 2026, month: 6, day: 10 },
    max: { year: 2026, month: 6, day: 20 },
    renderDay: (day) => day.date.day,
  }
  const tree = await mount(t, HozoCalendar, { ...props, onChange: (date) => changes.push(date) })
  const days = calendarDays(tree)
  const find = (n) =>
    days.find(
      (day) =>
        day.props.children.props.children === n && day.props.accessibilityLabel.includes('June'),
    )
  const selected = find(12)
  assert.ok(selected.props.accessibilityLabel.includes('June 12, 2026'))
  await press(find(9))
  assert.deepEqual(changes, [])
  await press(selected)
  assert.deepEqual(changes, [{ year: 2026, month: 6, day: 12 }])
  const ranges = []
  const range = await mount(t, HozoCalendar, {
    ...props,
    range: true,
    onChange: (value) => ranges.push(value),
  })
  const rangeDay = (n) =>
    calendarDays(range).find(
      (day) =>
        day.props.children.props.children === n && day.props.accessibilityLabel.includes('June'),
    )
  await press(rangeDay(12))
  assert.deepEqual(ranges, [])
  await press(rangeDay(15))
  assert.deepEqual(ranges, [
    { start: { year: 2026, month: 6, day: 12 }, end: { year: 2026, month: 6, day: 15 } },
  ])
})

test('Native overlay Popover keeps root and animated panel classes on separate owners', async (t) => {
  const { tree } = await checkClassSlots(
    t,
    HozoPopover,
    { open: true, trigger: 'Show', placement: 'bottom-start', offset: 4 },
    [
      ['className', 'style', 2, (tree) => views(tree)[0]],
      ['panelClassName', 'panelStyle', 4, (tree) => tree.root.findByType('NativeAnimatedView')],
    ],
    measuredHosts,
  )
  const floating = views(tree)[1]
  assert.equal(flat(floating.props.style).left, 100)
  assert.equal(flat(floating.props.style).top, 224)
  assert.equal(flat(floating.props.style).opacity, 1)
  assert.equal(
    flat(floating.props.style).paddingTop,
    undefined,
    'panel class is not the positioner',
  )
})

for (const [name, Component, ownClass, ownStyle] of [
  ['Drawer', HozoDrawer, 'panelClassName', 'panelStyle'],
  ['BottomSheet', HozoBottomSheet, 'sheetClassName', 'sheetStyle'],
]) {
  test(`Native overlay ${name} keeps root, scrim and panel classes through its modal`, async (t) => {
    const { tree, props } = await checkClassSlots(t, Component, { open: true }, [
      ['className', 'style', 2, (tree) => views(tree)[0]],
      ['scrimClassName', 'scrimStyle', 3, scrim],
      [ownClass, ownStyle, 4, panel],
    ])
    assert.ok(
      flat(panel(tree).props.style).transform,
      'layout transform remains after caller styles',
    )
    assert.equal(tree.root.findByType('NativeModal').props.style, undefined)
    await act(() => tree.update(React.createElement(Component, { ...props, open: false })))
    assert.equal(tree.root.findAllByType('NativeModal').length, 0, 'closed modal removes its hosts')
  })
}

test('Native BottomSheet root fills its Modal and pins the sheet to the bottom with the UI root class', async (t) => {
  // @hozo/ui's root list, read from its source so the two cannot drift.
  const rootClass = readFileSync(path.join(uiRoot, 'src/bottom-sheet.tsx'), 'utf8').match(
    /^const root = '([^']+)'/m,
  )[1]
  const tree = await mount(t, HozoBottomSheet, { open: true, className: rootClass })
  const root = flat(views(tree)[0].props.style)
  assert.equal(
    root.flex,
    1,
    'the Web layer is fixed inset-0; RN drops fixed, so the root fills the Modal',
  )
  assert.equal(root.flexDirection, 'row', 'items-end is the bottom edge only in a row')
  assert.equal(root.alignItems, 'flex-end')
  assert.equal(root.justifyContent, 'center')
})

test('Native Drawer root puts the panel against the edge its UI root class names', async (t) => {
  // @hozo/ui's root lists, read from its source so the two cannot drift.
  const source = readFileSync(path.join(uiRoot, 'src/drawer.tsx'), 'utf8')
  for (const [side, justify] of [
    ['left', 'flex-start'],
    ['right', 'flex-end'],
  ]) {
    const rootClass = source.match(new RegExp(`^  ${side}: '([^']+)'`, 'm'))[1]
    const tree = await mount(t, HozoDrawer, { open: true, side, className: rootClass })
    const root = flat(views(tree)[0].props.style)
    assert.equal(root.flex, 1, `${side}: RN drops fixed, so the root fills the Modal`)
    assert.equal(root.flexDirection, 'row', `${side}: justify-* is across only in a row`)
    assert.equal(root.justifyContent, justify, side)
  }
})

test('Native Drawer and BottomSheet add the safe area to the padding of the edges they reach', async (t) => {
  t.after(() => {
    nativeInsets = { top: 0, right: 0, bottom: 0, left: 0 }
  })
  const padding = async (Component, ownClass, insets) => {
    nativeInsets = insets
    const tree = await mount(t, Component, { open: true, [ownClass]: 'p-6' })
    const style = flat(panel(tree).props.style)
    return [style.paddingTop, style.paddingBottom]
  }
  const notch = { top: 47, right: 0, bottom: 34, left: 0 }
  assert.deepEqual(await padding(HozoDrawer, 'panelClassName', notch), [71, 58], 'top and bottom')
  assert.equal(
    (await padding(HozoBottomSheet, 'sheetClassName', notch))[1],
    58,
    'the sheet stands on the bottom edge only',
  )
  assert.equal(
    (await padding(HozoBottomSheet, 'sheetClassName', notch))[0],
    24,
    'its top is not against the window',
  )
  const none = { top: 0, right: 0, bottom: 0, left: 0 }
  assert.deepEqual(await padding(HozoDrawer, 'panelClassName', none), [24, 24], 'no provider')
})

test('Native Drawer, BottomSheet and Menu keep clear of a landscape notch on the left or right', async (t) => {
  t.after(() => {
    nativeInsets = { top: 0, right: 0, bottom: 0, left: 0 }
  })
  // iPhone landscape: the notch on the left, the home indicator below.
  nativeInsets = { top: 0, right: 0, bottom: 21, left: 59 }
  const sides = (style) => [flat(style).paddingLeft, flat(style).paddingRight]

  // The panel reaches its own edge and no other, so only that edge is padded.
  const left = await mount(t, HozoDrawer, { open: true, panelClassName: 'p-6' })
  assert.deepEqual(sides(panel(left).props.style), [83, 24], 'a left drawer pads the left')
  const right = await mount(t, HozoDrawer, { open: true, side: 'right', panelClassName: 'p-6' })
  assert.deepEqual(sides(panel(right).props.style), [24, 24], 'a right drawer is away from it')
  nativeInsets = { top: 0, right: 59, bottom: 21, left: 0 }
  const turned = await mount(t, HozoDrawer, { open: true, side: 'right', panelClassName: 'p-6' })
  assert.deepEqual(
    sides(panel(turned).props.style),
    [24, 83],
    'and pads the right once it is there',
  )

  // The sheet is centred with a maximum width, so the root keeps it off both
  // insets and the sheet's own padding is left alone.
  nativeInsets = { top: 0, right: 59, bottom: 21, left: 59 }
  const sheet = await mount(t, HozoBottomSheet, { open: true, sheetClassName: 'p-6' })
  assert.deepEqual(sides(views(sheet)[0].props.style), [59, 59], 'the root clears both sides')
  assert.deepEqual(sides(panel(sheet).props.style), [24, 24], 'the sheet keeps its own padding')

  // The menu is full width, so its own box pads both sides.
  const menuTree = await mount(t, HozoMenu, {
    trigger: 'Actions',
    menuClassName: 'p-2',
    defaultOpen: true,
    items: [{ label: 'Run' }],
  })
  const menu = menuTree.root.find((node) => node.props.accessibilityRole === 'menu')
  assert.deepEqual(sides(menu.props.style), [67, 67], 'the menu pads both sides')
})

test('Native BottomSheet draws the handle bar as a box inside the handle, with or without detents', async (t) => {
  for (const detents of [[1], [0.5, 1]]) {
    const tree = await mount(t, HozoBottomSheet, {
      open: true,
      detents,
      handleClassName: 'p-2',
      handleBarClassName: 'p-3',
      handleBarStyle: { opacity: 0.5 },
    })
    const handle = tree.root
      .findAll((node) => typeof node.props.onMoveShouldSetResponder === 'function')
      .at(0)
    const bars = handle.findAll(
      (node) =>
        node.type === 'NativeView' &&
        !node.props.onMoveShouldSetResponder &&
        node.props.style !== undefined,
    )
    assert.equal(bars.length, 1, `one bar for detents ${detents}`)
    assert.equal(flat(bars[0].props.style).paddingTop, 12)
    assert.equal(flat(bars[0].props.style).opacity, 0.5, 'its style comes after its classes')
  }
  const bare = await mount(t, HozoBottomSheet, { open: true, handleClassName: 'p-2' })
  const handle = bare.root.findAll(
    (node) => typeof node.props.onMoveShouldSetResponder === 'function',
  )[0]
  assert.equal(
    handle.findAll((node) => node.type === 'NativeView' && !node.props.onMoveShouldSetResponder)
      .length,
    0,
    'nothing is drawn without a bar class',
  )
})

test('Native overlay BottomSheet resolves both the plain and pressable handle owners', async (t) => {
  for (const detents of [[1], [0.5, 1]]) {
    const resizable = detents.length > 1
    const { tree } = await checkClassSlots(t, HozoBottomSheet, { open: true, detents }, [
      [
        'handleClassName',
        'handleStyle',
        5,
        (tree) =>
          tree.root
            .findAllByType(resizable ? 'NativePressable' : 'NativeView')
            .find((node) => node.props.onMoveShouldSetResponder),
      ],
    ])
    const handle = tree.root
      .findAllByType(resizable ? 'NativePressable' : 'NativeView')
      .find((node) => node.props.onMoveShouldSetResponder)
    assert.equal(handle.props.accessibilityRole, resizable ? 'button' : undefined)
  }
})

test('Native overlay Dialog styles the uncombined content, not the Modal host', async (t) => {
  const { tree } = await checkClassSlots(t, Dialog, { open: true }, [
    ['className', 'style', 2, panel],
  ])
  assert.equal(panel(tree).props.accessible, false)
  assert.equal(tree.root.findByType('NativeModal').props.style, undefined)
})

test('Native overlay Tooltip carries classes through the real positioner with and without Portal', async (t) => {
  const Probe = (props) =>
    React.createElement(
      Tooltip,
      props,
      React.createElement(NativeView, { testID: 'tooltip-anchor' }),
    )
  const floating = (tree) => views(tree).find((node) => node.props.testID !== 'tooltip-anchor')
  for (const portal of [false, true]) {
    const { tree, props } = await checkClassSlots(
      t,
      Probe,
      { open: true, portal, content: 'Help', placement: 'bottom-start', offset: 4 },
      [['className', 'style', 6, floating]],
      measuredHosts,
    )
    assert.equal(flat(floating(tree).props.style).left, 100)
    assert.equal(flat(floating(tree).props.style).top, 224)
    assert.equal(flat(floating(tree).props.style).opacity, 1)
    assert.equal(
      flat(views(tree)[0].props.style).paddingTop,
      undefined,
      'trigger is not the tooltip',
    )
    await act(() => tree.update(React.createElement(Probe, { ...props, open: false })))
    assert.equal(views(tree).length, 1, 'only the anchor remains')
  }
  // No PortalProvider is installed: portal=true exercises the real Portal's
  // documented inline fallback, not relocation to another native host tree.
})

test('Native overlay Slider keeps track, fill and thumb classes alongside value geometry', async (t) => {
  const thumb = (tree) => views(tree).find((node) => node.props.accessibilityRole === 'adjustable')
  const fill = (tree) => views(tree).find((node) => node.props.accessibilityElementsHidden)
  const { tree, props } = await checkClassSlots(t, HozoSlider, { value: 25 }, [
    ['className', 'style', 2, (tree) => views(tree)[0]],
    ['fillClassName', 'fillStyle', 3, fill],
    ['thumbClassName', 'thumbStyle', 4, thumb],
  ])
  assert.equal(flat(fill(tree).props.style).width, '25%')
  assert.equal(flat(thumb(tree).props.style).start, '25%')
  await act(() =>
    tree.update(
      React.createElement(HozoSlider, {
        ...props,
        value: 75,
        disabled: true,
        orientation: 'vertical',
        thumbClassName: `${props.thumbClassName} aria-disabled:opacity-25`,
      }),
    ),
  )
  assert.equal(flat(fill(tree).props.style).height, '75%')
  assert.equal(flat(thumb(tree).props.style).bottom, '75%')
  assert.equal(flat(thumb(tree).props.style).opacity, 0.25)
  assert.equal(flat(thumb(tree).props.style).paddingTop, 16)
})

test('Native slider thumbs own focus for runtime and compiled ColorPicker slots', async (t) => {
  const classes =
    'p-4 focus:outline-4 focus-visible:opacity-75 aria-disabled:border-4 disabled:mt-8 enabled:mb-8'
  for (const Component of [HozoSlider, HozoColorPicker, CompiledThumbPicker]) {
    const changes = []
    const props = {
      accessibilityLabel: 'Value',
      alpha: true,
      thumbClassName: classes,
      onChange: (value) => changes.push(value),
      onValueChange: (value) => changes.push(value),
    }
    const tree = await mount(t, Component, props)
    const thumbs = () => views(tree).filter((node) => node.props.accessibilityRole === 'adjustable')
    assert.equal(thumbs().length, Component === HozoSlider ? 1 : 4)
    const box = (index = 0) => flat(thumbs()[index].props.style)
    assert.equal(thumbs()[0].props.focusable, true)
    assert.equal(box().paddingTop, 16, 'caller resting class follows compiled p-2')
    assert.equal(box().outlineWidth, undefined)
    await act(() => thumbs()[0].props.onFocus({}))
    assert.equal(box().outlineWidth, Component === CompiledThumbPicker ? 2 : 4)
    assert.equal(box().opacity, 0.75)
    if (thumbs().length > 1)
      assert.equal(box(1).outlineWidth, undefined, 'another slider does not borrow focus')
    assert.equal(changes.length, 0, 'focus does not edit the value')
    await act(() => thumbs()[0].props.onBlur({}))
    assert.equal(box().outlineWidth, undefined)
    await act(() => thumbs()[0].props.onFocus({}))
    await act(() => tree.update(React.createElement(Component, { ...props, disabled: true })))
    assert.equal(thumbs()[0].props.focusable, false)
    assert.equal(typeof thumbs()[0].props.onFocus, 'function')
    assert.equal(box().outlineWidth, Component === CompiledThumbPicker ? 2 : 4)
    assert.equal(box().opacity, 0.75, 'aria-disabled alone does not invent blur')
    assert.equal(box().borderTopWidth, 4, 'aria-disabled describes the actual slider div')
    assert.equal(box().marginTop, undefined, ':disabled does not match a div')
    assert.equal(box().marginBottom, undefined, ':enabled does not match a div either')
    await act(() =>
      thumbs()[0].props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }),
    )
    assert.equal(changes.length, 0, 'disabled accessibility actions remain guarded')
    await act(() => thumbs()[0].props.onBlur({}))
    assert.equal(box().outlineWidth, undefined)
    assert.equal(box().opacity, undefined)
    await act(() => tree.update(React.createElement(Component, props)))
    assert.equal(
      box().outlineWidth,
      undefined,
      're-enabling must not invent focus after a real blur',
    )
    await act(() =>
      tree.update(
        React.createElement(Component, { ...props, thumbStyle: { opacity: 0.9, outlineWidth: 7 } }),
      ),
    )
    await act(() => thumbs()[0].props.onFocus({}))
    assert.equal(box().opacity, 0.9)
    assert.equal(box().outlineWidth, 7, 'explicit thumb style stays last')
    const slider = tree.root.findAllByType(HozoSlider)[0]
    const track = slider.findAllByType('NativeView')[0]
    assert.equal(track.props.pointerEvents, 'box-only')
    assert.equal(track.props.accessible, false)
    await act(() => track.props.onLayout({ nativeEvent: { layout: { width: 100, height: 10 } } }))
    await act(() => track.props.onResponderGrant({ nativeEvent: { locationX: 50, locationY: 5 } }))
    await act(() => track.props.onResponderRelease({}, { dx: 0, dy: 0 }))
    assert.ok(changes.length > 0, 'the track still owns pan/value changes')
    const afterPan = changes.length
    await act(() =>
      thumbs()[0].props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }),
    )
    assert.ok(changes.length > afterPan, 'enabled adjustable actions remain connected')
  }
})

test('Native UI ColorPicker marker contrast follows each value without borrowing thumb focus', async (t) => {
  for (const dark of [false, true]) {
    nativeDark = dark
    const props = { accessibilityLabel: 'Contrast', alpha: true, value: '#ffffff' }
    const tree = await mount(t, UiColorPicker, props)
    const thumbs = () => views(tree).filter((node) => node.props.accessibilityRole === 'adjustable')
    const style = (at) => flat(thumbs()[at].props.style)
    const border = (at) => style(at).borderTopColor ?? style(at).borderColor
    const black = (color) => ['#000', '#000000', 'black'].includes(color)
    const white = (color) => ['#fff', '#ffffff', 'white'].includes(color)
    assert.equal(thumbs().length, 4)
    assert.ok(black(border(1)), JSON.stringify(style(1)))
    assert.ok(white(style(1).outlineColor), JSON.stringify(style(1)))
    assert.equal(style(1).outlineWidth, 1)
    await act(() => thumbs()[1].props.onFocus({}))
    assert.equal(style(1).outlineWidth, 2, 'compiled focus styling remains on its actual thumb')
    assert.equal(style(2).outlineWidth, 1, 'an adjacent thumb keeps only its contrasting edge')
    await act(() =>
      tree.update(React.createElement(UiColorPicker, { ...props, value: '#00000080' })),
    )
    assert.ok(white(border(1)), JSON.stringify(style(1)))
    assert.equal(style(1).outlineWidth, 2, 'a color update does not remove focus')
    assert.ok(white(border(3)), 'alpha retains a light/dark edge over an unknown backdrop')
    assert.ok(black(style(3).outlineColor))
    await act(() => thumbs()[1].props.onBlur({}))
    assert.equal(style(1).outlineWidth, 1)
  }
  nativeDark = false
})

test('Native overlay ColorPicker applies root, swatch, input and nested slider class slots', async (t) => {
  const sliders = (tree) => tree.root.findAllByType(HozoSlider)
  const radios = (tree) => tree.root.findAllByType('NativePressable')
  await checkClassSlots(
    t,
    HozoColorPicker,
    {
      accessibilityLabel: 'Colour',
      alpha: true,
      presets: ['#ff0000', '#0000ff'],
      value: '#ff0000',
    },
    [
      ['className', 'style', 2, (tree) => views(tree)[0]],
      [
        'sliderClassName',
        'sliderStyle',
        3,
        (tree) => sliders(tree).map((node) => node.findAllByType('NativeView')[0]),
      ],
      ['swatchClassName', 'swatchStyle', 4, (tree) => radios(tree)[1]],
      ['selectedSwatchClassName', 'selectedSwatchStyle', 5, (tree) => radios(tree)[0]],
      ['inputClassName', 'inputStyle', 6, (tree) => tree.root.findByType('NativeTextInput')],
      [
        'thumbClassName',
        'thumbStyle',
        7,
        (tree) => views(tree).filter((node) => node.props.accessibilityRole === 'adjustable'),
      ],
    ],
  )
})

test('Native overlay CommandPalette applies every container and label slot, including empty results', async (t) => {
  const item = (tree, label) =>
    tree.root
      .findAllByType('NativePressable')
      .find((node) => node.props.accessibilityLabel === label)
  const { tree, props, override, explicit } = await checkClassSlots(
    t,
    HozoCommandPalette,
    {
      open: true,
      commands: ['Alpha', 'Beta'].map((label) => ({
        id: label,
        label,
        group: 'Actions',
        shortcut: label[0],
        onSelect: () => {},
      })),
    },
    [
      ['className', 'style', 2, (tree) => views(tree)[0]],
      ['scrimClassName', 'scrimStyle', 3, scrim],
      ['panelClassName', 'panelStyle', 4, panel],
      ['inputClassName', 'inputStyle', 5, (tree) => tree.root.findByType('NativeTextInput')],
      ['listClassName', 'listStyle', 6, (tree) => tree.root.findByType('NativeScrollView')],
      [
        'groupHeadingClassName',
        'groupHeadingStyle',
        7,
        (tree) =>
          tree.root
            .findAllByType('NativeText')
            .find((node) => node.props.accessibilityRole === 'header'),
      ],
      ['itemClassName', 'itemStyle', 8, (tree) => item(tree, 'Beta')],
      ['activeItemClassName', 'activeItemStyle', 9, (tree) => item(tree, 'Alpha')],
      [
        'shortcutClassName',
        'shortcutStyle',
        10,
        (tree) => item(tree, 'Alpha').findByType('NativeView'),
      ],
    ],
  )
  for (const [target, initial, top] of [
    [tree, props, 48],
    [override, explicit, 123],
  ]) {
    await act(() =>
      target.update(
        React.createElement(HozoCommandPalette, {
          ...initial,
          emptyClassName: 'p-12',
          emptyStyle: top === 123 ? { paddingTop: top } : undefined,
        }),
      ),
    )
    await act(() =>
      target.root.findByType('NativeTextInput').props.onChangeText('no matching command'),
    )
    assert.equal(target.root.findAllByType('NativeText').length, 1)
    const empty = target.root.findByType('NativeText')
    assert.equal(flat(empty.props.style).paddingTop, top)
    assert.equal(flat(empty.props.style).paddingBottom, 48)
  }
})

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

// #974. A Text a caller nests in the label reads the pattern's state the
// way it would inside the primitive's pressable: through the shared context
// `HozoText` reads, so a component's `hover:` text classes reach it.
test('a Text nested in a Native checkbox or switch label reads its pressable state', async (t) => {
  const seen = []
  const Label = () => {
    const state = React.useContext(HozoInteractionContext)
    seen.push(state)
    return React.createElement('NativeText', null, 'Updates')
  }
  for (const Component of [HozoCheckbox, HozoSwitch]) {
    seen.length = 0
    let tree
    await act(() => {
      tree = create(React.createElement(Component, {}, React.createElement(Label)))
    })
    t.after(async () => {
      await act(() => tree.unmount())
    })
    const host = () => tree.root.findByType('NativePressable')
    assert.deepEqual(seen.at(-1), {
      pressed: false,
      hovered: false,
      focused: false,
      focusVisible: false,
    })
    await act(() => host().props.onHoverIn({}))
    assert.equal(seen.at(-1)?.hovered, true, 'hovered')
    await act(() => host().props.onHoverOut({}))
    await act(() => host().props.onKeyDown({}))
    await act(() => host().props.onFocus({}))
    assert.equal(seen.at(-1)?.focusVisible, true, 'focused from the keyboard')
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
    itemClassName: `${interactionClasses} aria-disabled:opacity-25 disabled:mt-8`,
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
  assert.equal(flat(hosts()[3].props.style).opacity, 0.25)
  assert.equal(
    flat(hosts()[3].props.style).marginTop,
    undefined,
    'the Web item is not a form control',
  )
  await press(hosts()[3])
  assert.deepEqual(selected, [])
  assert.equal(hosts().length, 4, 'disabled selection does not dismiss')
  await press(hosts()[2])
  assert.deepEqual(selected, ['run'])
  assert.equal(hosts().length, 1)
})

test('Native Menu sheet clears the bottom safe area its provider reports, after its own padding', async (t) => {
  const sheet = async (insets) => {
    nativeInsets = insets
    t.after(() => {
      nativeInsets = { top: 0, right: 0, bottom: 0, left: 0 }
    })
    const tree = await mount(t, HozoMenu, {
      trigger: 'Actions',
      menuClassName: 'p-2',
      defaultOpen: true,
      items: [{ label: 'Run' }, { label: 'Delete' }],
    })
    const menu = tree.root.find((node) => node.props.accessibilityRole === 'menu')
    const spacer = menu
      .findAll((node) => node.props.importantForAccessibility === 'no-hide-descendants')
      .at(-1)
    return { padding: flat(menu.props.style).paddingBottom, spacer }
  }
  const inset = await sheet({ top: 47, right: 0, bottom: 34, left: 0 })
  assert.equal(inset.padding, 8, "the class's padding is kept")
  assert.equal(flat(inset.spacer.props.style).height, 34, 'and the inset is added below it')
  const none = await sheet({ top: 0, right: 0, bottom: 0, left: 0 })
  assert.equal(flat(none.spacer.props.style).height, 0, 'no provider, no inset')
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
    optionClassName: interactionClasses
      .split(' ')
      .filter((name) => !name.startsWith('focus:') && !name.startsWith('focus-visible:'))
      .join(' '),
    onValueChange: (value) => selected.push(value),
  })
  const input = () => tree.root.findByType('NativeTextInput')
  const hosts = () => tree.root.findAllByType('NativePressable')
  await act(() => input().props.onFocus({}))
  assert.equal(hosts().length, 0, 'as on Web, focus alone does not open a filtered popup')
  await act(() => input().props.onChangeText(''))
  await checkInteraction(tree, 0, false)
  assert.deepEqual(selected, [])
  assert.equal(input().props.value, '')
  assert.equal(input().props.accessibilityState.expanded, true)
  await press(hosts()[2])
  assert.equal(hosts()[2].props.disabled, true)
  assert.deepEqual(selected, [])
  await act(() => input().props.onChangeText('Be'))
  assert.equal(hosts().length, 1)
  assert.equal(hosts()[0].findByType('NativeText').children.join(''), 'Beta')
  await checkInteraction(tree, 0, false)
  await press(hosts()[0])
  assert.deepEqual(selected, ['b'])
  assert.equal(input().props.value, 'Beta')
  assert.equal(input().props.accessibilityState.expanded, false)
  assert.equal(hosts().length, 0)
})

test('compiled UI Combobox keeps placeholder, validation, input focus and active-option looks on their real owners', async (t) => {
  t.after(() => {
    nativeDark = false
  })
  const props = {
    options: [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ],
    accessibilityLabel: 'Language',
    placeholder: 'Choose a language',
  }
  const token = (name) => theme.colors.find((entry) => entry.token === name)
  for (const dark of [false, true]) {
    nativeDark = dark
    const expected = (name) => (dark ? token(name).dark.hex : token(name).hex)
    const tree = await mount(t, UiCombobox, props)
    const input = () => tree.root.findByType('NativeTextInput')
    assert.equal(input().props.placeholderTextColor, expected('hozo-text-subtle'))
    assert.equal(flat(input().props.style).color, expected('hozo-text'))
    assert.equal(flat(input().props.style).borderColor, expected('hozo-border-strong'))
    await act(() =>
      tree.update(React.createElement(UiCombobox, { ...props, 'aria-invalid': true })),
    )
    assert.equal(flat(input().props.style).borderColor, expected('hozo-danger'))
    await act(() =>
      tree.update(React.createElement(UiCombobox, { ...props, 'aria-invalid': 'grammar' })),
    )
    assert.equal(flat(input().props.style).borderColor, expected('hozo-border-strong'))
    await act(() => input().props.onFocus({}))
    assert.equal(flat(input().props.style).outlineWidth, 2)
    await act(() => input().props.onChangeText(''))
    const options = () => tree.root.findAllByType('NativePressable')
    assert.equal(options().length, 2)
    assert.equal(flat(options()[0].props.style).outlineWidth, undefined)
    await act(() => input().props.onKeyPress({ nativeEvent: { key: 'ArrowDown' } }))
    assert.equal(options()[0].props.accessibilityState.selected, true)
    assert.equal(flat(options()[0].props.style).outlineWidth, 2)
    assert.equal(flat(options()[1].props.style).outlineWidth, undefined)
    assert.equal(flat(input().props.style).outlineWidth, 2)
    await act(() => input().props.onBlur({}))
    assert.equal(options().length, 0)
    assert.equal(flat(input().props.style).outlineWidth, undefined)
  }
})

test('compiled UI Listbox bounds the real scroller and puts child layout on its content', async (t) => {
  const props = {
    accessibilityLabel: 'Delivery',
    options: [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ],
    className: 'p-3',
  }
  const tree = await mount(t, UiListbox, props)
  const scroll = () => tree.root.findByType('NativeScrollView')
  assert.equal(scroll().props.accessibilityRole, 'list')
  assert.equal(flat(scroll().props.style).maxHeight, 240)
  assert.equal(flat(scroll().props.style).paddingTop, undefined)
  assert.equal(flat(scroll().props.style).gap, undefined)
  assert.equal(flat(scroll().props.contentContainerStyle).paddingTop, 12)
  assert.equal(flat(scroll().props.contentContainerStyle).paddingRight, 12)
  assert.equal(flat(scroll().props.contentContainerStyle).gap, undefined)
  assert.equal(flat(scroll().props.contentContainerStyle).rowGap, 4)
  assert.equal(flat(scroll().props.contentContainerStyle).columnGap, 4)
  assert.equal(scroll().props.horizontal, false)
  assert.equal(scroll().props.keyboardShouldPersistTaps, 'handled')
  assert.equal(tree.root.findAllByType('NativePressable').length, 2)
  // #1056 composes the wrapper's caller spread with its compiled defaults.
  // Keep the bounded scroller when only one content property is overridden.
  const styled = await mount(t, UiListbox, {
    ...props,
    style: { paddingTop: 19, marginTop: 7, overflow: 'hidden', gap: 16 },
  })
  const styledOwner = styled.root.findByType('NativeScrollView')
  assert.equal(flat(styledOwner.props.style).maxHeight, 240)
  assert.equal(flat(styledOwner.props.style).marginTop, 7)
  assert.equal(flat(styledOwner.props.contentContainerStyle).paddingTop, 19)
  assert.equal(flat(styledOwner.props.contentContainerStyle).paddingRight, 12)
  assert.equal(flat(styledOwner.props.contentContainerStyle).gap, undefined)
  assert.equal(flat(styledOwner.props.contentContainerStyle).rowGap, 16)
  assert.equal(flat(styledOwner.props.contentContainerStyle).columnGap, 16)
  assert.equal(styledOwner.props.scrollEnabled, false)
  const explicit = await mount(t, HozoListbox, {
    options: props.options,
    hozoScrollY: true,
    style: [
      { maxHeight: 240, padding: 4, gap: 4 },
      { paddingTop: 19, marginTop: 7, overflow: 'hidden' },
    ],
  })
  const owner = explicit.root.findByType('NativeScrollView')
  assert.equal(flat(owner.props.style).maxHeight, 240)
  assert.equal(flat(owner.props.style).marginTop, 7)
  assert.equal(flat(owner.props.contentContainerStyle).paddingTop, 19)
  assert.equal(
    owner.props.scrollEnabled,
    false,
    'an explicit overflow override still wins at the owner',
  )
})

test('compiled UI Combobox scrolls only the popup list, not the editable field', async (t) => {
  const tree = await mount(t, UiCombobox, {
    options: [{ value: 'a', label: 'Alpha' }],
    accessibilityLabel: 'Language',
  })
  assert.equal(tree.root.findAllByType('NativeScrollView').length, 0)
  await act(() => tree.root.findByType('NativeTextInput').props.onChangeText(''))
  const list = tree.root.findByType('NativeScrollView')
  assert.equal(list.props.accessibilityRole, 'list')
  assert.equal(flat(list.props.style).maxHeight, 240)
  assert.equal(flat(list.props.contentContainerStyle).gap, undefined)
  assert.equal(flat(list.props.contentContainerStyle).rowGap, 4)
  assert.equal(flat(list.props.contentContainerStyle).columnGap, 4)
  assert.equal(
    tree.root.findByType('NativeTextInput').props.placeholderTextColor,
    color('hozo-text-subtle'),
  )
})

test('compiled UI Dialog separates backdrop, viewport bound and scroll-content padding in both palettes', async (t) => {
  t.after(() => {
    nativeDark = false
    nativeViewport = { width: 400, height: 800 }
  })
  for (const dark of [false, true]) {
    nativeDark = dark
    nativeViewport = { width: 400, height: 800 }
    const props = {
      open: true,
      onClose: () => {},
      accessibilityLabel: 'Confirm',
      testID: 'ui-dialog',
    }
    const tree = await mount(t, UiDialog, props)
    const panel = () => tree.root.findByType('NativeScrollView')
    assert.equal(flat(panel().props.style).maxHeight, 680)
    assert.equal(panel().props.testID, 'ui-dialog')
    assert.equal(panel().props.accessible, false)
    assert.equal(panel().props.accessibilityViewIsModal, true)
    assert.equal(flat(panel().props.contentContainerStyle).paddingTop, 24)
    const frame = tree.root
      .findAllByType('NativeView')
      .find((node) => flat(node.props.style).flex === 1)
    assert.ok(frame)
    assert.equal(flat(frame.props.style).justifyContent, 'center')
    assert.match(flat(frame.props.style).backgroundColor, /^rgba\(/)
    assert.notEqual(
      flat(frame.props.style).backgroundColor,
      flat(panel().props.style).backgroundColor,
    )
    nativeViewport = { width: 800, height: 400 }
    await act(() => tree.update(React.createElement(UiDialog, props)))
    assert.equal(flat(panel().props.style).maxHeight, 340, 'rotation recomputes the bound')
  }
})

test('compiled UI CommandPalette uses its Modal viewport and real search/list owners', async (t) => {
  nativeViewport = { width: 400, height: 800 }
  t.after(() => {
    nativeViewport = { width: 400, height: 800 }
  })
  const props = {
    open: true,
    accessibilityLabel: 'Commands',
    commands: [{ id: 'open', label: 'Open', onSelect: () => {} }],
  }
  const tree = await mount(t, UiCommandPalette, props)
  const frame = () =>
    tree.root
      .findAllByType('NativeView')
      .find((node) => flat(node.props.style).position === 'absolute')
  assert.ok(frame())
  assert.equal(flat(frame().props.style).paddingTop, 96)
  const input = tree.root.findByType('NativeTextInput')
  assert.equal(input.props.placeholderTextColor, color('hozo-text-subtle'))
  const list = tree.root.findByType('NativeScrollView')
  assert.equal(flat(list.props.style).maxHeight, 320)
  assert.equal(flat(list.props.contentContainerStyle).paddingTop, 8)
  nativeViewport = { width: 400, height: 1000 }
  await act(() => tree.update(React.createElement(UiCommandPalette, props)))
  assert.equal(flat(frame().props.style).paddingTop, 120)
})

// #1143: a press selects, and opens or closes a branch too -- the Web half's
// behaviour. This half used to toggle a branch and never select it.
test('Native Tree: a press selects a row and opens or closes a branch', async (t) => {
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
  assert.deepEqual(selected, ['folder'])
  await press(hosts()[1])
  assert.deepEqual(selected, ['folder', 'leaf'])
  await press(hosts()[0])
  assert.equal(hosts().length, 2)
  assert.deepEqual(selected, ['folder', 'leaf', 'folder'])
  assert.equal(hosts()[0].props.accessibilityActions, undefined)
})

test('Native Tree with toggleOn="marker": the row selects, and the marker or an action toggles', async (t) => {
  const selected = []
  const tree = await mount(t, HozoTree, {
    nodes: [{ id: 'folder', label: 'Folder', children: [{ id: 'leaf', label: 'Leaf' }] }],
    toggleOn: 'marker',
    rowLook: ({ branch }) => ({
      indentClassName: 'flex-row',
      markerClassName: branch ? 'size-6' : 'size-2',
    }),
    onSelect: (id) => selected.push(id),
  })
  const rows = () =>
    tree.root.findAllByType('NativePressable').filter((node) => node.props.accessibilityRole)
  const markers = () =>
    tree.root.findAllByType('NativePressable').filter((node) => !node.props.accessibilityRole)
  await press(rows()[0])
  assert.deepEqual(selected, ['folder'])
  assert.equal(rows().length, 1, 'a row press opened the branch')
  assert.equal(markers()[0].props.accessible, false)
  await press(markers()[0])
  assert.equal(rows().length, 2, 'the marker did not open the branch')
  assert.deepEqual(selected, ['folder'], 'the marker also selected')
  // The marker is hidden from a screen reader, so the row offers the action.
  assert.deepEqual(rows()[0].props.accessibilityActions, [{ name: 'collapse' }])
  await act(() =>
    rows()[0].props.onAccessibilityAction({ nativeEvent: { actionName: 'collapse' } }),
  )
  assert.equal(rows().length, 1)
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
  const frames = new Map()
  let frame = 0
  const oldFrame = globalThis.requestAnimationFrame
  const oldCancel = globalThis.cancelAnimationFrame
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++frame, callback)
    return frame
  }
  globalThis.cancelAnimationFrame = (id) => frames.delete(id)
  t.after(() => {
    globalThis.requestAnimationFrame = oldFrame
    globalThis.cancelAnimationFrame = oldCancel
  })
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
  assert.equal(travel(), 200, 'drag movement waits for the animation frame')
  await act(() => {
    const callbacks = [...frames.values()]
    frames.clear()
    for (const callback of callbacks) callback()
  })
  assert.equal(travel(), 0, 'shared pressable forwards the existing responder handlers')
  await act(() => handle().props.onResponderRelease({}, { dy: -200, vy: 0 }))
  assert.equal(travel(), 0, 'release keeps the final detent')
  assert.equal(frames.size, 0)
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
      // The mark, then the description box: the label and description are the
      // step row's own children, with no column between them (#1205).
      return [
        [views[0], texts[0]],
        [views[1], texts[2]],
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
  // The description box follows the mark directly in the step row (#1205).
  assert.equal(flat(hosts()[1].findAllByType('NativeView')[1].props.style).opacity, 0.6)
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
