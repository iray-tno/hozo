// Public Native form sources and real project candidates. Stand-in hosts and
// fixed Yoga layouts establish composition, not device/picker geometry.
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
const buttonNames =
  'gap-y-[8px] gap-x-[2px] hover:gap-x-[4px] active:gap-y-[12px] focus:gap-y-[6px] disabled:gap-x-[14px]'
const dayNames =
  buttonNames.replace('disabled:gap-x-[14px]', 'aria-disabled:gap-x-[14px] disabled:gap-x-[30px]') +
  ' aria-selected:opacity-50'
const owners = [
  ['Calendar', 'className', 'style', { View: 1 }],
  ['Calendar', 'headerClassName', 'headerStyle', { View: 1 }],
  ['Calendar', 'dayClassName', 'dayStyle', { Pressable: 42 }],
  ['Calendar', 'monthButtonClassName', 'monthButtonStyle', { Pressable: 2 }],
  ['TimePicker', 'className', 'style', { View: 1 }],
  ['TimePicker', 'fieldClassName', 'fieldStyle', { View: 2, Pressable: 1 }],
  ['TimePicker', 'periodClassName', 'fieldStyle', { View: 2, Pressable: 1 }],
  ['TimePicker', 'stepClassName', 'stepStyle', { Pressable: 4 }],
] as const
// Form is opt-in passthrough, not a default semantic lowering source. The
// independent primitive activates actual Metro without replacing form APIs.
const source = `import {View} from '@hozo/core'
import {Calendar,TimePicker} from '@hozo/form'
export {Calendar as RawCalendar,TimePicker as RawTimePicker} from '@hozo/form'
export function Anchor(){return <View/>}
${owners
  .flatMap(([component, classProp, styleProp], index) =>
    ['Literal', 'Opaque', 'Spread'].map(
      (mode) =>
        `export function ${mode}${index}({base,own,runtimeNames}){return <${component} {...${mode === 'Spread' ? `{...base,${styleProp}:own}` : 'base'}} ${classProp}=${mode === 'Opaque' ? '{runtimeNames}' : JSON.stringify(names)} ${mode === 'Spread' ? '' : `${styleProp}={own}`}/>}`,
    ),
  )
  .join('\n')}
${owners
  .flatMap(([component, classProp, styleProp], index) =>
    ['dayStyle', 'monthButtonStyle', 'stepStyle'].includes(styleProp) ||
    classProp === 'periodClassName'
      ? ['Literal', 'Opaque', 'Spread'].map(
          (mode) =>
            `export function State${mode}${index}({base,own,runtimeNames}){return <${component} {...${mode === 'Spread' ? `{...base,${styleProp}:own}` : 'base'}} ${classProp}=${mode === 'Opaque' ? '{runtimeNames}' : JSON.stringify(styleProp === 'dayStyle' ? dayNames : buttonNames)} ${mode === 'Spread' ? '' : `${styleProp}={own}`}/>}`,
        )
      : [],
  )
  .join('\n')}`
const root = fileURLToPath(new URL('../../../', import.meta.url))
const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.calendar-gap-'))
const cache = openCandidateCache()
cache.scanFile('Owners.tsx', source, 1)
const choices = [...new Set(`${names} ${buttonNames} ${dayNames}`.split(' '))]
cache.scanFile('Choices.ts', JSON.stringify(choices), 1)
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
    const file =
      specifier === '@hozo/form'
        ? path.join(root, 'packages/form/src/index.native.ts')
        : specifier === '@hozo/engine/project'
          ? sheet
          : undefined
    return file ? { url: pathToFileURL(file).href, shortCircuit: true } : next(specifier, context)
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
  Calendar: {
    defaultMonth: { year: 2026, month: 10 },
    today: { year: 2026, month: 10, day: 15 },
    value: { year: 2026, month: 10, day: 15 },
    weeks: 6,
    firstDayOfWeek: 0,
    locale: 'en-US',
    accessibilityLabel: 'Date',
  },
  TimePicker: {
    defaultValue: { hour: 9, minute: 30 },
    hour12: true,
    locale: 'en-US',
    accessibilityLabel: 'Time',
  },
}
const authors = [
  { id: 'no-gap', own: Object.freeze({ paddingBottom: 23 }), expected: [8, 4] },
  { id: 'generic', own: Object.freeze({ gap: 16, paddingBottom: 23 }), expected: [16, 16] },
  {
    id: 'nested-axis',
    own: [Object.freeze({ gap: 24, paddingBottom: 23 }), [false, Object.freeze({ rowGap: 6 })]],
    expected: [6, 24],
  },
]

