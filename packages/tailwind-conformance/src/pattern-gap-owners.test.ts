// Real Native pattern sources with stand-in RN hosts; selected gap values are
// laid out by upstream Yoga, not a claim about widget/device pixels or events.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { after, mock, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { gapLayouts, yogaGapGeometry } from './gap-alias-reference.ts'
import { loadNativeModule } from './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')
const names = 'gap-y-[8px] gap-x-[4px]'
const interactionNames =
  'gap-y-[8px] gap-x-[2px] hover:gap-x-[4px] active:gap-y-[12px] focus:gap-y-[6px]'
const controlNames = `${interactionNames} aria-checked:gap-y-[10px] disabled:gap-x-[14px] aria-disabled:gap-x-[14px]`
const markNames =
  'gap-y-[3px] gap-x-[5px] aria-checked:gap-y-[7px] hover:gap-x-[9px] disabled:gap-x-[11px]'
type Owner = {
  component: string
  classProp: string
  styleProp: string
  base?: Record<string, unknown>
  hosts?: number
  focusInput?: boolean
  marker?: string
}
const owners = [
  ['Chip', 'className', 'style'],
  ['Chip', 'removeClassName', 'removeStyle'],
  ['Listbox', 'className', 'style'],
  ['Listbox', 'optionClassName', 'optionStyle'],
  ['Menu', 'className', 'style'],
  ['Menu', 'triggerClassName', 'triggerStyle'],
  ['Menu', 'menuClassName', 'menuStyle'],
  ['Menu', 'itemClassName', 'itemStyle'],
  ['Combobox', 'className', 'style'],
  ['Combobox', 'inputClassName', 'inputStyle'],
  ['Combobox', 'listClassName', 'listStyle'],
  ['Combobox', 'optionClassName', 'optionStyle'],
  ['Tabs', 'className', 'style'],
  ['Tabs', 'tabListClassName', 'tabListStyle'],
  ['Tabs', 'tabClassName', 'tabStyle'],
  ['Tabs', 'panelClassName', 'panelStyle'],
  ['Pagination', 'className', 'style'],
  ['Pagination', 'itemClassName', 'itemStyle', undefined, 3],
  ['Pagination', 'currentItemClassName', 'currentItemStyle'],
  ['Pagination', 'disabledItemClassName', 'disabledItemStyle', undefined, 2],
  [
    'Pagination',
    'ellipsisClassName',
    'ellipsisStyle',
    { pageCount: 20, page: 10, siblingCount: 0 },
    2,
  ],
  ['Stepper', 'className', 'style'],
  ['Stepper', 'stepClassName', 'stepStyle'],
  ['Stepper', 'currentStepClassName', 'currentStepStyle'],
  [
    'Stepper',
    'completedStepClassName',
    'completedStepStyle',
    { steps: [{ label: 'Done', status: 'completed' }] },
  ],
  [
    'Stepper',
    'errorStepClassName',
    'errorStepStyle',
    { steps: [{ label: 'Error', status: 'error' }] },
  ],
  ['Stepper', 'indicatorClassName', 'indicatorStyle'],
  ['Stepper', 'currentIndicatorClassName', 'currentIndicatorStyle'],
  [
    'Stepper',
    'completedIndicatorClassName',
    'completedIndicatorStyle',
    { steps: [{ label: 'Done', status: 'completed' }] },
  ],
  [
    'Stepper',
    'errorIndicatorClassName',
    'errorIndicatorStyle',
    { steps: [{ label: 'Error', status: 'error' }] },
  ],
  ['Stepper', 'descriptionClassName', 'descriptionStyle'],
  ['Avatar', 'className', 'style'],
  ['Avatar', 'fallbackClassName', 'fallbackStyle'],
  ['Avatar', 'imageClassName', 'imageStyle', { src: 'https://example.test/avatar.png' }],
  ['Avatar', 'statusClassName', 'statusStyle'],
  ['OtpInput', 'className', 'style'],
  ['OtpInput', 'cellClassName', 'cellStyle', undefined, 2],
  ['OtpInput', 'activeCellClassName', 'activeCellStyle', undefined, 1, true],
  ['OtpInput', 'filledCellClassName', 'filledCellStyle'],
  ['OtpInput', 'inputClassName', 'inputStyle', undefined, 2, false, 'zIndex'],
  ['CommandPalette', 'className', 'style'],
  ['CommandPalette', 'scrimClassName', 'scrimStyle'],
  ['CommandPalette', 'panelClassName', 'panelStyle'],
  ['CommandPalette', 'inputClassName', 'inputStyle'],
  ['CommandPalette', 'listClassName', 'listStyle'],
  ['CommandPalette', 'groupHeadingClassName', 'groupHeadingStyle'],
  ['CommandPalette', 'itemClassName', 'itemStyle'],
  ['CommandPalette', 'activeItemClassName', 'activeItemStyle'],
  ['CommandPalette', 'shortcutClassName', 'shortcutStyle'],
  ['CommandPalette', 'emptyClassName', 'emptyStyle', { commands: [] }],
  ['Slider', 'className', 'style'],
  ['Slider', 'railClassName', 'railStyle'],
  ['Slider', 'fillClassName', 'fillStyle'],
  ['Slider', 'thumbClassName', 'thumbStyle'],
  ['ColorPicker', 'className', 'style'],
  ['ColorPicker', 'swatchClassName', 'swatchStyle', undefined, 2],
  ['ColorPicker', 'selectedSwatchClassName', 'selectedSwatchStyle'],
  ['ColorPicker', 'sliderClassName', 'sliderStyle', undefined, 3],
  ['ColorPicker', 'thumbClassName', 'thumbStyle', undefined, 3],
  ['ColorPicker', 'inputClassName', 'inputStyle'],
  ['Checkbox', 'className', 'style'],
  ['Switch', 'className', 'style'],
  ['RadioGroup', 'className', 'style'],
  ['RadioGroup', 'optionClassName', 'optionStyle', undefined, 2],
  ['Dialog', 'className', 'style'],
  ['Dialog', 'className', 'style', { hozoScrollY: true }],
  ['Popover', 'className', 'style'],
  ['Popover', 'triggerClassName', 'triggerStyle'],
  ['Popover', 'panelClassName', 'panelStyle'],
  ['Drawer', 'className', 'style'],
  ['Drawer', 'scrimClassName', 'scrimStyle'],
  ['Drawer', 'panelClassName', 'panelStyle'],
  ['BottomSheet', 'className', 'style'],
  ['BottomSheet', 'scrimClassName', 'scrimStyle'],
  ['BottomSheet', 'sheetClassName', 'sheetStyle'],
  ['BottomSheet', 'handleClassName', 'handleStyle'],
  ['BottomSheet', 'handleClassName', 'handleStyle', { detents: [0.5, 1] }],
  ['BottomSheet', 'handleBarClassName', 'handleBarStyle'],
  ['Tree', 'className', 'style'],
  ['Tree', 'rowClassName', 'rowStyle'],
  [
    'Tree',
    'rowClassName',
    'rowStyle',
    {
      nodes: [{ id: 'a', label: 'A', children: [{ id: 'b', label: 'B' }] }],
      defaultExpanded: ['a'],
    },
    2,
  ],
  ['Toolbar', 'className', 'style'],
  ['Tooltip', 'className', 'style'],
  ['Splitter', 'className', 'style'],
  ['ResizablePane', 'className', 'style'],
  ['ResizablePane', 'paneClassName', 'paneStyle'],
  ['ResizablePane', 'handleClassName', 'handleStyle'],
  ['Accordion', 'className', 'style'],
  ['Accordion', 'sectionClassName', 'sectionStyle'],
  ['Accordion', 'triggerClassName', 'triggerStyle'],
  ['Accordion', 'headingClassName', 'triggerStyle'],
  ['Accordion', 'panelClassName', 'panelStyle'],
  ['Alert', 'className', 'style'],
].map(([component, classProp, styleProp, base, hosts, focusInput, marker]) => ({
  component,
  classProp,
  styleProp,
  base,
  hosts,
  focusInput,
  marker,
})) as Owner[]
assert.equal(owners.length, 93, 'include alternate presentations and class sources')
assert.equal(
  new Set(owners.map(({ component, styleProp }) => `${component}.${styleProp}`)).size,
  89,
)
assert.equal(
  owners.reduce((total, { hosts = 1 }) => total + hosts, 0),
  106,
)
const interactiveSlots = new Set([
  'Chip.removeStyle',
  'Listbox.optionStyle',
  'Menu.triggerStyle',
  'Menu.itemStyle',
  'Combobox.optionStyle',
  'Tabs.tabStyle',
  'Pagination.currentItemStyle',
  'Stepper.stepStyle',
  'Popover.triggerStyle',
  'Drawer.scrimStyle',
  'BottomSheet.scrimStyle',
  'BottomSheet.handleStyle',
])
const interactiveOwners = owners
  .map((owner, index) => ({ ...owner, index }))
  .filter(
    ({ component, styleProp, base }) =>
      interactiveSlots.has(`${component}.${styleProp}`) &&
      // The single-detent handle is a decorative View, not an event owner.
      !(component === 'BottomSheet' && styleProp === 'handleStyle' && !base?.detents),
  )
  .map((owner) => ({
    ...owner,
    // The Web Combobox keeps focus on its input, not on an option.
    classes:
      owner.component === 'Combobox'
        ? interactionNames.replace(' focus:gap-y-[6px]', '')
        : interactionNames,
  }))
