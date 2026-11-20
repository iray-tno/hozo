import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { MANIFEST_VERSION } from './manifest.ts'
import {
  OWNER_SHADOW_VERSION,
  parseOwnerContractShadow,
  selectOwnerShape,
} from './owner-contract.ts'

const text = readFileSync(
  new URL('../../../scripts/style-slots/owner-shadow.json', import.meta.url),
  'utf8',
)
const parsed = () => parseOwnerContractShadow(text)
const contract = () => parsed().contracts[0]!
test('Toolbar root is one unknown-audit non-interactive shape, not an item event owner', () => {
  const toolbar = parsed().contracts.find((row) => row.owner === 'Toolbar.root')!
  assert.ok(toolbar)
  assert.equal(toolbar.audit, 'unknown')
  assert.deepEqual(toolbar.abi, {
    nativePreparedProp: 'hozoToolbarStyle',
    webClassProp: 'className',
  })
  assert.deepEqual(toolbar.authoredStyles, [{ prop: 'style', order: 0 }])
  assert.deepEqual(toolbar.shapes, [
    {
      id: 'root',
      when: { eq: ['present', true] },
      nativeHost: 'View',
      webHost: 'div',
      events: [],
    },
  ])
  assert.equal(selectOwnerShape(toolbar, { present: true }).status, 'selected')
  assert.equal(selectOwnerShape(toolbar, { present: false }).status, 'absent')
  assert.equal(selectOwnerShape(toolbar, {}).status, 'unresolved')
})
test('Form, SubmitButton and FileDropzone root contracts are audited on their declared host shapes', () => {
  const form = parsed().contracts.find((row) => row.owner === 'Form.root')!
  assert.equal(form.audit, 'audited')
  assert.deepEqual(form.abi, { nativePreparedProp: 'hozoFormStyle', webClassProp: 'className' })
  assert.deepEqual(form.shapes, [
    {
      id: 'root',
      when: { eq: ['present', true] },
      nativeHost: 'View',
      webHost: 'form',
      events: [],
    },
  ])
  for (const [owner, prop] of [
    ['SubmitButton.root', 'hozoSubmitButtonStyle'],
    ['FileDropzone.root', 'hozoFileDropzoneStyle'],
  ]) {
    const entry = parsed().contracts.find((row) => row.owner === owner)!
    assert.equal(entry.audit, 'audited')
    assert.deepEqual(entry.abi, { nativePreparedProp: prop, webClassProp: 'className' })
    assert.deepEqual(entry.shapes, [
      {
        id: 'root',
        when: { eq: ['present', true] },
        nativeHost: 'Pressable',
        webHost: 'button',
        events: ['pressed', 'hovered', 'focused', 'focusVisible'],
        inputs: { facts: ['disabled'], splitText: true },
      },
    ])
  }
  rejects((value) => {
    const submit = value.contracts.find((row) => row.owner === 'SubmitButton.root')!
    submit.shapes[0]!.webHost = 'form'
  }, /control host/)
})
test('Field and TextArea contracts declare empty authoredStyles, Text leaves, and TextInput facts', () => {
  for (const [owner, classProp, prop, nativeHost, webHost] of [
    ['Field.root', 'className', 'hozoFieldStyle', 'View', 'div'],
    ['Field.label', 'labelClassName', 'hozoLabelStyle', 'Text', 'label'],
    ['Field.required', 'requiredClassName', 'hozoRequiredStyle', 'Text', 'span'],
    ['Field.description', 'descriptionClassName', 'hozoDescriptionStyle', 'Text', 'span'],
    ['Field.error', 'errorClassName', 'hozoErrorStyle', 'Text', 'span'],
  ] as const) {
    const entry = parsed().contracts.find((row) => row.owner === owner)!
    assert.equal(entry.audit, 'audited')
    assert.equal(entry.classProp, classProp)
    assert.deepEqual(entry.abi, { nativePreparedProp: prop, webClassProp: classProp })
    assert.deepEqual(entry.authoredStyles, [])
    assert.deepEqual(entry.shapes, [
      {
        id: owner.split('.')[1],
        when: { eq: ['present', true] },
        nativeHost,
        webHost,
        events: [],
      },
    ])
  }
  const field = parsed().contracts.find((row) => row.owner === 'TextArea.field')!
  assert.equal(field.audit, 'audited')
  assert.deepEqual(field.abi, {
    nativePreparedProp: 'hozoFieldStyle',
    webClassProp: 'fieldClassName',
  })
  assert.deepEqual(field.authoredStyles, [{ prop: 'fieldStyle', order: 0 }])
  assert.deepEqual(field.shapes, [
    {
      id: 'field',
      when: { eq: ['present', true] },
      nativeHost: 'TextInput',
      webHost: 'textarea',
      events: ['focused', 'focusVisible'],
      inputs: {
        facts: ['disabled', 'readOnly', 'aria-invalid', 'aria-required'],
        splitText: false,
      },
    },
  ])
  rejects((value) => {
    const entry = value.contracts.find((row) => row.owner === 'TextArea.field')!
    entry.shapes[0]!.events.push('hovered')
  }, /input events\/host/)
  rejects((value) => {
    const entry = value.contracts.find((row) => row.owner === 'TextArea.field')!
    entry.shapes[0]!.inputs!.splitText = true
  }, /full control snapshot/)
  rejects((value) => {
    const entry = value.contracts.find((row) => row.owner === 'Field.label')!
    entry.shapes[0]!.webHost = 'div'
  }, /text events\/host/)
  rejects((value) => {
    const entry = value.contracts.find((row) => row.owner === 'Field.label')!
    entry.shapes[0]!.events = ['hovered']
  }, /text events\/host/)
})
test('NativeSelect root contract declares select webHost and Pressable form facts', () => {
  const select = parsed().contracts.find((row) => row.owner === 'NativeSelect.root')!
  assert.equal(select.audit, 'audited')
  assert.deepEqual(select.abi, { nativePreparedProp: 'hozoSelectStyle', webClassProp: 'className' })
  assert.deepEqual(select.authoredStyles, [
    { prop: 'style', order: 0 },
    { prop: 'textStyle', order: 1 },
  ])
  assert.deepEqual(select.shapes, [
    {
      id: 'root',
      when: { eq: ['present', true] },
      nativeHost: 'Pressable',
      webHost: 'select',
      events: ['pressed', 'hovered', 'focused', 'focusVisible'],
      inputs: { facts: ['disabled', 'aria-invalid', 'aria-required'], splitText: true },
    },
  ])
  rejects((value) => {
    const form = value.contracts.find((row) => row.owner === 'Form.root')!
    form.shapes[0]!.webHost = 'select'
  }, /decoration events\/host/)
})
test('Calendar contracts declare split-text Views, table/td hosts, and data-hozo-* facts', () => {
  for (const [owner, classProp, prop, webHost] of [
    ['Calendar.root', 'className', 'hozoCalendarStyle', 'div'],
    ['Calendar.header', 'headerClassName', 'hozoHeaderStyle', 'div'],
    ['Calendar.grid', 'gridClassName', 'hozoGridStyle', 'table'],
  ] as const) {
    const entry = parsed().contracts.find((row) => row.owner === owner)!
    assert.equal(entry.audit, 'audited')
    assert.deepEqual(entry.abi, { nativePreparedProp: prop, webClassProp: classProp })
    assert.deepEqual(entry.shapes, [
      {
        id: owner.split('.')[1],
        when: { eq: ['present', true] },
        nativeHost: 'View',
        webHost,
        events: [],
        inputs: { facts: [], splitText: true },
      },
    ])
  }
  const day = parsed().contracts.find((row) => row.owner === 'Calendar.day')!
  assert.equal(day.audit, 'audited')
  assert.equal(day.shapes[0]!.webHost, 'td')
  assert.deepEqual(day.shapes[0]!.inputs, {
    facts: [
      'aria-selected',
      'aria-disabled',
      'data-hozo-outside',
      'data-hozo-disabled',
      'data-hozo-range-start',
      'data-hozo-range-end',
      'data-hozo-in-range',
    ],
    splitText: true,
  })
  rejects((value) => {
    const entry = value.contracts.find((row) => row.owner === 'Calendar.root')!
    entry.shapes[0]!.inputs!.facts = ['disabled']
  }, /full control snapshot/)
})
test('DatePicker, DateRangePicker and DateTimePicker contracts declare aria-expanded triggers and forwarded Calendar slots', () => {
  for (const [component, rootProp] of [
    ['DatePicker', 'hozoDatePickerStyle'],
    ['DateRangePicker', 'hozoDateRangePickerStyle'],
    ['DateTimePicker', 'hozoDateTimePickerStyle'],
  ]) {
    const root = parsed().contracts.find((row) => row.owner === `${component}.root`)!
    assert.equal(root.audit, 'audited')
    assert.equal(root.abi.nativePreparedProp, rootProp)
    assert.deepEqual(root.shapes[0]!.inputs, { facts: [], splitText: true })
    const trigger = parsed().contracts.find((row) => row.owner === `${component}.trigger`)!
    assert.equal(trigger.audit, 'audited')
    assert.deepEqual(trigger.shapes[0]!.inputs, {
      facts: ['disabled', 'aria-expanded'],
      splitText: true,
    })
    for (const part of ['dialog', 'calendar', 'header', 'grid', 'monthButton', 'day']) {
      assert.equal(
        parsed().contracts.find((row) => row.owner === `${component}.${part}`)!.audit,
        'audited',
      )
    }
  }
  const done = parsed().contracts.find((row) => row.owner === 'DateTimePicker.done')!
  assert.equal(done.audit, 'audited')
  assert.deepEqual(done.shapes[0]!.inputs, { facts: [], splitText: true })
})
test('TimePicker contracts declare interactive spinbutton View and data-hozo-step buttons', () => {
  const root = parsed().contracts.find((row) => row.owner === 'TimePicker.root')!
  assert.equal(root.audit, 'audited')
  assert.deepEqual(root.abi, {
    nativePreparedProp: 'hozoTimePickerStyle',
    webClassProp: 'className',
  })
  assert.deepEqual(root.shapes[0]!.inputs, { facts: [], splitText: true })
  const field = parsed().contracts.find((row) => row.owner === 'TimePicker.field')!
  assert.equal(field.audit, 'audited')
  assert.deepEqual(field.abi, {
    nativePreparedProp: 'hozoFieldStyle',
    webClassProp: 'fieldClassName',
  })
  const value = parsed().contracts.find((row) => row.owner === 'TimePicker.value')!
  assert.equal(value.audit, 'audited')
  assert.deepEqual(value.abi, {
    nativePreparedProp: 'hozoValueStyle',
    webClassProp: 'valueClassName',
  })
  assert.deepEqual(value.authoredStyles, [{ prop: 'fieldTextStyle', order: 0 }])
  assert.deepEqual(value.shapes, [
    {
      id: 'value',
      when: { eq: ['present', true] },
      nativeHost: 'View',
      webHost: 'div',
      events: ['hovered', 'focused', 'focusVisible'],
      inputs: { facts: ['aria-disabled', 'data-hozo-disabled'], splitText: true },
    },
  ])
  const period = parsed().contracts.find((row) => row.owner === 'TimePicker.period')!
  assert.equal(period.audit, 'audited')
  assert.deepEqual(period.authoredStyles, [
    { prop: 'fieldStyle', order: 0 },
    { prop: 'fieldTextStyle', order: 1 },
  ])
  assert.deepEqual(period.shapes[0]!.inputs, {
    facts: ['disabled', 'data-hozo-disabled'],
    splitText: true,
  })
  const step = parsed().contracts.find((row) => row.owner === 'TimePicker.step')!
  assert.equal(step.audit, 'audited')
  assert.deepEqual(step.shapes[0]!.inputs, {
    facts: [
      'disabled',
      'data-hozo-step',
      'data-hozo-step=increase',
      'data-hozo-step=decrease',
      'data-hozo-disabled',
    ],
    splitText: true,
  })
  rejects((doc) => {
    const entry = doc.contracts.find((row) => row.owner === 'TimePicker.value')!
    entry.shapes[0]!.events.push('pressed')
  }, /decoration events\/host/)
  rejects((doc) => {
    const entry = doc.contracts.find((row) => row.owner === 'TimePicker.value')!
    entry.shapes[0]!.webHost = 'table'
  }, /decoration events\/host/)
  rejects((doc) => {
    const entry = doc.contracts.find((row) => row.owner === 'TimePicker.value')!
    entry.shapes[0]!.events = []
  }, /full control snapshot/)
})
test('single-platform contracts declare null host/carrier on the absent platform (#2095)', () => {
  const active = parsed().contracts.find((row) => row.owner === 'FileDropzone.active')!
  assert.equal(active.audit, 'audited')
  assert.deepEqual(active.abi, { nativePreparedProp: null, webClassProp: 'activeClassName' })
  assert.deepEqual(active.authoredStyles, [])
  assert.deepEqual(active.shapes, [
    {
      id: 'active',
      when: { eq: ['present', true] },
      nativeHost: null,
      webHost: 'button',
      events: ['pressed', 'hovered', 'focused', 'focusVisible'],
    },
  ])
  const indicator = parsed().contracts.find((row) => row.owner === 'NativeSelect.indicator')!
  assert.equal(indicator.audit, 'audited')
  assert.deepEqual(indicator.abi, { nativePreparedProp: 'hozoIndicatorStyle', webClassProp: null })
  assert.deepEqual(indicator.shapes, [
    {
      id: 'indicator',
      when: { eq: ['present', true] },
      nativeHost: 'View',
      webHost: null,
      events: ['pressed', 'hovered', 'focused', 'focusVisible'],
      inputs: { facts: ['disabled', 'aria-invalid', 'aria-required'], splitText: false },
    },
  ])
  const sheet = parsed().contracts.find((row) => row.owner === 'NativeSelect.sheet')!
  assert.equal(sheet.audit, 'audited')
  assert.deepEqual(sheet.abi, { nativePreparedProp: 'hozoSheetStyle', webClassProp: null })
  assert.deepEqual(sheet.shapes[0]!.inputs, { facts: [], splitText: true })
  const scrim = parsed().contracts.find((row) => row.owner === 'NativeSelect.scrim')!
  assert.equal(scrim.audit, 'audited')
  assert.deepEqual(scrim.abi, { nativePreparedProp: 'hozoScrimStyle', webClassProp: null })
  assert.equal(scrim.shapes[0]!.inputs, undefined)
  const option = parsed().contracts.find((row) => row.owner === 'NativeSelect.option')!
  assert.equal(option.audit, 'audited')
  assert.deepEqual(option.abi, { nativePreparedProp: 'hozoOptionStyle', webClassProp: null })
  assert.deepEqual(option.shapes, [
    {
      id: 'option',
      when: { eq: ['present', true] },
      nativeHost: 'Pressable',
      webHost: null,
      events: ['pressed'],
      inputs: { facts: ['disabled', 'aria-selected', 'aria-disabled'], splitText: true },
    },
  ])
  rejects((doc) => {
    const entry = doc.contracts.find((row) => row.owner === 'FileDropzone.active')!
    entry.abi.webClassProp = null
  }, /empty carriers/)
  rejects((doc) => {
    const entry = doc.contracts.find((row) => row.owner === 'FileDropzone.active')!
    entry.shapes[0]!.webHost = null
  }, /shape host/)
  rejects((doc) => {
    const entry = doc.contracts.find((row) => row.owner === 'FileDropzone.active')!
    entry.authoredStyles = [{ prop: 'style', order: 0 }]
  }, /authoredStyles requires native carrier/)
  rejects((doc) => {
    const entry = doc.contracts.find((row) => row.owner === 'FileDropzone.active')!
    entry.shapes[0]!.inputs = { facts: [], splitText: false }
  }, /inputs require native host/)
  rejects((doc) => {
    const entry = doc.contracts.find((row) => row.owner === 'FileDropzone.active')!
    entry.abi.nativePreparedProp = 'hozoActiveStyle'
  }, /native host\/carrier mismatch/)
  rejects((doc) => {
    const entry = doc.contracts.find((row) => row.owner === 'NativeSelect.sheet')!
    entry.abi.webClassProp = 'sheetClassName'
  }, /web host\/carrier mismatch/)
  rejects((doc) => {
    const entry = doc.contracts.find((row) => row.owner === 'NativeSelect.option')!
    entry.shapes[0]!.events = ['pressed', 'hovered']
  }, /full control snapshot/)
})
test('Drawer scrim and panel contracts declare stateless box and split-text View hosts (#2046)', () => {
  const scrim = parsed().contracts.find((row) => row.owner === 'Drawer.scrim')!
  assert.equal(scrim.audit, 'audited')
  assert.deepEqual(scrim.abi, {
    nativePreparedProp: 'hozoScrimStyle',
    webClassProp: 'scrimClassName',
  })
  assert.deepEqual(scrim.authoredStyles, [{ prop: 'scrimStyle', order: 0 }])
  assert.deepEqual(scrim.shapes, [
    {
      id: 'scrim',
      when: { eq: ['present', true] },
      nativeHost: 'View',
      webHost: 'div',
      events: [],
    },
  ])
  const panel = parsed().contracts.find((row) => row.owner === 'Drawer.panel')!
  assert.equal(panel.audit, 'audited')
  assert.deepEqual(panel.abi, {
    nativePreparedProp: 'hozoPanelStyle',
    webClassProp: 'panelClassName',
  })
  assert.deepEqual(panel.authoredStyles, [{ prop: 'panelStyle', order: 0 }])
  assert.deepEqual(panel.shapes, [
    {
      id: 'panel',
      when: { eq: ['present', true] },
      nativeHost: 'View',
      webHost: 'div',
      events: [],
      inputs: { facts: [], splitText: true },
    },
  ])
})
test('Popover trigger and panel contracts declare Pressable facts and split-text View (#2046)', () => {
  const trigger = parsed().contracts.find((row) => row.owner === 'Popover.trigger')!
  assert.equal(trigger.audit, 'audited')
  assert.deepEqual(trigger.abi, {
    nativePreparedProp: 'hozoTriggerStyle',
    webClassProp: 'triggerClassName',
  })
  assert.deepEqual(trigger.authoredStyles, [{ prop: 'triggerStyle', order: 0 }])
  assert.deepEqual(trigger.shapes, [
    {
      id: 'trigger',
      when: { eq: ['present', true] },
      nativeHost: 'Pressable',
      webHost: 'button',
      events: ['pressed', 'hovered', 'focused', 'focusVisible'],
      inputs: { facts: ['disabled', 'aria-expanded', 'data-hozo-disabled'], splitText: true },
    },
  ])
  const panel = parsed().contracts.find((row) => row.owner === 'Popover.panel')!
  assert.equal(panel.audit, 'audited')
  assert.deepEqual(panel.abi, {
    nativePreparedProp: 'hozoPanelStyle',
    webClassProp: 'panelClassName',
  })
  assert.deepEqual(panel.authoredStyles, [{ prop: 'panelStyle', order: 0 }])
  assert.deepEqual(panel.shapes, [
    {
      id: 'panel',
      when: { eq: ['present', true] },
      nativeHost: 'View',
      webHost: 'div',
      events: [],
      inputs: { facts: [], splitText: true },
    },
  ])
})
test('RadioGroup option contract declares Pressable div host and aria-checked/aria-disabled facts (#2046)', () => {
  const option = parsed().contracts.find((row) => row.owner === 'RadioGroup.option')!
  assert.equal(option.audit, 'audited')
  assert.deepEqual(option.abi, {
    nativePreparedProp: 'hozoOptionStyle',
    webClassProp: 'optionClassName',
  })
  assert.deepEqual(option.authoredStyles, [{ prop: 'optionStyle', order: 0 }])
  assert.deepEqual(option.shapes, [
    {
      id: 'option',
      when: { eq: ['present', true] },
      nativeHost: 'Pressable',
      webHost: 'div',
      events: ['pressed', 'hovered', 'focused', 'focusVisible'],
      inputs: { facts: ['aria-checked', 'aria-disabled'], splitText: true },
    },
  ])
})
test('Tree row contract declares Pressable div host and aria-selected/expanded/disabled facts (#2046)', () => {
  const row = parsed().contracts.find((entry) => entry.owner === 'Tree.row')!
  assert.equal(row.audit, 'audited')
  assert.deepEqual(row.abi, {
    nativePreparedProp: 'hozoRowStyle',
    webClassProp: 'rowClassName',
  })
  assert.deepEqual(row.authoredStyles, [{ prop: 'rowStyle', order: 0 }])
  assert.deepEqual(row.shapes, [
    {
      id: 'row',
      when: { eq: ['present', true] },
      nativeHost: 'Pressable',
      webHost: 'div',
      events: ['pressed', 'hovered', 'focused', 'focusVisible'],
      inputs: { facts: ['aria-selected', 'aria-expanded', 'aria-disabled'], splitText: true },
    },
  ])
})
test('Splitter root contract declares interactive View div host and drag/collapse facts (#2046)', () => {
  const splitter = parsed().contracts.find((entry) => entry.owner === 'Splitter.root')!
  assert.equal(splitter.audit, 'audited')
  assert.deepEqual(splitter.abi, {
    nativePreparedProp: 'hozoSplitterStyle',
    webClassProp: 'className',
  })
  assert.deepEqual(splitter.authoredStyles, [{ prop: 'style', order: 0 }])
  assert.deepEqual(splitter.shapes, [
    {
      id: 'handle',
      when: { eq: ['present', true] },
      nativeHost: 'View',
      webHost: 'div',
      events: ['hovered', 'focused', 'focusVisible'],
      inputs: { facts: ['data-dragging', 'data-collapsed'], splitText: false },
    },
  ])
})
test('ResizablePane contracts declare div root, section split-text pane, and handle View (#2046)', () => {
  const root = parsed().contracts.find((entry) => entry.owner === 'ResizablePane.root')!
  assert.equal(root.audit, 'audited')
  assert.deepEqual(root.abi, {
    nativePreparedProp: 'hozoResizablePaneStyle',
    webClassProp: 'className',
  })
  assert.deepEqual(root.authoredStyles, [{ prop: 'style', order: 0 }])
  assert.deepEqual(root.shapes, [
    { id: 'root', when: { eq: ['present', true] }, nativeHost: 'View', webHost: 'div', events: [] },
  ])
  const pane = parsed().contracts.find((entry) => entry.owner === 'ResizablePane.pane')!
  assert.equal(pane.audit, 'audited')
  assert.deepEqual(pane.abi, {
    nativePreparedProp: 'hozoPaneStyle',
    webClassProp: 'paneClassName',
  })
  assert.deepEqual(pane.authoredStyles, [{ prop: 'paneStyle', order: 0 }])
  assert.deepEqual(pane.shapes, [
    {
      id: 'pane',
      when: { eq: ['present', true] },
      nativeHost: 'View',
      webHost: 'section',
      events: [],
      inputs: { facts: [], splitText: true },
    },
  ])
  const handle = parsed().contracts.find((entry) => entry.owner === 'ResizablePane.handle')!
  assert.equal(handle.audit, 'audited')
  assert.deepEqual(handle.abi, {
    nativePreparedProp: 'hozoHandleStyle',
    webClassProp: 'handleClassName',
  })
  assert.deepEqual(handle.authoredStyles, [{ prop: 'handleStyle', order: 0 }])
  assert.deepEqual(handle.shapes, [
    {
      id: 'handle',
      when: { eq: ['present', true] },
      nativeHost: 'View',
      webHost: 'div',
      events: ['hovered', 'focused', 'focusVisible'],
      inputs: { facts: ['data-dragging', 'data-collapsed'], splitText: false },
    },
  ])
})
test('Slider contracts declare focus-only thumb View and stateless fill/rail Views (#2046)', () => {
  const thumb = parsed().contracts.find((entry) => entry.owner === 'Slider.thumb')!
  assert.equal(thumb.audit, 'audited')
  assert.deepEqual(thumb.abi, {
    nativePreparedProp: 'hozoSliderThumbStyle',
    webClassProp: 'thumbClassName',
  })
  assert.deepEqual(thumb.authoredStyles, [{ prop: 'thumbStyle', order: 0 }])
  assert.deepEqual(thumb.shapes, [
    {
      id: 'thumb',
      when: { eq: ['present', true] },
      nativeHost: 'View',
      webHost: 'div',
      events: ['focused', 'focusVisible'],
      inputs: { facts: ['aria-disabled'], splitText: false },
    },
  ])
  for (const [owner, classProp, prop, styleProp, id] of [
    ['Slider.fill', 'fillClassName', 'hozoFillStyle', 'fillStyle', 'fill'],
    ['Slider.rail', 'railClassName', 'hozoRailStyle', 'railStyle', 'rail'],
  ] as const) {
    const entry = parsed().contracts.find((row) => row.owner === owner)!
    assert.equal(entry.audit, 'audited')
    assert.deepEqual(entry.abi, { nativePreparedProp: prop, webClassProp: classProp })
    assert.deepEqual(entry.authoredStyles, [{ prop: styleProp, order: 0 }])
    assert.deepEqual(entry.shapes, [
      { id, when: { eq: ['present', true] }, nativeHost: 'View', webHost: 'div', events: [] },
    ])
  }
})
test('Accordion contracts declare section, heading, trigger, data-state panel, and panelContent (#2046)', () => {
  const section = parsed().contracts.find((entry) => entry.owner === 'Accordion.section')!
  assert.equal(section.audit, 'audited')
  assert.deepEqual(section.abi, {
    nativePreparedProp: 'hozoSectionStyle',
    webClassProp: 'sectionClassName',
  })
  assert.deepEqual(section.authoredStyles, [{ prop: 'sectionStyle', order: 0 }])
  assert.deepEqual(section.shapes, [
    {
      id: 'section',
      when: { eq: ['present', true] },
      nativeHost: 'View',
      webHost: 'div',
      events: [],
    },
  ])
  const heading = parsed().contracts.find((entry) => entry.owner === 'Accordion.heading')!
  assert.equal(heading.audit, 'audited')
  assert.deepEqual(heading.abi, {
    nativePreparedProp: 'hozoHeadingStyle',
    webClassProp: 'headingClassName',
  })
  assert.deepEqual(heading.authoredStyles, [])
  assert.deepEqual(heading.shapes, [
    {
      id: 'heading',
      when: { eq: ['present', true] },
      nativeHost: 'View',
      webHost: 'heading',
      events: [],
      inputs: { facts: [], splitText: true },
    },
  ])
  const trigger = parsed().contracts.find((entry) => entry.owner === 'Accordion.trigger')!
  assert.equal(trigger.audit, 'audited')
  assert.deepEqual(trigger.abi, {
    nativePreparedProp: 'hozoTriggerStyle',
    webClassProp: 'triggerClassName',
  })
  assert.deepEqual(trigger.authoredStyles, [
    { prop: 'triggerStyle', order: 0 },
    { prop: 'triggerTextStyle', order: 1 },
  ])
  assert.deepEqual(trigger.shapes, [
    {
      id: 'trigger',
      when: { eq: ['present', true] },
      nativeHost: 'Pressable',
      webHost: 'button',
      events: ['pressed', 'hovered', 'focused', 'focusVisible'],
      inputs: {
        facts: [
          'disabled',
          'aria-expanded',
          'data-hozo-disabled',
          'data-hozo-state=open',
          'data-hozo-state=closed',
        ],
        splitText: true,
      },
    },
  ])
  const panel = parsed().contracts.find((entry) => entry.owner === 'Accordion.panel')!
  assert.equal(panel.audit, 'audited')
  assert.deepEqual(panel.abi, {
    nativePreparedProp: 'hozoPanelStyle',
    webClassProp: 'panelClassName',
  })
  assert.deepEqual(panel.authoredStyles, [{ prop: 'panelStyle', order: 0 }])
  assert.deepEqual(panel.shapes, [
    {
      id: 'panel',
      when: { eq: ['present', true] },
      nativeHost: 'View',
      webHost: 'div',
      events: [],
      inputs: { facts: ['data-hozo-state=open', 'data-hozo-state=closed'], splitText: true },
    },
  ])
  const content = parsed().contracts.find((entry) => entry.owner === 'Accordion.panelContent')!
  assert.equal(content.audit, 'audited')
  assert.deepEqual(content.abi, {
    nativePreparedProp: 'hozoPanelContentStyle',
    webClassProp: 'panelContentClassName',
  })
  assert.deepEqual(content.authoredStyles, [{ prop: 'panelContentStyle', order: 0 }])
  assert.deepEqual(content.shapes, [
    {
      id: 'panelContent',
      when: { eq: ['present', true] },
      nativeHost: 'View',
      webHost: 'div',
      events: [],
      inputs: { facts: [], splitText: true },
    },
  ])
})

