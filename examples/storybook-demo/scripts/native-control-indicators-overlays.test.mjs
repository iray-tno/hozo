// Native host-render tests for overlays, selections, navigation, and control indicators.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import React, { act } from 'react'
import { create } from 'react-test-renderer'
import {
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
  flat,
  HozoAccordion,
  HozoBottomSheet,
  HozoCheckbox,
  HozoColorPicker,
  HozoCombobox,
  HozoCommandPalette,
  HozoDrawer,
  HozoInteractionContext,
  HozoListbox,
  HozoMenu,
  HozoNavigationProvider,
  HozoPagination,
  HozoPopover,
  HozoRadioGroup,
  HozoSlider,
  HozoSwitch,
  HozoTabs,
  HozoTree,
  hostState,
  hozoClasses,
  indicators,
  interactionClasses,
  measuredHosts,
  mount,
  NativeView,
  nativeI18n,
  openedURLs,
  panel,
  press,
  RadioPattern,
  resolverFor,
  SwitchPattern,
  scrim,
  shortcutSemanticClasses,
  Tooltip,
  theme,
  UiColorPicker,
  UiCombobox,
  UiCommandPalette,
  UiDialog,
  UiListbox,
  UiTree,
  uiRoot,
  views,
} from './native-control-indicators-harness.mjs'

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

test('Native BottomSheet keeps the UI bottom anchor and top corners at narrow and wide widths', async (t) => {
  // @hozo/ui's root list, read from its source so the two cannot drift.
  const source = readFileSync(path.join(uiRoot, 'src/bottom-sheet.tsx'), 'utf8')
  const rootClass = source.match(/^const root = '([^']+)'/m)[1]
  const sheetClass = source.match(/^const sheet =\s*'([^']+)'/m)[1]
  const previous = hostState.viewport
  t.after(() => {
    hostState.viewport = previous
  })
  for (const width of [390, 1280]) {
    hostState.viewport = { width, height: 800 }
    const tree = await mount(t, HozoBottomSheet, {
      open: true,
      className: rootClass,
      sheetClassName: sheetClass,
      testID: 'desktop-sheet',
    })
    const root = flat(views(tree)[0].props.style)
    assert.equal(
      root.flex,
      1,
      'the Web layer is fixed inset-0; RN drops fixed, so the root fills the Modal',
    )
    assert.equal(root.flexDirection, 'row', 'items-end is the bottom edge only in a row')
    assert.equal(root.alignItems, 'flex-end')
    assert.equal(root.justifyContent, 'center')
    const sheet = flat(
      views(tree).find((node) => node.props.testID === 'desktop-sheet').props.style,
    )
    assert.equal(sheet.maxWidth, 512)
    assert.equal(sheet.borderTopLeftRadius, 16)
    assert.equal(sheet.borderBottomLeftRadius ?? 0, 0)
  }
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
    hostState.insets = { top: 0, right: 0, bottom: 0, left: 0 }
  })
  const padding = async (Component, ownClass, insets) => {
    hostState.insets = insets
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
    hostState.insets = { top: 0, right: 0, bottom: 0, left: 0 }
  })
  // iPhone landscape: the notch on the left, the home indicator below.
  hostState.insets = { top: 0, right: 0, bottom: 21, left: 59 }
  const sides = (style) => [flat(style).paddingLeft, flat(style).paddingRight]

  // The panel reaches its own edge and no other, so only that edge is padded.
  const left = await mount(t, HozoDrawer, { open: true, panelClassName: 'p-6' })
  assert.deepEqual(sides(panel(left).props.style), [83, 24], 'a left drawer pads the left')
  const right = await mount(t, HozoDrawer, { open: true, side: 'right', panelClassName: 'p-6' })
  assert.deepEqual(sides(panel(right).props.style), [24, 24], 'a right drawer is away from it')
  hostState.insets = { top: 0, right: 59, bottom: 21, left: 0 }
  const turned = await mount(t, HozoDrawer, { open: true, side: 'right', panelClassName: 'p-6' })
  assert.deepEqual(
    sides(panel(turned).props.style),
    [24, 83],
    'and pads the right once it is there',
  )

  // The sheet is centred with a maximum width, so the root keeps it off both
  // insets and the sheet's own padding is left alone.
  hostState.insets = { top: 0, right: 59, bottom: 21, left: 59 }
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
    hostState.dark = dark
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
  hostState.dark = false
})