const controlOwners = owners
  .map((owner, index) => ({ ...owner, index }))
  .filter(
    ({ component, styleProp }) =>
      component === 'Checkbox' ||
      component === 'Switch' ||
      (component === 'RadioGroup' && styleProp === 'optionStyle'),
  )
const source = `import {Chip,Listbox,Menu,Combobox,Tabs,Pagination,Stepper,Avatar,OtpInput,CommandPalette,ColorPicker,RadioGroup,Dialog,Tree,Toolbar,Splitter,ResizablePane} from '@hozo/core'
import {Slider,Checkbox,Switch,Popover,Drawer,BottomSheet,Accordion,Alert,Tooltip} from '@hozo/patterns'
export {Chip as RawChip,Listbox as RawListbox,Menu as RawMenu,Combobox as RawCombobox,Tabs as RawTabs,Pagination as RawPagination,Stepper as RawStepper,Avatar as RawAvatar,OtpInput as RawOtpInput,CommandPalette as RawCommandPalette,ColorPicker as RawColorPicker,RadioGroup as RawRadioGroup,Dialog as RawDialog,Tree as RawTree,Toolbar as RawToolbar,Splitter as RawSplitter,ResizablePane as RawResizablePane} from '@hozo/core'
export {Slider as RawSlider,Checkbox as RawCheckbox,Switch as RawSwitch,Popover as RawPopover,Drawer as RawDrawer,BottomSheet as RawBottomSheet,Accordion as RawAccordion,Alert as RawAlert,Tooltip as RawTooltip} from '@hozo/patterns'
${owners
  .flatMap(({ component, classProp, styleProp }, index) =>
    ['Literal', 'Opaque', 'Spread'].map(
      (mode) =>
        `export function ${mode}${index}({base,own,runtimeNames}) {return <${component} {...${mode === 'Spread' ? `{...base,${styleProp}:own}` : 'base'}} ${classProp}=${mode === 'Opaque' ? '{runtimeNames}' : JSON.stringify(names)} ${mode === 'Spread' ? '' : `${styleProp}={own}`}/>}`,
    ),
  )
  .join('\n')}
${[...interactiveOwners, ...controlOwners.map((owner) => ({ ...owner, classes: controlNames }))]
  .flatMap(({ component, classProp, styleProp, index, classes }) =>
    ['Literal', 'Opaque', 'Spread'].map(
      (mode) =>
        `export function State${mode}${index}({base,own,runtimeNames}) {return <${component} {...${mode === 'Spread' ? `{...base,${styleProp}:own}` : 'base'}} ${component === 'Stepper' ? 'onStepPress={base.onStepPress}' : ''} ${classProp}=${mode === 'Opaque' ? '{runtimeNames}' : JSON.stringify(classes)} ${mode === 'Spread' ? '' : `${styleProp}={own}`}/>}`,
    ),
  )
  .join('\n')}`