test('Calendar and TimePicker public owners compose authored gap axes without borrowing sibling classes', () => {
  let observations = 0
  const mismatches: unknown[] = []
  for (const [index, [component, classProp, styleProp, hostCounts]] of owners.entries())
    for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread'])
      for (const author of authors) {
        const type = components[mode === 'Raw' ? `Raw${component}` : `${mode}${index}`]
        assert.notEqual(type, undefined)
        const props =
          mode === 'Raw'
            ? { ...baseProps[component], [classProp]: names, [styleProp]: author.own }
            : { base: baseProps[component], own: author.own, runtimeNames: names }
        if (mode !== 'Raw')
          assert.equal(
            (type as (props: unknown) => { type: unknown })(props).type,
            components[`Raw${component}`],
          )
        let view: ReturnType<typeof renderer.create>
        const before = JSON.stringify(author.own)
        try {
          renderer.act(() => {
            view = renderer.create(react.createElement(type, props))
          })
          const targets = view.root.findAll(
            (node) =>
              ['View', 'Pressable'].includes(node.type) &&
              stub.StyleSheet.flatten(node.props.style)?.paddingBottom === 23,
          )
          assert.equal(
            targets.length,
            Object.values(hostCounts).reduce((a, b) => a + b, 0),
            `${component}.${styleProp}/${classProp}/${mode}: all actual owners`,
          )
          for (const [host, count] of Object.entries(hostCounts))
            assert.equal(targets.filter((node) => node.type === host).length, count)
          for (const target of targets) {
            if (styleProp === 'dayStyle') {
              assert.equal(target.props.accessibilityRole, 'button')
              assert.equal(typeof target.props.accessibilityState.selected, 'boolean')
            }
            if (styleProp === 'monthButtonStyle' || styleProp === 'stepStyle')
              assert.equal(target.props.accessibilityRole, 'button')
            if (
              component === 'TimePicker' &&
              styleProp === 'fieldStyle' &&
              target.type === 'Pressable'
            )
              assert.equal(target.props.accessibilityLabel, 'AM or PM')
            if (component === 'Calendar' && styleProp === 'style')
              assert.equal(target.props.accessibilityRole, 'grid')
            for (const label of target.findAllByType('Text'))
              for (const axis of ['gap', 'rowGap', 'columnGap'])
                assert.equal(stub.StyleSheet.flatten(label.props.style)?.[axis], undefined)
            // fieldStyle is deliberately shared with the period, but the field
            // group and period class lists belong to different Web owners.
            const unclassed =
              component === 'TimePicker' &&
              styleProp === 'fieldStyle' &&
              ((classProp === 'fieldClassName' && target.type === 'Pressable') ||
                (classProp === 'periodClassName' && target.type === 'View'))
            const expected = author.id === 'no-gap' && unclassed ? [0, 0] : author.expected
            for (const layout of gapLayouts) {
              const actual = yogaGapGeometry(stub.StyleSheet.flatten(target.props.style), layout)
              if (JSON.stringify(actual) !== JSON.stringify(expected))
                mismatches.push({
                  component,
                  classProp,
                  mode,
                  author: author.id,
                  host: target.type,
                  layout,
                  expected,
                  actual,
                })
              observations++
            }
          }
          assert.equal(JSON.stringify(author.own), before)
        } finally {
          renderer.act(() => view?.unmount())
        }
      }
  assert.equal(observations, 5472)
  assert.deepEqual(
    mismatches,
    [],
    `${mismatches.length}/${observations} calendar/time gap differences`,
  )
})