test('CodeBlock contracts declare figure root, figcaption text, copy button, and data-code-mark spans (#2046)', () => {
  const root = parsed().contracts.find((entry) => entry.owner === 'CodeBlock.root')!
  assert.equal(root.audit, 'audited')
  assert.deepEqual(root.shapes, [
    {
      id: 'root',
      when: { eq: ['present', true] },
      nativeHost: 'View',
      webHost: 'figure',
      events: [],
      inputs: { facts: [], splitText: true },
    },
  ])
  const caption = parsed().contracts.find((entry) => entry.owner === 'CodeBlock.caption')!
  assert.equal(caption.audit, 'audited')
  assert.deepEqual(caption.shapes, [
    {
      id: 'caption',
      when: { eq: ['present', true] },
      nativeHost: 'Text',
      webHost: 'figcaption',
      events: [],
    },
  ])
  const copy = parsed().contracts.find((entry) => entry.owner === 'CodeBlock.copy')!
  assert.equal(copy.audit, 'audited')
  assert.deepEqual(copy.shapes, [
    {
      id: 'copy',
      when: { eq: ['present', true] },
      nativeHost: 'Pressable',
      webHost: 'button',
      events: ['pressed', 'hovered', 'focused', 'focusVisible'],
      inputs: { facts: [], splitText: true },
    },
  ])
  for (const part of ['line', 'gutter', 'ins', 'del', 'mark']) {
    const entry = parsed().contracts.find((row) => row.owner === `CodeBlock.${part}`)!
    assert.equal(entry.audit, 'audited')
    assert.deepEqual(entry.shapes, [
      {
        id: part,
        when: { eq: ['present', true] },
        nativeHost: 'View',
        webHost: 'span',
        events: [],
        inputs: {
          facts: [
            'data-code-mark',
            'data-code-mark=ins',
            'data-code-mark=del',
            'data-code-mark=mark',
          ],
          splitText: true,
        },
      },
    ])
  }
  const checkbox = parsed().contracts.find((entry) => entry.owner === 'Checkbox.root')!
  assert.equal(checkbox.audit, 'audited')
  assert.deepEqual(checkbox.shapes, [
    {
      id: 'root',
      when: { eq: ['present', true] },
      nativeHost: 'Pressable',
      webHost: 'button',
      events: ['pressed', 'hovered', 'focused', 'focusVisible'],
      inputs: {
        facts: [
          'disabled',
          'aria-checked',
          'data-hozo-disabled',
          'data-hozo-state=checked',
          'data-hozo-state=unchecked',
          'data-hozo-state=mixed',
        ],
        splitText: true,
      },
    },
  ])
  const toggleSwitch = parsed().contracts.find((entry) => entry.owner === 'Switch.root')!
  assert.equal(toggleSwitch.audit, 'audited')
  assert.deepEqual(toggleSwitch.shapes, [
    {
      id: 'root',
      when: { eq: ['present', true] },
      nativeHost: 'Pressable',
      webHost: 'button',
      events: ['pressed', 'hovered', 'focused', 'focusVisible'],
      inputs: {
        facts: [
          'disabled',
          'aria-checked',
          'data-hozo-disabled',
          'data-hozo-state=checked',
          'data-hozo-state=unchecked',
        ],
        splitText: true,
      },
    },
  ])
  for (const [owner, prop] of [
    ['Alert.root', 'hozoAlertStyle'],
    ['Tooltip.root', 'hozoTooltipStyle'],
  ]) {
    const entry = parsed().contracts.find((row) => row.owner === owner)!
    assert.equal(entry.audit, 'audited')
    assert.equal(entry.abi.nativePreparedProp, prop)
    assert.deepEqual(entry.shapes, [
      {
        id: 'root',
        when: { eq: ['present', true] },
        nativeHost: 'View',
        webHost: 'div',
        events: [],
        inputs: { facts: [], splitText: true },
      },
    ])
  }
})
function rejects(change: (value: ReturnType<typeof parsed>) => void, reason: RegExp) {
  const value = parsed()
  change(value)
  assert.throws(() => parseOwnerContractShadow(JSON.stringify(value)), reason)
}