const root = fileURLToPath(new URL('../../../', import.meta.url))
const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.gap-owner-'))
const cache = openCandidateCache()
cache.scanFile('GapOwners.tsx', source, 1)
// The compiled literal owners do not need their classes in a fallback map.
// A separate data module supplies the choices opaque/raw callers can return.
const choices = [...new Set(`${names} ${controlNames} ${markNames} pt-[41px] pt-[42px]`.split(' '))]
cache.scanFile('GapChoices.ts', JSON.stringify(choices), 1)
assert.deepEqual(
  cache
    .candidates()
    .filter((name) => choices.includes(name))
    .sort(),
  choices.sort(),
)
const sheet = path.join(project, 'node_modules/.hozo/candidates.native.js')
mkdirSync(path.dirname(sheet), { recursive: true })
writeFileSync(sheet, cache.renderNativeModule())
const hook = registerHooks({
  resolve(specifier, context, next) {
    return specifier === '@hozo/engine/project'
      ? { url: pathToFileURL(sheet).href, shortCircuit: true }
      : next(specifier, context)
  },
})
after(() => {
  hook.deregister()
  rmSync(project, { recursive: true, force: true })
})
const warnings = mock.method(console, 'warn', () => {})
const components = loadNativeModule(source, project, { root: project, compiler: createCompiler() })
warnings.mock.restore()

const baseProps = {
  Chip: { defaultSelected: true, onRemove() {}, children: 'Token' },
  Listbox: { options: [{ value: 'a', label: 'A' }] },
  Menu: { trigger: 'Open', defaultOpen: true, items: [{ label: 'Action' }] },
  Combobox: { defaultOpen: true, options: [{ value: 'a', label: 'A' }], onValueChange() {} },
  Tabs: { tabs: [{ label: 'Tab', content: 'Panel' }] },
  Pagination: { pageCount: 1 },
  Stepper: { steps: [{ label: 'Step', description: 'Details' }], activeStep: 0, onStepPress() {} },
  Avatar: { name: 'Ada', status: 'online' },
  OtpInput: { length: 2, value: '1', accessibilityLabel: 'Code', showCaret: false },
  CommandPalette: {
    open: true,
    commands: [{ id: 'a', label: 'Action', group: 'Group', shortcut: 'Ctrl+K', onSelect() {} }],
  },
  Slider: { value: 40 },
  ColorPicker: {
    defaultValue: '#ff0000',
    presets: ['#ff0000', '#00ff00'],
    accessibilityLabel: 'Colour',
  },
  Checkbox: { children: 'Check', accessibilityLabel: 'Check' },
  Switch: { children: 'Switch', accessibilityLabel: 'Switch' },
  RadioGroup: {
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
    defaultValue: 'a',
  },
  Dialog: { open: true, children: 'Dialog body' },
  Popover: { open: true, trigger: 'Open', children: 'Popover body' },
  Drawer: { open: true, children: 'Drawer body' },
  BottomSheet: { open: true, children: 'Sheet body', detents: [1] },
  Tree: { nodes: [{ id: 'a', label: 'A' }] },
  Toolbar: { items: [{ render: () => react.createElement('Text', null, 'Tool') }] },
  Tooltip: { open: true, portal: false, content: 'Tip', children: react.createElement('View') },
  Splitter: { label: 'Size', controls: 'pane', min: 0, max: 400, defaultSize: 100 },
  ResizablePane: {
    label: 'Pane',
    side: 'start',
    min: 0,
    max: 400,
    defaultSize: 100,
    children: 'Body',
  },
  Accordion: { items: [{ header: 'Header', content: 'Panel' }], defaultExpanded: '0' },
  Alert: { children: 'Notice' },
}
const authorInputs = [
  { id: 'no-gap-control', value: Object.freeze({ paddingBottom: 23 }), expected: [8, 4] },
  { id: 'generic', value: Object.freeze({ gap: 16, paddingBottom: 23 }), expected: [16, 16] },
  {
    id: 'nested-axis',
    value: [Object.freeze({ gap: 24, paddingBottom: 23 }), [false, Object.freeze({ rowGap: 6 })]],
    expected: [6, 24],
  },
]

