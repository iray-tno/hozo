// Prepared marker delivery and Chromium vs Native parity for @hozo/form controls.
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Fixtures retain authored TSX interpolation.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { createCompiler } from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'
import {
  Calendar,
  DatePicker,
  DateRangePicker,
  DateTimePicker,
  Field,
  FileDropzone,
  Form,
  NativeSelect,
  SubmitButton,
  TextArea,
  TimePicker,
} from '@hozo/form'
import { build, transformSync } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformHozoSource } from '../../../packages/metro/src/transform.ts'
import { executablePath, launchCallerBrowser } from './caller-composition-harness.mjs'

let browser

before(async () => {
  browser = await launchCallerBrowser()
})
after(async () => {
  await browser?.close()
})

test('Form, SubmitButton and FileDropzone deliver markers to declared hosts and match Chromium vs Native prepared states (#2045)', {
  skip: !executablePath,
}, async () => {
  const compiler = createCompiler()
  const stateClasses =
    'p-3 bg-[#112233] text-[#ffffff] hover:bg-[#223344] active:bg-[#334455] focus-visible:bg-[#445566] disabled:bg-[#556677] disabled:text-[#8899aa]'
  const source = `import { Form, SubmitButton, FileDropzone } from '@hozo/form'
export function Screen({ disabled = false }) {
  return (
    <Form accessibilityLabel="Profile" className="pt-3">
      <SubmitButton disabled={disabled} className="${stateClasses}">Save</SubmitButton>
      <FileDropzone accessibilityLabel="Upload" disabled={disabled} className="${stateClasses}">Drop</FileDropzone>
    </Form>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  const webCjs = transformSync(web.code, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const webMod = { exports: {} }
  runInNewContext(webCjs, {
    module: webMod,
    exports: webMod.exports,
    h: createElement,
    require: (specifier) => {
      if (specifier === '@hozo/form') return { Form, SubmitButton, FileDropzone }
      throw new Error(`Unexpected web require: ${specifier}`)
    },
  })

  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  const nativeCjs = transformSync(nativeCode, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const nativeMod = { exports: {} }
  const nativeElements = {}
  runInNewContext(nativeCjs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props) => {
      if (typeof type === 'string') nativeElements[type] = props
      return { type, props }
    },
    require: (specifier) => {
      if (specifier === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      if (specifier === '@hozo/form')
        return { Form: 'Form', SubmitButton: 'SubmitButton', FileDropzone: 'FileDropzone' }
      throw new Error(`Unexpected native require: ${specifier}`)
    },
  })
  nativeMod.exports.Screen({})
  assert.equal(nativeElements.Form.className, undefined)
  assert.equal(nativeElements.SubmitButton.className, undefined)
  assert.equal(nativeElements.FileDropzone.className, undefined)
  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
    return m ? `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})` : hex
  }
  assert.equal(flat(nativeElements.Form.hozoFormStyle()).paddingTop, 12)

  const page = await browser.newPage()
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const enabledHtml = renderToStaticMarkup(
      createElement(webMod.exports.Screen, { disabled: false }),
    )
    await page.setContent(`<!doctype html><style>${web.css}</style>${enabledHtml}`)
    // Item 2 (Web): marker classes reach declared hosts (<form>, <button>, <button>).
    const formPadding = await page
      .locator('form[aria-label="Profile"]')
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingTop))
    assert.equal(formPadding, 12)

    const states = [
      {
        name: 'rest',
        disabled: false,
        pseudo: [],
        facts: {
          hovered: false,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: false,
        },
      },
      {
        name: 'hover',
        disabled: false,
        pseudo: ['hover'],
        facts: {
          hovered: true,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: false,
        },
      },
      {
        name: 'active',
        disabled: false,
        pseudo: ['active'],
        facts: {
          hovered: false,
          pressed: true,
          focused: false,
          focusVisible: false,
          disabled: false,
        },
      },
      {
        name: 'focus-visible',
        disabled: false,
        pseudo: ['focus', 'focus-visible'],
        facts: {
          hovered: false,
          pressed: false,
          focused: true,
          focusVisible: true,
          disabled: false,
        },
      },
      {
        name: 'disabled',
        disabled: true,
        pseudo: [],
        facts: {
          hovered: false,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: true,
        },
      },
    ]

    for (const [label, selector, carrier] of [
      ['SubmitButton', 'button[type="submit"]', nativeElements.SubmitButton.hozoSubmitButtonStyle],
      [
        'FileDropzone',
        'button[aria-label="Upload"]',
        nativeElements.FileDropzone.hozoFileDropzoneStyle,
      ],
    ]) {
      for (const state of states) {
        const html = renderToStaticMarkup(
          createElement(webMod.exports.Screen, { disabled: state.disabled }),
        )
        await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
        const { root } = await cdp.send('DOM.getDocument')
        const { nodeId } = await cdp.send('DOM.querySelector', {
          nodeId: root.nodeId,
          selector,
        })
        if (state.pseudo.length) {
          await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: state.pseudo })
        }
        const webStyle = await page.locator(selector).evaluate((el) => {
          const cs = getComputedStyle(el)
          return {
            paddingTop: parseFloat(cs.paddingTop),
            backgroundColor: cs.backgroundColor,
            color: cs.color,
          }
        })
        const nativeStyle = flat(carrier(state.facts))
        assert.deepEqual(
          {
            paddingTop: nativeStyle.paddingTop,
            backgroundColor: hexToRgb(nativeStyle.backgroundColor),
            color: hexToRgb(nativeStyle.color),
          },
          webStyle,
          `${label}/${state.name}`,
        )
      }
    }
  } finally {
    await page.close()
  }
})

test('Field and TextArea deliver markers to declared hosts and match Chromium vs Native prepared states (#2045)', {
  skip: !executablePath,
}, async () => {
  const compiler = createCompiler()
  const fieldClasses =
    'p-3 bg-[#112233] text-[#ffffff] focus:bg-[#223344] focus-visible:bg-[#334455] read-only:bg-[#445566] disabled:bg-[#556677] aria-[invalid=true]:bg-[#667788] aria-required:bg-[#778899]'
  const source = `import { Field, TextArea } from '@hozo/form'