test('shadow data is explicit, bounded and independent of the shipped v1 manifest protocol', () => {
  assert.equal(MANIFEST_VERSION, 2)
  assert.equal(parsed().schema, OWNER_SHADOW_VERSION)
  assert.equal(contract().owner, 'BottomSheet.handle')
  assert.equal(contract().audit, 'audited')
  assert.deepEqual(contract().authoredStyles, [{ prop: 'handleStyle', order: 0 }])
  assert.throws(() => parseOwnerContractShadow('{'), /JSON/)
  assert.throws(() => parseOwnerContractShadow(' '.repeat(131_073)), /size/)
  assert.throws(() => parseOwnerContractShadow('{"schema":2,"contracts":[]}'), /schema/)
  assert.throws(
    () =>
      parseOwnerContractShadow(
        '{"schema":"rfc010-owner-shadow-0","contracts":[],"execute":"evil()"}',
      ),
    /fields/,
  )
  rejects((value) => {
    value.contracts = []
  }, /contracts/)
  rejects((value) => {
    value.contracts.push(value.contracts[0]!)
  }, /duplicate/)
  rejects((value) => {
    Object.assign(value.contracts[0]!, { audit: 'certified' })
  }, /audit/)
})

test('audit vocabulary transports a declaration but cannot add an evidence channel', () => {
  const value = parsed()
  value.contracts[0]!.audit = 'audited'
  assert.equal(parseOwnerContractShadow(JSON.stringify(value)).contracts[0]!.audit, 'audited')
  Object.assign(value.contracts[0]!, { auditEvidence: { passed: true } })
  assert.throws(() => parseOwnerContractShadow(JSON.stringify(value)), /fields/)
})