test('raw patterns and compiled root/secondary slots project the author before composing class gap axes', () => {
  const mismatches: unknown[] = []
  let observations = 0
  for (const [
    index,
    { component, classProp, styleProp, base, hosts = 1, focusInput, marker = 'paddingBottom' },
  ] of owners.entries()) {
    for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread']) {
      for (const author of authorInputs) {
        const type = components[mode === 'Raw' ? `Raw${component}` : `${mode}${index}`]
        assert.notEqual(
          type,
          undefined,
          `${component}/${mode}: the authored public import must resolve`,
        )
        const ownerProps = { ...baseProps[component], ...base }
        const own = marker === 'paddingBottom' ? author.value : [author.value, { [marker]: 23 }]
        const props =
          mode === 'Raw'
            ? { ...ownerProps, [classProp]: names, [styleProp]: own }
            : { base: ownerProps, own, runtimeNames: names }
        let view: ReturnType<typeof renderer.create>
        renderer.act(() => {
          view = renderer.create(react.createElement(type, props))
        })
        try {
          if (focusInput) {
            const input = view.root.findByType('TextInput')
            assert.equal(typeof input.props.onFocus, 'function')
            renderer.act(() => input.props.onFocus({ nativeEvent: {} }))
          }
          // Scroll content owns child gap; the viewport is a different style
          // channel. OTP's frame resets padding, so use an unaffected marker
          // and check both its decorative frame and actual input host.
          const targets = view.root
            .findAll(
              (node) =>
                typeof node.type === 'string' &&
                [
                  'View',
                  'Pressable',
                  'TextInput',
                  'ScrollView',
                  'Image',
                  'Text',
                  'Animated.View',
                ].includes(node.type),
            )
            .flatMap((node) =>
              ['style', 'contentContainerStyle'].map((channel) => ({
                node,
                channel,
                style: stub.StyleSheet.flatten(node.props[channel]),
              })),
            )
            .filter(({ style }) => style?.[marker] === 23)
          assert.equal(
            targets.length,
            hosts,
            `${component}.${styleProp}/${mode}: actual owner, not its label/ancestor`,
          )
          if (component === 'Checkbox' || component === 'Switch')
            assert.equal(targets[0].node.props.accessibilityRole, component.toLowerCase())
          if (component === 'RadioGroup')
            for (const { node } of targets)
              assert.equal(
                node.props.accessibilityRole,
                styleProp === 'style' ? 'radiogroup' : 'radio',
              )
          if (component === 'Dialog') {
            assert.equal(targets[0].node.type, base?.hozoScrollY ? 'ScrollView' : 'View')
            assert.equal(targets[0].channel, base?.hozoScrollY ? 'contentContainerStyle' : 'style')
            assert.equal(targets[0].node.props.accessibilityViewIsModal, true)
          }
          if (component === 'Popover' && styleProp === 'panelStyle')
            assert.equal(targets[0].node.type, 'Animated.View')
          if (component === 'BottomSheet' && styleProp === 'handleStyle')
            assert.equal(targets[0].node.type, base?.detents ? 'Pressable' : 'View')
          if (component === 'Tree')
            for (const { node } of targets)
              assert.equal(
                node.props.accessibilityRole,
                styleProp === 'style' ? 'list' : 'menuitem',
              )
          if (component === 'Toolbar')
            assert.equal(targets[0].node.props.accessibilityRole, 'toolbar')
          if (
            component === 'Splitter' ||
            (component === 'ResizablePane' && styleProp === 'handleStyle')
          ) {
            assert.equal(targets[0].node.props.accessibilityRole, 'adjustable')
            assert.equal(targets[0].node.props.accessibilityValue.now, 100)
          }
          if (component === 'ResizablePane' && styleProp === 'paneStyle') {
            assert.equal(targets[0].node.props.role, 'region')
            assert.equal(targets[0].style.width, 100)
            assert.equal(targets[0].style.overflow, 'hidden')
          }
          if (component === 'Accordion' && styleProp === 'triggerStyle')
            assert.equal(targets[0].node.props.accessibilityRole, 'header')
          if (component === 'OtpInput' && styleProp === 'inputStyle') {
            assert.equal(targets.filter(({ node }) => node.type === 'TextInput').length, 1)
            assert.equal(
              targets.filter(
                ({ node }) => node.type === 'View' && node.props.pointerEvents === 'none',
              ).length,
              1,
            )
            for (const { style } of targets)
              assert.equal(
                style.paddingBottom,
                0,
                'fixed input-frame geometry remains authoritative',
              )
          }
          if (component === 'CommandPalette' && styleProp === 'listStyle') {
            assert.equal(targets[0].node.type, 'ScrollView')
            assert.equal(targets[0].channel, 'contentContainerStyle')
          }
          for (const target of targets) {
            const selected = target.style
            for (const layout of gapLayouts) {
              const actual = yogaGapGeometry(selected, layout)
              if (JSON.stringify(actual) !== JSON.stringify(author.expected)) {
                mismatches.push({
                  component,
                  styleProp,
                  mode,
                  input: author.id,
                  layout,
                  expected: author.expected,
                  actual,
                })
              }
              observations++
            }
          }
        } finally {
          renderer.act(() => view.unmount())
        }
      }
    }
  }
  assert.equal(observations, 10176)
  assert.deepEqual(
    mismatches,
    [],
    `${mismatches.length}/${observations} owner gap observations differ`,
  )
})