export function Screen({ disabled = false, readOnly = false, invalid = false, required = false }) {
  return (
    <Field
      label="Notes"
      required
      description="Details"
      error="Problem"
      className="pt-2"
      labelClassName="text-[#112233]"
      requiredClassName="text-[#cc0000]"
      descriptionClassName="text-[#334455]"
      errorClassName="text-[#990000]"
    >
      {(control) => (
        <TextArea
          id={control.id}
          maxLength={50}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={invalid}
          aria-required={required}
          className="pt-3"
          fieldClassName="${fieldClasses}"
          countClassName="text-[#556677]"
        />
      )}
    </Field>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  const webCjs = transformSync(web.code, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const webMod = { exports: {} }
  runInNewContext(webCjs, {
    module: webMod,
    exports: webMod.exports,
    h: createElement,
    require: (specifier) => {
      if (specifier === '@hozo/form') return { Field, TextArea }
      throw new Error(`Unexpected web require: ${specifier}`)
    },
  })

  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  const nativeCjs = transformSync(nativeCode, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const nativeMod = { exports: {} }
  const nativeElements = {}
  runInNewContext(nativeCjs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props, ...children) => {
      if (typeof type === 'string') nativeElements[type] = props
      if (type === 'Field' && typeof children[0] === 'function') children[0]({})
      return { type, props, children }
    },
    require: (specifier) => {
      if (specifier === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      if (specifier === '@hozo/form') return { Field: 'Field', TextArea: 'TextArea' }
      throw new Error(`Unexpected native require: ${specifier}`)
    },
  })
  nativeMod.exports.Screen({})
  for (const prop of [
    'className',
    'labelClassName',
    'requiredClassName',
    'descriptionClassName',
    'errorClassName',
  ])
    assert.equal(nativeElements.Field[prop], undefined)
  for (const prop of ['className', 'fieldClassName', 'countClassName'])
    assert.equal(nativeElements.TextArea[prop], undefined)

  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
    return m ? `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})` : hex
  }
  assert.equal(flat(nativeElements.Field.hozoFieldStyle()).paddingTop, 8)
  assert.equal(flat(nativeElements.Field.hozoLabelStyle()).color, '#112233')
  assert.equal(flat(nativeElements.Field.hozoRequiredStyle()).color, '#cc0000')
  assert.equal(flat(nativeElements.Field.hozoDescriptionStyle()).color, '#334455')
  assert.equal(flat(nativeElements.Field.hozoErrorStyle()).color, '#990000')
  assert.equal(flat(nativeElements.TextArea.hozoTextAreaStyle()).paddingTop, 12)
  assert.equal(flat(nativeElements.TextArea.hozoCountStyle()).color, '#556677')

  const page = await browser.newPage()
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const baseHtml = renderToStaticMarkup(createElement(webMod.exports.Screen, {}))
    await page.setContent(`<!doctype html><style>${web.css}</style>${baseHtml}`)
    // Item 2 (Web): markers reach every declared host element.
    const fieldMarkers = await page.evaluate(() => {
      const root = document.querySelector('body > div')
      const label = root.querySelector('label')
      const req = label.querySelector('span[aria-hidden="true"]')
      const err = root.querySelector('span[role="alert"]')
      const desc = root.querySelector('span[id$="-hint"]')
      const areaRoot = root.querySelector('textarea').parentElement
      const count = areaRoot.querySelector('span[id$="-count"]')
      return {
        rootPaddingTop: parseFloat(getComputedStyle(root).paddingTop),
        labelColor: getComputedStyle(label).color,
        reqColor: getComputedStyle(req).color,
        errColor: getComputedStyle(err).color,
        descColor: getComputedStyle(desc).color,
        areaPaddingTop: parseFloat(getComputedStyle(areaRoot).paddingTop),
        countColor: getComputedStyle(count).color,
      }
    })
    assert.deepEqual(fieldMarkers, {
      rootPaddingTop: 8,
      labelColor: hexToRgb('#112233'),
      reqColor: hexToRgb('#cc0000'),
      errColor: hexToRgb('#990000'),
      descColor: hexToRgb('#334455'),
      areaPaddingTop: 12,
      countColor: hexToRgb('#556677'),
    })

    // Item 3 (Chromium vs Native): TextArea.field state matrix.
    const states = [
      {
        name: 'rest',
        props: {},
        pseudo: [],
        facts: {
          focused: false,
          focusVisible: false,
          disabled: false,
          readOnly: false,
          'aria-invalid': false,
          'aria-required': false,
        },
      },
      {
        name: 'focus',
        props: {},
        pseudo: ['focus'],
        facts: {
          focused: true,
          focusVisible: false,
          disabled: false,
          readOnly: false,
          'aria-invalid': false,
          'aria-required': false,
        },
      },
      {
        name: 'focus-visible',
        props: {},
        pseudo: ['focus', 'focus-visible'],
        facts: {
          focused: true,
          focusVisible: true,
          disabled: false,
          readOnly: false,
          'aria-invalid': false,
          'aria-required': false,
        },
      },
      {
        name: 'read-only',
        props: { readOnly: true },
        pseudo: [],
        facts: {
          focused: false,
          focusVisible: false,
          disabled: false,
          readOnly: true,
          'aria-invalid': false,
          'aria-required': false,
        },
      },
      {
        name: 'disabled',
        props: { disabled: true },
        pseudo: [],
        facts: {
          focused: false,
          focusVisible: false,
          disabled: true,
          readOnly: true,
          'aria-invalid': false,
          'aria-required': false,
        },
      },
      {
        name: 'aria-invalid',
        props: { invalid: true },
        pseudo: [],
        facts: {
          focused: false,
          focusVisible: false,
          disabled: false,
          readOnly: false,
          'aria-invalid': true,
          'aria-required': false,
        },
      },
      {
        name: 'aria-required',
        props: { required: true },
        pseudo: [],
        facts: {
          focused: false,
          focusVisible: false,
          disabled: false,
          readOnly: false,
          'aria-invalid': false,
          'aria-required': true,
        },
      },
    ]
    for (const state of states) {
      const html = renderToStaticMarkup(createElement(webMod.exports.Screen, state.props))
      await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
      const { root } = await cdp.send('DOM.getDocument')
      const { nodeId } = await cdp.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: 'textarea',
      })
      if (state.pseudo.length)
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: state.pseudo })
      const webStyle = await page.locator('textarea').evaluate((el) => {
        const cs = getComputedStyle(el)
        return {
          paddingTop: parseFloat(cs.paddingTop),
          backgroundColor: cs.backgroundColor,
          color: cs.color,
        }
      })
      const nativeStyle = flat(nativeElements.TextArea.hozoFieldStyle(state.facts))
      assert.deepEqual(
        {
          paddingTop: nativeStyle.paddingTop,
          backgroundColor: hexToRgb(nativeStyle.backgroundColor),
          color: hexToRgb(nativeStyle.color),
        },
        webStyle,
        `TextArea.field/${state.name}`,
      )
    }
  } finally {
    await page.close()
  }
})