test('day, month, step and period gap authors stay on their actual interaction and disabled owners', () => {
  let observations = 0
  for (const [index, [component, classProp, styleProp]] of owners.entries()) {
    if (
      !['dayStyle', 'monthButtonStyle', 'stepStyle'].includes(styleProp) &&
      classProp !== 'periodClassName'
    )
      continue
    for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread'])
      for (const author of authors) {
        const classes = styleProp === 'dayStyle' ? dayNames : buttonNames
        let base = {
          ...baseProps[component],
          nextMonthLabel: 'Next',
          previousMonthLabel: 'Previous',
          hourFieldLabel: 'Hour',
          minuteFieldLabel: 'Minute',
          increaseLabel: 'Increase',
        }
        const type = components[mode === 'Raw' ? `Raw${component}` : `State${mode}${index}`]
        const element = () =>
          react.createElement(
            type,
            mode === 'Raw'
              ? { ...base, [classProp]: classes, [styleProp]: author.own }
              : { base, own: author.own, runtimeNames: classes },
          )
        let view: ReturnType<typeof renderer.create>
        const target = () => {
          const matches = view.root.findAll(
            (node) =>
              node.type === 'Pressable' &&
              (styleProp === 'dayStyle'
                ? node.props.accessibilityState?.selected === true
                : node.props.accessibilityLabel ===
                  (styleProp === 'monthButtonStyle'
                    ? 'Next'
                    : styleProp === 'stepStyle'
                      ? 'Increase Hour'
                      : 'AM or PM')),
          )
          assert.equal(matches.length, 1, 'one real selected day/month/step/period owner')
          return matches[0]
        }
        const check = (control: readonly number[], disabled = false) => {
          assert.equal(target().props.disabled, disabled)
          assert.equal(target().props.accessibilityRole, 'button')
          const style = stub.StyleSheet.flatten(target().props.style)
          if (styleProp === 'dayStyle') assert.equal(style.opacity, 0.5)
          for (const layout of gapLayouts) {
            assert.deepEqual(
              yogaGapGeometry(style, layout),
              author.id === 'no-gap' ? control : author.expected,
            )
            observations++
          }
          for (const axis of ['gap', 'rowGap', 'columnGap'])
            assert.equal(
              stub.StyleSheet.flatten(target().findByType('Text').props.style)?.[axis],
              undefined,
            )
        }
        try {
          renderer.act(() => {
            view = renderer.create(element())
          })
          for (const [event, control] of [
            [undefined, [8, 2]],
            ['onHoverIn', [8, 4]],
            ['onPressIn', [12, 4]],
            ['onPressOut', [8, 4]],
            ['onHoverOut', [8, 2]],
            ['onFocus', [6, 2]],
            ['onBlur', [8, 2]],
            ['onFocus', [6, 2]],
          ] as const) {
            if (event) renderer.act(() => target().props[event]({ nativeEvent: {} }))
            check(control)
          }
          base = {
            ...base,
            ...(styleProp === 'dayStyle'
              ? { min: { year: 2026, month: 11, day: 1 } }
              : styleProp === 'monthButtonStyle'
                ? { max: { year: 2026, month: 10, day: 31 } }
                : { disabled: true }),
          }
          renderer.act(() => view.update(element()))
          // dayClassName belongs to a Web td: aria-disabled does not make it
          // a disabled HTML button or clear its delivered focus state.
          check(styleProp === 'dayStyle' ? [6, 14] : [8, 14], true)
          base = { ...base, min: undefined, max: undefined, disabled: false }
          renderer.act(() => view.update(element()))
          check(styleProp === 'dayStyle' ? [6, 2] : [8, 2])
        } finally {
          renderer.act(() => view?.unmount())
        }
      }
  }
  assert.equal(observations, 3840)
})