test('Stepper does not inspect authored gap accessors on discarded status layers', () => {
  let reads = 0
  const inactive = Object.defineProperty({}, 'gap', {
    enumerable: true,
    get() {
      reads++
      throw new Error('an inactive status style was inspected')
    },
  })
  const props: Record<string, unknown> = {
    steps: [{ label: 'Next', status: 'upcoming' }],
    activeStep: 0,
    onStepPress() {},
  }
  for (const status of ['completed', 'current', 'error']) {
    props[`${status}StepStyle`] = inactive
    props[`${status}IndicatorStyle`] = inactive
  }
  let view: ReturnType<typeof renderer.create>
  try {
    renderer.act(() => {
      view = renderer.create(react.createElement(components.RawStepper, props))
    })
    const step = view.root.findByType('Pressable')
    stub.StyleSheet.flatten(step.props.style)
    assert.equal(reads, 0)
  } finally {
    renderer.act(() => view?.unmount())
  }
})

test('real owner hover/press/focus updates gap controls without overriding authored axes', () => {
  const frames = [
    [undefined, [8, 2]],
    ['onHoverIn', [8, 4]],
    ['onPressIn', [12, 4]],
    ['onPressOut', [8, 4]],
    ['onHoverOut', [8, 2]],
    ['onFocus', [6, 2]],
    ['onBlur', [8, 2]],
  ] as const
  const mismatches: unknown[] = []
  let observations = 0
  for (const { component, classProp, styleProp, base, index, classes } of interactiveOwners) {
    for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread']) {
      for (const author of authorInputs) {
        const type = components[mode === 'Raw' ? `Raw${component}` : `State${mode}${index}`]
        const ownerProps = { ...baseProps[component], ...base }
        const props =
          mode === 'Raw'
            ? { ...ownerProps, [classProp]: classes, [styleProp]: author.value }
            : { base: ownerProps, own: author.value, runtimeNames: classes }
        let view: ReturnType<typeof renderer.create>
        const target = () => {
          const matches = view.root.findAll(
            (node) =>
              node.type === 'Pressable' &&
              stub.StyleSheet.flatten(node.props.style)?.paddingBottom === 23,
          )
          assert.equal(
            matches.length,
            1,
            `${component}.${styleProp}/${mode}: one actual interaction owner`,
          )
          return matches[0]
        }
        try {
          renderer.act(() => {
            view = renderer.create(react.createElement(type, props))
          })
          for (const [event, control] of frames) {
            if (event) {
              assert.equal(typeof target().props[event], 'function')
              renderer.act(() => target().props[event]({ nativeEvent: {} }))
            }
            const expected =
              author.id === 'no-gap-control'
                ? component === 'Combobox' && event === 'onFocus'
                  ? [8, 2]
                  : control
                : author.expected
            const selected = stub.StyleSheet.flatten(target().props.style)
            for (const layout of gapLayouts) {
              const actual = yogaGapGeometry(selected, layout)
              if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                mismatches.push({
                  component,
                  styleProp,
                  mode,
                  input: author.id,
                  event,
                  layout,
                  expected,
                  actual,
                })
              }
              observations++
            }
          }
        } finally {
          renderer.act(() => view?.unmount())
        }
      }
    }
  }
  assert.equal(observations, 8064)
  assert.deepEqual(
    mismatches,
    [],
    `${mismatches.length}/${observations} state gap observations differ`,
  )
})

test('gap evidence retains refusals for a borrowed focus owner and an undeclared step button', () => {
  for (const [source, reason] of [
    [
      'import {Combobox} from \'@hozo/core\';export function C(){return <Combobox optionClassName="focus:gap-y-[6px]"/>}',
      /Combobox option focus is not wired/,
    ],
    [
      'import {Stepper} from \'@hozo/core\';export function C(props){return <Stepper {...props} stepClassName="hover:gap-x-[4px]"/>}',
      /needs an authored `onStepPress`/,
    ],
  ] as const) {
    assert.throws(
      () => loadNativeModule(source, project, { root: project, compiler: createCompiler() }),
      reason,
    )
  }
})