test('NativeSelect delivers markers to select/Pressable hosts and matches Chromium vs Native prepared states (#2045)', {
  skip: !executablePath,
}, async () => {
  const compiler = createCompiler()
  const selectClasses =
    'p-3 bg-[#112233] text-[#ffffff] hover:bg-[#223344] active:bg-[#334455] focus-visible:bg-[#445566] disabled:bg-[#556677] aria-[invalid=true]:bg-[#667788] aria-required:bg-[#778899]'
  const source = `import { NativeSelect } from '@hozo/form'
export function Screen({ disabled = false, invalid = false, required = false }) {
  return (
    <NativeSelect
      accessibilityLabel="Country"
      options={[{ value: 'jp', label: 'Japan' }]}
      value="jp"
      disabled={disabled}
      aria-invalid={invalid}
      aria-required={required}
      className="${selectClasses}"
    />
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  const webCjs = transformSync(web.code, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const webMod = { exports: {} }
  runInNewContext(webCjs, {
    module: webMod,
    exports: webMod.exports,
    h: createElement,
    require: (specifier) => {
      if (specifier === '@hozo/form') return { NativeSelect }
      throw new Error(`Unexpected web require: ${specifier}`)
    },
  })

  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  const nativeCjs = transformSync(nativeCode, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const nativeMod = { exports: {} }
  const nativeElements = {}
  runInNewContext(nativeCjs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props) => {
      if (typeof type === 'string') nativeElements[type] = props
      return { type, props }
    },
    require: (specifier) => {
      if (specifier === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      if (specifier === '@hozo/form') return { NativeSelect: 'NativeSelect' }
      throw new Error(`Unexpected native require: ${specifier}`)
    },
  })
  nativeMod.exports.Screen({})
  assert.equal(nativeElements.NativeSelect.className, undefined)

  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
    return m ? `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})` : hex
  }

  const page = await browser.newPage()
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const states = [
      {
        name: 'rest',
        props: {},
        pseudo: [],
        facts: {
          hovered: false,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: false,
          'aria-invalid': false,
          'aria-required': false,
        },
      },
      {
        name: 'hover',
        props: {},
        pseudo: ['hover'],
        facts: {
          hovered: true,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: false,
          'aria-invalid': false,
          'aria-required': false,
        },
      },
      {
        name: 'active',
        props: {},
        pseudo: ['active'],
        facts: {
          hovered: false,
          pressed: true,
          focused: false,
          focusVisible: false,
          disabled: false,
          'aria-invalid': false,
          'aria-required': false,
        },
      },
      {
        name: 'focus-visible',
        props: {},
        pseudo: ['focus', 'focus-visible'],
        facts: {
          hovered: false,
          pressed: false,
          focused: true,
          focusVisible: true,
          disabled: false,
          'aria-invalid': false,
          'aria-required': false,
        },
      },
      {
        name: 'disabled',
        props: { disabled: true },
        pseudo: [],
        facts: {
          hovered: false,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: true,
          'aria-invalid': false,
          'aria-required': false,
        },
      },
      {
        name: 'aria-invalid',
        props: { invalid: true },
        pseudo: [],
        facts: {
          hovered: false,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: false,
          'aria-invalid': true,
          'aria-required': false,
        },
      },
      {
        name: 'aria-required',
        props: { required: true },
        pseudo: [],
        facts: {
          hovered: false,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: false,
          'aria-invalid': false,
          'aria-required': true,
        },
      },
    ]
    for (const state of states) {
      const html = renderToStaticMarkup(createElement(webMod.exports.Screen, state.props))
      await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
      const { root } = await cdp.send('DOM.getDocument')
      const { nodeId } = await cdp.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: 'select',
      })
      if (state.pseudo.length)
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: state.pseudo })
      const webStyle = await page.locator('select').evaluate((el) => {
        const cs = getComputedStyle(el)
        return {
          paddingTop: parseFloat(cs.paddingTop),
          backgroundColor: cs.backgroundColor,
          color: cs.color,
        }
      })
      const nativeStyle = flat(nativeElements.NativeSelect.hozoSelectStyle(state.facts))
      assert.deepEqual(
        {
          paddingTop: nativeStyle.paddingTop,
          backgroundColor: hexToRgb(nativeStyle.backgroundColor),
          color: hexToRgb(nativeStyle.color),
        },
        webStyle,
        `NativeSelect.root/${state.name}`,
      )
    }
  } finally {
    await page.close()
  }
})

test('Calendar delivers markers to all five hosts and matches Chromium vs Native prepared states (#2045)', {
  skip: !executablePath,
}, async () => {
  const compiler = createCompiler()
  const monthClasses =
    'p-2 bg-[#112233] text-[#ffffff] hover:bg-[#223344] active:bg-[#334455] focus-visible:bg-[#445566] disabled:bg-[#556677]'
  const dayClasses =
    'p-1 bg-[#101010] text-[#ffffff] hover:bg-[#202020] active:bg-[#303030] focus-visible:bg-[#404040] data-[hozo-outside]:bg-[#505050] aria-disabled:bg-[#606060] data-[hozo-disabled]:text-[#aaaaaa] aria-selected:bg-[#707070] data-[hozo-range-start]:bg-[#808080] data-[hozo-in-range]:bg-[#909090] data-[hozo-range-end]:bg-[#a0a0a0]'
  const source = `import { Calendar } from '@hozo/form'