test('Native UI ColorPicker centers thumbs with logical marginStart and reverses track gradients in RTL', async (t) => {
  t.after(() => {
    nativeI18n.isRTL = false
  })
  for (const isRTL of [false, true]) {
    nativeI18n.isRTL = isRTL
    const changes = []
    const tree = await mount(t, UiColorPicker, {
      accessibilityLabel: 'Direction',
      alpha: true,
      defaultValue: '#ffff00',
      onChange: (value) => changes.push(value),
    })
    const sliders = () => tree.root.findAllByType(HozoSlider)
    const thumbs = () => views(tree).filter((node) => node.props.accessibilityRole === 'adjustable')
    const direction = isRTL ? 'to left' : 'to right'
    for (const slider of sliders()) {
      const track = flat(slider.findAllByType('NativeView')[0].props.style)
      assert.match(track.backgroundImage, new RegExp(`^linear-gradient\\(${direction}, `))
    }
    const hueThumb = flat(thumbs()[0].props.style)
    assert.equal(hueThumb.marginStart, -12)
    assert.equal(hueThumb.width, 24)
    assert.equal(hueThumb.height, 24)
    assert.equal(hueThumb.start, `${(60 / 359) * 100}%`)
    assert.deepEqual(hueThumb.transform, [{ translateY: '-50%' }])

    const hueTrack = sliders()[0].findAllByType('NativeView')[0]
    await act(() =>
      hueTrack.props.onLayout({ nativeEvent: { layout: { width: 359, height: 12 } } }),
    )
    const locationX = isRTL ? 359 - 180 : 180
    await act(() => hueTrack.props.onResponderGrant({ nativeEvent: { locationX, locationY: 6 } }))
    await act(() => hueTrack.props.onResponderRelease({}, { dx: 0, dy: 0 }))
    assert.equal(changes.at(-1), '#00ffff')
    assert.equal(flat(thumbs()[0].props.style).start, `${(180 / 359) * 100}%`)
  }
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
    hostState.insets = insets
    t.after(() => {
      hostState.insets = { top: 0, right: 0, bottom: 0, left: 0 }
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
    hostState.dark = false
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
    hostState.dark = dark
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
  assert.equal(flat(scroll().props.style).rowGap, undefined)
  assert.equal(flat(scroll().props.style).columnGap, undefined)
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
    hostState.dark = false
    hostState.viewport = { width: 400, height: 800 }
  })
  for (const dark of [false, true]) {
    hostState.dark = dark
    hostState.viewport = { width: 400, height: 800 }
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
    hostState.viewport = { width: 800, height: 400 }
    await act(() => tree.update(React.createElement(UiDialog, props)))
    assert.equal(flat(panel().props.style).maxHeight, 340, 'rotation recomputes the bound')
  }
})

test('compiled UI CommandPalette uses its Modal viewport and real search/list owners', async (t) => {
  hostState.viewport = { width: 400, height: 800 }
  t.after(() => {
    hostState.viewport = { width: 400, height: 800 }
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
  hostState.viewport = { width: 400, height: 1000 }
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
  const look = (name) => new RegExp(`const ${name} =\\s*'([^']*)'`).exec(source)?.[1] ?? ''
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
  assert.deepEqual(
    warnings.filter((message) => !message.includes('transition')),
    [],
  )
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
  assert.equal(
    flat(hosts()[0].props.style).backgroundColor,
    undefined,
    'scrim is a decorative non-control owner and does not borrow Pressable hover',
  )
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