test('ColorPicker delegates authored thumb projection to each actual Slider owner', () => {
  let value = 16
  let reads = 0
  const own = Object.freeze({
    get gap() {
      reads++
      return value
    },
  })
  let view: ReturnType<typeof renderer.create>
  const thumbs = () =>
    view.root.findAll(
      (node) => node.type === 'View' && node.props.accessibilityRole === 'adjustable',
    )
  const check = (expected: number[]) => {
    assert.equal(thumbs().length, 3)
    for (const [index, thumb] of thumbs().entries()) {
      const style = stub.StyleSheet.flatten(thumb.props.style)
      assert.equal(style.gap, undefined)
      assert.deepEqual([style.rowGap, style.columnGap], [expected[index], expected[index]])
    }
  }
  try {
    renderer.act(() => {
      view = renderer.create(
        react.createElement(components.RawColorPicker, {
          accessibilityLabel: 'Colour',
          thumbClassName: names,
          thumbStyle: own,
        }),
      )
    })
    assert.equal(reads, 3, 'one author read per actual thumb, not an eager parent projection')
    check([16, 16, 16])
    value = 24
    renderer.act(() => thumbs()[0].props.onFocus({ nativeEvent: {} }))
    check([24, 16, 16])
    assert.equal(reads, 4, 'only the focused owner reevaluates; no cached mutable author')
  } finally {
    renderer.act(() => view?.unmount())
  }
})

test('toggle and radio gap authors stay on actual controls through checked, disabled and interaction changes', () => {
  const frames = [
    'rest',
    'hover',
    'press',
    'release',
    'leave',
    'focus',
    'blur',
    'select-first',
    'checked-hover',
    'checked-leave',
    'select-next',
    'disabled',
    'reenabled',
  ]
  const events: Record<string, string> = {
    hover: 'onHoverIn',
    press: 'onPressIn',
    release: 'onPressOut',
    leave: 'onHoverOut',
    focus: 'onFocus',
    blur: 'onBlur',
    'checked-hover': 'onHoverIn',
    'checked-leave': 'onHoverOut',
  }
  let observations = 0
  for (const { component, classProp, styleProp, index } of controlOwners)
    for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread'])
      for (const author of authorInputs) {
        const radio = component === 'RadioGroup'
        const type = components[mode === 'Raw' ? `Raw${component}` : `State${mode}${index}`]
        const notify: unknown[] = []
        const props = (disabled: boolean) => {
          const base = {
            ...baseProps[component],
            defaultValue: undefined,
            defaultChecked: false,
            disabled,
            options: [
              { value: 'a', label: 'A', disabled },
              { value: 'b', label: 'B', disabled },
            ],
            onValueChange: (value: unknown) => notify.push(value),
            onCheckedChange: (checked: boolean) => notify.push(checked),
            indicator: () => ({
              className: `${controlNames} pt-[41px]`,
              markClassName: `${markNames} pt-[42px]`,
            }),
          }
          return mode === 'Raw'
            ? { ...base, [classProp]: controlNames, [styleProp]: author.value }
            : { base, own: author.value, runtimeNames: controlNames }
        }
        let view: ReturnType<typeof renderer.create>
        const controls = () => view.root.findAll((node) => node.type === 'Pressable')
        try {
          renderer.act(() => {
            view = renderer.create(react.createElement(type, props(false)))
          })
          for (const [frame, name] of frames.entries()) {
            if (events[name])
              renderer.act(() => controls()[0].props[events[name]]({ nativeEvent: {} }))
            if (name === 'select-first' || name === 'select-next')
              renderer.act(() =>
                controls()[name === 'select-next' && radio ? 1 : 0].props.onPress(),
              )
            if (name === 'disabled' || name === 'reenabled')
              renderer.act(() => view.update(react.createElement(type, props(name === 'disabled'))))
            const disabled = name === 'disabled'
            const hovered = ['hover', 'press', 'release', 'checked-hover'].includes(name)
            assert.equal(controls().length, radio ? 2 : 1)
            for (const [at, control] of controls().entries()) {
              const checked = frame >= 7 && (frame < 10 ? at === 0 : radio && at === 1)
              assert.equal(
                control.props.accessibilityRole,
                radio ? 'radio' : component.toLowerCase(),
              )
              assert.equal(control.props.accessibilityState.checked, checked)
              assert.equal(Boolean(control.props.disabled), disabled)
              const row = checked
                ? 10
                : at === 0 && name === 'press'
                  ? 12
                  : at === 0 && name === 'focus'
                    ? 6
                    : 8
              const column = disabled ? 14 : at === 0 && hovered ? 4 : 2
              const indicator = control.findAll(
                (node) => node.type === 'View' && node.props.pointerEvents === 'none',
              )
              assert.equal(indicator.length, 1, 'one decorative indicator per actual control')
              assert.equal(indicator[0].props.accessibilityElementsHidden, true)
              assert.equal(indicator[0].props.importantForAccessibility, 'no-hide-descendants')
              const marks = indicator[0].findAll(
                (node) => node.type === 'View' && node !== indicator[0],
              )
              assert.equal(marks.length, 1)
              const look = stub.StyleSheet.flatten(indicator[0].props.style)
              const mark = stub.StyleSheet.flatten(marks[0].props.style)
              assert.equal(look.paddingTop, 41)
              assert.equal(mark.paddingTop, 42)
              for (const style of [look, mark]) assert.notEqual(style.paddingBottom, 23)
              for (const label of control.findAllByType('Text')) {
                const text = stub.StyleSheet.flatten(label.props.style)
                for (const key of ['gap', 'rowGap', 'columnGap']) assert.equal(text[key], undefined)
              }
              for (const [style, expected] of [
                [
                  stub.StyleSheet.flatten(control.props.style),
                  author.id === 'no-gap-control' ? [row, column] : author.expected,
                ],
                [look, [row, column]],
                [mark, [checked ? 7 : 3, disabled ? 11 : at === 0 && hovered ? 9 : 5]],
              ] as const)
                for (const layout of gapLayouts) {
                  assert.deepEqual(
                    yogaGapGeometry(style, layout),
                    expected,
                    `${component}/${mode}/${author.id}/${name}/${at}: actual control vs independent indicator`,
                  )
                  observations++
                }
            }
          }
          assert.deepEqual(notify, radio ? ['a', 'b'] : [true, false])
        } finally {
          renderer.act(() => view?.unmount())
        }
      }
  assert.equal(observations, 14976)
})