export function Screen() {
  return (
    <Calendar
      range
      accessibilityLabel="Trip"
      today={{ year: 2026, month: 9, day: 24 }}
      defaultMonth={{ year: 2026, month: 9 }}
      min={{ year: 2026, month: 9, day: 10 }}
      value={{ start: { year: 2026, month: 9, day: 12 }, end: { year: 2026, month: 9, day: 14 } }}
      locale="en-US"
      firstDayOfWeek={1}
      className="pt-2 text-[#112233]"
      headerClassName="pt-3 text-[#223344]"
      gridClassName="pt-4 text-[#334455]"
      monthButtonClassName="${monthClasses}"
      dayClassName="${dayClasses}"
    />
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  const webCjs = transformSync(web.code, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const webMod = { exports: {} }
  runInNewContext(webCjs, {
    module: webMod,
    exports: webMod.exports,
    h: createElement,
    require: (specifier) => {
      if (specifier === '@hozo/form') return { Calendar }
      throw new Error(`Unexpected web require: ${specifier}`)
    },
  })

  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  const nativeCjs = transformSync(nativeCode, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const nativeMod = { exports: {} }
  const nativeElements = {}
  runInNewContext(nativeCjs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props) => {
      if (typeof type === 'string') nativeElements[type] = props
      return { type, props }
    },
    require: (specifier) => {
      if (specifier === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      if (specifier === '@hozo/form') return { Calendar: 'Calendar' }
      throw new Error(`Unexpected native require: ${specifier}`)
    },
  })
  nativeMod.exports.Screen()
  for (const prop of [
    'className',
    'headerClassName',
    'gridClassName',
    'monthButtonClassName',
    'dayClassName',
  ])
    assert.equal(nativeElements.Calendar[prop], undefined)

  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
    return m ? `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})` : hex
  }
  assert.equal(flat(nativeElements.Calendar.hozoCalendarStyle()).paddingTop, 8)
  assert.equal(flat(nativeElements.Calendar.hozoCalendarStyle()).color, '#112233')
  assert.equal(flat(nativeElements.Calendar.hozoHeaderStyle()).paddingTop, 12)
  assert.equal(flat(nativeElements.Calendar.hozoGridStyle()).paddingTop, 16)

  const page = await browser.newPage()
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const html = renderToStaticMarkup(createElement(webMod.exports.Screen))
    await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)

    const structural = await page.evaluate(() => {
      const root = document.querySelector('div[role="group"]')
      const header = root.firstElementChild
      const grid = root.querySelector('table[role="grid"]')
      return {
        rootPaddingTop: parseFloat(getComputedStyle(root).paddingTop),
        rootColor: getComputedStyle(root).color,
        headerPaddingTop: parseFloat(getComputedStyle(header).paddingTop),
        gridPaddingTop: parseFloat(getComputedStyle(grid).paddingTop),
      }
    })
    assert.deepEqual(structural, {
      rootPaddingTop: 8,
      rootColor: hexToRgb('#112233'),
      headerPaddingTop: 12,
      gridPaddingTop: 16,
    })

    // Month buttons: previous is disabled, next is enabled.
    for (const [label, selector, pseudo, facts] of [
      [
        'monthButton/disabled',
        'button[aria-label="Previous month"]',
        [],
        { hovered: false, pressed: false, focused: false, focusVisible: false, disabled: true },
      ],
      [
        'monthButton/rest',
        'button[aria-label="Next month"]',
        [],
        { hovered: false, pressed: false, focused: false, focusVisible: false, disabled: false },
      ],
      [
        'monthButton/hover',
        'button[aria-label="Next month"]',
        ['hover'],
        { hovered: true, pressed: false, focused: false, focusVisible: false, disabled: false },
      ],
      [
        'monthButton/active',
        'button[aria-label="Next month"]',
        ['active'],
        { hovered: false, pressed: true, focused: false, focusVisible: false, disabled: false },
      ],
      [
        'monthButton/focus-visible',
        'button[aria-label="Next month"]',
        ['focus', 'focus-visible'],
        { hovered: false, pressed: false, focused: true, focusVisible: true, disabled: false },
      ],
    ]) {
      await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
      const { root } = await cdp.send('DOM.getDocument')
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
      if (pseudo.length)
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: pseudo })
      const webStyle = await page.locator(selector).evaluate((el) => {
        const cs = getComputedStyle(el)
        return {
          paddingTop: parseFloat(cs.paddingTop),
          backgroundColor: cs.backgroundColor,
          color: cs.color,
        }
      })
      const nativeStyle = flat(nativeElements.Calendar.hozoMonthButtonStyle(facts))
      assert.deepEqual(
        {
          paddingTop: nativeStyle.paddingTop,
          backgroundColor: hexToRgb(nativeStyle.backgroundColor),
          color: hexToRgb(nativeStyle.color),
        },
        webStyle,
        label,
      )
    }

    // Day cells: rest, hover, outside, disabled, range-start, in-range, range-end.
    const dayBase = {
      hovered: false,
      pressed: false,
      focused: false,
      focusVisible: false,
      'aria-selected': false,
      'aria-disabled': false,
      'data-hozo-outside': false,
      'data-hozo-disabled': false,
      'data-hozo-range-start': false,
      'data-hozo-range-end': false,
      'data-hozo-in-range': false,
    }
    for (const [label, selector, pseudo, facts] of [
      ['day/rest', 'td[aria-label*="September 20, 2026"]', [], dayBase],
      [
        'day/hover',
        'td[aria-label*="September 20, 2026"]',
        ['hover'],
        { ...dayBase, hovered: true },
      ],
      [
        'day/focus-visible',
        'td[aria-label*="September 20, 2026"]',
        ['focus', 'focus-visible'],
        { ...dayBase, focused: true, focusVisible: true },
      ],
      [
        'day/outside',
        'td[aria-label*="October 1, 2026"]',
        [],
        { ...dayBase, 'data-hozo-outside': true },
      ],
      [
        'day/disabled',
        'td[aria-label*="September 5, 2026"]',
        [],
        { ...dayBase, 'aria-disabled': true, 'data-hozo-disabled': true },
      ],
      [
        'day/range-start',
        'td[aria-label*="September 12, 2026"]',
        [],
        { ...dayBase, 'aria-selected': true, 'data-hozo-range-start': true },
      ],
      [
        'day/in-range',
        'td[aria-label*="September 13, 2026"]',
        [],
        { ...dayBase, 'aria-selected': true, 'data-hozo-in-range': true },
      ],
      [
        'day/range-end',
        'td[aria-label*="September 14, 2026"]',
        [],
        { ...dayBase, 'aria-selected': true, 'data-hozo-range-end': true },
      ],
    ]) {
      await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
      const { root } = await cdp.send('DOM.getDocument')
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
      if (pseudo.length)
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: pseudo })
      const webStyle = await page.locator(selector).evaluate((el) => {
        const cs = getComputedStyle(el)
        return {
          paddingTop: parseFloat(cs.paddingTop),
          backgroundColor: cs.backgroundColor,
          color: cs.color,
        }
      })
      const nativeStyle = flat(nativeElements.Calendar.hozoDayStyle(facts))
      assert.deepEqual(
        {
          paddingTop: nativeStyle.paddingTop,
          backgroundColor: hexToRgb(nativeStyle.backgroundColor),
          color: hexToRgb(nativeStyle.color),
        },
        webStyle,
        label,
      )
    }
  } finally {
    await page.close()
  }
})

