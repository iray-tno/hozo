// Whether `TimePicker`'s fields are accessibility elements, on the platform
// where that is a prop rather than a consequence.
//
// The defect this pins was invisible to every check in the repository. The
// fields carried `accessibilityRole`, `accessibilityLabel` and
// `accessibilityValue` and were read by nobody, because a React Native `View`
// is only an accessibility element when it says `accessible` -- and no type
// error, no DOM test and no compiled-output assertion has an opinion about
// that. It took a 24-minute device run to find: TalkBack's walk of the pickers
// screen was seven items, the four steppers, the period and the two triggers,
// and the hour and minute fields were on it nowhere.
//
// A tree assertion is the right place for the fix to live. The bug was not
// "the props are wrong" but "the element is inert with the right props on it",
// which is exactly what a rendered tree can see and a type cannot.
//
// The behaviour is asserted too, not just the attributes. `accessibilityActions`
// without a handler that moves the value is the same class of mistake one layer
// along: everything declared, nothing happening.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

// Imported for its resolve hook: `react-native` has to be the stub before
// anything below pulls the component in.
import './native-render.ts'

const require = createRequire(import.meta.url)

const react = require('react') as {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
}
const renderer = require('react-test-renderer') as {
  create: (element: unknown) => { toJSON: () => Node | Node[] | null }
  act: (callback: () => void) => void
}
const { HozoTimePicker } = require('../../form/src/time-picker.native.tsx') as {
  HozoTimePicker: unknown
}

type Node = {
  type: string
  props: Record<string, unknown>
  children: (Node | string)[] | null
}

type Field = {
  accessible?: boolean
  accessibilityRole?: string
  accessibilityLabel?: string
  accessibilityValue?: { min?: number; max?: number; now?: number; text?: string }
  accessibilityActions?: readonly { name: string }[]
  onAccessibilityAction?: (event: { nativeEvent: { actionName: string } }) => void
}

function flatten(node: Node | Node[] | null | string): Node[] {
  if (node === null || typeof node === 'string') return []
  if (Array.isArray(node)) return node.flatMap(flatten)
  return [node, ...(node.children ?? []).flatMap(flatten)]
}

/** Every node rendered for a picker holding half past nine, in tree order. */
function nodes(props: Record<string, unknown> = {}) {
  const element = react.createElement(HozoTimePicker, {
    value: { hour: 9, minute: 30 },
    locale: 'en-US',
    hour12: true,
    ...props,
  })
  // `toJSON` after the callback, never inside it. React 19 does not flush
  // outside `act`, and within it the commit has not happened -- so the answer
  // is `null`, which is indistinguishable from a component that rendered
  // nothing. `native-render.ts` carries the same warning and this test was
  // written past it: the first run found no fields and said so exactly as it
  // would have if the fix under test had not worked.
  let root: { toJSON: () => Node | Node[] | null } | null = null
  renderer.act(() => {
    root = renderer.create(element)
  })
  if (root === null) return []
  return flatten((root as { toJSON: () => Node | Node[] | null }).toJSON())
}

const adjustables = (props: Record<string, unknown> = {}) =>
  nodes(props).filter((node) => (node.props as Field).accessibilityRole === 'adjustable')

test('each field is an accessibility element, which is the prop that was missing', () => {
  const fields = adjustables()
  assert.equal(fields.length, 2, 'the hour and the minute')
  for (const field of fields) {
    const props = field.props as Field
    // The line the device run was needed to find. Without it the three below
    // are declarations nothing reads.
    assert.equal(props.accessible, true)
  }
})

test('each field is a range Android can offer gestures against', () => {
  const [hour, minute] = adjustables().map((field) => field.props as Field)
  assert.ok(hour && minute)
  assert.equal(hour.accessibilityLabel, 'Hour')
  assert.equal(minute.accessibilityLabel, 'Minute')
  // A twelve-hour field speaks 1-12, and the value it reports is on that clock
  // rather than the 0-23 the record holds.
  assert.deepEqual(
    { ...hour.accessibilityValue, text: undefined },
    {
      max: 12,
      min: 1,
      now: 9,
      text: undefined,
    },
  )
  assert.deepEqual(
    { ...minute.accessibilityValue, text: undefined },
    {
      max: 59,
      min: 0,
      now: 30,
      text: undefined,
    },
  )
})

test('a field says the whole time, not the digits it shows', () => {
  for (const field of adjustables()) {
    const { text } = (field.props as Field).accessibilityValue ?? {}
    // The Web half's `aria-valuetext`, and the reason is the same: a reader
    // moving the hour wants to hear where that put the time. Matched loosely
    // because ICU puts a narrow no-break space before the period.
    assert.match(text ?? '', /9:30/)
    assert.match(text ?? '', /AM/)
  }
})

test('an unset field is a range with no current value rather than a guessed one', () => {
  const fields = adjustables({ value: null })
  for (const field of fields) {
    const value = (field.props as Field).accessibilityValue ?? {}
    assert.ok(typeof value.min === 'number' && typeof value.max === 'number')
    assert.equal('now' in value, false, 'midnight is not what the picker holds')
  }
})

test('the gestures move the value, and are not a declaration on their own', () => {
  const changes: { hour: number; minute: number }[] = []
  const fields = adjustables({
    onChange: (time: { hour: number; minute: number }) => changes.push(time),
  })
  const [hour, minute] = fields.map((field) => field.props as Field)
  assert.ok(hour && minute)

  assert.deepEqual(
    hour.accessibilityActions?.map((action) => action.name),
    ['increment', 'decrement'],
  )

  hour.onAccessibilityAction?.({ nativeEvent: { actionName: 'increment' } })
  assert.deepEqual(changes.at(-1), { hour: 10, minute: 30 })
  hour.onAccessibilityAction?.({ nativeEvent: { actionName: 'decrement' } })
  assert.deepEqual(changes.at(-1), { hour: 8, minute: 30 })
  // The hour steps an hour and keeps the minutes, which is `addHours`.
  minute.onAccessibilityAction?.({ nativeEvent: { actionName: 'increment' } })
  assert.deepEqual(changes.at(-1), { hour: 9, minute: 31 })
})

test('a disabled picker does not move on a gesture it still advertises', () => {
  const changes: unknown[] = []
  const [hour] = adjustables({
    disabled: true,
    onChange: (time: unknown) => changes.push(time),
  }).map((field) => field.props as Field)
  hour?.onAccessibilityAction?.({ nativeEvent: { actionName: 'increment' } })
  // Advertised rather than withdrawn: a control that stops offering its
  // actions while disabled is a control that changes shape, and
  // `accessibilityState` is where "you cannot use this now" belongs.
  assert.deepEqual(changes, [])
})

test('an action nobody sent is not acted on', () => {
  const changes: unknown[] = []
  const [hour] = adjustables({ onChange: (time: unknown) => changes.push(time) }).map(
    (field) => field.props as Field,
  )
  hour?.onAccessibilityAction?.({ nativeEvent: { actionName: 'activate' } })
  assert.deepEqual(changes, [])
})