test('a mixed checkbox passes mixed to its indicator and activates to checked without leaking authored gaps', () => {
  const { index } = controlOwners.find(({ component }) => component === 'Checkbox')!
  for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread']) {
    const states: unknown[] = []
    const changes: boolean[] = []
    const base = {
      children: 'Mixed',
      defaultChecked: 'mixed',
      onCheckedChange: (checked: boolean) => changes.push(checked),
      indicator: ({ checked }: { checked: unknown }) => {
        states.push(checked)
        return { className: controlNames, markClassName: markNames }
      },
    }
    const props =
      mode === 'Raw'
        ? { ...base, className: controlNames, style: authorInputs[1].value }
        : { base, own: authorInputs[1].value, runtimeNames: controlNames }
    const type = components[mode === 'Raw' ? 'RawCheckbox' : `State${mode}${index}`]
    let view: ReturnType<typeof renderer.create>
    try {
      renderer.act(() => {
        view = renderer.create(react.createElement(type, props))
      })
      const host = () => view.root.findByType('Pressable')
      const checkStyles = (checked: boolean) => {
        const views = host().findAll((node) => node.type === 'View')
        assert.equal(views.length, 2, 'indicator and mark, not a duplicated control')
        const expected = [
          [16, 16],
          [checked ? 10 : 8, 2],
          [checked ? 7 : 3, 5],
        ]
        for (const [at, node] of [host(), ...views].entries())
          assert.deepEqual(
            yogaGapGeometry(stub.StyleSheet.flatten(node.props.style), gapLayouts[0]),
            expected[at],
          )
      }
      assert.equal(host().props.accessibilityState.checked, 'mixed')
      assert.equal(states.at(-1), 'mixed')
      checkStyles(false)
      renderer.act(() => host().props.onPress())
      assert.equal(host().props.accessibilityState.checked, true)
      assert.equal(states.at(-1), true)
      assert.deepEqual(changes, [true])
      checkStyles(true)
    } finally {
      renderer.act(() => view?.unmount())
    }
  }
})