test('native partial ABI only describes an explicitly stateful box and a decorative fallback', () => {
  const value = parsed()
  const handle = value.contracts[0]!
  handle.shapes[0]!.inputs = { facts: [], splitText: false }
  handle.abi.nativePartial = { prop: 'hozoInteractiveHandleStyle', shape: 'resizable' }
  const parse = () => parseOwnerContractShadow(JSON.stringify(value))
  assert.deepEqual(parse().contracts[0]!.abi.nativePartial, handle.abi.nativePartial)
  handle.abi.nativePartial.shape = 'decorative'
  assert.throws(parse, /native partial requires/)
  handle.abi.nativePartial.shape = 'resizable'
  handle.abi.nativePartial.prop = handle.abi.nativePreparedProp
  assert.throws(parse, /carrier collision/)
  handle.abi.nativePartial.prop = 'hozoInteractiveHandleStyle'
  handle.shapes[0]!.inputs.splitText = true
  assert.throws(parse, /native partial requires/)
})

test('gates choose each present handle shape; an absent owner does not require resizable', () => {
  const owner = contract()
  for (const resizable of [false, true]) {
    assert.deepEqual(selectOwnerShape(owner, { present: false, resizable }), { status: 'absent' })
    const selected = selectOwnerShape(owner, { present: true, resizable })
    assert.equal(selected.status, 'selected')
    if (selected.status === 'selected')
      assert.equal(selected.shape.id, resizable ? 'resizable' : 'decorative')
  }
  assert.deepEqual(selectOwnerShape(owner, { present: false }), { status: 'absent' })
  assert.deepEqual(selectOwnerShape(owner, {}), {
    status: 'unresolved',
    possible: ['resizable', 'decorative'],
  })
  assert.deepEqual(selectOwnerShape(owner, { present: true }), {
    status: 'unresolved',
    possible: ['resizable', 'decorative'],
  })
  assert.deepEqual(selectOwnerShape(owner, { present: 'true' }), {
    status: 'invalid',
    binding: 'present',
  })
  assert.equal(
    selectOwnerShape(owner, Object.create({ present: true, resizable: true })).status,
    'unresolved',
  )
  let reads = 0
  const accessor = {
    get present() {
      reads++
      return true
    },
    resizable: true,
  }
  assert.deepEqual(selectOwnerShape(owner, accessor), { status: 'invalid', binding: 'present' })
  assert.equal(reads, 0, 'shadow inspection must not capture/evaluate caller accessors')
})