test('DatePicker, DateRangePicker and DateTimePicker deliver markers and match Chromium vs Native prepared states (#2045)', {
  skip: !executablePath,
}, async () => {
  const compiler = createCompiler()
  const triggerClasses =
    'p-2 bg-[#112233] text-[#ffffff] hover:bg-[#223344] active:bg-[#334455] focus-visible:bg-[#445566] aria-expanded:bg-[#556677] disabled:bg-[#667788]'
  const doneClasses =
    'p-2 bg-[#212121] text-[#ffffff] hover:bg-[#313131] active:bg-[#414141] focus-visible:bg-[#515151]'
  const calendarSlots = `className="pt-[11px]" dialogClassName="pt-[17px]"
        calendarClassName="pt-[23px]" headerClassName="pt-[29px]" gridClassName="pt-[37px]"
        monthButtonClassName="bg-[#414141]" dayClassName="bg-[#515151]"`
  const source = `import { DatePicker, DateRangePicker, DateTimePicker } from '@hozo/form'
export function Screen({ open = false, disabled = false }) {
  return (
    <div id="wrap">
      <DatePicker
        defaultOpen={open}
        disabled={disabled}
        accessibilityLabel="Departure"
        today={{ year: 2026, month: 9, day: 24 }}
        defaultMonth={{ year: 2026, month: 9 }}
        ${calendarSlots}
        triggerClassName="${triggerClasses}"
      />
      <DateRangePicker
        defaultOpen={open}
        disabled={disabled}
        accessibilityLabel="Stay"
        today={{ year: 2026, month: 9, day: 24 }}
        defaultMonth={{ year: 2026, month: 9 }}
        ${calendarSlots}
        triggerClassName="${triggerClasses}"
      />
      <DateTimePicker
        defaultOpen={open}
        disabled={disabled}
        accessibilityLabel="Meeting"
        today={{ year: 2026, month: 9, day: 24 }}
        defaultMonth={{ year: 2026, month: 9 }}
        ${calendarSlots}
        triggerClassName="${triggerClasses}"
        doneClassName="${doneClasses}"
      >
        {() => null}
      </DateTimePicker>
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  const webCjs = transformSync(web.code, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const webMod = { exports: {} }
  runInNewContext(webCjs, {
    module: webMod,
    exports: webMod.exports,
    h: createElement,
    require: (specifier) => {
      if (specifier === '@hozo/form') return { DatePicker, DateRangePicker, DateTimePicker }
      throw new Error(`Unexpected web require: ${specifier}`)
    },
  })

  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  const nativeCjs = transformSync(nativeCode, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  const nativeMod = { exports: {} }
  const nativeElements = {}
  runInNewContext(nativeCjs, {
    module: nativeMod,
    exports: nativeMod.exports,
    h: (type, props) => {
      if (typeof type === 'string' && type !== 'div') nativeElements[type] = props
      return { type, props }
    },
    require: (specifier) => {
      if (specifier === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      if (specifier === '@hozo/form')
        return {
          DatePicker: 'DatePicker',
          DateRangePicker: 'DateRangePicker',
          DateTimePicker: 'DateTimePicker',
        }
      throw new Error(`Unexpected native require: ${specifier}`)
    },
  })
  nativeMod.exports.Screen({})
  for (const name of ['DatePicker', 'DateRangePicker', 'DateTimePicker']) {
    assert.equal(nativeElements[name].className, undefined)
    assert.equal(nativeElements[name].triggerClassName, undefined)
    assert.equal(nativeElements[name].dialogClassName, undefined)
  }
  assert.equal(nativeElements.DateTimePicker.doneClassName, undefined)

  const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
  const hexToRgb = (hex) => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
    return m ? `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})` : hex
  }
  assert.equal(flat(nativeElements.DatePicker.hozoDatePickerStyle()).paddingTop, 11)
  assert.equal(flat(nativeElements.DatePicker.hozoDialogStyle()).paddingTop, 17)
  assert.equal(flat(nativeElements.DatePicker.hozoCalendarStyle()).paddingTop, 23)
  assert.equal(flat(nativeElements.DatePicker.hozoHeaderStyle()).paddingTop, 29)
  assert.equal(flat(nativeElements.DatePicker.hozoGridStyle()).paddingTop, 37)

  const page = await browser.newPage()
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')

    const triggerStates = [
      {
        name: 'rest',
        props: { open: false, disabled: false },
        pseudo: [],
        facts: {
          hovered: false,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: false,
          'aria-expanded': false,
        },
      },
      {
        name: 'hover',
        props: { open: false, disabled: false },
        pseudo: ['hover'],
        facts: {
          hovered: true,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: false,
          'aria-expanded': false,
        },
      },
      {
        name: 'active',
        props: { open: false, disabled: false },
        pseudo: ['active'],
        facts: {
          hovered: false,
          pressed: true,
          focused: false,
          focusVisible: false,
          disabled: false,
          'aria-expanded': false,
        },
      },
      {
        name: 'focus-visible',
        props: { open: false, disabled: false },
        pseudo: ['focus', 'focus-visible'],
        facts: {
          hovered: false,
          pressed: false,
          focused: true,
          focusVisible: true,
          disabled: false,
          'aria-expanded': false,
        },
      },
      {
        name: 'expanded',
        props: { open: true, disabled: false },
        pseudo: [],
        facts: {
          hovered: false,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: false,
          'aria-expanded': true,
        },
      },
      {
        name: 'disabled',
        props: { open: false, disabled: true },
        pseudo: [],
        facts: {
          hovered: false,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: true,
          'aria-expanded': false,
        },
      },
    ]

    for (const [index, name] of ['DatePicker', 'DateRangePicker', 'DateTimePicker'].entries()) {
      for (const state of triggerStates) {
        const html = renderToStaticMarkup(createElement(webMod.exports.Screen, state.props))
        await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
        const selector = `#wrap > div:nth-child(${index + 1}) > button[aria-haspopup="dialog"]`
        const { root } = await cdp.send('DOM.getDocument')
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
        if (state.pseudo.length)
          await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: state.pseudo })
        const webStyle = await page.locator(selector).evaluate((el) => {
          const cs = getComputedStyle(el)
          return {
            paddingTop: parseFloat(cs.paddingTop),
            backgroundColor: cs.backgroundColor,
            color: cs.color,
          }
        })
        const nativeStyle = flat(nativeElements[name].hozoTriggerStyle(state.facts))
        assert.deepEqual(
          {
            paddingTop: nativeStyle.paddingTop,
            backgroundColor: hexToRgb(nativeStyle.backgroundColor),
            color: hexToRgb(nativeStyle.color),
          },
          webStyle,
          `${name}.trigger/${state.name}`,
        )
      }
    }

    // Open dialog & DateTimePicker done button markers/states.
    const openHtml = renderToStaticMarkup(createElement(webMod.exports.Screen, { open: true }))
    await page.setContent(`<!doctype html><style>${web.css}</style>${openHtml}`)
    for (const [index, name] of ['DatePicker', 'DateRangePicker', 'DateTimePicker'].entries()) {
      const openMarkers = await page
        .locator(`#wrap > div:nth-child(${index + 1})`)
        .evaluate((root) => {
          const dialog = root.querySelector('div[role="dialog"]')
          const cal = dialog.querySelector('div[role="group"]')
          const header = cal.firstElementChild
          const grid = cal.querySelector('table[role="grid"]')
          return {
            boxPadding: [root, dialog, cal, header, grid].map((el) =>
              parseFloat(getComputedStyle(el).paddingTop),
            ),
            monthButtons: [...header.querySelectorAll('button')].map(
              (el) => getComputedStyle(el).backgroundColor,
            ),
            day: getComputedStyle(grid.querySelector('td[role="gridcell"]')).backgroundColor,
          }
        })
      assert.deepEqual(
        openMarkers,
        {
          boxPadding: [11, 17, 23, 29, 37],
          monthButtons: ['rgb(65, 65, 65)', 'rgb(65, 65, 65)'],
          day: 'rgb(81, 81, 81)',
        },
        `${name}: root, dialog, calendar, header, grid and controls`,
      )
    }

    for (const [label, pseudo, facts] of [
      ['done/rest', [], { hovered: false, pressed: false, focused: false, focusVisible: false }],
      [
        'done/hover',
        ['hover'],
        { hovered: true, pressed: false, focused: false, focusVisible: false },
      ],
      [
        'done/active',
        ['active'],
        { hovered: false, pressed: true, focused: false, focusVisible: false },
      ],
      [
        'done/focus-visible',
        ['focus', 'focus-visible'],
        { hovered: false, pressed: false, focused: true, focusVisible: true },
      ],
    ]) {
      await page.setContent(`<!doctype html><style>${web.css}</style>${openHtml}`)
      const selector = '#wrap > div:nth-child(3) [role="dialog"] > button[type="button"]'
      const { root } = await cdp.send('DOM.getDocument')
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
      if (pseudo.length)
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: pseudo })
      const webStyle = await page.locator(selector).evaluate((el) => {
        const cs = getComputedStyle(el)
        return {
          paddingTop: parseFloat(cs.paddingTop),
          backgroundColor: cs.backgroundColor,
          color: cs.color,
        }
      })
      const nativeStyle = flat(nativeElements.DateTimePicker.hozoDoneStyle(facts))
      assert.deepEqual(
        {
          paddingTop: nativeStyle.paddingTop,
          backgroundColor: hexToRgb(nativeStyle.backgroundColor),
          color: hexToRgb(nativeStyle.color),
        },
        webStyle,
        label,
      )
    }
  } finally {
    await page.close()
  }
})

