// Prepared root and NonControl styles on Web Chromium and Native for @hozo/patterns controls.
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Fixtures retain authored TSX interpolation.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler } from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'
import {
  Accordion,
  Alert,
  Avatar,
  BottomSheet,
  Checkbox,
  ColorPicker,
  CommandPalette,
  Dialog,
  Drawer,
  Pagination,
  Popover,
  RadioGroup,
  Slider,
  Stepper,
  Switch,
  Tabs,
  Toolbar,
  Tooltip,
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

test('Checkbox and Switch deliver prepared root styles across states on Web Chromium and Native (#2137)', async () => {
  const compiler = createCompiler()
  const source = `import { Checkbox, Switch } from '@hozo/patterns'
export function Screen({
  checked,
  switchChecked,
  disabled,
}: {
  checked?: boolean | 'mixed'
  switchChecked?: boolean
  disabled?: boolean
}) {
  return (
    <div id="wrap">
      <Checkbox
        checked={checked}
        disabled={disabled}
        className="pt-2 border border-[#cccccc] bg-[#111111] data-[hozo-state=unchecked]:bg-[#777777] data-[hozo-state=checked]:bg-[#666666] data-[hozo-state=mixed]:bg-[#888888] aria-checked:border-[#555555] hover:bg-[#222222] active:bg-[#333333] focus-visible:border-[#444444] disabled:bg-[#999999] text-[#eeeeee] disabled:text-[#aaaaaa]"
      >
        Agree
      </Checkbox>
      <Switch
        checked={switchChecked}
        disabled={disabled}
        className="pt-3 border border-[#cccccc] bg-[#101010] data-[hozo-state=unchecked]:bg-[#707070] data-[hozo-state=checked]:bg-[#606060] aria-checked:border-[#505050] hover:bg-[#202020] active:bg-[#303030] focus-visible:border-[#404040] disabled:bg-[#909090] text-[#f0f0f0] disabled:text-[#a0a0a0]"
      >
        Alerts
      </Switch>
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  assert.match(web.code, /className=\{"hozo-owner-/)

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
      if (id === '@hozo/patterns') return { Checkbox, Switch }
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
  const nativeProps = {}
  const nativeMod = { exports: {} }
  runInNewContext(nativeJs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props, ...children) => {
      if (type === 'Checkbox' || type === 'Switch') nativeProps[type] = props
      return { type, props, children }
    },
    require: (id) => {
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      if (id === '@hozo/patterns') return { Checkbox: 'Checkbox', Switch: 'Switch' }
      throw new Error(`Unexpected native require: ${id}`)
    },
  })
  nativeMod.exports.Screen({})
  assert.equal(typeof nativeProps.Checkbox.hozoCheckboxStyle, 'function')
  assert.equal(nativeProps.Checkbox.className, undefined)
  assert.equal(typeof nativeProps.Switch.hozoSwitchStyle, 'function')
  assert.equal(nativeProps.Switch.className, undefined)

  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const checkboxNative = (state, overrides = {}) =>
    flat(
      nativeProps.Checkbox.hozoCheckboxStyle({
        pressed: false,
        hovered: false,
        focused: false,
        focusVisible: false,
        disabled: false,
        'aria-checked': state === true,
        'data-hozo-disabled': Boolean(overrides.disabled),
        'data-hozo-state=checked': state === true,
        'data-hozo-state=unchecked': state === false,
        'data-hozo-state=mixed': state === 'mixed',
        ...overrides,
      }),
    )
  const switchNative = (state, overrides = {}) =>
    flat(
      nativeProps.Switch.hozoSwitchStyle({
        pressed: false,
        hovered: false,
        focused: false,
        focusVisible: false,
        disabled: false,
        'aria-checked': state === true,
        'data-hozo-disabled': Boolean(overrides.disabled),
        'data-hozo-state=checked': state === true,
        'data-hozo-state=unchecked': state === false,
        ...overrides,
      }),
    )

  const page = await browser.newPage()
  try {
    const renderStates = async (props) => {
      const html = renderToStaticMarkup(createElement(webMod.exports.Screen, props))
      await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
      return page.evaluate(() => {
        const read = (sel) => {
          const el = document.querySelector(sel)
          const cs = getComputedStyle(el)
          return {
            tag: el.tagName,
            bg: cs.backgroundColor,
            border: cs.borderTopColor,
            color: cs.color,
            paddingTop: parseFloat(cs.paddingTop),
          }
        }
        return {
          checkbox: read('#wrap [role="checkbox"]'),
          toggleSwitch: read('#wrap [role="switch"]'),
        }
      })
    }

    for (const [props, cbState, swState, overrides] of [
      [{ checked: false, switchChecked: false }, false, false, {}],
      [{ checked: true, switchChecked: true }, true, true, {}],
      [{ checked: 'mixed', switchChecked: false }, 'mixed', false, {}],
      [{ checked: false, switchChecked: false, disabled: true }, false, false, { disabled: true }],
    ]) {
      const webRow = await renderStates(props)
      const cb = checkboxNative(cbState, overrides)
      const sw = switchNative(swState, overrides)
      assert.deepEqual(webRow.checkbox, {
        tag: 'BUTTON',
        bg: hexToRgb(cb.backgroundColor),
        border: hexToRgb(cb.borderColor),
        color: hexToRgb(cb.color),
        paddingTop: cb.paddingTop,
      })
      assert.deepEqual(webRow.toggleSwitch, {
        tag: 'BUTTON',
        bg: hexToRgb(sw.backgroundColor),
        border: hexToRgb(sw.borderColor),
        color: hexToRgb(sw.color),
        paddingTop: sw.paddingTop,
      })
    }

    await renderStates({ checked: false, switchChecked: false })
    for (const [sel, nativeFn] of [
      ['#wrap [role="checkbox"]', (ov) => checkboxNative(false, ov)],
      ['#wrap [role="switch"]', (ov) => switchNative(false, ov)],
    ]) {
      const loc = page.locator(sel)
      await loc.hover()
      await page.waitForFunction((s) => document.querySelector(s).matches(':hover'), sel)
      const hoveredBg = await loc.evaluate((el) => getComputedStyle(el).backgroundColor)
      assert.equal(hoveredBg, hexToRgb(nativeFn({ hovered: true }).backgroundColor))
      await page.mouse.down()
      try {
        await page.waitForFunction((s) => document.querySelector(s).matches(':active'), sel)
        const activeBg = await loc.evaluate((el) => getComputedStyle(el).backgroundColor)
        assert.equal(activeBg, hexToRgb(nativeFn({ hovered: true, pressed: true }).backgroundColor))
      } finally {
        await page.mouse.up()
      }
    }
  } finally {
    await page.close()
  }
})

test('Alert and Tooltip deliver prepared root box and text styles on Web Chromium and Native (#2137)', async () => {
  const compiler = createCompiler()
  const source = `import { Alert, Tooltip } from '@hozo/patterns'
export function Screen() {
  return (
    <div id="wrap">
      <Alert live="polite" className="pt-3 bg-[#112233] text-[#ffffff]">
        Saved
      </Alert>
      <Tooltip open portal={false} content="Hint" className="pt-2 bg-[#223344] text-[#eeeeee]">
        <span>?</span>
      </Tooltip>
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  assert.match(web.code, /className=\{"hozo-owner-/)

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
      if (id === '@hozo/patterns') return { Alert, Tooltip }
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
  const nativeProps = {}
  const nativeMod = { exports: {} }
  runInNewContext(nativeJs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props, ...children) => {
      if (type === 'Alert' || type === 'Tooltip') nativeProps[type] = props
      return { type, props, children }
    },
    require: (id) => {
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      if (id === '@hozo/patterns') return { Alert: 'Alert', Tooltip: 'Tooltip' }
      throw new Error(`Unexpected native require: ${id}`)
    },
  })
  nativeMod.exports.Screen()
  assert.equal(typeof nativeProps.Alert.hozoAlertStyle, 'function')
  assert.equal(nativeProps.Alert.className, undefined)
  assert.equal(typeof nativeProps.Tooltip.hozoTooltipStyle, 'function')
  assert.equal(nativeProps.Tooltip.className, undefined)

  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const alertNative = flat(nativeProps.Alert.hozoAlertStyle())
  const tooltipNative = flat(nativeProps.Tooltip.hozoTooltipStyle())

  const page = await browser.newPage()
  try {
    const html = renderToStaticMarkup(createElement(webMod.exports.Screen))
    await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
    const markers = await page.evaluate(() => {
      const alertEl = document.querySelector('#wrap [role="status"]')
      const tooltipInner = document.querySelector('#wrap [role="tooltip"]')
      const tooltipBox = tooltipInner.parentElement
      const alertStyle = getComputedStyle(alertEl)
      const tooltipBoxStyle = getComputedStyle(tooltipBox)
      const tooltipTextStyle = getComputedStyle(tooltipInner)
      return {
        alertTag: alertEl.tagName,
        alertBg: alertStyle.backgroundColor,
        alertColor: alertStyle.color,
        alertPaddingTop: parseFloat(alertStyle.paddingTop),
        tooltipTag: tooltipBox.tagName,
        tooltipBg: tooltipBoxStyle.backgroundColor,
        tooltipColor: tooltipTextStyle.color,
        tooltipPaddingTop: parseFloat(tooltipBoxStyle.paddingTop),
      }
    })
    assert.deepEqual(markers, {
      alertTag: 'DIV',
      alertBg: hexToRgb(alertNative.backgroundColor),
      alertColor: hexToRgb(alertNative.color),
      alertPaddingTop: alertNative.paddingTop,
      tooltipTag: 'DIV',
      tooltipBg: hexToRgb(tooltipNative.backgroundColor),
      tooltipColor: hexToRgb(tooltipNative.color),
      tooltipPaddingTop: tooltipNative.paddingTop,
    })
  } finally {
    await page.close()
  }
})

test('Toolbar delivers prepared root styles by default on Web Chromium and Native (#2137)', async () => {
  const compiler = createCompiler()
  const source = `import { Toolbar } from '@hozo/patterns'
export function Screen() {
  return (
    <div id="wrap">
      <Toolbar
        accessibilityLabel="Tools"
        items={[{ render: (props) => <button type="button" {...props}>Action</button> }]}
        className="pt-2 gap-x-2 bg-[#112233]"
      />
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  assert.match(web.code, /className=\{"hozo-owner-/)

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
      if (id === '@hozo/patterns') return { Toolbar }
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
      if (type === 'Toolbar') nativeProps = props
      return { type, props, children }
    },
    require: (id) => {
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      if (id === '@hozo/patterns') return { Toolbar: 'Toolbar' }
      throw new Error(`Unexpected native require: ${id}`)
    },
  })
  nativeMod.exports.Screen()
  assert.equal(typeof nativeProps.hozoToolbarStyle, 'function')
  assert.equal(nativeProps.className, undefined)

  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const nativeStyle = flat(nativeProps.hozoToolbarStyle())

  const page = await browser.newPage()
  try {
    const html = renderToStaticMarkup(createElement(webMod.exports.Screen))
    await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
    const markers = await page.evaluate(() => {
      const el = document.querySelector('#wrap [role="toolbar"]')
      const cs = getComputedStyle(el)
      return {
        tag: el.tagName,
        bg: cs.backgroundColor,
        paddingTop: parseFloat(cs.paddingTop),
        columnGap: parseFloat(cs.columnGap),
      }
    })
    assert.deepEqual(markers, {
      tag: 'DIV',
      bg: hexToRgb(nativeStyle.backgroundColor),
      paddingTop: nativeStyle.paddingTop,
      columnGap: nativeStyle.columnGap,
    })
  } finally {
    await page.close()
  }
})

test('Accordion, BottomSheet, Drawer and Popover deliver prepared root styles on Web Chromium and Native (#2137)', async () => {
  const compiler = createCompiler()
  const source = `import { Accordion, BottomSheet, Drawer, Popover } from '@hozo/patterns'
export function Screen() {
  return (
    <div id="wrap">
      <div id="acc"><Accordion items={[{ header: 'H', content: 'C' }]} className="pt-2 bg-[#112233]" /></div>
      <div id="sheet"><BottomSheet open portal={false} className="pt-3 bg-[#223344]">Body</BottomSheet></div>
      <div id="drawer"><Drawer open portal={false} className="pt-4 bg-[#334455]">Nav</Drawer></div>
      <div id="pop"><Popover trigger="Open" className="pt-1 bg-[#445566]">Panel</Popover></div>
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  assert.equal(web.code.match(/className=\{"hozo-owner-/g)?.length, 4)

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
      if (id === '@hozo/patterns') return { Accordion, BottomSheet, Drawer, Popover }
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
  const nativeProps = {}
  const nativeMod = { exports: {} }
  runInNewContext(nativeJs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props, ...children) => {
      if (['Accordion', 'BottomSheet', 'Drawer', 'Popover'].includes(type))
        nativeProps[type] = props
      return { type, props, children }
    },
    require: (id) => {
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      if (id === '@hozo/patterns')
        return {
          Accordion: 'Accordion',
          BottomSheet: 'BottomSheet',
          Drawer: 'Drawer',
          Popover: 'Popover',
        }
      throw new Error(`Unexpected native require: ${id}`)
    },
  })
  nativeMod.exports.Screen()

  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const nativeStyles = {
    acc: flat(nativeProps.Accordion.hozoAccordionStyle()),
    sheet: flat(nativeProps.BottomSheet.hozoBottomSheetStyle()),
    drawer: flat(nativeProps.Drawer.hozoDrawerStyle()),
    pop: flat(nativeProps.Popover.hozoPopoverStyle()),
  }

  const page = await browser.newPage()
  try {
    const html = renderToStaticMarkup(createElement(webMod.exports.Screen))
    await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
    const markers = await page.evaluate(() => {
      const read = (sel) => {
        const el = document.querySelector(sel)
        const cs = getComputedStyle(el)
        return {
          tag: el.tagName,
          bg: cs.backgroundColor,
          paddingTop: parseFloat(cs.paddingTop),
        }
      }
      return {
        acc: read('#acc > div'),
        sheet: read('#sheet > div'),
        drawer: read('#drawer > div'),
        pop: read('#pop > div'),
      }
    })
    for (const key of ['acc', 'sheet', 'drawer', 'pop']) {
      assert.deepEqual(markers[key], {
        tag: 'DIV',
        bg: hexToRgb(nativeStyles[key].backgroundColor),
        paddingTop: nativeStyles[key].paddingTop,
      })
    }
  } finally {
    await page.close()
  }
})

test('RadioGroup, Slider, Tabs and Tree deliver prepared root styles on Web Chromium and Native (#2137)', async () => {
  const compiler = createCompiler()
  const source = `import { RadioGroup, Slider, Tabs, Tree } from '@hozo/patterns'
export function Screen() {
  return (
    <div id="wrap">
      <div id="radio"><RadioGroup options={[{ value: 'a', label: 'A' }]} className="pt-2 bg-[#112233]" /></div>
      <div id="slider"><Slider defaultValue={50} className="pt-3 bg-[#223344]" /></div>
      <div id="tabs"><Tabs tabs={[{ label: 'One', content: 'Body' }]} className="pt-4 bg-[#334455]" /></div>
      <div id="tree"><Tree nodes={[{ id: '1', label: 'Root' }]} className="pt-1 bg-[#445566]" /></div>
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  assert.equal(web.code.match(/className=\{"hozo-owner-/g)?.length, 4)

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
      if (id === '@hozo/patterns') return { RadioGroup, Slider, Tabs, Tree }
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
  const nativeProps = {}
  const nativeMod = { exports: {} }
  runInNewContext(nativeJs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props, ...children) => {
      if (['RadioGroup', 'Slider', 'Tabs', 'Tree'].includes(type)) nativeProps[type] = props
      return { type, props, children }
    },
    require: (id) => {
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      if (id === '@hozo/patterns')
        return {
          RadioGroup: 'RadioGroup',
          Slider: 'Slider',
          Tabs: 'Tabs',
          Tree: 'Tree',
        }
      throw new Error(`Unexpected native require: ${id}`)
    },
  })
  nativeMod.exports.Screen()

  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const nativeStyles = {
    radio: flat(nativeProps.RadioGroup.hozoRadioGroupStyle()),
    slider: flat(nativeProps.Slider.hozoSliderStyle()),
    tabs: flat(nativeProps.Tabs.hozoTabsStyle()),
    tree: flat(nativeProps.Tree.hozoTreeStyle()),
  }

  const page = await browser.newPage()
  try {
    const html = renderToStaticMarkup(createElement(webMod.exports.Screen))
    await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
    const markers = await page.evaluate(() => {
      const read = (sel) => {
        const el = document.querySelector(sel)
        const cs = getComputedStyle(el)
        return {
          tag: el.tagName,
          bg: cs.backgroundColor,
          paddingTop: parseFloat(cs.paddingTop),
        }
      }
      return {
        radio: read('#radio > div'),
        slider: read('#slider > div'),
        tabs: read('#tabs > div'),
        tree: read('#tree > div'),
      }
    })
    for (const key of ['radio', 'slider', 'tabs', 'tree']) {
      assert.deepEqual(markers[key], {
        tag: 'DIV',
        bg: hexToRgb(nativeStyles[key].backgroundColor),
        paddingTop: nativeStyles[key].paddingTop,
      })
    }
  } finally {
    await page.close()
  }
})

test('Avatar, Pagination and Stepper roots match NonControl facts on Web Chromium and Native (#2149)', async () => {
  const compiler = createCompiler()
  const classes =
    'pt-2 bg-[#112233] read-only:rounded-lg not-disabled:px-2 not-enabled:py-1 disabled:opacity-25 enabled:pb-8 aria-selected:mt-8'
  const source = `import { Avatar, Pagination, Stepper } from '@hozo/core'
export function Screen() {
  return (
    <div id="wrap">
      <div id="avatar"><Avatar name="Ada" className="${classes}" /></div>
      <div id="pagination"><Pagination pageCount={3} className="${classes}" /></div>
      <div id="stepper"><Stepper steps={[{ label: 'One' }]} activeStep={0} className="${classes}" /></div>
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  assert.doesNotMatch(web.css, /data-hozo-disabled/)
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
      if (id === '@hozo/core/generated/avatar') return { HozoAvatar: Avatar }
      if (id === '@hozo/core/generated/pagination') return { HozoPagination: Pagination }
      if (id === '@hozo/core/generated/stepper') return { HozoStepper: Stepper }
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
  const nativeProps = {}
  const nativeMod = { exports: {} }
  runInNewContext(nativeJs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props, ...children) => {
      if (['HozoAvatar', 'HozoPagination', 'HozoStepper'].includes(type)) nativeProps[type] = props
      return { type, props, children }
    },
    require: (id) => {
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      if (id === '@hozo/core/generated/avatar') return { HozoAvatar: 'HozoAvatar' }
      if (id === '@hozo/core/generated/pagination') return { HozoPagination: 'HozoPagination' }
      if (id === '@hozo/core/generated/stepper') return { HozoStepper: 'HozoStepper' }
      throw new Error(`Unexpected native require: ${id}`)
    },
  })
  nativeMod.exports.Screen()

  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const nativeStyles = {
    avatar: flat(nativeProps.HozoAvatar.style),
    pagination: flat(nativeProps.HozoPagination.style),
    stepper: flat(nativeProps.HozoStepper.style),
  }

  const page = await browser.newPage()
  try {
    const html = renderToStaticMarkup(createElement(webMod.exports.Screen))
    await page.setContent(`<!doctype html><style>ul, ol { margin: 0; }${web.css}</style>${html}`)
    const markers = await page.evaluate(() => {
      const read = (sel) => {
        const el = document.querySelector(sel)
        const cs = getComputedStyle(el)
        return {
          tag: el.tagName,
          bg: cs.backgroundColor,
          paddingTop: parseFloat(cs.paddingTop),
          paddingLeft: parseFloat(cs.paddingLeft),
          paddingBottom: parseFloat(cs.paddingBottom),
          borderRadius: parseFloat(cs.borderTopLeftRadius),
          opacity: parseFloat(cs.opacity),
          marginTop: parseFloat(cs.marginTop),
        }
      }
      return {
        avatar: read('#avatar > span'),
        pagination: read('#pagination ul'),
        stepper: read('#stepper > ol'),
      }
    })
    for (const [key, tag] of [
      ['avatar', 'SPAN'],
      ['pagination', 'UL'],
      ['stepper', 'OL'],
    ]) {
      assert.deepEqual(markers[key], {
        tag,
        bg: hexToRgb(nativeStyles[key].backgroundColor),
        paddingTop: nativeStyles[key].paddingTop,
        paddingLeft: nativeStyles[key].paddingStart,
        paddingBottom: nativeStyles[key].paddingBottom,
        borderRadius: nativeStyles[key].borderRadius,
        opacity: 1,
        marginTop: 0,
      })
      assert.equal(nativeStyles[key].borderRadius, 8)
      assert.equal(nativeStyles[key].opacity, undefined)
      assert.equal(nativeStyles[key].marginTop, undefined)
    }
  } finally {
    await page.close()
  }
})

test('ColorPicker root/slider and Dialog root match NonControl facts on Web Chromium and Native (#2149)', async () => {
  const compiler = createCompiler()
  const classes =
    'pt-2 bg-[#112233] read-only:rounded-lg not-disabled:px-2 not-enabled:py-1 disabled:opacity-25 enabled:pb-8 aria-selected:mt-8'
  const source = `import { ColorPicker, Dialog } from '@hozo/core'
export function Screen() {
  return (
    <div id="wrap">
      <div id="picker">
        <ColorPicker accessibilityLabel="Theme" className="${classes}" sliderClassName="${classes}" />
      </div>
      <div id="dialog">
        <Dialog open onClose={() => {}} accessibilityLabel="Confirm" className="${classes}">Body</Dialog>
      </div>
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  assert.doesNotMatch(web.css, /data-hozo-disabled/)
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
      if (id === '@hozo/core/generated/color-picker') return { HozoColorPicker: ColorPicker }
      if (id === '@hozo/core/generated/dialog') return { HozoDialog: Dialog }
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
  const nativeProps = {}
  const nativeMod = { exports: {} }
  runInNewContext(nativeJs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props, ...children) => {
      if (['HozoColorPicker', 'HozoDialog'].includes(type)) nativeProps[type] = props
      return { type, props, children }
    },
    require: (id) => {
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      if (id === '@hozo/core/generated/color-picker') return { HozoColorPicker: 'HozoColorPicker' }
      if (id === '@hozo/core/generated/dialog') return { HozoDialog: 'HozoDialog' }
      if (id === '@hozo/core/generated/inherited-leaves')
        return new Proxy({}, { get: () => (value) => value })
      throw new Error(`Unexpected native require: ${id}`)
    },
  })
  nativeMod.exports.Screen()

  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const nativeStyles = {
    pickerRoot: flat(nativeProps.HozoColorPicker.style),
    pickerSlider: flat(nativeProps.HozoColorPicker.sliderStyle),
    dialog: flat(nativeProps.HozoDialog.style),
  }

  const page = await browser.newPage()
  try {
    const html = renderToStaticMarkup(createElement(webMod.exports.Screen))
    await page.setContent(
      `<!doctype html><style>dialog { display: block; margin: 0; border: 0; }${web.css}</style>${html}`,
    )
    const markers = await page.evaluate(() => {
      const read = (sel) => {
        const el = document.querySelector(sel)
        const cs = getComputedStyle(el)
        return {
          tag: el.tagName,
          bg: cs.backgroundColor,
          paddingTop: parseFloat(cs.paddingTop),
          paddingLeft: parseFloat(cs.paddingLeft),
          paddingBottom: parseFloat(cs.paddingBottom),
          borderRadius: parseFloat(cs.borderTopLeftRadius),
          opacity: parseFloat(cs.opacity),
          marginTop: parseFloat(cs.marginTop),
        }
      }
      return {
        pickerRoot: read('#picker > [role="group"]'),
        pickerSlider: read('#picker [data-hozo-orientation]'),
        dialog: read('#dialog > dialog'),
      }
    })
    for (const [key, tag] of [
      ['pickerRoot', 'DIV'],
      ['pickerSlider', 'DIV'],
      ['dialog', 'DIALOG'],
    ]) {
      assert.deepEqual(markers[key], {
        tag,
        bg:
          key === 'pickerSlider' ? 'rgba(0, 0, 0, 0)' : hexToRgb(nativeStyles[key].backgroundColor),
        paddingTop: nativeStyles[key].paddingTop,
        paddingLeft: nativeStyles[key].paddingStart,
        paddingBottom: nativeStyles[key].paddingBottom,
        borderRadius: nativeStyles[key].borderRadius,
        opacity: 1,
        marginTop: 0,
      })
      assert.equal(nativeStyles[key].borderRadius, 8)
      assert.equal(nativeStyles[key].opacity, undefined)
      assert.equal(nativeStyles[key].marginTop, undefined)
    }
  } finally {
    await page.close()
  }
})

test('CommandPalette root, scrim, panel and list match NonControl facts on Web Chromium and Native (#2149)', async () => {
  const compiler = createCompiler()
  const classes =
    'pt-2 bg-[#112233] read-only:rounded-lg not-disabled:px-2 not-enabled:py-1 disabled:opacity-25 enabled:pb-8 aria-selected:mt-8'
  const source = `import { CommandPalette } from '@hozo/core'
export function Screen() {
  return (
    <div id="wrap">
      <CommandPalette
        open
        portal={false}
        commands={[{ id: 'a', label: 'Alpha', onSelect: () => {} }]}
        className="${classes}"
        scrimClassName="${classes}"
        panelClassName="${classes}"
        listClassName="${classes}"
      />
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  assert.doesNotMatch(web.css, /data-hozo-disabled/)
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
      if (id === '@hozo/core/generated/command-palette')
        return { HozoCommandPalette: CommandPalette }
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
      if (type === 'HozoCommandPalette') nativeProps = props
      return { type, props, children }
    },
    require: (id) => {
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      if (id === '@hozo/core/generated/command-palette')
        return { HozoCommandPalette: 'HozoCommandPalette' }
      throw new Error(`Unexpected native require: ${id}`)
    },
  })
  nativeMod.exports.Screen()

  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }
  const nativeStyles = {
    root: flat(nativeProps.style),
    scrim: flat(nativeProps.scrimStyle),
    panel: flat(nativeProps.panelStyle),
    list: flat(nativeProps.listStyle),
  }

  const page = await browser.newPage()
  try {
    const html = renderToStaticMarkup(createElement(webMod.exports.Screen))
    await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
    const markers = await page.evaluate(() => {
      const read = (sel) => {
        const el = document.querySelector(sel)
        const cs = getComputedStyle(el)
        return {
          tag: el.tagName,
          bg: cs.backgroundColor,
          paddingTop: parseFloat(cs.paddingTop),
          paddingLeft: parseFloat(cs.paddingLeft),
          paddingBottom: parseFloat(cs.paddingBottom),
          borderRadius: parseFloat(cs.borderTopLeftRadius),
          opacity: parseFloat(cs.opacity),
          marginTop: parseFloat(cs.marginTop),
        }
      }
      return {
        root: read('#wrap > div'),
        scrim: read('#wrap > div > [aria-hidden="true"]'),
        panel: read('#wrap [role="dialog"]'),
        list: read('#wrap [role="listbox"]'),
      }
    })
    for (const key of ['root', 'scrim', 'panel', 'list']) {
      assert.deepEqual(markers[key], {
        tag: 'DIV',
        bg: hexToRgb(nativeStyles[key].backgroundColor),
        paddingTop: nativeStyles[key].paddingTop,
        paddingLeft: nativeStyles[key].paddingStart,
        paddingBottom: nativeStyles[key].paddingBottom,
        borderRadius: nativeStyles[key].borderRadius,
        opacity: 1,
        marginTop: 0,
      })
      assert.equal(nativeStyles[key].borderRadius, 8)
      assert.equal(nativeStyles[key].opacity, undefined)
      assert.equal(nativeStyles[key].marginTop, undefined)
    }
  } finally {
    await page.close()
  }
})