test('overlap and a true shape competing with an unknown one never silently select the first', () => {
  const owner = contract()
  owner.shapes[1]!.when = { eq: ['present', true] }
  assert.deepEqual(selectOwnerShape(owner, { present: true, resizable: true }), {
    status: 'ambiguous',
    matching: ['resizable', 'decorative'],
  })
  assert.deepEqual(selectOwnerShape(owner, { present: true }), {
    status: 'unresolved',
    possible: ['resizable', 'decorative'],
  })
  owner.shapes[0]!.when = { any: [{ eq: ['present', true] }, { eq: ['resizable', true] }] }
  assert.equal(selectOwnerShape(owner, { present: false }).status, 'unresolved')
  assert.equal(selectOwnerShape(owner, { present: false, resizable: true }).status, 'selected')
})

test('symbols are declared booleans, not executable expressions or arbitrary gate operators', () => {
  rejects((value) => {
    value.contracts[0]!.bindings[0] = 'props.present()'
  }, /binding/)
  rejects((value) => {
    value.contracts[0]!.bindings.push('present')
  }, /duplicate/)
  rejects((value) => {
    value.contracts[0]!.shapes[0]!.when = { eq: ['missing', true] }
  }, /binding/)
  rejects((value) => {
    Object.assign(value.contracts[0]!.shapes[0]!, { when: { js: 'present()' } })
  }, /operator/)
  rejects((value) => {
    Object.assign(value.contracts[0]!.shapes[0]!, { when: { eq: ['present', 'true'] } })
  }, /binding/)
  rejects((value) => {
    value.contracts[0]!.shapes[0]!.when = { all: [] }
  }, /operands/)
  rejects((value) => {
    value.contracts[0]!.shapes[0]!.when = { all: [{ eq: ['present', true] }], any: [] }
  }, /fields/)
  rejects((value) => {
    for (let i = 0; i < 10; i++)
      value.contracts[0]!.shapes[0]!.when = { all: [value.contracts[0]!.shapes[0]!.when] }
  }, /budget/)
  rejects((value) => {
    value.contracts[0]!.shapes = Array.from({ length: 16 }, (_, i) => ({
      ...value.contracts[0]!.shapes[0]!,
      id: `s${i}`,
      when: { all: Array.from({ length: 16 }, () => ({ eq: ['present', true] })) },
    }))
  }, /budget/)
})