test('Calendar keeps day evaluation local, pages once and leaves week and opaque-label ownership intact', () => {
  for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread']) {
    const gaps = [20, 28, 16, 12]
    const reads = [0, 0, 0, 0]
    const months: unknown[] = []
    let renderCalls = 0
    const own = (at: number, extra = {}) =>
      Object.freeze({
        ...extra,
        zIndex: 71 + at,
        get gap() {
          reads[at]++
          return gaps[at]
        },
      })
    const rootStyle = own(0, { color: '#112233', fontSize: 18 })
    const headerStyle = own(1, { color: '#334455' })
    const dayStyle = own(2, { color: '#556677' })
    const monthStyle = own(3)
    let base = {
      ...baseProps.Calendar,
      className: names,
      style: rootStyle,
      headerClassName: names,
      headerStyle,
      gridClassName: names,
      monthButtonClassName: names,
      monthButtonStyle: monthStyle,
      dayTextStyle: { color: '#778899' },
      weekStyle: Object.freeze({ gap: 10, zIndex: 75 }),
      nextMonthLabel: 'Next',
      previousMonthLabel: 'Previous',
      renderDay: (day) => {
        renderCalls++
        return String(day.date.day)
      },
      onMonthChange: (month) => months.push(month),
    }
    const type = components[mode === 'Raw' ? 'RawCalendar' : `${mode}2`]
    const element = () =>
      react.createElement(
        type,
        mode === 'Raw'
          ? { ...base, dayClassName: names, dayStyle }
          : { base, own: dayStyle, runtimeNames: names },
      )
    let view: ReturnType<typeof renderer.create>
    const marked = (marker: number) =>
      view.root.findAll(
        (node) =>
          ['View', 'Pressable'].includes(node.type) &&
          stub.StyleSheet.flatten(node.props.style)?.zIndex === marker,
      )
    const check = (marker: number, gap: number, count: number) => {
      assert.equal(marked(marker).length, count)
      for (const node of marked(marker))
        for (const layout of gapLayouts)
          assert.deepEqual(yogaGapGeometry(stub.StyleSheet.flatten(node.props.style), layout), [
            gap,
            gap,
          ])
    }
    try {
      renderer.act(() => {
        view = renderer.create(element())
      })
      check(71, 20, 1)
      check(72, 28, 1)
      check(73, 16, 42)
      check(74, 12, 2)
      check(75, 10, 7)
      assert.equal(renderCalls, 42)
      const selected = marked(73).find((node) => node.props.accessibilityState.selected)
      const before = [...reads]
      gaps.splice(0, 4, 32, 36, 24, 12)
      renderer.act(() => selected.props.onFocus({ nativeEvent: {} }))
      assert.deepEqual(reads, [before[0], before[1], before[2] + 1, before[3]])
      assert.equal(renderCalls, 42, 'one day focus does not invoke renderDay for the grid again')
      for (const layout of gapLayouts)
        assert.deepEqual(
          yogaGapGeometry(stub.StyleSheet.flatten(selected.props.style), layout),
          [24, 24],
        )
      check(71, 20, 1)
      check(72, 28, 1)
      const text = stub.StyleSheet.flatten(selected.findByType('Text').props.style)
      assert.equal(text.color, '#778899')
      assert.equal(text.fontSize, 18)
      for (const axis of ['gap', 'rowGap', 'columnGap']) assert.equal(text[axis], undefined)
      const next = marked(74).find((node) => node.props.accessibilityLabel === 'Next')
      renderer.act(() => next.props.onPress())
      assert.deepEqual(months, [{ year: 2026, month: 11 }])
      assert.equal(renderCalls, 84)
      check(71, 32, 1)
      check(72, 36, 1)
      check(73, 24, 42)
      check(75, 10, 7)
      for (const week of marked(75)) {
        assert.equal(stub.StyleSheet.flatten(week.props.style).flexDirection, 'row')
        for (const layout of gapLayouts)
          assert.deepEqual(
            yogaGapGeometry(stub.StyleSheet.flatten(week.parent.props.style), layout),
            [8, 4],
            'the grid keeps its classes; weeks keep their independent author',
          )
      }
      const opaque = Object.freeze({ color: '#abcdef' })
      base = { ...base, renderDay: () => react.createElement('Text', { style: opaque }, 'Custom') }
      renderer.act(() => view.update(element()))
      for (const day of marked(73)) {
        const label = day.findByType('Text')
        assert.equal(label.props.style, opaque, 'caller-owned label is not cloned or decorated')
        assert.deepEqual(label.children, ['Custom'])
      }
    } finally {
      renderer.act(() => view?.unmount())
    }
  }
})

