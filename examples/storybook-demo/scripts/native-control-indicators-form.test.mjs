// Native host-render tests for canonical controls, @hozo/form, pickers, and Calendar.
import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { create } from 'react-test-renderer'
import {
  actionSheets,
  announcements,
  checkClassSlots,
  color,
  dialogUnmeasuredClass,
  fileZoneClasses,
  flat,
  HozoCalendar,
  HozoDatePicker,
  HozoDateTimePicker,
  HozoFileDropzone,
  HozoForm,
  HozoNativeSelect,
  HozoTextArea,
  HozoTimePicker,
  hiddenPeriodClass,
  hostState,
  interactionClasses,
  moduleSource,
  mount,
  NativeCanonicalPressable,
  NativeOwnerLink,
  NativeOwnerPressable,
  NativePressable,
  NativeSelectProvider,
  NativeText,
  NativeView,
  nativePlatform,
  openedURLs,
  panel,
  pickerCases,
  press,
  resolverFor,
  timeActiveUnmeasuredClass,
  timeStepClasses,
  timeValueClasses,
  UiAccordion,
  UiCalendar,
  UiDateTimePicker,
  UiFileDropzone,
  UiForm,
  UiNativeSelect,
  UiTextArea,
  UiTimePicker,
  useFormSubmit,
  views,
  withoutClock,
} from './native-control-indicators-harness.mjs'

test('the Native host harness links real generated helpers in both directions', () => {
  assert.match(moduleSource, /@hozo\/core\/generated\/class-resolver/)
  assert.match(moduleSource, /hozoTextMetricStyles/)
  for (const isRTL of [false, true]) {
    const style = flat(resolverFor(isRTL)('leading-6 text-lg'))
    assert.equal(style.fontSize, 18)
    assert.equal(style.lineHeight, 24)
  }
})

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
  const formStyle = flat(views(ui)[0].props.style)
  assert.deepEqual([formStyle.rowGap, formStyle.columnGap], [16, 16])
  assert.equal(flat(views(ui)[0].props.style).flexDirection, 'column')
  let submit
  const before = hostState.keyboardDismissals
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
            assert.equal(hostState.keyboardDismissals, before + 1, 'dismiss before submitting')
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
  assert.equal(hostState.keyboardDismissals, before + 1)
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
// Its right border is written as the LTR end edge, so the RTL swap cannot
// turn the chevron the other way (#2050).
const chevronOf = (node) =>
  node
    .findAllByType('NativeView')
    .find(
      (view) =>
        view.props.accessibilityElementsHidden && flat(view.props.style).borderEndWidth === 2,
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
  const groupStyle = flat(timeGroup(tree).props.style)
  assert.deepEqual([groupStyle.rowGap, groupStyle.columnGap], [8, 8])
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
