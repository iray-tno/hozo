// Native host-render tests for ColorPicker swatches, Stepper, Chip, OTP, and shared tracker.
import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import {
  checkInteraction,
  color,
  flat,
  HozoChip,
  HozoColorPicker,
  HozoOtpInput,
  HozoStepper,
  interactionClasses,
  mount,
  otpCellFocusClasses,
  otpSemanticClasses,
  otpUnsupportedFocusClasses,
  press,
  selectedSwatchSemanticClasses,
  swatchSemanticClasses,
  usePressableInteraction,
} from './native-control-indicators-harness.mjs'

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