test('TimePicker delivers markers across all five hosts and matches Chromium vs Native prepared states (#2045)', async () => {
  const compiler = createCompiler()
  const source = `import { TimePicker } from '@hozo/form'
export function Screen({ disabled = false }: { disabled?: boolean }) {
  return (
    <div id="wrap">
      <TimePicker
        hour12
        locale="en-US"
        value={{ hour: 9, minute: 30 }}
        disabled={disabled}
        className="pt-2 text-[#112233]"
        fieldClassName="pt-3 text-[#223344]"
        valueClassName="pt-4 bg-[#101010] text-[#f0f0f0] hover:bg-[#1a1a1a] focus:bg-[#2a2a2a] focus-visible:bg-[#3a3a3a] aria-disabled:bg-[#4a4a4a] data-[hozo-disabled]:text-[#5a5a5a]"
        periodClassName="pt-5 bg-[#606060] text-[#ffffff] hover:bg-[#6a6a6a] active:bg-[#707070] focus-visible:bg-[#7a7a7a] disabled:bg-[#808080] data-[hozo-disabled]:text-[#8a8a8a]"
        stepClassName="pt-1 bg-[#202020] text-[#eeeeee] data-[hozo-step=increase]:bg-[#224466] data-[hozo-step=decrease]:bg-[#664422] hover:bg-[#335577] active:bg-[#446688] disabled:bg-[#909090] data-[hozo-disabled]:text-[#9a9a9a]"
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
      if (id === '@hozo/form') return { TimePicker }
      if (id === 'react') return { createElement }
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
      if (type === 'TimePicker') nativeProps = props
      return { type, props }
    },
    require: (id) => {
      if (id === '@hozo/form') return { TimePicker: 'TimePicker' }
      if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } }
      throw new Error(`unexpected native import ${id}`)
    },
  })
  nativeMod.exports.Screen({})
  assert.ok(nativeProps?.hozoTimePickerStyle)
  assert.ok(nativeProps?.hozoFieldStyle)
  assert.ok(nativeProps?.hozoValueStyle)
  assert.ok(nativeProps?.hozoPeriodStyle)
  assert.ok(nativeProps?.hozoStepStyle)

  const flat = (style) =>
    Object.assign(
      {},
      ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(
        (entry) => entry && typeof entry === 'object',
      ),
    )
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '')
    return `rgb(${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)})`
  }

  const page = await browser.newPage()
  try {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')

    const enabledHtml = renderToStaticMarkup(
      createElement(webMod.exports.Screen, { disabled: false }),
    )
    const disabledHtml = renderToStaticMarkup(
      createElement(webMod.exports.Screen, { disabled: true }),
    )
    await page.setContent(`<!doctype html><style>${web.css}</style>${enabledHtml}`)

    const containerMarkers = await page.evaluate(() => {
      const root = document.querySelector('#wrap > [role="group"]')
      const field = root.querySelector('[data-hozo-field="hour"]')
      return {
        rootPaddingTop: parseFloat(getComputedStyle(root).paddingTop),
        rootColor: getComputedStyle(root).color,
        fieldPaddingTop: parseFloat(getComputedStyle(field).paddingTop),
        fieldColor: getComputedStyle(field).color,
      }
    })
    const nativeRoot = flat(nativeProps.hozoTimePickerStyle())
    const nativeField = flat(nativeProps.hozoFieldStyle())
    assert.deepEqual(containerMarkers, {
      rootPaddingTop: nativeRoot.paddingTop,
      rootColor: hexToRgb(nativeRoot.color),
      fieldPaddingTop: nativeField.paddingTop,
      fieldColor: hexToRgb(nativeField.color),
    })

    // TimePicker.value (interactive div/View spinbutton: hover, focus, focus-visible, aria-disabled, data-hozo-disabled)
    for (const [label, html, pseudo, facts] of [
      [
        'value/rest',
        enabledHtml,
        [],
        {
          hovered: false,
          focused: false,
          focusVisible: false,
          'aria-disabled': false,
          'data-hozo-disabled': false,
        },
      ],
      [
        'value/hover',
        enabledHtml,
        ['hover'],
        {
          hovered: true,
          focused: false,
          focusVisible: false,
          'aria-disabled': false,
          'data-hozo-disabled': false,
        },
      ],
      [
        'value/focus',
        enabledHtml,
        ['focus'],
        {
          hovered: false,
          focused: true,
          focusVisible: false,
          'aria-disabled': false,
          'data-hozo-disabled': false,
        },
      ],
      [
        'value/focus-visible',
        enabledHtml,
        ['focus', 'focus-visible'],
        {
          hovered: false,
          focused: true,
          focusVisible: true,
          'aria-disabled': false,
          'data-hozo-disabled': false,
        },
      ],
      [
        'value/disabled',
        disabledHtml,
        [],
        {
          hovered: false,
          focused: false,
          focusVisible: false,
          'aria-disabled': true,
          'data-hozo-disabled': true,
        },
      ],
    ]) {
      await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
      const selector = '#wrap [data-hozo-field="hour"] [role="spinbutton"]'
      const { root } = await cdp.send('DOM.getDocument')
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
      if (pseudo.length)
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: pseudo })
      const webStyle = await page.locator(selector).evaluate((el) => {
        const cs = getComputedStyle(el)
        return {
          paddingTop: parseFloat(cs.paddingTop),
          backgroundColor: cs.backgroundColor,
          color: cs.color,
        }
      })
      const nativeStyle = flat(nativeProps.hozoValueStyle(facts))
      assert.deepEqual(
        {
          paddingTop: nativeStyle.paddingTop,
          backgroundColor: hexToRgb(nativeStyle.backgroundColor),
          color: hexToRgb(nativeStyle.color),
        },
        webStyle,
        label,
      )
    }

    // TimePicker.period
    for (const [label, html, pseudo, facts] of [
      [
        'period/rest',
        enabledHtml,
        [],
        {
          hovered: false,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: false,
          'data-hozo-disabled': false,
        },
      ],
      [
        'period/hover',
        enabledHtml,
        ['hover'],
        {
          hovered: true,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: false,
          'data-hozo-disabled': false,
        },
      ],
      [
        'period/active',
        enabledHtml,
        ['active'],
        {
          hovered: false,
          pressed: true,
          focused: false,
          focusVisible: false,
          disabled: false,
          'data-hozo-disabled': false,
        },
      ],
      [
        'period/focus-visible',
        enabledHtml,
        ['focus', 'focus-visible'],
        {
          hovered: false,
          pressed: false,
          focused: true,
          focusVisible: true,
          disabled: false,
          'data-hozo-disabled': false,
        },
      ],
      [
        'period/disabled',
        disabledHtml,
        [],
        {
          hovered: false,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: true,
          'data-hozo-disabled': true,
        },
      ],
    ]) {
      await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
      const selector = '#wrap > [role="group"] > button[type="button"]'
      const { root } = await cdp.send('DOM.getDocument')
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
      if (pseudo.length)
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: pseudo })
      const webStyle = await page.locator(selector).evaluate((el) => {
        const cs = getComputedStyle(el)
        return {
          paddingTop: parseFloat(cs.paddingTop),
          backgroundColor: cs.backgroundColor,
          color: cs.color,
        }
      })
      const nativeStyle = flat(nativeProps.hozoPeriodStyle(facts))
      assert.deepEqual(
        {
          paddingTop: nativeStyle.paddingTop,
          backgroundColor: hexToRgb(nativeStyle.backgroundColor),
          color: hexToRgb(nativeStyle.color),
        },
        webStyle,
        label,
      )
    }

    // TimePicker.step (increase, decrease, hover, active, disabled)
    for (const [label, html, selector, pseudo, facts] of [
      [
        'step/increase',
        enabledHtml,
        '#wrap [data-hozo-field="hour"] button[data-hozo-step="increase"]',
        [],
        {
          hovered: false,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: false,
          'data-hozo-step': true,
          'data-hozo-step=increase': true,
          'data-hozo-step=decrease': false,
          'data-hozo-disabled': false,
        },
      ],
      [
        'step/decrease',
        enabledHtml,
        '#wrap [data-hozo-field="hour"] button[data-hozo-step="decrease"]',
        [],
        {
          hovered: false,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: false,
          'data-hozo-step': true,
          'data-hozo-step=increase': false,
          'data-hozo-step=decrease': true,
          'data-hozo-disabled': false,
        },
      ],
      [
        'step/hover',
        enabledHtml,
        '#wrap [data-hozo-field="hour"] button[data-hozo-step="increase"]',
        ['hover'],
        {
          hovered: true,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: false,
          'data-hozo-step': true,
          'data-hozo-step=increase': true,
          'data-hozo-step=decrease': false,
          'data-hozo-disabled': false,
        },
      ],
      [
        'step/active',
        enabledHtml,
        '#wrap [data-hozo-field="hour"] button[data-hozo-step="increase"]',
        ['active'],
        {
          hovered: false,
          pressed: true,
          focused: false,
          focusVisible: false,
          disabled: false,
          'data-hozo-step': true,
          'data-hozo-step=increase': true,
          'data-hozo-step=decrease': false,
          'data-hozo-disabled': false,
        },
      ],
      [
        'step/disabled',
        disabledHtml,
        '#wrap [data-hozo-field="hour"] button[data-hozo-step="increase"]',
        [],
        {
          hovered: false,
          pressed: false,
          focused: false,
          focusVisible: false,
          disabled: true,
          'data-hozo-step': true,
          'data-hozo-step=increase': true,
          'data-hozo-step=decrease': false,
          'data-hozo-disabled': true,
        },
      ],
    ]) {
      await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
      const { root } = await cdp.send('DOM.getDocument')
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
      if (pseudo.length)
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: pseudo })
      const webStyle = await page.locator(selector).evaluate((el) => {
        const cs = getComputedStyle(el)
        return {
          paddingTop: parseFloat(cs.paddingTop),
          backgroundColor: cs.backgroundColor,
          color: cs.color,
        }
      })
      const nativeStyle = flat(nativeProps.hozoStepStyle(facts))
      assert.deepEqual(
        {
          paddingTop: nativeStyle.paddingTop,
          backgroundColor: hexToRgb(nativeStyle.backgroundColor),
          color: hexToRgb(nativeStyle.color),
        },
        webStyle,
        label,
      )
    }
  } finally {
    await page.close()
  }
})

test('single-platform @hozo/form slots prepare only on their real host platform (#2095)', async () => {
  const compiler = createCompiler()
  const source = `import { FileDropzone, NativeSelect } from '@hozo/form'
export function Screen() {
  return (
    <div id="wrap">
      <FileDropzone
        accessibilityLabel="Upload"
        className="pt-2 bg-[#111111] border-[#222222]"
        activeClassName="bg-[#336699] border-[#0055aa]"
      >
        Drop
      </FileDropzone>
      <NativeSelect
        options={[{ value: 'a', label: 'Alpha' }]}
        value="a"
        className="pt-3 bg-[#121212]"
        indicatorClassName="w-2 h-2 border-b-2 border-[#444444]"
        sheetClassName="pt-4 bg-[#555555]"
        scrimClassName="bg-[#000000]"
        optionClassName="pt-2 bg-[#666666] active:bg-[#777777] aria-selected:bg-[#888888]"
      />
    </div>
  )
}
`
  const web = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(web)
  // Web compiles FileDropzone.activeClassName and leaves NativeSelect's 4 Native-only props untouched.
  assert.match(web.code, /activeClassName=\{"hozo-owner-/)
  assert.match(web.code, /indicatorClassName="w-2 h-2 border-b-2 border-\[#444444\]"/)
  assert.match(web.code, /sheetClassName="pt-4 bg-\[#555555\]"/)
  assert.match(web.code, /scrimClassName="bg-\[#000000\]"/)
  assert.match(web.code, /optionClassName="pt-2 bg-\[#666666\]/)
  assert.doesNotMatch(web.css, /#444444|#555555|#666666|#777777|#888888/)

  const webJs = transformSync(web.code, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'h',
  }).code
  let compiledActiveClass
  const probeMod = { exports: {} }
  runInNewContext(webJs, {
    module: probeMod,
    exports: probeMod.exports,
    h: (type, props) => {
      if (type === 'FileDropzone') compiledActiveClass = props.activeClassName
      return { type, props }
    },
    require: (id) => {
      if (id === '@hozo/form') return { FileDropzone: 'FileDropzone', NativeSelect: 'NativeSelect' }
      throw new Error(`unexpected web probe import ${id}`)
    },
  })
  probeMod.exports.Screen()
  assert.match(compiledActiveClass, /^hozo-owner-/)

  // Native compiles NativeSelect's 4 Native-only props and leaves FileDropzone.activeClassName untouched.
  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  assert.match(nativeCode, /activeClassName="bg-\[#336699\] border-\[#0055aa\]"/)
  assert.match(nativeCode, /hozoIndicatorStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(nativeCode, /hozoSheetStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(nativeCode, /hozoScrimStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(nativeCode, /hozoOptionStyle=\{__hozoOwner\d+_Plan\d+\}/)

  // Mount the compiled caller and let the real component apply the prepared
  // active class in response to drag events. Adding it in the test would
  // only exercise the selector, not the owner's delivery of it.
  const fixture = await build({
    stdin: {
      contents: `${web.code}
        import {createElement} from 'react';
        import {createRoot} from 'react-dom/client';
        import {flushSync} from 'react-dom';
        const root = createRoot(document.getElementById('fixture'));
        flushSync(() => root.render(createElement(Screen)));`,
      loader: 'tsx',
      resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const page = await browser.newPage()
  try {
    await page.setContent(`<!doctype html><style>${web.css}</style><div id="fixture"></div>`)
    await page.addScriptTag({ content: fixture.outputFiles[0].text })
    const button = page.getByRole('button', { name: 'Upload', exact: true })
    const observe = () =>
      button.evaluate((button) => ({
        paddingTop: parseFloat(getComputedStyle(button).paddingTop),
        backgroundColor: getComputedStyle(button).backgroundColor,
        borderTopColor: getComputedStyle(button).borderTopColor,
      }))
    const resting = {
      paddingTop: 8,
      backgroundColor: 'rgb(17, 17, 17)',
      borderTopColor: 'rgb(34, 34, 34)',
    }
    assert.deepEqual(await observe(), resting)
    const dispatch = async (event, active) => {
      await button.dispatchEvent(event)
      await page.waitForFunction(
        ({ activeClass, active }) => {
          const button = document.querySelector('#wrap button[aria-label="Upload"]')
          return button?.classList.contains(activeClass) === active
        },
        { activeClass: compiledActiveClass, active },
        { timeout: 5000 },
      )
    }
    await dispatch('dragenter', true)
    assert.deepEqual(await observe(), {
      paddingTop: 8,
      backgroundColor: 'rgb(51, 102, 153)',
      borderTopColor: 'rgb(0, 85, 170)',
    })
    await dispatch('dragleave', false)
    assert.deepEqual(await observe(), resting)
  } finally {
    await page.close()
  }
})