test('Popover projects panel authors only while mounted and refreshes them through leave and reopen', () => {
  const index = owners.findIndex(
    ({ component, styleProp }) => component === 'Popover' && styleProp === 'triggerStyle',
  )
  for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread']) {
    let reads = 0
    let gap = 16
    let readable = false
    const own = Object.freeze({
      get gap() {
        assert.equal(readable, true, 'an unmounted panel author must not be inspected')
        reads++
        return gap
      },
    })
    const changes: boolean[] = []
    const base = {
      trigger: 'Open',
      children: 'Body',
      modal: true,
      defaultOpen: false,
      panelClassName: names,
      panelStyle: own,
      offset: 4,
      onOpenChange: (open: boolean) => changes.push(open),
    }
    const props = () =>
      mode === 'Raw'
        ? { ...base, triggerClassName: names, triggerStyle: authorInputs[0].value }
        : { base: { ...base }, own: authorInputs[0].value, runtimeNames: names }
    const type = components[mode === 'Raw' ? 'RawPopover' : `${mode}${index}`]
    let view: ReturnType<typeof renderer.create>
    const trigger = () => view.root.findByType('Pressable')
    const panels = () => view.root.findAllByType('Animated.View')
    const checkPanel = (leaving: boolean) => {
      assert.equal(panels().length, 1)
      const panel = panels()[0]
      assert.equal(panel.props.pointerEvents, leaving ? 'none' : 'auto')
      assert.equal(panel.props.accessibilityElementsHidden, leaving)
      assert.equal(panel.props.accessibilityViewIsModal, !leaving)
      const before = reads
      for (const layout of gapLayouts)
        assert.deepEqual(yogaGapGeometry(stub.StyleSheet.flatten(panel.props.style), layout), [
          gap,
          gap,
        ])
      assert.equal(
        reads,
        before,
        'the rendered panel contains projected data, not a live author getter',
      )
    }
    stub.Animated.__hozoResetTimings()
    try {
      renderer.act(() => {
        view = renderer.create(react.createElement(type, props()))
      })
      assert.equal(panels().length, 0)
      assert.equal(reads, 0)
      readable = true
      renderer.act(() => trigger().props.onPress())
      assert.ok(reads > 0)
      checkPanel(false)
      assert.equal(stub.Animated.__hozoTimings.at(-1).config.toValue, 1)
      const openedReads = reads
      gap = 24
      renderer.act(() => trigger().props.onPress())
      assert.ok(reads > openedReads, 'the leaving owner rereads the changed author')
      checkPanel(true)
      const exit = stub.Animated.__hozoTimings.at(-1)
      assert.equal(exit.config.toValue, 0)
      assert.equal(exit.config.useNativeDriver, true)
      renderer.act(() => exit.finish())
      assert.equal(panels().length, 0)
      const retiredReads = reads
      readable = false
      base.offset = 8
      renderer.act(() => view.update(react.createElement(type, props())))
      assert.equal(reads, retiredReads)
      gap = 32
      readable = true
      renderer.act(() => trigger().props.onPress())
      checkPanel(false)
      assert.deepEqual(changes, [true, false, true])
    } finally {
      renderer.act(() => view?.unmount())
      stub.Animated.__hozoResetTimings()
    }
  }
})

test('BottomSheet keeps separate slot authors and measured translation when its handle changes host type', () => {
  const index = owners.findIndex(
    ({ component, styleProp }) => component === 'BottomSheet' && styleProp === 'handleStyle',
  )
  let observations = 0
  for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread'])
    for (const author of authorInputs) {
      const base = {
        open: true,
        children: 'Sheet',
        testID: 'gap-sheet',
        detents: [1],
        className: names,
        // The fixed 140px oracle needs two 50px children on its first line.
        // Keep distinct slot gaps below the 40px wrap-topology threshold.
        style: Object.freeze({ gap: 28, zIndex: 52 }),
        scrimClassName: names,
        scrimStyle: Object.freeze({ gap: 20, zIndex: 53 }),
        sheetClassName: names,
        sheetStyle: Object.freeze({ gap: 32, zIndex: 51 }),
        handleBarClassName: names,
        handleBarStyle: Object.freeze({ gap: 12, zIndex: 54 }),
      }
      const props = () =>
        mode === 'Raw'
          ? { ...base, handleClassName: names, handleStyle: author.value }
          : { base: { ...base }, own: author.value, runtimeNames: names }
      const type = components[mode === 'Raw' ? 'RawBottomSheet' : `${mode}${index}`]
      let view: ReturnType<typeof renderer.create>
      const marked = (key: string, value: number) => {
        const matches = view.root.findAll(
          (node) =>
            ['View', 'Pressable'].includes(node.type) &&
            stub.StyleSheet.flatten(node.props.style)[key] === value,
        )
        assert.equal(matches.length, 1, `${key}=${value}: one actual slot`)
        return matches[0]
      }
      const handle = () => marked('paddingBottom', 23)
      const check = (resizable: boolean, translation: number) => {
        const target = handle()
        assert.equal(target.type, resizable ? 'Pressable' : 'View')
        if (resizable) assert.equal(target.props.accessibilityRole, 'button')
        else assert.equal(target.props.accessibilityElementsHidden, true)
        assert.deepEqual(stub.StyleSheet.flatten(marked('zIndex', 51).props.style).transform, [
          { translateY: translation },
        ])
        assert.equal(view.root.findByType('Modal').props.visible, true)
        const slots = [
          { node: target, expected: author.expected },
          ...[
            [51, 32],
            [52, 28],
            [53, 20],
            [54, 12],
          ].map(([marker, gap]) => ({ node: marked('zIndex', marker), expected: [gap, gap] })),
        ]
        for (const { node, expected } of slots)
          for (const layout of gapLayouts) {
            assert.deepEqual(
              yogaGapGeometry(stub.StyleSheet.flatten(node.props.style), layout),
              expected,
            )
            observations++
          }
      }
      try {
        renderer.act(() => {
          view = renderer.create(react.createElement(type, props()))
        })
        renderer.act(() =>
          marked('zIndex', 51).props.onLayout({ nativeEvent: { layout: { height: 400 } } }),
        )
        check(false, 0)
        base.detents = [0.5, 1]
        renderer.act(() => view.update(react.createElement(type, props())))
        check(true, 0)
        renderer.act(() => handle().props.onPress())
        check(true, 200)
        renderer.act(() => handle().props.onPress())
        check(true, 0)
        base.detents = [1]
        renderer.act(() => view.update(react.createElement(type, props())))
        check(false, 0)
      } finally {
        renderer.act(() => view?.unmount())
      }
    }
  assert.equal(observations, 2400)
})
