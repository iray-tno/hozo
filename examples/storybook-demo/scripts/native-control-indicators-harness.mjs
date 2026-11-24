// Shared Native host-render harness for `native-control-indicators-*.test.mjs`.
// No browser, GPU, Metro or device is launched here. Execute the real UI
// and Native patterns with React state and a real themed candidate module.
// Only the Native hosts are stand-ins; do not hand-copy a control's styles.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { loadTheme } from '@hozo/tailwind'
import { build, transformSync } from 'esbuild'
import React, { act } from 'react'
import { create } from 'react-test-renderer'
import * as classResolverRuntime from '../../../packages/engine/src/generated/class-resolver.ts'
import * as shadowRuntime from '../../../packages/engine/src/generated/shadow-slots.ts'
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
export const hostState = {
  dark: false,
  viewport: { width: 400, height: 800 },
  // What an app's `<SafeAreaProvider>` reports; zeros are an app without one.
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
  keyboardDismissals: 0,
}
const nativeI18n = { isRTL: false }
const nativePlatform = { OS: 'ios' }
const actionSheets = []
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
    if (id === '@hozo/core/generated/shadow-slots') return shadowRuntime
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

const NativeView = (props) => React.createElement('NativeView', props, props.children)
const NativeText = (props) => React.createElement('NativeText', props, props.children)
const NativeTextInput = (props) => React.createElement('NativeTextInput', props)
const NativeScrollView = (props) => React.createElement('NativeScrollView', props, props.children)
const NativeModal = ({ visible, ...props }) =>
  visible ? React.createElement('NativeModal', props, props.children) : null
const announcements = []
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
        Keyboard: { dismiss: () => hostState.keyboardDismissals++ },
        I18nManager: nativeI18n,
        Pressable: NativePressable,
        StyleSheet: { flatten: flat, create: (styles) => styles },
        // The floating positioner's flip/shift bounds; a phone-sized window,
        // large enough that no fixture here flips or shifts.
        useWindowDimensions: () => ({ width: 400, height: 800, scale: 1, fontScale: 1 }),
      }
    if (name === '@hozo/core/generated/environment')
      return { useHozoDark: () => hostState.dark, useHozoViewport: () => hostState.viewport }
    // No transition table: these probes read resting looks, so every control
    // indicator part is the plain View it is without motion.
    if (name === '@hozo/engine/project') return { hozoClasses, hozoClassTransitions: {} }
    if (name === '@hozo/engine/generated/animated') return { HozoAnimated: NativeView }
    if (name === '@hozo/engine/generated/environment') return { useHozoEnvironment: () => false }
    if (name === '@hozo/engine/generated/safe-area')
      return { useHozoProvidedSafeArea: () => hostState.insets }
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

export {
  actionSheets,
  activeCommandSemanticClasses,
  announcements,
  CheckboxPattern,
  CompiledThumbPicker,
  checkBoxInteraction,
  checkClassSlots,
  checkInteraction,
  color,
  commandSemanticClasses,
  Dialog,
  dialogUnmeasuredClass,
  fileZoneClasses,
  flat,
  HozoAccordion,
  HozoBottomSheet,
  HozoCalendar,
  HozoCheckbox,
  HozoChip,
  HozoColorPicker,
  HozoCombobox,
  HozoCommandPalette,
  HozoDatePicker,
  HozoDateTimePicker,
  HozoDrawer,
  HozoFileDropzone,
  HozoForm,
  HozoInteractionContext,
  HozoListbox,
  HozoMenu,
  HozoNativeSelect,
  HozoNavigationProvider,
  HozoOtpInput,
  HozoPagination,
  HozoPopover,
  HozoRadioGroup,
  HozoSlider,
  HozoStepper,
  HozoSwitch,
  HozoTabs,
  HozoTextArea,
  HozoTimePicker,
  HozoTree,
  hiddenPeriodClass,
  hozoClasses,
  indicators,
  interactionClasses,
  measuredHosts,
  moduleSource,
  mount,
  NativeCanonicalPressable,
  NativeOwnerLink,
  NativeOwnerPressable,
  NativePressable,
  NativeSelectProvider,
  NativeText,
  NativeView,
  nativeI18n,
  nativePlatform,
  openedURLs,
  otpCellFocusClasses,
  otpSemanticClasses,
  otpUnsupportedFocusClasses,
  panel,
  pickerCases,
  press,
  RadioPattern,
  resolverFor,
  SwitchPattern,
  scrim,
  selectedSwatchSemanticClasses,
  shortcutSemanticClasses,
  swatchSemanticClasses,
  Tooltip,
  theme,
  timeActiveUnmeasuredClass,
  timeStepClasses,
  timeValueClasses,
  UiAccordion,
  UiCalendar,
  UiColorPicker,
  UiCombobox,
  UiCommandPalette,
  UiDateTimePicker,
  UiDialog,
  UiFileDropzone,
  UiForm,
  UiListbox,
  UiNativeSelect,
  UiTextArea,
  UiTimePicker,
  UiTree,
  uiRoot,
  useFormSubmit,
  usePressableInteraction,
  views,
  withoutClock,
}