test('unsupported host/event declarations remain errors rather than invented decoration state', () => {
  rejects((value) => {
    value.contracts[0]!.shapes[1]!.events = ['hovered']
  }, /decoration/)
  rejects((value) => {
    Object.assign(value.contracts[0]!.shapes[0]!, { nativeHost: 'Text' })
  }, /host/)
  rejects((value) => {
    value.contracts[0]!.shapes[0]!.webHost = 'form'
  }, /host/)
  rejects((value) => {
    Object.assign(value.contracts[0]!.shapes[0]!, { events: ['selected'] })
  }, /event/)
  rejects((value) => {
    value.contracts[0]!.shapes[0]!.events = ['pressed', 'pressed']
  }, /duplicate/)
  rejects((value) => {
    value.contracts[0]!.shapes[1]!.id = 'resizable'
  }, /duplicate/)
})

test('prepared carrier and explicit author ordering cannot collide', () => {
  rejects((value) => {
    value.contracts[0]!.authoredStyles[0]!.prop = 'hozoHandleStyle'
  }, /collision/)
  rejects((value) => {
    value.contracts[0]!.authoredStyles[0]!.prop = 'handleClassName'
  }, /collision/)
  rejects((value) => {
    value.contracts[0]!.authoredStyles[0]!.order = -1
  }, /order/)
  rejects((value) => {
    value.contracts[0]!.authoredStyles.push({ prop: 'style', order: 0 })
  }, /duplicate/)
  rejects((value) => {
    value.contracts[0]!.abi.webClassProp = 'className'
  }, /carrier/)
  rejects((value) => {
    value.contracts[0]!.abi.nativePreparedProp = 'handleStyle'
  }, /private carrier/)
})
