// Prepared slot marker delivery on Web Chromium and Native for @hozo/patterns controls.
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Fixtures retain authored TSX interpolation.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler } from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'
import {
  Accordion,
  BottomSheet,
  CodeBlock,
  CodeClipboardProvider,
  Drawer,
  Popover,
  RadioGroup,
  ResizablePane,
  Slider,
  Splitter,
  Tabs,
  Tree,
} from '@hozo/patterns'
import { transformSync } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformHozoSource } from '../../../packages/metro/src/transform.ts'
import { launchCallerBrowser } from './caller-composition-harness.mjs'

let browser

before(async () => {
  browser = await launchCallerBrowser()
})
after(async () => {
  await browser?.close()
})

test('Drawer delivers prepared scrim and panel markers on Web Chromium and Native (#2046)', async () => {
  const compiler = createCompiler()
  const source = `import { Drawer } from '@hozo/patterns'
export function Screen() {
  return (
    <div id="wrap">
      <Drawer
        open
        portal={false}
        accessibilityLabel="Menu"
        scrimClassName="bg-[#121212] opacity-50"
        panelClassName="pt-6 bg-[#fafafa] text-[#112233]"
      >
        Body
      </Drawer>
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  const webJs = transformSync(web.code, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const webMod = { exports: {} }
  runInNewContext(webJs, {
    module: webMod,
    exports: webMod.exports,
    h: createElement,
    require: (id) => {
      if (id === '@hozo/patterns') return { Drawer }
      throw new Error(`unexpected web import ${id}`)
    },
  })

  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  const nativeJs = transformSync(nativeCode, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  let nativeProps
  const nativeMod = { exports: {} }
  runInNewContext(nativeJs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props) => {
      if (type === 'Drawer') nativeProps = props
      return { type, props }
    },
    require: (id) => {
      if (id === '@hozo/patterns') return { Drawer: 'Drawer' }
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      throw new Error(`unexpected native import ${id}`)
    },
  })
  nativeMod.exports.Screen()
  assert.equal(nativeProps.scrimClassName, undefined)
  assert.equal(nativeProps.panelClassName, undefined)
  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const nativeScrim = flat(nativeProps.hozoScrimStyle())
  const nativePanel = flat(nativeProps.hozoPanelStyle())

  const html = renderToStaticMarkup(createElement(webMod.exports.Screen))
  const page = await browser.newPage()
  try {
    await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
    const markers = await page.evaluate(() => {
      const scrim = document.querySelector('#wrap [aria-hidden="true"]')
      const panel = document.querySelector('#wrap [role="dialog"]')
      return {
        scrimBg: getComputedStyle(scrim).backgroundColor,
        scrimOpacity: parseFloat(getComputedStyle(scrim).opacity),
        panelPaddingTop: parseFloat(getComputedStyle(panel).paddingTop),
        panelBg: getComputedStyle(panel).backgroundColor,
        panelColor: getComputedStyle(panel).color,
      }
    })
    assert.deepEqual(markers, {
      scrimBg: hexToRgb(nativeScrim.backgroundColor),
      scrimOpacity: nativeScrim.opacity,
      panelPaddingTop: nativePanel.paddingTop,
      panelBg: hexToRgb(nativePanel.backgroundColor),
      panelColor: hexToRgb(nativePanel.color),
    })
  } finally {
    await page.close()
  }
})

test('Popover delivers prepared trigger and panel markers across states on Web Chromium and Native (#2046)', async () => {
  const compiler = createCompiler()
  const source = `import { Popover } from '@hozo/patterns'
export function Screen({ open, disabled }: { open?: boolean; disabled?: boolean }) {
  return (
    <div id="wrap">
      <Popover
        open={open}
        disabled={disabled}
        accessibilityLabel="Options"
        trigger="Open"
        triggerClassName="bg-[#111111] hover:bg-[#222222] active:bg-[#333333] focus-visible:border-[#444444] border aria-expanded:bg-[#555555] disabled:bg-[#666666] text-[#eeeeee] disabled:text-[#999999]"
        panelClassName="pt-4 bg-[#fafafa] text-[#112233]"
      >
        Details
      </Popover>
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  const webJs = transformSync(web.code, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const webMod = { exports: {} }
  runInNewContext(webJs, {
    module: webMod,
    exports: webMod.exports,
    h: createElement,
    require: (id) => {
      if (id === '@hozo/patterns') return { Popover }
      throw new Error(`unexpected web import ${id}`)
    },
  })

  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  const nativeJs = transformSync(nativeCode, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  let nativeProps
  const nativeMod = { exports: {} }
  runInNewContext(nativeJs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props) => {
      if (type === 'Popover') nativeProps = props
      return { type, props }
    },
    require: (id) => {
      if (id === '@hozo/patterns') return { Popover: 'Popover' }
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      throw new Error(`unexpected native import ${id}`)
    },
  })
  nativeMod.exports.Screen({ open: true, disabled: false })
  assert.equal(nativeProps.triggerClassName, undefined)
  assert.equal(nativeProps.panelClassName, undefined)
  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const triggerNative = (overrides = {}) =>
    flat(
      nativeProps.hozoTriggerStyle({
        hovered: false,
        pressed: false,
        focused: false,
        focusVisible: false,
        disabled: false,
        'aria-expanded': false,
        'data-hozo-disabled': false,
        ...overrides,
      }),
    )
  const nativePanel = flat(nativeProps.hozoPanelStyle())

  const page = await browser.newPage()
  try {
    // Closed interactive states: rest, hover, active, focus-visible
    const closedHtml = renderToStaticMarkup(createElement(webMod.exports.Screen, { open: false }))
    await page.setContent(`<!doctype html><style>${web.css}</style>${closedHtml}`)
    const trigger = page.locator('#wrap button')
    const readTrigger = () =>
      trigger.evaluate((el) => ({
        bg: getComputedStyle(el).backgroundColor,
        color: getComputedStyle(el).color,
        borderColor: getComputedStyle(el).borderTopColor,
      }))

    assert.equal((await readTrigger()).bg, hexToRgb(triggerNative().backgroundColor))
    assert.equal((await readTrigger()).color, hexToRgb(triggerNative().color))

    await page.keyboard.press('Tab')
    await page.waitForFunction(() =>
      document.querySelector('#wrap button').matches(':focus-visible'),
    )
    assert.equal(
      (await readTrigger()).borderColor,
      hexToRgb(triggerNative({ focused: true, focusVisible: true }).borderColor),
    )

    await page.evaluate(() => document.activeElement?.blur())
    await trigger.hover()
    await page.waitForFunction(() => document.querySelector('#wrap button').matches(':hover'))
    assert.equal(
      (await readTrigger()).bg,
      hexToRgb(triggerNative({ hovered: true }).backgroundColor),
    )

    await page.mouse.down()
    try {
      await page.waitForFunction(() => document.querySelector('#wrap button').matches(':active'))
      assert.equal(
        (await readTrigger()).bg,
        hexToRgb(triggerNative({ hovered: true, pressed: true }).backgroundColor),
      )
    } finally {
      await page.mouse.up()
    }

    // Open state: aria-expanded on trigger + panel markers
    const openHtml = renderToStaticMarkup(createElement(webMod.exports.Screen, { open: true }))
    await page.setContent(`<!doctype html><style>${web.css}</style>${openHtml}`)
    const openMarkers = await page.evaluate(() => {
      const btn = document.querySelector('#wrap button')
      const panel = document.querySelector('#wrap [role="dialog"]')
      return {
        triggerBg: getComputedStyle(btn).backgroundColor,
        panelPaddingTop: parseFloat(getComputedStyle(panel).paddingTop),
        panelBg: getComputedStyle(panel).backgroundColor,
        panelColor: getComputedStyle(panel).color,
      }
    })
    assert.deepEqual(openMarkers, {
      triggerBg: hexToRgb(triggerNative({ 'aria-expanded': true }).backgroundColor),
      panelPaddingTop: nativePanel.paddingTop,
      panelBg: hexToRgb(nativePanel.backgroundColor),
      panelColor: hexToRgb(nativePanel.color),
    })

    // Disabled state: disabled: and data-[hozo-disabled]: on trigger
    const disabledHtml = renderToStaticMarkup(
      createElement(webMod.exports.Screen, { open: false, disabled: true }),
    )
    await page.setContent(`<!doctype html><style>${web.css}</style>${disabledHtml}`)
    const disabledMarkers = await page.evaluate(() => {
      const btn = document.querySelector('#wrap button')
      return {
        bg: getComputedStyle(btn).backgroundColor,
        color: getComputedStyle(btn).color,
      }
    })
    const nativeDisabled = triggerNative({ disabled: true, 'data-hozo-disabled': true })
    assert.deepEqual(disabledMarkers, {
      bg: hexToRgb(nativeDisabled.backgroundColor),
      color: hexToRgb(nativeDisabled.color),
    })
  } finally {
    await page.close()
  }
})

test('RadioGroup delivers prepared option markers across states on Web Chromium and Native (#2046)', async () => {
  const compiler = createCompiler()
  const source = `import { RadioGroup } from '@hozo/patterns'
export function Screen() {
  return (
    <div id="wrap">
      <RadioGroup
        value="b"
        accessibilityLabel="Size"
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
          { value: 'c', label: 'Gamma', disabled: true },
        ]}
        optionClassName="bg-[#111111] hover:bg-[#222222] active:bg-[#333333] focus-visible:border-[#444444] border aria-checked:bg-[#555555] aria-disabled:bg-[#666666] text-[#eeeeee] aria-disabled:text-[#999999]"
      />
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  const webJs = transformSync(web.code, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const webMod = { exports: {} }
  runInNewContext(webJs, {
    module: webMod,
    exports: webMod.exports,
    h: createElement,
    require: (id) => {
      if (id === '@hozo/patterns') return { RadioGroup }
      throw new Error(`unexpected web import ${id}`)
    },
  })

  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  const nativeJs = transformSync(nativeCode, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  let nativeProps
  const nativeMod = { exports: {} }
  runInNewContext(nativeJs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props) => {
      if (type === 'RadioGroup') nativeProps = props
      return { type, props }
    },
    require: (id) => {
      if (id === '@hozo/patterns') return { RadioGroup: 'RadioGroup' }
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      throw new Error(`unexpected native import ${id}`)
    },
  })
  nativeMod.exports.Screen()
  assert.equal(nativeProps.optionClassName, undefined)
  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const optionNative = (overrides = {}) =>
    flat(
      nativeProps.hozoOptionStyle({
        hovered: false,
        pressed: false,
        focused: false,
        focusVisible: false,
        'aria-checked': false,
        'aria-disabled': false,
        ...overrides,
      }),
    )

  const html = renderToStaticMarkup(createElement(webMod.exports.Screen))
  const page = await browser.newPage()
  try {
    await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
    const readOption = (index) =>
      page
        .locator('#wrap [role="radio"]')
        .nth(index)
        .evaluate((el) => ({
          bg: getComputedStyle(el).backgroundColor,
          color: getComputedStyle(el).color,
          borderColor: getComputedStyle(el).borderTopColor,
        }))

    // Unchecked, checked, and disabled rest states
    assert.equal((await readOption(0)).bg, hexToRgb(optionNative().backgroundColor))
    assert.equal((await readOption(0)).color, hexToRgb(optionNative().color))
    assert.equal(
      (await readOption(1)).bg,
      hexToRgb(optionNative({ 'aria-checked': true }).backgroundColor),
    )
    assert.equal(
      (await readOption(2)).bg,
      hexToRgb(optionNative({ 'aria-disabled': true }).backgroundColor),
    )
    assert.equal(
      (await readOption(2)).color,
      hexToRgb(optionNative({ 'aria-disabled': true }).color),
    )

    // Keyboard Tab focuses the checked option (tabIndex=0) with :focus-visible
    await page.keyboard.press('Tab')
    await page.waitForFunction(() =>
      document.querySelectorAll('#wrap [role="radio"]')[1].matches(':focus-visible'),
    )
    assert.equal(
      (await readOption(1)).borderColor,
      hexToRgb(
        optionNative({ focused: true, focusVisible: true, 'aria-checked': true }).borderColor,
      ),
    )

    // Hover and active on unchecked option
    await page.evaluate(() => document.activeElement?.blur())
    const first = page.locator('#wrap [role="radio"]').nth(0)
    await first.hover()
    await page.waitForFunction(() =>
      document.querySelectorAll('#wrap [role="radio"]')[0].matches(':hover'),
    )
    assert.equal(
      (await readOption(0)).bg,
      hexToRgb(optionNative({ hovered: true }).backgroundColor),
    )

    await page.mouse.down()
    try {
      await page.waitForFunction(() =>
        document.querySelectorAll('#wrap [role="radio"]')[0].matches(':active'),
      )
      assert.equal(
        (await readOption(0)).bg,
        hexToRgb(optionNative({ hovered: true, pressed: true }).backgroundColor),
      )
    } finally {
      await page.mouse.up()
    }
  } finally {
    await page.close()
  }
})

test('Tree delivers prepared row markers across states on Web Chromium and Native (#2046)', async () => {
  const compiler = createCompiler()
  const source = `import { Tree } from '@hozo/patterns'
export function Screen() {
  return (
    <div id="wrap">
      <Tree
        selectedId="child"
        defaultExpanded={['branch-open']}
        accessibilityLabel="Files"
        nodes={[
          { id: 'leaf', label: 'Leaf' },
          { id: 'branch-open', label: 'Open', children: [{ id: 'child', label: 'Child' }] },
          { id: 'branch-closed', label: 'Closed', children: [{ id: 'hidden', label: 'Hidden' }] },
          { id: 'disabled', label: 'Disabled', disabled: true },
        ]}
        rowClassName="bg-[#111111] hover:bg-[#222222] active:bg-[#333333] border border-[#aaaaaa] focus-visible:border-[#444444] aria-selected:bg-[#555555] aria-expanded:border-[#666666] aria-disabled:bg-[#777777] text-[#eeeeee] aria-disabled:text-[#999999]"
      />
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  const webJs = transformSync(web.code, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const webMod = { exports: {} }
  runInNewContext(webJs, {
    module: webMod,
    exports: webMod.exports,
    h: createElement,
    require: (id) => {
      if (id === '@hozo/patterns') return { Tree }
      throw new Error(`unexpected web import ${id}`)
    },
  })

  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  const nativeJs = transformSync(nativeCode, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  let nativeProps
  const nativeMod = { exports: {} }
  runInNewContext(nativeJs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props) => {
      if (type === 'Tree') nativeProps = props
      return { type, props }
    },
    require: (id) => {
      if (id === '@hozo/patterns') return { Tree: 'Tree' }
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      throw new Error(`unexpected native import ${id}`)
    },
  })
  nativeMod.exports.Screen()
  assert.equal(nativeProps.rowClassName, undefined)
  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const rowNative = (overrides = {}) =>
    flat(
      nativeProps.hozoRowStyle({
        hovered: false,
        pressed: false,
        focused: false,
        focusVisible: false,
        'aria-selected': false,
        'aria-expanded': false,
        'aria-disabled': false,
        ...overrides,
      }),
    )

  const html = renderToStaticMarkup(createElement(webMod.exports.Screen))
  const page = await browser.newPage()
  try {
    await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
    const readRow = (index) =>
      page
        .locator('#wrap [role="treeitem"]')
        .nth(index)
        .evaluate((el) => ({
          bg: getComputedStyle(el).backgroundColor,
          color: getComputedStyle(el).color,
          borderColor: getComputedStyle(el).borderTopColor,
        }))

    // [0: leaf, 1: branch-open, 2: child (selected), 3: branch-closed, 4: disabled]
    assert.equal((await readRow(0)).bg, hexToRgb(rowNative().backgroundColor))
    assert.equal((await readRow(0)).color, hexToRgb(rowNative().color))
    assert.equal((await readRow(0)).borderColor, hexToRgb(rowNative().borderColor))
    assert.equal(
      (await readRow(1)).borderColor,
      hexToRgb(rowNative({ 'aria-expanded': true }).borderColor),
    )
    assert.equal(
      (await readRow(2)).bg,
      hexToRgb(rowNative({ 'aria-selected': true }).backgroundColor),
    )
    assert.equal((await readRow(3)).borderColor, hexToRgb(rowNative().borderColor))
    assert.equal(
      (await readRow(4)).bg,
      hexToRgb(rowNative({ 'aria-disabled': true }).backgroundColor),
    )
    assert.equal((await readRow(4)).color, hexToRgb(rowNative({ 'aria-disabled': true }).color))

    // Keyboard Tab focuses the selected row (index 2, tabIndex=0) with :focus-visible
    await page.keyboard.press('Tab')
    await page.waitForFunction(() =>
      document.querySelectorAll('#wrap [role="treeitem"]')[2].matches(':focus-visible'),
    )
    assert.equal(
      (await readRow(2)).borderColor,
      hexToRgb(rowNative({ focused: true, focusVisible: true, 'aria-selected': true }).borderColor),
    )

    // Hover and active on resting leaf row (index 0)
    await page.evaluate(() => document.activeElement?.blur())
    const leaf = page.locator('#wrap [role="treeitem"]').nth(0)
    await leaf.hover()
    await page.waitForFunction(() =>
      document.querySelectorAll('#wrap [role="treeitem"]')[0].matches(':hover'),
    )
    assert.equal((await readRow(0)).bg, hexToRgb(rowNative({ hovered: true }).backgroundColor))

    await page.mouse.down()
    try {
      await page.waitForFunction(() =>
        document.querySelectorAll('#wrap [role="treeitem"]')[0].matches(':active'),
      )
      assert.equal(
        (await readRow(0)).bg,
        hexToRgb(rowNative({ hovered: true, pressed: true }).backgroundColor),
      )
    } finally {
      await page.mouse.up()
    }
  } finally {
    await page.close()
  }
})

test('Splitter delivers prepared handle markers across states on Web Chromium and Native (#2046)', async () => {
  const compiler = createCompiler()
  const source = `import { Splitter } from '@hozo/patterns'
export function Screen({ collapsed }: { collapsed?: boolean }) {
  return (
    <div id="wrap">
      <Splitter
        label="Sidebar"
        controls="nav"
        min={100}
        max={400}
        collapsible
        collapsed={collapsed}
        className="w-4 h-12 bg-[#111111] hover:bg-[#222222] border border-[#aaaaaa] focus-visible:border-[#333333] data-[dragging]:bg-[#444444] data-[collapsed]:bg-[#555555]"
      />
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  const webJs = transformSync(web.code, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const webMod = { exports: {} }
  runInNewContext(webJs, {
    module: webMod,
    exports: webMod.exports,
    h: createElement,
    require: (id) => {
      if (id === '@hozo/patterns') return { Splitter }
      throw new Error(`unexpected web import ${id}`)
    },
  })

  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  const nativeJs = transformSync(nativeCode, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  let nativeProps
  const nativeMod = { exports: {} }
  runInNewContext(nativeJs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props) => {
      if (type === 'Splitter') nativeProps = props
      return { type, props }
    },
    require: (id) => {
      if (id === '@hozo/patterns') return { Splitter: 'Splitter' }
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      throw new Error(`unexpected native import ${id}`)
    },
  })
  nativeMod.exports.Screen({ collapsed: false })
  assert.equal(nativeProps.className, undefined)
  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const handleNative = (overrides = {}) =>
    flat(
      nativeProps.hozoSplitterStyle({
        hovered: false,
        focused: false,
        focusVisible: false,
        'data-dragging': false,
        'data-collapsed': false,
        ...overrides,
      }),
    )

  const page = await browser.newPage()
  try {
    const html = renderToStaticMarkup(createElement(webMod.exports.Screen, { collapsed: false }))
    await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
    const sep = page.locator('#wrap [role="separator"]')
    const readSep = () =>
      sep.evaluate((el) => ({
        bg: getComputedStyle(el).backgroundColor,
        borderColor: getComputedStyle(el).borderTopColor,
      }))

    assert.equal((await readSep()).bg, hexToRgb(handleNative().backgroundColor))

    await page.keyboard.press('Tab')
    await page.waitForFunction(() =>
      document.querySelector('#wrap [role="separator"]').matches(':focus-visible'),
    )
    assert.equal(
      (await readSep()).borderColor,
      hexToRgb(handleNative({ focused: true, focusVisible: true }).borderColor),
    )

    await page.evaluate(() => document.activeElement?.blur())
    await sep.hover()
    await page.waitForFunction(() =>
      document.querySelector('#wrap [role="separator"]').matches(':hover'),
    )
    assert.equal((await readSep()).bg, hexToRgb(handleNative({ hovered: true }).backgroundColor))

    // Dragging attribute written by useDrag1D during an active drag
    await sep.evaluate((el) => el.setAttribute('data-dragging', ''))
    assert.equal(
      (await readSep()).bg,
      hexToRgb(handleNative({ hovered: true, 'data-dragging': true }).backgroundColor),
    )

    // Collapsed state rendered by Splitter collapsible collapsed
    const collapsedHtml = renderToStaticMarkup(
      createElement(webMod.exports.Screen, { collapsed: true }),
    )
    await page.setContent(`<!doctype html><style>${web.css}</style>${collapsedHtml}`)
    assert.equal(
      (await readSep()).bg,
      hexToRgb(handleNative({ 'data-collapsed': true }).backgroundColor),
    )
  } finally {
    await page.close()
  }
})

test('ResizablePane delivers prepared root, section pane and handle markers on Web Chromium and Native (#2046)', async () => {
  const compiler = createCompiler()
  const source = `import { ResizablePane } from '@hozo/patterns'
export function Screen({ collapsed }: { collapsed?: boolean }) {
  return (
    <div id="wrap">
      <ResizablePane
        side="start"
        label="Nav"
        min={100}
        max={400}
        collapsible
        collapsed={collapsed}
        className="bg-[#010101]"
        paneClassName="pt-4 bg-[#fafafa] text-[#112233]"
        handleClassName="w-4 h-12 bg-[#111111] hover:bg-[#222222] border border-[#aaaaaa] focus-visible:border-[#333333] data-[dragging]:bg-[#444444] data-[collapsed]:bg-[#555555]"
      >
        Sidebar
      </ResizablePane>
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  const webJs = transformSync(web.code, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const webMod = { exports: {} }
  runInNewContext(webJs, {
    module: webMod,
    exports: webMod.exports,
    h: createElement,
    require: (id) => {
      if (id === '@hozo/patterns') return { ResizablePane }
      throw new Error(`unexpected web import ${id}`)
    },
  })

  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  const nativeJs = transformSync(nativeCode, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  let nativeProps
  const nativeMod = { exports: {} }
  runInNewContext(nativeJs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props) => {
      if (type === 'ResizablePane') nativeProps = props
      return { type, props }
    },
    require: (id) => {
      if (id === '@hozo/patterns') return { ResizablePane: 'ResizablePane' }
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      throw new Error(`unexpected native import ${id}`)
    },
  })
  nativeMod.exports.Screen({ collapsed: false })
  assert.equal(nativeProps.className, undefined)
  assert.equal(nativeProps.paneClassName, undefined)
  assert.equal(nativeProps.handleClassName, undefined)
  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const nativeRoot = flat(nativeProps.hozoResizablePaneStyle())
  const nativePane = flat(nativeProps.hozoPaneStyle())
  const handleNative = (overrides = {}) =>
    flat(
      nativeProps.hozoHandleStyle({
        hovered: false,
        focused: false,
        focusVisible: false,
        'data-dragging': false,
        'data-collapsed': false,
        ...overrides,
      }),
    )

  const page = await browser.newPage()
  try {
    const html = renderToStaticMarkup(createElement(webMod.exports.Screen, { collapsed: false }))
    await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
    const markers = await page.evaluate(() => {
      const root = document.querySelector('#wrap > div')
      const pane = document.querySelector('#wrap section')
      const handle = document.querySelector('#wrap [role="separator"]')
      return {
        rootBg: getComputedStyle(root).backgroundColor,
        panePaddingTop: parseFloat(getComputedStyle(pane).paddingTop),
        paneBg: getComputedStyle(pane).backgroundColor,
        paneColor: getComputedStyle(pane).color,
        handleBg: getComputedStyle(handle).backgroundColor,
      }
    })
    assert.deepEqual(markers, {
      rootBg: hexToRgb(nativeRoot.backgroundColor),
      panePaddingTop: nativePane.paddingTop,
      paneBg: hexToRgb(nativePane.backgroundColor),
      paneColor: hexToRgb(nativePane.color),
      handleBg: hexToRgb(handleNative().backgroundColor),
    })

    const sep = page.locator('#wrap [role="separator"]')
    await page.keyboard.press('Tab')
    await page.waitForFunction(() =>
      document.querySelector('#wrap [role="separator"]').matches(':focus-visible'),
    )
    assert.equal(
      await sep.evaluate((el) => getComputedStyle(el).borderTopColor),
      hexToRgb(handleNative({ focused: true, focusVisible: true }).borderColor),
    )

    await page.evaluate(() => document.activeElement?.blur())
    await sep.hover()
    await page.waitForFunction(() =>
      document.querySelector('#wrap [role="separator"]').matches(':hover'),
    )
    assert.equal(
      await sep.evaluate((el) => getComputedStyle(el).backgroundColor),
      hexToRgb(handleNative({ hovered: true }).backgroundColor),
    )

    await sep.evaluate((el) => el.setAttribute('data-dragging', ''))
    assert.equal(
      await sep.evaluate((el) => getComputedStyle(el).backgroundColor),
      hexToRgb(handleNative({ hovered: true, 'data-dragging': true }).backgroundColor),
    )

    const collapsedHtml = renderToStaticMarkup(
      createElement(webMod.exports.Screen, { collapsed: true }),
    )
    await page.setContent(`<!doctype html><style>${web.css}</style>${collapsedHtml}`)
    assert.equal(
      await sep.evaluate((el) => getComputedStyle(el).backgroundColor),
      hexToRgb(handleNative({ 'data-collapsed': true }).backgroundColor),
    )
  } finally {
    await page.close()
  }
})

test('Slider delivers prepared rail, fill and thumb markers across states on Web Chromium and Native (#2046)', async () => {
  const compiler = createCompiler()
  const source = `import { Slider } from '@hozo/patterns'
export function Screen({ disabled }: { disabled?: boolean }) {
  return (
    <div id="wrap">
      <Slider
        accessibilityLabel="Volume"
        defaultValue={40}
        disabled={disabled}
        railClassName="bg-[#101010] h-2"
        fillClassName="bg-[#202020] h-2"
        thumbClassName="w-6 h-6 bg-[#111111] border border-[#aaaaaa] focus-visible:border-[#333333] aria-disabled:bg-[#444444]"
      />
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  const webJs = transformSync(web.code, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const webMod = { exports: {} }
  runInNewContext(webJs, {
    module: webMod,
    exports: webMod.exports,
    h: createElement,
    require: (id) => {
      if (id === '@hozo/patterns') return { Slider }
      throw new Error(`unexpected web import ${id}`)
    },
  })

  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  const nativeJs = transformSync(nativeCode, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  let nativeProps
  const nativeMod = { exports: {} }
  runInNewContext(nativeJs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props) => {
      if (type === 'Slider') nativeProps = props
      return { type, props }
    },
    require: (id) => {
      if (id === '@hozo/patterns') return { Slider: 'Slider' }
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      throw new Error(`unexpected native import ${id}`)
    },
  })
  nativeMod.exports.Screen({ disabled: false })
  assert.equal(nativeProps.railClassName, undefined)
  assert.equal(nativeProps.fillClassName, undefined)
  assert.equal(nativeProps.thumbClassName, undefined)
  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const nativeRail = flat(nativeProps.hozoRailStyle())
  const nativeFill = flat(nativeProps.hozoFillStyle())
  const thumbNative = (overrides = {}) =>
    flat(
      nativeProps.hozoSliderThumbStyle({
        focused: false,
        focusVisible: false,
        'aria-disabled': false,
        ...overrides,
      }),
    )

  const page = await browser.newPage()
  try {
    const html = renderToStaticMarkup(createElement(webMod.exports.Screen, { disabled: false }))
    await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
    const markers = await page.evaluate(() => {
      const hidden = document.querySelectorAll('#wrap [aria-hidden="true"]')
      const thumb = document.querySelector('#wrap [role="slider"]')
      return {
        railBg: getComputedStyle(hidden[0]).backgroundColor,
        fillBg: getComputedStyle(hidden[1]).backgroundColor,
        thumbBg: getComputedStyle(thumb).backgroundColor,
        thumbBorder: getComputedStyle(thumb).borderTopColor,
      }
    })
    assert.deepEqual(markers, {
      railBg: hexToRgb(nativeRail.backgroundColor),
      fillBg: hexToRgb(nativeFill.backgroundColor),
      thumbBg: hexToRgb(thumbNative().backgroundColor),
      thumbBorder: hexToRgb(thumbNative().borderColor),
    })

    await page.keyboard.press('Tab')
    await page.waitForFunction(() =>
      document.querySelector('#wrap [role="slider"]').matches(':focus-visible'),
    )
    assert.equal(
      await page
        .locator('#wrap [role="slider"]')
        .evaluate((el) => getComputedStyle(el).borderTopColor),
      hexToRgb(thumbNative({ focused: true, focusVisible: true }).borderColor),
    )

    const disabledHtml = renderToStaticMarkup(
      createElement(webMod.exports.Screen, { disabled: true }),
    )
    await page.setContent(`<!doctype html><style>${web.css}</style>${disabledHtml}`)
    assert.equal(
      await page
        .locator('#wrap [role="slider"]')
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      hexToRgb(thumbNative({ 'aria-disabled': true }).backgroundColor),
    )
  } finally {
    await page.close()
  }
})

test('Accordion delivers all five prepared slot markers across states on Web Chromium and Native (#2046)', async () => {
  const compiler = createCompiler()
  const source = `import { Accordion } from '@hozo/patterns'
export function Screen({ expanded }: { expanded?: string | null }) {
  return (
    <div id="wrap">
      <Accordion
        expanded={expanded}
        accessibilityLabel="Help"
        items={[
          { id: 'a', header: 'Shipping', content: 'Two days.' },
          { id: 'b', header: 'Disabled', content: 'Hidden.', disabled: true },
        ]}
        sectionClassName="bg-[#010101]"
        headingClassName="mt-2"
        triggerClassName="bg-[#111111] hover:bg-[#222222] active:bg-[#333333] border border-[#aaaaaa] focus-visible:border-[#444444] aria-expanded:bg-[#555555] disabled:bg-[#666666] data-[hozo-state=open]:border-[#777777] text-[#eeeeee] disabled:text-[#999999]"
        panelClassName="bg-[#fafafa] border border-[#bbbbbb] data-[hozo-state=open]:border-[#888888] text-[#112233]"
        panelContentClassName="pt-4 text-[#223344]"
      />
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  const webJs = transformSync(web.code, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const webMod = { exports: {} }
  runInNewContext(webJs, {
    module: webMod,
    exports: webMod.exports,
    h: createElement,
    require: (id) => {
      if (id === '@hozo/patterns') return { Accordion }
      throw new Error(`unexpected web import ${id}`)
    },
  })

  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  const nativeJs = transformSync(nativeCode, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  let nativeProps
  const nativeMod = { exports: {} }
  runInNewContext(nativeJs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props) => {
      if (type === 'Accordion') nativeProps = props
      return { type, props }
    },
    require: (id) => {
      if (id === '@hozo/patterns') return { Accordion: 'Accordion' }
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      throw new Error(`unexpected native import ${id}`)
    },
  })
  nativeMod.exports.Screen({ expanded: 'a' })
  for (const prop of [
    'sectionClassName',
    'headingClassName',
    'triggerClassName',
    'panelClassName',
    'panelContentClassName',
  ])
    assert.equal(nativeProps[prop], undefined)
  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const nativeSection = flat(nativeProps.hozoSectionStyle())
  const nativeHeading = flat(nativeProps.hozoHeadingStyle())
  const triggerNative = (overrides = {}) =>
    flat(
      nativeProps.hozoTriggerStyle({
        hovered: false,
        pressed: false,
        focused: false,
        focusVisible: false,
        disabled: false,
        'aria-expanded': false,
        'data-hozo-disabled': false,
        'data-hozo-state=open': false,
        'data-hozo-state=closed': true,
        ...overrides,
      }),
    )
  const panelNative = (open) =>
    flat(
      nativeProps.hozoPanelStyle({
        'data-hozo-state=open': open,
        'data-hozo-state=closed': !open,
      }),
    )
  const nativeContent = flat(nativeProps.hozoPanelContentStyle())

  const page = await browser.newPage()
  try {
    // Closed interactive states on first trigger + disabled second trigger
    const closedHtml = renderToStaticMarkup(
      createElement(webMod.exports.Screen, { expanded: null }),
    )
    await page.setContent(`<!doctype html><style>${web.css}</style>${closedHtml}`)
    const triggers = page.locator('#wrap button')
    const first = triggers.nth(0)
    const readBtn = (locator) =>
      locator.evaluate((el) => ({
        bg: getComputedStyle(el).backgroundColor,
        color: getComputedStyle(el).color,
        borderColor: getComputedStyle(el).borderTopColor,
      }))

    assert.equal(
      await page.evaluate(
        () =>
          getComputedStyle(document.querySelector('#wrap [role="group"] > div')).backgroundColor,
      ),
      hexToRgb(nativeSection.backgroundColor),
    )
    assert.equal(
      await page.evaluate(() =>
        parseFloat(getComputedStyle(document.querySelector('#wrap h3')).marginTop),
      ),
      nativeHeading.marginTop,
    )
    assert.equal((await readBtn(first)).bg, hexToRgb(triggerNative().backgroundColor))
    assert.equal((await readBtn(first)).color, hexToRgb(triggerNative().color))

    const nativeDisabled = triggerNative({ disabled: true, 'data-hozo-disabled': true })
    assert.equal((await readBtn(triggers.nth(1))).bg, hexToRgb(nativeDisabled.backgroundColor))
    assert.equal((await readBtn(triggers.nth(1))).color, hexToRgb(nativeDisabled.color))

    await page.keyboard.press('Tab')
    await page.waitForFunction(() =>
      document.querySelector('#wrap button').matches(':focus-visible'),
    )
    assert.equal(
      (await readBtn(first)).borderColor,
      hexToRgb(triggerNative({ focused: true, focusVisible: true }).borderColor),
    )

    await page.evaluate(() => document.activeElement?.blur())
    await first.hover()
    await page.waitForFunction(() => document.querySelector('#wrap button').matches(':hover'))
    assert.equal(
      (await readBtn(first)).bg,
      hexToRgb(triggerNative({ hovered: true }).backgroundColor),
    )

    await page.mouse.down()
    try {
      await page.waitForFunction(() => document.querySelector('#wrap button').matches(':active'))
      assert.equal(
        (await readBtn(first)).bg,
        hexToRgb(triggerNative({ hovered: true, pressed: true }).backgroundColor),
      )
    } finally {
      await page.mouse.up()
    }

    // Expanded state: open trigger, open panel, and panelContent markers
    const openHtml = renderToStaticMarkup(createElement(webMod.exports.Screen, { expanded: 'a' }))
    await page.setContent(`<!doctype html><style>${web.css}</style>${openHtml}`)
    const openMarkers = await page.evaluate(() => {
      const btn = document.querySelector('#wrap button')
      const panel = document.querySelector('#wrap [role="region"]')
      const inner = panel.firstElementChild
      return {
        triggerBg: getComputedStyle(btn).backgroundColor,
        triggerBorder: getComputedStyle(btn).borderTopColor,
        panelBg: getComputedStyle(panel).backgroundColor,
        panelBorder: getComputedStyle(panel).borderTopColor,
        contentPaddingTop: parseFloat(getComputedStyle(inner).paddingTop),
        contentColor: getComputedStyle(inner).color,
      }
    })
    const openTrigger = triggerNative({
      'aria-expanded': true,
      'data-hozo-state=open': true,
      'data-hozo-state=closed': false,
    })
    const openPanel = panelNative(true)
    assert.deepEqual(openMarkers, {
      triggerBg: hexToRgb(openTrigger.backgroundColor),
      triggerBorder: hexToRgb(openTrigger.borderColor),
      panelBg: hexToRgb(openPanel.backgroundColor),
      panelBorder: hexToRgb(openPanel.borderColor),
      contentPaddingTop: nativeContent.paddingTop,
      contentColor: hexToRgb(nativeContent.color),
    })
  } finally {
    await page.close()
  }
})

test('Tabs delivers prepared tabList, tab and panel markers across states on Web Chromium and Native (#2046)', async () => {
  const compiler = createCompiler()
  const source = `import { Tabs } from '@hozo/patterns'
export function Screen({ index }: { index?: number }) {
  return (
    <div id="wrap">
      <Tabs
        index={index}
        tabs={[
          { label: 'One', content: 'First body' },
          { label: 'Two', content: 'Second body' },
          { label: 'Three', content: 'Third body', disabled: true },
        ]}
        tabListClassName="bg-[#010101]"
        tabClassName="bg-[#111111] hover:bg-[#222222] active:bg-[#333333] border border-[#aaaaaa] focus-visible:border-[#444444] aria-selected:bg-[#555555] disabled:bg-[#666666] text-[#eeeeee] aria-selected:text-[#ffffff] disabled:text-[#999999]"
        panelClassName="pt-4 bg-[#fafafa] text-[#223344]"
      />
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  assert.match(web.code, /tabListClassName=\{"hozo-owner-/)
  assert.match(web.code, /tabClassName=\{"hozo-owner-/)
  assert.match(web.code, /panelClassName=\{"hozo-owner-/)

  const webJs = transformSync(web.code, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const webMod = { exports: {} }
  runInNewContext(webJs, {
    module: webMod,
    exports: webMod.exports,
    h: createElement,
    require: (id) => {
      if (id === '@hozo/patterns') return { Tabs }
      throw new Error(`Unexpected web require: ${id}`)
    },
  })

  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  assert.match(nativeCode, /hozoTabListStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(nativeCode, /hozoTabStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(nativeCode, /hozoPanelStyle=\{__hozoOwner\d+_Plan\d+\}/)
  const nativeJs = transformSync(nativeCode, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  let nativeProps
  const nativeMod = { exports: {} }
  runInNewContext(nativeJs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props) => {
      if (type === 'Tabs') nativeProps = props
      return { type, props }
    },
    require: (id) => {
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      if (id === '@hozo/patterns') return { Tabs: 'Tabs' }
      throw new Error(`Unexpected native require: ${id}`)
    },
  })
  nativeMod.exports.Screen({ index: 0 })
  assert.equal(typeof nativeProps.hozoTabListStyle, 'function')
  assert.equal(typeof nativeProps.hozoTabStyle, 'function')
  assert.equal(typeof nativeProps.hozoPanelStyle, 'function')
  assert.equal(nativeProps.tabListClassName, undefined)
  assert.equal(nativeProps.tabClassName, undefined)
  assert.equal(nativeProps.panelClassName, undefined)

  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const nativeTabList = flat(nativeProps.hozoTabListStyle())
  const nativePanel = flat(nativeProps.hozoPanelStyle())
  const tabNative = (overrides = {}) =>
    flat(
      nativeProps.hozoTabStyle({
        hovered: false,
        pressed: false,
        focused: false,
        focusVisible: false,
        disabled: false,
        'aria-selected': false,
        'aria-disabled': false,
        ...overrides,
      }),
    )

  const page = await browser.newPage()
  try {
    const html = renderToStaticMarkup(createElement(webMod.exports.Screen, { index: 0 }))
    await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
    const tabs = page.locator('#wrap [role="tab"]')
    const readTab = (locator) =>
      locator.evaluate((el) => ({
        bg: getComputedStyle(el).backgroundColor,
        color: getComputedStyle(el).color,
        borderColor: getComputedStyle(el).borderTopColor,
      }))

    const parts = await page.evaluate(() => {
      const list = document.querySelector('#wrap [role="tablist"]')
      const panel = document.querySelector('#wrap [role="tabpanel"]:not([hidden])')
      return {
        listBg: getComputedStyle(list).backgroundColor,
        panelBg: getComputedStyle(panel).backgroundColor,
        panelPaddingTop: parseFloat(getComputedStyle(panel).paddingTop),
        panelColor: getComputedStyle(panel).color,
      }
    })
    assert.deepEqual(parts, {
      listBg: hexToRgb(nativeTabList.backgroundColor),
      panelBg: hexToRgb(nativePanel.backgroundColor),
      panelPaddingTop: nativePanel.paddingTop,
      panelColor: hexToRgb(nativePanel.color),
    })

    // Selected tab (0), unselected resting tab (1), disabled tab (2)
    assert.equal(
      (await readTab(tabs.nth(0))).bg,
      hexToRgb(tabNative({ 'aria-selected': true }).backgroundColor),
    )
    assert.equal(
      (await readTab(tabs.nth(0))).color,
      hexToRgb(tabNative({ 'aria-selected': true }).color),
    )
    assert.equal((await readTab(tabs.nth(1))).bg, hexToRgb(tabNative().backgroundColor))
    assert.equal((await readTab(tabs.nth(1))).color, hexToRgb(tabNative().color))
    assert.equal(
      (await readTab(tabs.nth(2))).bg,
      hexToRgb(tabNative({ disabled: true, 'aria-disabled': true }).backgroundColor),
    )
    assert.equal(
      (await readTab(tabs.nth(2))).color,
      hexToRgb(tabNative({ disabled: true, 'aria-disabled': true }).color),
    )

    // Keyboard focus-visible before mouse events
    await page.evaluate(() =>
      document.querySelector('#wrap [role="tab"]').setAttribute('tabindex', '-1'),
    )
    await page.evaluate(() =>
      document.querySelectorAll('#wrap [role="tab"]')[1].setAttribute('tabindex', '0'),
    )
    await page.keyboard.press('Tab')
    await page.waitForFunction(() =>
      document.querySelectorAll('#wrap [role="tab"]')[1].matches(':focus-visible'),
    )
    assert.equal(
      (await readTab(tabs.nth(1))).borderColor,
      hexToRgb(tabNative({ focused: true, focusVisible: true }).borderColor),
    )

    await page.evaluate(() => document.activeElement?.blur())
    await tabs.nth(1).hover()
    await page.waitForFunction(() =>
      document.querySelectorAll('#wrap [role="tab"]')[1].matches(':hover'),
    )
    assert.equal(
      (await readTab(tabs.nth(1))).bg,
      hexToRgb(tabNative({ hovered: true }).backgroundColor),
    )

    await page.mouse.down()
    try {
      await page.waitForFunction(() =>
        document.querySelectorAll('#wrap [role="tab"]')[1].matches(':active'),
      )
      assert.equal(
        (await readTab(tabs.nth(1))).bg,
        hexToRgb(tabNative({ hovered: true, pressed: true }).backgroundColor),
      )
    } finally {
      await page.mouse.up()
    }
  } finally {
    await page.close()
  }
})

test('BottomSheet delivers prepared scrim, sheet, handle and handleBar markers on Web Chromium and Native (#2046)', async () => {
  const compiler = createCompiler()
  const source = `import { BottomSheet } from '@hozo/patterns'
export function Screen({ detents }: { detents?: readonly number[] }) {
  return (
    <div id="wrap">
      <BottomSheet
        open
        portal={false}
        detents={detents}
        accessibilityLabel="Filters"
        scrimClassName="bg-[#010101]"
        sheetClassName="pt-4 bg-[#fafafa] text-[#223344]"
        handleClassName="py-2 bg-[#111111]"
        handleBarClassName="block w-8 h-1 bg-[#333333]"
      >
        Sheet body
      </BottomSheet>
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  assert.match(web.code, /scrimClassName=\{"hozo-owner-/)
  assert.match(web.code, /sheetClassName=\{"hozo-owner-/)
  assert.match(web.code, /handleClassName=\{"hozo-owner-/)
  assert.match(web.code, /handleBarClassName=\{"hozo-owner-/)

  const webJs = transformSync(web.code, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const webMod = { exports: {} }
  runInNewContext(webJs, {
    module: webMod,
    exports: webMod.exports,
    h: createElement,
    require: (id) => {
      if (id === '@hozo/patterns') return { BottomSheet }
      throw new Error(`Unexpected web require: ${id}`)
    },
  })

  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  assert.match(nativeCode, /hozoScrimStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(nativeCode, /hozoSheetStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(nativeCode, /hozoHandleStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(nativeCode, /hozoHandleBarStyle=\{__hozoOwner\d+_Plan\d+\}/)
  const nativeJs = transformSync(nativeCode, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  let nativeProps
  const nativeMod = { exports: {} }
  runInNewContext(nativeJs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props) => {
      if (type === 'BottomSheet') nativeProps = props
      return { type, props }
    },
    require: (id) => {
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      if (id === '@hozo/patterns') return { BottomSheet: 'BottomSheet' }
      throw new Error(`Unexpected native require: ${id}`)
    },
  })
  nativeMod.exports.Screen({ detents: [0.5, 1] })
  for (const prop of ['hozoScrimStyle', 'hozoSheetStyle', 'hozoHandleStyle', 'hozoHandleBarStyle'])
    assert.equal(typeof nativeProps[prop], 'function')
  for (const prop of ['scrimClassName', 'sheetClassName', 'handleClassName', 'handleBarClassName'])
    assert.equal(nativeProps[prop], undefined)

  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const nativeScrim = flat(nativeProps.hozoScrimStyle())
  const nativeSheet = flat(nativeProps.hozoSheetStyle())
  const nativeHandle = flat(nativeProps.hozoHandleStyle())
  const nativeBar = flat(nativeProps.hozoHandleBarStyle())

  const page = await browser.newPage()
  try {
    for (const [detents, handleTag] of [
      [[0.5, 1], 'BUTTON'],
      [[1], 'DIV'],
    ]) {
      const html = renderToStaticMarkup(createElement(webMod.exports.Screen, { detents }))
      await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
      const markers = await page.evaluate(() => {
        const dialog = document.querySelector('#wrap [role="dialog"]')
        const scrim = document.querySelector('#wrap [data-hozo-state] > [aria-hidden="true"]')
        const handle = dialog.firstElementChild
        const bar = handle.firstElementChild
        return {
          scrimBg: getComputedStyle(scrim).backgroundColor,
          sheetBg: getComputedStyle(dialog).backgroundColor,
          sheetPaddingTop: parseFloat(getComputedStyle(dialog).paddingTop),
          sheetColor: getComputedStyle(dialog).color,
          handleTag: handle.tagName,
          handleBg: getComputedStyle(handle).backgroundColor,
          barTag: bar.tagName,
          barBg: getComputedStyle(bar).backgroundColor,
          barWidth: parseFloat(getComputedStyle(bar).width),
        }
      })
      assert.deepEqual(markers, {
        scrimBg: hexToRgb(nativeScrim.backgroundColor),
        sheetBg: hexToRgb(nativeSheet.backgroundColor),
        sheetPaddingTop: nativeSheet.paddingTop,
        sheetColor: hexToRgb(nativeSheet.color),
        handleTag,
        handleBg: hexToRgb(nativeHandle.backgroundColor),
        barTag: 'SPAN',
        barBg: hexToRgb(nativeBar.backgroundColor),
        barWidth: nativeBar.width,
      })
    }
  } finally {
    await page.close()
  }
})

test('CodeBlock delivers all eight prepared slot markers across states on Web Chromium and Native (#2046)', async () => {
  const compiler = createCompiler()
  const source = `import { CodeBlock, CodeClipboardProvider } from '@hozo/patterns'
export function Screen() {
  return (
    <div id="wrap">
      <CodeClipboardProvider value={{ writeText: async () => {} }}>
        <CodeBlock
          title="Diff"
          lineNumbers
          copy
          lines={[
            { tokens: 'plain' },
            { tokens: 'added', mark: 'ins' },
            { tokens: 'removed', mark: 'del' },
            { tokens: 'marked', mark: 'mark' },
          ]}
          className="pt-2 bg-[#010101]"
          lineClassName="bg-[#101010] border border-[#aaaaaa] data-[code-mark]:border-[#202020] text-[#121212]"
          gutterClassName="bg-[#303030] data-[code-mark=ins]:border-[#313131] data-[code-mark=del]:border-[#323232] data-[code-mark=mark]:border-[#333333] border border-[#bbbbbb] text-[#343434]"
          insClassName="bg-[#002200] text-[#00ee00]"
          delClassName="bg-[#220000] text-[#ee0000]"
          markClassName="bg-[#222200] text-[#eeee00]"
          copyClassName="bg-[#404040] hover:bg-[#414141] active:bg-[#424242] border border-[#cccccc] focus-visible:border-[#434343] text-[#f0f0f0]"
          captionClassName="pt-1 text-[#505050]"
        />
      </CodeClipboardProvider>
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  for (const prop of [
    'className',
    'lineClassName',
    'gutterClassName',
    'insClassName',
    'delClassName',
    'markClassName',
    'copyClassName',
    'captionClassName',
  ])
    assert.match(web.code, new RegExp(`${prop}=\\{"hozo-owner-`))

  const webJs = transformSync(web.code, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const webMod = { exports: {} }
  runInNewContext(webJs, {
    module: webMod,
    exports: webMod.exports,
    h: createElement,
    require: (id) => {
      if (id === '@hozo/patterns') return { CodeBlock, CodeClipboardProvider }
      throw new Error(`Unexpected web require: ${id}`)
    },
  })

  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  const nativeJs = transformSync(nativeCode, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  let nativeProps
  const nativeMod = { exports: {} }
  runInNewContext(nativeJs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props, ...children) => {
      if (type === 'CodeBlock') nativeProps = props
      return { type, props, children }
    },
    require: (id) => {
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      if (id === '@hozo/patterns')
        return { CodeBlock: 'CodeBlock', CodeClipboardProvider: 'CodeClipboardProvider' }
      throw new Error(`Unexpected native require: ${id}`)
    },
  })
  nativeMod.exports.Screen()
  for (const prop of [
    'hozoCodeBlockStyle',
    'hozoLineStyle',
    'hozoGutterStyle',
    'hozoInsStyle',
    'hozoDelStyle',
    'hozoMarkStyle',
    'hozoCopyStyle',
    'hozoCaptionStyle',
  ])
    assert.equal(typeof nativeProps[prop], 'function')
  for (const prop of [
    'className',
    'lineClassName',
    'gutterClassName',
    'insClassName',
    'delClassName',
    'markClassName',
    'copyClassName',
    'captionClassName',
  ])
    assert.equal(nativeProps[prop], undefined)

  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const factsFor = (mark) => ({
    'data-code-mark': Boolean(mark),
    'data-code-mark=ins': mark === 'ins',
    'data-code-mark=del': mark === 'del',
    'data-code-mark=mark': mark === 'mark',
  })
  const nativeRoot = flat(nativeProps.hozoCodeBlockStyle())
  const nativeCaption = flat(nativeProps.hozoCaptionStyle())
  const nativeLine = (mark) => flat(nativeProps.hozoLineStyle(factsFor(mark)))
  const nativeGutter = (mark) => flat(nativeProps.hozoGutterStyle(factsFor(mark)))
  const nativeIns = flat(nativeProps.hozoInsStyle(factsFor('ins')))
  const nativeDel = flat(nativeProps.hozoDelStyle(factsFor('del')))
  const nativeMark = flat(nativeProps.hozoMarkStyle(factsFor('mark')))
  const nativeCopy = (overrides = {}) =>
    flat(
      nativeProps.hozoCopyStyle({
        hovered: false,
        pressed: false,
        focused: false,
        focusVisible: false,
        ...overrides,
      }),
    )

  const page = await browser.newPage()
  try {
    const html = renderToStaticMarkup(createElement(webMod.exports.Screen))
    await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
    const markers = await page.evaluate(() => {
      const fig = document.querySelector('#wrap figure')
      const cap = fig.querySelector('figcaption')
      const rows = [...fig.querySelectorAll('[data-code-line]')]
      const rowData = rows.map((row) => {
        const [gutter, content] = row.children
        return {
          gutterBg: getComputedStyle(gutter).backgroundColor,
          gutterBorder: getComputedStyle(gutter).borderTopColor,
          gutterColor: getComputedStyle(gutter).color,
          lineBg: getComputedStyle(content).backgroundColor,
          lineBorder: getComputedStyle(content).borderTopColor,
          lineColor: getComputedStyle(content).color,
        }
      })
      return {
        rootBg: getComputedStyle(fig).backgroundColor,
        rootPaddingTop: parseFloat(getComputedStyle(fig).paddingTop),
        captionColor: getComputedStyle(cap).color,
        captionPaddingTop: parseFloat(getComputedStyle(cap).paddingTop),
        rows: rowData,
      }
    })
    assert.equal(markers.rootBg, hexToRgb(nativeRoot.backgroundColor))
    assert.equal(markers.rootPaddingTop, nativeRoot.paddingTop)
    assert.equal(markers.captionColor, hexToRgb(nativeCaption.color))
    assert.equal(markers.captionPaddingTop, nativeCaption.paddingTop)
    // Plain row 0
    assert.equal(markers.rows[0].lineBg, hexToRgb(nativeLine(undefined).backgroundColor))
    assert.equal(markers.rows[0].lineBorder, hexToRgb(nativeLine(undefined).borderColor))
    assert.equal(markers.rows[0].gutterBg, hexToRgb(nativeGutter(undefined).backgroundColor))
    assert.equal(markers.rows[0].gutterColor, hexToRgb(nativeGutter(undefined).color))
    // Marked rows 1..3: ins, del, mark
    assert.equal(markers.rows[1].lineBorder, hexToRgb(nativeLine('ins').borderColor))
    assert.equal(markers.rows[1].gutterBorder, hexToRgb(nativeGutter('ins').borderColor))
    assert.equal(markers.rows[1].lineBg, hexToRgb(nativeIns.backgroundColor))
    assert.equal(markers.rows[1].lineColor, hexToRgb(nativeIns.color))
    assert.equal(markers.rows[2].gutterBorder, hexToRgb(nativeGutter('del').borderColor))
    assert.equal(markers.rows[2].lineBg, hexToRgb(nativeDel.backgroundColor))
    assert.equal(markers.rows[2].lineColor, hexToRgb(nativeDel.color))
    assert.equal(markers.rows[3].gutterBorder, hexToRgb(nativeGutter('mark').borderColor))
    assert.equal(markers.rows[3].lineBg, hexToRgb(nativeMark.backgroundColor))
    assert.equal(markers.rows[3].lineColor, hexToRgb(nativeMark.color))

    // Copy button states: rest, focus-visible, hover, active
    const copyBtn = page.locator('#wrap button')
    const readCopy = () =>
      copyBtn.evaluate((el) => ({
        bg: getComputedStyle(el).backgroundColor,
        color: getComputedStyle(el).color,
        borderColor: getComputedStyle(el).borderTopColor,
      }))
    assert.equal((await readCopy()).bg, hexToRgb(nativeCopy().backgroundColor))
    assert.equal((await readCopy()).color, hexToRgb(nativeCopy().color))

    await page.keyboard.press('Tab')
    await page.waitForFunction(() =>
      document.querySelector('#wrap button').matches(':focus-visible'),
    )
    assert.equal(
      (await readCopy()).borderColor,
      hexToRgb(nativeCopy({ focused: true, focusVisible: true }).borderColor),
    )

    await page.evaluate(() => document.activeElement?.blur())
    await copyBtn.hover()
    await page.waitForFunction(() => document.querySelector('#wrap button').matches(':hover'))
    assert.equal((await readCopy()).bg, hexToRgb(nativeCopy({ hovered: true }).backgroundColor))

    await page.mouse.down()
    try {
      await page.waitForFunction(() => document.querySelector('#wrap button').matches(':active'))
      assert.equal(
        (await readCopy()).bg,
        hexToRgb(nativeCopy({ hovered: true, pressed: true }).backgroundColor),
      )
    } finally {
      await page.mouse.up()
    }
  } finally {
    await page.close()
  }
})