test('TimePicker keeps step and value updates local and retains actual bounds, actions and text ancestry', () => {
  for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread']) {
    const gaps = [20, 16, 12]
    const reads = [0, 0, 0]
    const changes: unknown[] = []
    const own = (at: number, extra = {}) =>
      Object.freeze({
        ...extra,
        zIndex: 81 + at,
        get gap() {
          reads[at]++
          return gaps[at]
        },
      })
    const rootStyle = own(0, { color: '#112233', fontSize: 18 })
    const fieldStyle = own(1, { color: '#334455', fontWeight: '600' })
    const stepStyle = own(2, { color: '#556677' })
    let base = {
      ...baseProps.TimePicker,
      className: names,
      style: rootStyle,
      fieldClassName: names,
      fieldStyle,
      periodClassName: names,
      valueClassName: `${names} focus:gap-y-[6px]`,
      fieldTextStyle: { color: '#778899', fontSize: 22 },
      hourFieldLabel: 'Hour',
      minuteFieldLabel: 'Minute',
      increaseLabel: 'Increase',
      decreaseLabel: 'Decrease',
      min: { hour: 9, minute: 0 },
      max: { hour: 10, minute: 0 },
      step: 15,
      onChange: (value) => changes.push(value),
    }
    const type = components[mode === 'Raw' ? 'RawTimePicker' : `${mode}7`]
    const element = () =>
      react.createElement(
        type,
        mode === 'Raw'
          ? { ...base, stepClassName: names, stepStyle }
          : { base, own: stepStyle, runtimeNames: names },
      )
    let view: ReturnType<typeof renderer.create>
    const host = (label: string, type: string) => {
      const matches = view.root.findAll(
        (node) => node.type === type && node.props.accessibilityLabel === label,
      )
      assert.equal(matches.length, 1)
      return matches[0]
    }
    const action = (label: string, actionName = 'increment') =>
      renderer.act(() =>
        host(label, 'View').props.onAccessibilityAction({
          nativeEvent: { actionName },
        }),
      )
    const check = () => {
      const root = view.root.findAll(
        (node) => node.type === 'View' && stub.StyleSheet.flatten(node.props.style)?.zIndex === 81,
      )
      const groups = view.root.findAll(
        (node) => node.type === 'View' && stub.StyleSheet.flatten(node.props.style)?.zIndex === 82,
      )
      assert.equal(root.length, 1)
      assert.equal(groups.length, 2)
      for (const [node, gap] of [[root[0], gaps[0]], ...groups.map((node) => [node, gaps[1]])])
        for (const layout of gapLayouts)
          assert.deepEqual(yogaGapGeometry(stub.StyleSheet.flatten(node.props.style), layout), [
            gap,
            gap,
          ])
      const value = host('Minute', 'View')
      assert.equal(value.props.accessible, true)
      assert.equal(value.props.accessibilityRole, 'adjustable')
      const text = stub.StyleSheet.flatten(value.findByType('Text').props.style)
      assert.equal(text.color, '#778899')
      assert.equal(text.fontSize, 22)
      assert.equal(text.fontWeight, '600')
      const stepText = stub.StyleSheet.flatten(
        host('Increase Hour', 'Pressable').findByType('Text').props.style,
      )
      assert.equal(stepText.color, '#556677')
      assert.equal(stepText.fontSize, 18)
      for (const style of [text, stepText])
        for (const axis of ['gap', 'rowGap', 'columnGap']) assert.equal(style[axis], undefined)
    }
    try {
      renderer.act(() => {
        view = renderer.create(element())
      })
      check()
      const before = [...reads]
      gaps.splice(0, 3, 28, 32, 24)
      renderer.act(() => host('Increase Hour', 'Pressable').props.onFocus({ nativeEvent: {} }))
      assert.deepEqual(reads, [before[0], before[1], before[2] + 1])
      for (const layout of gapLayouts)
        assert.deepEqual(
          yogaGapGeometry(
            stub.StyleSheet.flatten(host('Increase Hour', 'Pressable').props.style),
            layout,
          ),
          [24, 24],
        )
      const afterStepFocus = [...reads]
      renderer.act(() => host('Minute', 'View').props.onFocus({ nativeEvent: {} }))
      assert.deepEqual(
        reads,
        afterStepFocus,
        'value focus does not reevaluate the parent field author',
      )
      for (const layout of gapLayouts)
        assert.deepEqual(
          yogaGapGeometry(stub.StyleSheet.flatten(host('Minute', 'View').props.style), layout),
          [6, 4],
          'value owns its class axes, not the field group author',
        )
      action('Hour', 'decrement')
      assert.deepEqual(changes, [], '08:30 is below the whole-time lower bound')
      action('Hour')
      assert.deepEqual(changes, [], '10:30 exceeds the whole-time upper bound')
      action('Minute')
      check()
      assert.equal(host('Minute', 'View').props.accessibilityValue.now, 45)
      action('Minute')
      assert.equal(host('Hour', 'View').props.accessibilityValue.now, 10)
      assert.equal(host('Minute', 'View').props.accessibilityValue.now, 0)
      action('Minute')
      assert.deepEqual(changes, [
        { hour: 9, minute: 45, second: 0 },
        { hour: 10, minute: 0, second: 0 },
      ])
      base = { ...base, disabled: true }
      renderer.act(() => view.update(element()))
      assert.equal(host('Minute', 'View').props.focusable, false)
      assert.equal(host('Minute', 'View').props.accessibilityState.disabled, true)
      assert.equal(host('Increase Hour', 'Pressable').props.disabled, true)
      action('Minute')
      renderer.act(() => host('Increase Hour', 'Pressable').props.onPress())
      assert.equal(changes.length, 2)
    } finally {
      renderer.act(() => view?.unmount())
    }
  }
})
