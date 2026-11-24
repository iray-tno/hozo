// Scalar ranks, typography registers, filter/transform resets, and Tailwind browser oracles.
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Fixtures retain authored TSX interpolation.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '@hozo/engine'
import { loadTheme, prepareTailwindOrder, tailwindPackageDir } from '@hozo/tailwind'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { compile } from 'tailwindcss'
import Yoga from 'yoga-layout'
import { hozoAuthoredStyle } from '../../../packages/engine/src/authored-gap.ts'
import {
  hozoMixedTextMetricStyles,
  hozoTextMetricStyles,
} from '../../../packages/engine/src/class-resolver.ts'
import { hozoDomStyle } from '../../../packages/engine/src/dom-style.ts'
import {
  gapGeometry,
  gapLayouts,
  yogaGapGeometry,
} from '../../../packages/tailwind-conformance/src/gap-alias-reference.ts'
import {
  assertRepeatedOwnerRegisters as checkRepeatedOwnerRegisters,
  evaluate,
  executablePath,
  launchCallerBrowser,
} from './caller-composition-harness.mjs'

const compiler = createCompiler()
let browser

const assertRepeatedOwnerRegisters = (opts) => checkRepeatedOwnerRegisters(browser, compiler, opts)

before(async () => {
  browser = await launchCallerBrowser()
})
after(async () => {
  await browser?.close()
})

test('opaque typography needs captured rule order even when a caller string includes a barrier', {
  skip: !executablePath,
}, async () => {
  const css = `${readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')}
    @tailwind utilities; @theme { --color-brand: #123456; --font-sans: Arial; --font-serif: Georgia; }
    @utility bg-brand { background-color: #abcdef; }
    @utility text-brand { color: #123456; }`
  const theme = await loadTheme(css, tailwindPackageDir())
  const names = [
    'bg-brand',
    'text-brand',
    'active:text-2xl',
    'hover:text-xl',
    'hover:text-lg',
    'active:p-2',
    'hover:p-4',
    'hover:focus:text-3xl',
    'hover:font-bold',
    'hover:font-normal',
    'hover:font-sans',
    'hover:font-serif',
    'hover:tracking-[1px]',
    'hover:tracking-[2px]',
    'hover:opacity-25',
    'hover:opacity-75',
  ]
  const { snapshot, classOrder } = await prepareTailwindOrder(css, tailwindPackageDir(), [
    ...names,
    'hover:mt-2',
    'hover:bg-brand',
  ])
  const context = prepareFinalTailwindContext(JSON.stringify(snapshot))
  const local = createCompiler(theme)
  const cache = openCandidateCache()
  cache.scanFile('opaque-metrics.tsx', JSON.stringify(names.join(' ')), 1)
  const candidates = cache.renderNativeModulePlan(context, theme)
  assert.equal(candidates.ordering.ranks['bg-brand'], undefined)
  const candidateCode = candidates.code.replace(/^import .*$/gm, '')
  const production = evaluate(candidateCode, { createClassResolver }).hozoClasses
  // The independent namespace no longer needs legacy ranks. Build the
  // negative control in a larger universe where the old route is reachable.
  const control = openCandidateCache()
  control.scanFile(
    'mixed.tsx',
    JSON.stringify([...names, 'hover:mt-2', 'hover:bg-brand'].join(' ')),
    1,
  )
  const controlCode = control
    .renderNativeModulePlan(context, theme)
    .code.replace(/^import .*$/gm, '')
    .replace(/^hozoClasses\.fontDefaults = .*$/m, '')
  const withStateColor = openCandidateCache()
  withStateColor.scanFile('colour.tsx', JSON.stringify([...names, 'hover:bg-brand'].join(' ')), 1)
  const colorPlan = withStateColor.renderNativeModulePlan(context, theme)
  assert.match(colorPlan.code, /rankedStates: "hover:bg-brand"/)
  const renderColor = evaluate(colorPlan.code.replace(/^import .*$/gm, ''), {
    createClassResolver,
  }).hozoClasses
  const withBarrier = (plan) => ({
    ...plan,
    ordering: { schema: 1, ranks: {} },
  })
  const specificityOnly = evaluate(controlCode, {
    createClassResolver: (plan) => createClassResolver(withBarrier(plan)),
  }).hozoClasses
  const partial = evaluate(controlCode, { createClassResolver }).hozoClasses
  const source = `import { Button } from '@hozo/core'; const el=<Button className={value}/>`
  const web = local.prepareWebModule(source).emit(context)[0]
  const native = local.prepareNativeModule(source).emit(context).components[0]
  assert.deepEqual(
    native.diagnostics.map(({ code }) => code),
    ['DYNAMIC_CLASS_NAME_NOT_RESOLVED'],
  )
  const renderWeb = evaluate(`module.exports=(value)=> (${web.jsx})`, { h: createElement })
  const renderNative = (resolve) =>
    evaluate(`const hozoStyles=${native.styles};module.exports=(value)=> (${native.jsx})`, {
      HozoPressable: 'host',
      Pressable: 'host',
      h: (_type, props) => props,
      hozoClasses: resolve,
    })
  const renderCurrent = renderNative(production)
  const renderMasked = renderNative(specificityOnly)
  const renderPartial = renderNative(partial)
  const upstream = (await compile(css)).build(names)
  const downstream = cache.renderCss(theme, classOrder(cache.candidates()))
  const page = await browser.newPage()
  const cdp = await page.context().newCDPSession(page)
  let maskedDisagrees = 0
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    for (const [authored, focus, expected, fallback] of [
      ['active:text-2xl hover:text-xl active:p-2 hover:p-4', false, [24, 32, 8], [20, 28, 16]],
      ['hover:text-xl active:text-2xl hover:p-4 active:p-2', false, [24, 32, 8], [24, 32, 8]],
      [
        'active:text-2xl hover:focus:text-3xl hover:text-xl active:p-2 hover:p-4',
        true,
        [30, 36, 8],
        [30, 36, 16],
      ],
      ['hover:text-xl hover:text-lg active:p-2 hover:p-4', false, [20, 28, 8], [18, 28, 16]],
      ['hover:text-lg hover:text-xl hover:p-4 active:p-2', false, [20, 28, 8], [20, 28, 8]],
    ]) {
      const value = `${authored} bg-brand`
      const html = renderToStaticMarkup(renderWeb(value))
      for (const [sheet, markup] of [
        [upstream, `<button class="${value}"></button>`],
        [`${downstream}\n${web.css}`, html],
      ]) {
        await page.setContent(`<!doctype html><style>${sheet}</style>${markup}`)
        const { root } = await cdp.send('DOM.getDocument')
        const { nodeId } = await cdp.send('DOM.querySelector', {
          nodeId: root.nodeId,
          selector: 'button',
        })
        assert.ok(nodeId, html)
        await cdp.send('CSS.forcePseudoState', {
          nodeId,
          forcedPseudoClasses: ['hover', 'active', ...(focus ? ['focus'] : [])],
        })
        const browserMetrics = await page.locator('button').evaluate((node) => {
          const { fontSize, lineHeight, paddingTop } = getComputedStyle(node)
          return [fontSize, lineHeight, paddingTop].map(parseFloat)
        })
        assert.deepEqual(browserMetrics, expected, value)
      }
      const state = { hovered: true, pressed: true, focused: focus, focusVisible: false }
      const read = ({ style }) => {
        const { fontSize, lineHeight, paddingTop } = Object.assign(
          {},
          ...style(state).flat(Infinity).filter(Boolean),
        )
        return [fontSize, lineHeight, paddingTop]
      }
      assert.deepEqual(read(renderCurrent(value)), expected, `${value}/current`)
      assert.deepEqual(
        read(renderPartial(`${value} hover:bg-brand`)),
        expected,
        `${value}/assessed-run-before-barrier`,
      )
      assert.deepEqual(read(renderNative(renderColor)(`${value} hover:bg-brand`)), expected, value)
      assert.deepEqual(read(renderMasked(value)), fallback, `${value}/specificity-only`)
      if (fallback.some((metric, index) => metric !== expected[index])) maskedDisagrees++
    }
    assert.equal(maskedDisagrees, 3)
    const registered = [
      'hover:font-serif',
      'hover:font-sans',
      'hover:font-normal',
      'hover:font-bold',
      'hover:tracking-[2px]',
      'hover:tracking-[1px]',
      'hover:opacity-75',
      'hover:opacity-25',
      'bg-brand',
      'text-brand',
    ]
    for (const tokens of [registered, registered.toReversed()]) {
      const value = tokens.join(' ')
      const html = renderToStaticMarkup(renderWeb(value))
      for (const [sheet, markup] of [
        [upstream, `<button class="${value}"></button>`],
        [`${downstream}\n${web.css}`, html],
      ]) {
        await page.setContent(`<!doctype html><style>${sheet}</style>${markup}`)
        const { root } = await cdp.send('DOM.getDocument')
        const { nodeId } = await cdp.send('DOM.querySelector', {
          nodeId: root.nodeId,
          selector: 'button',
        })
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] })
        assert.deepEqual(
          await page.locator('button').evaluate((element) => {
            const { fontFamily, fontWeight, letterSpacing, opacity } = getComputedStyle(element)
            return [fontFamily, fontWeight, letterSpacing, opacity]
          }),
          ['Georgia', '400', '2px', '0.75'],
          value,
        )
      }
      const state = { hovered: true, pressed: false, focused: false, focusVisible: false }
      const selected = Object.assign(
        {},
        ...renderCurrent(value).style(state).flat(Infinity).filter(Boolean),
      )
      assert.deepEqual(
        [selected.fontFamily, selected.fontWeight, selected.letterSpacing, selected.opacity],
        ['Georgia', '400', 2, 0.75],
        value,
      )
    }
  } finally {
    await page.close()
  }
})

test('an overlapping custom leading register reaches ordinary Web and Native candidates', {
  skip: !executablePath,
}, async () => {
  const base = tailwindPackageDir()
  const names = ['text-brand', 'hover:text-xl', 'hover:text-lg', 'active:text-2xl']
  const cache = openCandidateCache()
  cache.scanFile('custom-leading.tsx', JSON.stringify(names.join(' ')), 1)
  const page = await browser.newPage()
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    for (const overlapping of [false, true]) {
      const css = `${readFileSync(path.join(base, 'theme.css'), 'utf8')}
        @tailwind utilities; @theme { --color-brand: #123456; }
        @utility text-brand { color: #123456; ${overlapping ? '--tw-leading: 41px;' : ''} }`
      const theme = await loadTheme(css, base)
      const { snapshot, classOrder } = await prepareTailwindOrder(css, base, names)
      const context = prepareFinalTailwindContext(JSON.stringify(snapshot))
      const module = cache.renderNativeModulePlan(context, theme)
      const branded = module.entries.find((entry) => entry.candidate === 'text-brand')
      assert.equal(branded.kind, 'style')
      assert.deepEqual(
        branded.groups.map(({ nativeKeys }) => nativeKeys),
        [['color']],
      )
      assert.equal(module.ordering.ranks['text-brand'], undefined)
      assert.equal(module.code.includes('independentColors:'), !overlapping)
      if (overlapping) {
        assert.doesNotMatch(module.code, /rankedStates: true/)
        assert.doesNotMatch(module.code, /lineHeight: (?:28|32) \}, \d+\]/)
      }

      const local = createCompiler(theme)
      const opaque = `import { Text } from '@hozo/core'; const el=<Text className={value}/>`
      const web = local.prepareWebModule(opaque).emit(context)[0]
      const renderWeb = evaluate(`module.exports=(value)=> (${web.jsx})`, { h: createElement })
      const upstream = (await compile(css)).build(names)
      const downstream = `${cache.renderCss(theme, classOrder(cache.candidates()))}\n${web.css}`
      const code = module.code.replace(/^import .*$/gm, '')
      const resolve = evaluate(code, { createClassResolver, hozoTextMetricStyles }).hozoClasses
      assert.deepEqual(Object.assign({}, ...resolve('text-brand')), { color: '#123456' })
      assert.doesNotMatch(downstream, /--tw-leading: 41px;[^}]*line-height:/)
      if (overlapping) {
        // Test both ways the register and reader can meet, without adding a
        // static reader to the runtime candidate map for the first case.
        for (const [literal, dynamic] of [
          ['text-xl', 'text-brand'],
          ['text-brand', 'text-xl'],
        ]) {
          const mixedSource = `import { Text, cx } from '@hozo/core';
            const el=<Text className={cx("${literal}", value)} style={own}>Label</Text>`
          const mixedCache = openCandidateCache()
          mixedCache.scanFile('mixed-leading.ts', JSON.stringify(dynamic), 1)
          const mixedOrder = await prepareTailwindOrder(css, base, [literal, dynamic])
          const mixedContext = prepareFinalTailwindContext(JSON.stringify(mixedOrder.snapshot))
          const mixedCode = mixedCache.renderNativeModulePlan(mixedContext, theme).code
          const hozoClasses = evaluate(mixedCode.replace(/^import .*$/gm, ''), {
            createClassResolver,
            hozoTextMetricStyles,
          }).hozoClasses
          const mixed = local.prepareNativeModule(mixedSource).emit(mixedContext).components[0]
          const win = evaluate(
            `const hozoStyles=${mixed.styles};module.exports=(value, own)=>(${mixed.jsx})`,
            {
              h: (_type, props) => props,
              Text: 'text',
              HozoText: 'text',
              hozoClasses,
              hozoMixedTextMetricStyles,
            },
          )
          for (const own of [undefined, { lineHeight: 53 }]) {
            const selected = Object.assign(
              {},
              ...win(dynamic, own).style.flat(Infinity).filter(Boolean),
            )
            assert.equal(selected.fontSize, 20)
            assert.equal(selected.lineHeight, own?.lineHeight ?? 41)
            const mixedWeb = local.prepareWebModule(mixedSource).emit(mixedContext)[0]
            const renderMixed = evaluate(`module.exports=(value,own)=>(${mixedWeb.jsx})`, {
              h: createElement,
              hozoDomStyle,
            })
            await page.setContent(
              `<style>${mixedCache.renderCss(theme, [dynamic])}\n${mixedWeb.css}</style>${renderToStaticMarkup(
                renderMixed(dynamic, own && { lineHeight: '53px' }),
              )}`,
            )
            assert.equal(
              await page.locator('span').evaluate((node) => getComputedStyle(node).lineHeight),
              `${own?.lineHeight ?? 41}px`,
            )
          }
        }
      }
      for (const tokens of [names, names.toReversed()]) {
        const value = tokens.join(' ')
        const markup = renderToStaticMarkup(renderWeb(value))
        const literal = `import { Pressable } from '@hozo/core';
          const el=<Pressable className="${value}"/>`
        const staticWeb = overlapping ? local.prepareWebModule(literal).emit(context)[0] : null
        const staticNative = overlapping
          ? local.prepareNativeModule(literal).emit(context).components[0]
          : null
        const staticProps =
          staticNative &&
          evaluate(`const hozoStyles=${staticNative.styles};module.exports=(${staticNative.jsx})`, {
            HozoPressable: 'host',
            Pressable: 'host',
            h: (_type, props) => props,
          })
        for (const pressed of [false, true]) {
          const expectedSize = pressed ? 24 : 20
          const defaultLeading = overlapping ? 41 : pressed ? 32 : 28
          for (const [sheet, html, expectedLeading] of [
            [upstream, `<span class="${value}"></span>`, defaultLeading],
            [downstream, markup, defaultLeading],
            ...(staticWeb
              ? [
                  [
                    staticWeb.css,
                    renderToStaticMarkup(
                      evaluate(`module.exports=(${staticWeb.jsx})`, { h: createElement }),
                    ),
                    defaultLeading,
                  ],
                ]
              : []),
          ]) {
            await page.setContent(`<!doctype html><style>${sheet}</style>${html}`)
            const { root } = await cdp.send('DOM.getDocument')
            const { nodeId } = await cdp.send('DOM.querySelector', {
              nodeId: root.nodeId,
              selector: 'body > *',
            })
            assert.ok(nodeId, html)
            await cdp.send('CSS.forcePseudoState', {
              nodeId,
              forcedPseudoClasses: pressed ? ['hover', 'active'] : ['hover'],
            })
            assert.deepEqual(
              await page.locator('body > *').evaluate((node) => {
                const { fontSize, lineHeight } = getComputedStyle(node)
                return [fontSize, lineHeight]
              }),
              [`${expectedSize}px`, `${expectedLeading}px`],
              value,
            )
          }
          const { color, fontSize, lineHeight } = Object.assign(
            {},
            ...resolve(value, { hovered: true, pressed }),
          )
          assert.deepEqual(
            [color, fontSize, lineHeight],
            ['#123456', expectedSize, defaultLeading],
            value,
          )
          if (staticProps) {
            const { fontSize, lineHeight } = Object.assign(
              {},
              ...staticProps
                .hozoTextStyle({ hovered: true, pressed })
                .flat(Infinity)
                .filter(Boolean),
            )
            assert.deepEqual([fontSize, lineHeight], [expectedSize, defaultLeading], value)
          }
        }
      }
    }
  } finally {
    await page.close()
  }
})

test('a custom register does not replace a direct leading declaration in either class order', {
  skip: !executablePath,
}, async () => {
  const base = tailwindPackageDir()
  const css = `${readFileSync(path.join(base, 'theme.css'), 'utf8')}
    @tailwind utilities; @theme { --color-brand: #123456; }
    @utility text-brand { color: #123456; --tw-leading: 41px; }`
  const names = ['text-brand', 'text-xl', 'leading-6']
  const theme = await loadTheme(css, base)
  const { snapshot, classOrder } = await prepareTailwindOrder(css, base, names)
  const context = prepareFinalTailwindContext(JSON.stringify(snapshot))
  const cache = openCandidateCache()
  cache.scanFile('entry.ts', JSON.stringify(names.join(' ')), 1)
  const code = cache.renderNativeModulePlan(context, theme).code.replace(/^import .*$/gm, '')
  const resolve = evaluate(code, { createClassResolver, hozoTextMetricStyles }).hozoClasses
  const upstream = (await compile(css)).build(names)
  const candidateCss = cache.renderCss(theme, classOrder(names))
  const compiler = createCompiler(theme)
  const page = await browser.newPage()
  try {
    for (const tokens of [names, names.toReversed()]) {
      const value = tokens.join(' ')
      const markup = `<span class="${value}">Label</span>`
      const literal = `import {Text} from '@hozo/core'; const el=<Text className="${value}">Label</Text>`
      const web = compiler.prepareWebModule(literal).emit(context)[0]
      const native = compiler.prepareNativeModule(literal).emit(context).components[0]
      const nativeProps = evaluate(
        `const hozoStyles=${native.styles};module.exports=(${native.jsx})`,
        {
          h: (_type, props) => props,
          Text: 'text',
        },
      )
      const compiledMarkup = renderToStaticMarkup(
        evaluate(`module.exports=(${web.jsx})`, { h: createElement }),
      )
      for (const [sheet, html] of [
        [upstream, markup],
        [candidateCss, markup],
        [web.css, compiledMarkup],
      ]) {
        await page.setContent(`<style>${sheet}</style>${html}`)
        assert.deepEqual(
          await page.locator('span').evaluate((element) => {
            const { fontSize, lineHeight } = getComputedStyle(element)
            return [fontSize, lineHeight]
          }),
          ['20px', '24px'],
          value,
        )
      }
      for (const styles of [resolve(value), [nativeProps.style].flat(Infinity)]) {
        const { fontSize, lineHeight } = Object.assign({}, ...styles)
        assert.deepEqual([fontSize, lineHeight], [20, 24], value)
      }
    }
  } finally {
    await page.close()
  }
})

test('absolute metric fallback preserves mixed tiers and projects cross-input leading', {
  skip: !executablePath,
}, async () => {
  const css = `${readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')}
    @tailwind utilities; @theme { --color-brand: #123456; }
    @utility bg-brand { background-color: #abcdef; }
    @utility text-xl { font-size: 20px; }
    @utility text-2xl { font-size: 24px; }`
  const theme = await loadTheme(css, tailwindPackageDir())
  const local = createCompiler(theme)
  const sx = `import * as stylex from '@stylexjs/stylex';
    const metric=stylex.create({label:{fontSize:{default:'15px',':focus':'19px'}}});`
  const compilerRequire = createRequire(
    new URL('../../../packages/compiler/package.json', import.meta.url),
  )
  const official = compilerRequire('@babel/core').transformSync(sx, {
    filename: '/app/MixedMetrics.tsx',
    babelrc: false,
    configFile: false,
    plugins: [[compilerRequire('@stylexjs/babel-plugin'), { runtimeInjection: false }]],
  }).metadata.stylex
  assert.equal(official.length, 2)
  const stylexCss = [...official]
    .sort((a, b) => a[2] - b[2])
    .map(([, rule]) => rule.ltr)
    .join('\n')
  const stylexClasses = official.map(([name]) => name).join(' ')
  const names = [
    'text-sm',
    'hover:text-lg',
    'active:text-2xl',
    'hover:text-xl',
    'tracking-[3px]',
    'leading-6',
    'bg-brand',
  ]
  const { snapshot, classOrder } = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const context = prepareFinalTailwindContext(JSON.stringify(snapshot))
  const cache = openCandidateCache()
  cache.scanFile('mixed-metrics.tsx', JSON.stringify(names.join(' ')), 1)
  const candidates = cache.renderNativeModulePlan(context, theme)
  assert.equal(candidates.ordering.ranks['bg-brand'], undefined)
  assert.equal(candidates.ordering.ranks['hover:text-xl'], undefined)
  const nativeCandidateCode = candidates.code.replace(/^import .*$/gm, '')
  const { hozoClasses } = evaluate(nativeCandidateCode, {
    createClassResolver,
    hozoTextMetricStyles,
  })
  const webCandidates = cache.renderCss(theme, classOrder(cache.candidates()))
  // The unassessed candidate preserves authored order for the compiled
  // input. Native should still follow the same StyleX, residual and inline
  // boundaries as Web, not apply a second Tailwind order to that input.
  const rules = {
    'text-sm': ['', 'font-size:14px;line-height:var(--tw-leading,20px)'],
    'hover:text-lg': [':hover', 'font-size:18px;line-height:var(--tw-leading,28px)'],
    'active:text-2xl': [':active', 'font-size:24px;line-height:var(--tw-leading,32px)'],
    'hover:text-xl': [':hover', 'font-size:20px;line-height:var(--tw-leading,28px)'],
  }
  const page = await browser.newPage()
  const cdp = await page.context().newCDPSession(page)
  let compared = 0
  let leadingGaps = 0
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    for (const guarded of [names.slice(1, 4), names.slice(1, 4).toReversed()])
      for (const stylexLast of [false, true]) {
        const known = ['text-sm', ...guarded]
        const input = `${known.join(' ')} bg-brand`
        const attributes = [
          `className={cx("${input}", runtimeNames)}`,
          '{...stylex.props(metric.label)}',
        ]
        if (!stylexLast) attributes.reverse()
        const source = `${sx} import {cx, Pressable, Text} from '@hozo/core';
          const el=<Pressable><Text ${attributes.join(' ')} style={own}>Label</Text></Pressable>`
        const native = local.prepareNativeModule(source).emit(context).components[0]
        const web = local.prepareWebModule(source).emit(context)[0]
        // `hover:text-lg` and `hover:text-xl` beside the unranked `bg-brand`
        // keep written order, which the build now reports (decision 012).
        for (const { diagnostics } of [native, web])
          assert.deepEqual(diagnostics.map(({ code }) => code).sort(), [
            'DYNAMIC_CLASS_NAME_NOT_RESOLVED',
            'TAILWIND_ORDER_AS_WRITTEN',
          ])
        assert.match(native.jsx, /hozoClasses\(runtimeNames\)/)
        const render = (project) =>
          evaluate(
            `const hozoStyles=${native.styles};module.exports=(runtimeNames, own)=> (${native.jsx})`,
            {
              h: (type, props, ...children) => ({ type, props, children }),
              HozoPressable: 'owner',
              HozoText: 'text',
              Text: 'text',
              hozoClasses,
              hozoMixedTextMetricStyles: project,
            },
          )
        const renderNative = render(hozoMixedTextMetricStyles)
        const withoutProjection = render((styles) => styles)
        const renderWeb = evaluate(`module.exports=(runtimeNames,own)=>(${web.jsx})`, {
          h: createElement,
          hozoDomStyle,
        })
        const authoredCss = known
          .map((name) => {
            const [selector, declarations] = rules[name]
            return `.authored${selector}{${declarations}}`
          })
          .join('\n')
        const sourceCss = stylexLast ? [authoredCss, stylexCss] : [stylexCss, authoredCss]
        for (const [runtimeNames, own] of [
          ['tracking-[3px] bg-brand', undefined],
          ['leading-6 tracking-[3px] bg-brand', undefined],
          ['leading-6 tracking-[3px] bg-brand', { fontSize: 27, letterSpacing: 5 }],
        ]) {
          const actual = renderToStaticMarkup(renderWeb(runtimeNames, own))
          const compiledText = renderNative(runtimeNames, own).children[0].props
          const unprojectedText = withoutProjection(runtimeNames, own).children[0].props
          const reference = renderToStaticMarkup(
            createElement(
              'span',
              {
                className: `authored ${stylexClasses} ${runtimeNames}`,
                style: own,
              },
              'Label',
            ),
          )
          // The only residual metrics here are unconditional; use actual
          // Tailwind CSS for them and the caller's established source tier.
          const oracleCaller = (await compile(css)).build(runtimeNames.split(' '))
          await page.setContent(`<!doctype html>
            <style>${sourceCss.join('\n')}\n${oracleCaller}\n${webCandidates}\n${web.css}</style>
            <section id="oracle">${reference}</section><section id="compiled">${actual}</section>`)
          const { root } = await cdp.send('DOM.getDocument')
          const ids = []
          for (const selector of ['#oracle span', '#compiled span'])
            ids.push(
              (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })).nodeId,
            )
          for (let mask = 0; mask < 8; mask++) {
            const state = {
              hovered: Boolean(mask & 1),
              pressed: Boolean(mask & 2),
              focused: Boolean(mask & 4),
            }
            const forcedPseudoClasses = [
              state.hovered && 'hover',
              state.pressed && 'active',
              state.focused && 'focus',
            ].filter(Boolean)
            for (const nodeId of ids)
              await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses })
            const [expected, compiled] = await page.locator('section span').evaluateAll((nodes) =>
              nodes.map((node) => {
                const style = getComputedStyle(node)
                return [style.fontSize, style.lineHeight, style.letterSpacing].map(parseFloat)
              }),
            )
            const metrics = ({ style }) => {
              const { fontSize, lineHeight, letterSpacing } = Object.assign(
                {},
                ...style(state).flat(Infinity).filter(Boolean),
              )
              return [fontSize, lineHeight, letterSpacing]
            }
            const label = `${input}/StyleX-last=${stylexLast}/${runtimeNames}/${mask}`
            assert.deepEqual(compiled, expected, `${label}/web`)
            assert.deepEqual(metrics(compiledText), expected, `${label}/native`)
            if (runtimeNames.includes('leading-6') && (state.hovered || state.pressed)) {
              assert.equal(expected[1], 24, label)
              assert.equal(metrics(unprojectedText)[1], state.hovered ? 28 : 32, label)
              leadingGaps++
            } else assert.deepEqual(metrics(unprojectedText), expected, label)
            compared++
          }
        }
      }
    assert.equal(compared, 96)
    assert.equal(leadingGaps, 48)
  } finally {
    await page.close()
  }
})

test('static and generated scalars share Tailwind order beside a proven independent background', {
  skip: !executablePath,
}, async () => {
  const base = tailwindPackageDir()
  const css = `${readFileSync(path.join(base, 'theme.css'), 'utf8')} @tailwind utilities;
    @theme { --color-brand: #123456; }`
  const cases = [
    ['hover:gap-2 active:gap-4 hover:gap-6', [24, 24]],
    ['hover:gap-x-6 active:gap-4', [16, 16]],
    ['active:gap-4 hover:gap-x-6', [16, 24]],
    ['active:gap-4 hover:gap-x-6', [28, 28], { gap: 28 }],
    [
      'active:gap-4 hover:gap-x-6 active:opacity-75 hover:opacity-25',
      null,
      undefined,
      'hover:bg-brand',
    ],
    [
      'hover:opacity-25 active:opacity-75 hover:gap-x-6 active:gap-4',
      null,
      undefined,
      'hover:bg-brand',
    ],
  ]
  const names = [
    ...new Set(cases.flatMap(([classes]) => classes.split(' '))),
    'bg-brand',
    'hover:bg-brand',
  ]
  const prepare = async (extra = '') => {
    const stylesheet = `${css} @utility bg-brand { background-color: #abcdef; } ${extra}`
    const theme = await loadTheme(stylesheet, tailwindPackageDir())
    const { snapshot, classOrder } = await prepareTailwindOrder(
      stylesheet,
      tailwindPackageDir(),
      names,
    )
    return {
      final: prepareFinalTailwindContext(JSON.stringify(snapshot)),
      local: createCompiler(theme),
      theme,
      classOrder,
      upstream: (await compile(stylesheet)).build(names),
    }
  }
  const { final, local, theme, classOrder, upstream } = await prepare()
  // This makes active:gap-4's owner ambiguous, unlike a resting-only barrier.
  const overlap = await prepare('@utility gap-4 { gap: 16px; }')
  const cache = openCandidateCache()
  cache.scanFile('gap-fallback.ts', JSON.stringify(names.join(' ')), 1)
  const webCandidates = cache.renderCss(theme, classOrder(cache.candidates()))
  const candidates = cache.renderNativeModulePlan(final, theme)
  assert.equal(candidates.ordering.ranks['bg-brand'], undefined)
  assert.equal(candidates.ordering.ranks['hover:bg-brand'], undefined)
  assert.match(candidates.code, /rankedStates: "hover:bg-brand"/)
  const resolve = evaluate(
    `${candidates.code.replace(/^import[^\n]*\n/gm, '').replaceAll('export const ', 'const ')}
      module.exports = hozoClasses`,
    { createClassResolver },
  )
  const flatten = (style) => Object.assign({}, ...style.flat(Infinity).filter(Boolean))
  const page = await browser.newPage()
  try {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    let controlsDisagree = 0
    for (const [index, [classes, authoredGap, own, color = 'bg-brand']] of cases.entries()) {
      // Exercise a background on either side of the writes and between
      // conflicting shorthand and axis rules.
      const tokens = classes.split(' ')
      const position = color === 'bg-brand' ? index % (tokens.length + 1) : 1
      tokens.splice(position, 0, color)
      const input = tokens.join(' ')
      const source = `import { Pressable } from '@hozo/core'; const el=<Pressable className="${input}" ${own ? 'style={own}' : ''}/>`
      const lower = (compiler, order) => {
        const native = compiler.prepareNativeModule(source).emit(order).components[0]
        const nativeProps = evaluate(`module.exports=(${native.jsx})`, {
          h: (_type, props) => props,
          HozoPressable: 'host',
          own,
          hozoStyles: runInNewContext(`(${native.styles})`),
        })
        const web = compiler.prepareWebModule(source).emit(order)[0]
        const webProps = evaluate(`module.exports=(${web.jsx})`, {
          h: (_type, props) => props,
          own,
          hozoDomStyle,
        })
        return { nativeProps, webProps, web }
      }
      const output = lower(local, final)
      const untouched = authoredGap && lower(overlap.local, overlap.final)
      for (const layout of gapLayouts) {
        const markup = (webProps, className = webProps.className) =>
          renderToStaticMarkup(
            createElement(
              'button',
              {
                className,
                style: {
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignContent: 'flex-start',
                  alignItems: 'flex-start',
                  boxSizing: 'content-box',
                  border: 0,
                  padding: 0,
                  width: 140,
                  height: 140,
                  ...layout,
                  ...webProps.style,
                },
              },
              ...[0, 1, 2].map((key) =>
                createElement('span', { key, style: { flex: 'none', width: 50, height: 50 } }),
              ),
            ),
          )
        const fromNative = (style) => {
          const selected = flatten(style)
          return { gap: yogaGapGeometry(selected, layout), opacity: selected.opacity ?? 1 }
        }
        const compare = async (sheet, html, { hovered, pressed }) => {
          await page.setContent(`<style>${sheet}</style>${html}`)
          const { root } = await cdp.send('DOM.getDocument')
          const { nodeId } = await cdp.send('DOM.querySelector', {
            nodeId: root.nodeId,
            selector: 'button',
          })
          await cdp.send('CSS.forcePseudoState', {
            nodeId,
            forcedPseudoClasses: [hovered && 'hover', pressed && 'active'].filter(Boolean),
          })
          const { positions, opacity } = await page.locator('button').evaluate((owner) => ({
            opacity: Number(getComputedStyle(owner).opacity),
            positions: [...owner.children].map((child) => {
              const box = child.getBoundingClientRect()
              return [box.left, box.top]
            }),
          }))
          return { gap: gapGeometry(positions, layout.flexDirection), opacity }
        }
        for (let bits = 0; bits < 4; bits++) {
          const state = { hovered: !!(bits & 1), pressed: !!(bits & 2), focused: false }
          const expected = await compare(upstream, markup(output.webProps, input), state)
          const label = `${input}, state ${bits}`
          assert.deepEqual(
            await compare(output.web.css, markup(output.webProps), state),
            expected,
            `${label} / static Web`,
          )
          assert.deepEqual(
            await compare(webCandidates, markup(output.webProps, input), state),
            expected,
            `${label} / generated Web`,
          )
          assert.deepEqual(
            fromNative(output.nativeProps.style(state)),
            expected,
            `${label} / static Native`,
          )
          assert.deepEqual(
            fromNative([resolve(input, state), hozoAuthoredStyle(own)]),
            expected,
            `${label} / generated Native`,
          )
          if (bits === 3 && authoredGap) {
            assert.deepEqual(
              (await compare(untouched.web.css, markup(untouched.webProps), state)).gap,
              authoredGap,
              `${label} / overlapping unknown, static Web`,
            )
            assert.deepEqual(
              yogaGapGeometry(flatten(untouched.nativeProps.style(state)), layout),
              authoredGap,
              `${label} / overlapping unknown, static Native`,
            )
            if (authoredGap.some((value, axis) => value !== expected.gap[axis])) controlsDisagree++
          }
        }
      }
    }
    assert.ok(controlsDisagree > 0, 'the overlapping control must detect unproved reordering')
  } finally {
    await page.close()
  }
})

test('an unassessed resting write does not discard assessed owner precedence', {
  skip: !executablePath,
}, async () => {
  const base = tailwindPackageDir()
  const css = `@theme { --spacing: .25rem; --color-brand: #123456; } @tailwind utilities;
    @utility bg-brand { background-color: #123456; padding: 4px; }`
  const guards = ['active:p-2', 'hover:p-4', 'focus:p-3', 'focus-visible:p-5', 'hover:focus:p-6']
  const lists = [0, 1, guards.length].flatMap((position) => {
    const classes = [...guards]
    classes.splice(position, 0, 'bg-brand')
    classes.unshift('p-1')
    return [classes.join(' '), classes.toReversed().join(' ')]
  })
  const names = ['p-1', ...guards, 'bg-brand']
  const theme = await loadTheme(css, base)
  const { snapshot, classOrder } = await prepareTailwindOrder(css, base, names)
  const final = prepareFinalTailwindContext(JSON.stringify(snapshot))
  const local = createCompiler(theme)
  const cache = openCandidateCache()
  cache.scanFile('owner-run.ts', JSON.stringify(names.join(' ')), 1)
  const plan = cache.renderNativeModulePlan(final, theme)
  assert.equal(plan.ordering.ranks['bg-brand'], undefined)
  for (const name of guards) assert.ok(plan.ordering.ranks[name]?.length, name)
  assert.doesNotMatch(plan.code, /independentColors/)
  const resolve = evaluate(plan.code.replace(/^import .*$/gm, ''), {
    createClassResolver,
  }).hozoClasses
  const upstream = (await compile(css)).build(names)
  const generated = cache.renderCss(theme, classOrder(cache.candidates()))
  const page = await browser.newPage()
  try {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const read = async (stylesheet, className, force) => {
      await page.setContent(
        `<!doctype html><style>${stylesheet}</style><button class="${className}">Target</button>`,
      )
      const { root } = await cdp.send('DOM.getDocument')
      const { nodeId } = await cdp.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: 'button',
      })
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: force })
      return page
        .locator('button')
        .evaluate((node) => parseFloat(getComputedStyle(node).paddingTop))
    }
    const selected = (value) =>
      Object.assign({}, ...[value].flat(Infinity).filter(Boolean)).paddingTop
    for (const classes of lists) {
      const source = `import { Pressable } from '@hozo/core'; const el=<Pressable className="${classes}"/>`
      const native = local.prepareNativeModule(source).emit(final).components[0]
      const web = local.prepareWebModule(source).emit(final)[0]
      const webProps = evaluate(`module.exports=(${web.jsx})`, { h: (_type, props) => props })
      const nativeProps = evaluate(`module.exports=(${native.jsx})`, {
        h: (_type, props) => props,
        HozoPressable: 'owner',
        hozoStyles: runInNewContext(`(${native.styles})`),
      })
      for (let mask = 0; mask < 16; mask++) {
        const state = {
          pressed: Boolean(mask & 1),
          hovered: Boolean(mask & 2),
          focused: Boolean(mask & 4),
          focusVisible: Boolean(mask & 8),
        }
        const force = [
          state.pressed && 'active',
          state.hovered && 'hover',
          state.focused && 'focus',
          state.focusVisible && 'focus-visible',
        ].filter(Boolean)
        const expected = await read(upstream, classes, force)
        const label = `${classes}/${mask}`
        assert.equal(
          await read(web.css, webProps.className, force),
          expected,
          `${label}/static Web`,
        )
        assert.equal(await read(generated, classes, force), expected, `${label}/generated Web`)
        assert.equal(selected(nativeProps.style(state)), expected, `${label}/static Native`)
        assert.equal(selected(resolve(classes, state)), expected, `${label}/generated Native`)
      }
    }
  } finally {
    await page.close()
  }
})

test('an unassessed owner write pins the boundary inside its own selector weight', {
  skip: !executablePath,
}, async () => {
  const css = `@theme { --spacing: .25rem; } @tailwind utilities;
    @utility p-7 { padding: 28px; }`
  const names = ['active:p-2', 'hover:p-4', 'hover:focus:p-6', 'focus:p-7', 'rtl:m-2', 'ltr:m-2']
  const base = tailwindPackageDir()
  const theme = await loadTheme(css, base)
  const { snapshot } = await prepareTailwindOrder(css, base, names)
  const final = prepareFinalTailwindContext(JSON.stringify(snapshot))
  const local = createCompiler(theme)
  const cache = openCandidateCache()
  cache.scanFile('mixed-owner-run.ts', JSON.stringify(names.join(' ')), 1)
  const plan = cache.renderNativeModulePlan(final, theme)
  assert.equal(plan.ordering.ranks['focus:p-7'], undefined)
  assert.ok(plan.ordering.ranks['hover:focus:p-6'])
  const resolve = evaluate(plan.code.replace(/^import .*$/gm, ''), {
    createClassResolver,
    I18nManager: { isRTL: true },
  }).hozoClasses
  const upstream = (await compile(css)).build(names)
  const page = await browser.newPage()
  try {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const read = async (sheet, className, focused) => {
      await page.setContent(
        `<!doctype html><html dir="rtl"><style>${sheet}</style><button class="${className}">Target</button>`,
      )
      const { root } = await cdp.send('DOM.getDocument')
      const { nodeId } = await cdp.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: 'button',
      })
      await cdp.send('CSS.forcePseudoState', {
        nodeId,
        forcedPseudoClasses: ['active', 'hover', ...(focused ? ['focus'] : [])],
      })
      return page
        .locator('button')
        .evaluate((node) => parseFloat(getComputedStyle(node).paddingTop))
    }
    for (const [classes, focused, expected, matchesOracle] of [
      ['active:p-2 hover:p-4 focus:p-7', false, 8, true],
      ['focus:p-7 hover:p-4 active:p-2', false, 8, true],
      ['active:p-2 hover:focus:p-6 hover:p-4 focus:p-7', false, 8, true],
      ['active:p-2 hover:focus:p-6 hover:p-4 focus:p-7', true, 24, true],
      ['active:p-2 focus:p-7 hover:p-4', false, 16, false],
      ['hover:p-4 focus:p-7 active:p-2', false, 8, true],
      ['active:p-2 rtl:m-2 hover:p-4 focus:p-7 ltr:m-2', false, 8, true],
    ]) {
      const source = `import { Pressable } from '@hozo/core'; const el=<Pressable className="${classes}"/>`
      const web = local.prepareWebModule(source).emit(final)[0]
      const native = local.prepareNativeModule(source).emit(final).components[0]
      const { className } = evaluate(`module.exports=(${web.jsx})`, { h: (_type, props) => props })
      const nativeProps = evaluate(`module.exports=(${native.jsx})`, {
        h: (_type, props) => props,
        HozoPressable: 'owner',
        hozoStyles: runInNewContext(`(${native.styles})`),
        __hozoEnv_rtl: true,
        __hozoEnv_ltr: false,
      })
      const state = { pressed: true, hovered: true, focused, focusVisible: false }
      const selected = (value) =>
        Object.assign({}, ...[value].flat(Infinity).filter(Boolean)).paddingTop
      const tailwind = await read(upstream, classes, focused)
      assert.equal(tailwind, focused ? 24 : 8)
      assert.equal(await read(web.css, className, focused), expected, classes)
      assert.equal(selected(nativeProps.style(state)), expected, classes)
      assert.equal(selected(resolve(classes, state)), expected, classes)
      // The fifth row deliberately keeps an ambiguous owner between
      // same-weight writes. It is a boundary control, not a parity pass.
      assert.equal(expected === tailwind, matchesOracle, classes)
    }
  } finally {
    await page.close()
  }
})

test('resting and ambient scalar ranks agree with real Tailwind behind a resting candidate barrier', {
  skip: !executablePath,
}, async () => {
  const lists = [
    ['rtl:p-4 rtl:p-2 p-1 bg-brand m-2', 'rtl'],
    ['rtl:p-4 rtl:p-2 p-1 bg-overlap m-2', 'rtl'],
    ['ltr:p-4 ltr:p-2 p-1 bg-overlap m-2', 'ltr'],
    ['p-4 p-2 bg-brand m-2'],
    ['p-4 bg-brand p-2 m-2'],
  ].flatMap(([classes, direction]) => [
    { classes, direction },
    { classes: classes.split(' ').toReversed().join(' '), direction },
  ])
  const names = [...new Set(lists.flatMap(({ classes }) => classes.split(' ')))]
  const base = tailwindPackageDir()
  const css = `@theme { --spacing: .25rem; --color-brand: #123456; --color-overlap: #112233; } @tailwind utilities;
    @utility bg-brand { background-color: #123456; }
    @utility bg-overlap { background-color: #112233; border-width: 3px; }`
  const theme = await loadTheme(css, base)
  const { snapshot, classOrder } = await prepareTailwindOrder(css, base, names)
  const final = prepareFinalTailwindContext(JSON.stringify(snapshot))
  const compiler = createCompiler(theme)
  const cache = openCandidateCache()
  cache.scanFile('direction.ts', JSON.stringify(names.join(' ')), 1)
  const candidatePlan = cache.renderNativeModulePlan(final, theme)
  assert.ok(candidatePlan.ordering.ranks['rtl:p-2'])
  assert.ok(candidatePlan.ordering.ranks['rtl:p-4'])
  assert.equal(candidatePlan.ordering.ranks['bg-brand'], undefined)
  assert.equal(candidatePlan.ordering.ranks['bg-overlap'], undefined)
  // m-2's Native projected keys are not in the compact colour-independent
  // admission. This exact string must actually take the resolver fallback.
  assert.match(candidatePlan.code, /independentColors: \["bg-brand", "(?![^"]*m-2)/)
  const candidateWeb = cache.renderCss(theme, classOrder(cache.candidates()))
  const upstream = (await compile(css)).build(names)
  const page = await browser.newPage()
  try {
    for (const { classes, direction } of lists) {
      const code = `import { View } from '@hozo/core'; const el=<View className="${classes}"/>`
      const web = compiler.prepareWebModule(code).emit(final)[0]
      const webMarkup = renderToStaticMarkup(
        evaluate(`module.exports=(${web.jsx})`, { h: createElement }),
      )
      const native = compiler.prepareNativeModule(code).emit(final).components[0]
      for (const isRTL of [false, true]) {
        const dir = isRTL ? 'rtl' : 'ltr'
        const read = async (sheet, markup) => {
          await page.setContent(`<html dir="${dir}"><style>${sheet}</style>${markup}</html>`)
          return page.locator('body > div').evaluate((owner) => getComputedStyle(owner).paddingTop)
        }
        const nativeStyles = evaluate(`module.exports=(${native.jsx})`, {
          h: (_type, props) => props,
          View: 'view',
          hozoStyles: runInNewContext(`(${native.styles})`),
          __hozoEnv_rtl: isRTL,
          __hozoEnv_ltr: !isRTL,
        }).style
        const resolve = evaluate(
          `${candidatePlan.code.replace(/^import[^\n]*\n/gm, '').replaceAll('export const ', 'const ')}
            module.exports = hozoClasses`,
          { createClassResolver, I18nManager: { isRTL } },
        )
        const selected = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
        const markup = `<div class="${classes}"></div>`
        const expected = await read(upstream, markup)
        assert.equal(expected, !direction || direction === dir ? '16px' : '4px')
        assert.equal(await read(web.css, webMarkup), expected, `${classes} / ${dir} static Web`)
        assert.equal(
          await read(candidateWeb, markup),
          expected,
          `${classes} / ${dir} generated Web`,
        )
        assert.equal(
          `${selected(nativeStyles).paddingTop}px`,
          expected,
          `${classes} / ${dir} static Native`,
        )
        assert.equal(
          `${selected(resolve(classes)).paddingTop}px`,
          expected,
          `${classes} / ${dir} generated Native`,
        )
      }
    }
  } finally {
    await page.close()
  }
})

// #2027. An unranked utility between two direction writes, whose whole
// footprint is disjoint from padding and margin, no longer keeps them in
// written order. One that writes padding, by shorthand, logical alias or
// physical edge, stays a barrier: Hozo cannot rank it against them.
test('an unranked utility that writes neither padding nor margin does not split direction ranks', {
  skip: !executablePath,
}, async () => {
  const lists = [
    ['rtl:p-4 bg-overlap rtl:p-2 p-1 m-2', true],
    ['ltr:p-4 bg-overlap ltr:p-2 p-1 m-2', true],
    ['rtl:p-4 bg-pad rtl:p-2 p-1 m-2', false],
    ['rtl:p-4 bg-inline rtl:p-2 p-1 m-2', false],
    ['rtl:p-4 bg-left rtl:p-2 p-1 m-2', false],
  ].flatMap(([classes, disjoint]) => [
    { classes, disjoint },
    { classes: classes.split(' ').toReversed().join(' '), disjoint },
  ])
  const names = [...new Set(lists.flatMap(({ classes }) => classes.split(' ')))]
  const base = tailwindPackageDir()
  const css = `@theme { --spacing: .25rem; --color-overlap: #112233; --color-pad: #112233; --color-inline: #112233; --color-left: #112233; } @tailwind utilities;
    @utility bg-overlap { background-color: #112233; border-width: 3px; }
    @utility bg-pad { background-color: #112233; padding: 3px; }
    @utility bg-inline { background-color: #112233; padding-inline: 3px; }
    @utility bg-left { background-color: #112233; padding-left: 3px; }`
  const theme = await loadTheme(css, base)
  const { snapshot } = await prepareTailwindOrder(css, base, names)
  const final = prepareFinalTailwindContext(JSON.stringify(snapshot))
  const compiler = createCompiler(theme)
  const cache = openCandidateCache()
  cache.scanFile('disjoint.ts', JSON.stringify(names.join(' ')), 1)
  const candidatePlan = cache.renderNativeModulePlan(final, theme)
  const upstream = (await compile(css)).build(names)
  const page = await browser.newPage()
  try {
    for (const { classes, disjoint } of lists) {
      const code = `import { View } from '@hozo/core'; const el=<View className="${classes}"/>`
      const web = compiler.prepareWebModule(code).emit(final)[0]
      const webMarkup = renderToStaticMarkup(
        evaluate(`module.exports=(${web.jsx})`, { h: createElement }),
      )
      const native = compiler.prepareNativeModule(code).emit(final).components[0]
      for (const isRTL of [false, true]) {
        const dir = isRTL ? 'rtl' : 'ltr'
        const read = async (sheet, markup) => {
          await page.setContent(`<html dir="${dir}"><style>${sheet}</style>${markup}</html>`)
          return page.locator('body > *').evaluate((owner) => getComputedStyle(owner).paddingTop)
        }
        const props = evaluate(`module.exports=(${native.jsx})`, {
          h: (_type, props) => props,
          View: 'view',
          hozoStyles: runInNewContext(`(${native.styles})`),
          __hozoEnv_rtl: isRTL,
          __hozoEnv_ltr: !isRTL,
        })
        const resolve = evaluate(
          `${candidatePlan.code.replace(/^import[^\n]*\n/gm, '').replaceAll('export const ', 'const ')}
            module.exports = hozoClasses`,
          { createClassResolver, I18nManager: { isRTL } },
        )
        const selected = (value) =>
          `${Object.assign({}, ...[value].flat(Infinity).filter(Boolean)).paddingTop}px`
        const writes = classes.split(' ').filter((name) => name.startsWith(`${dir}:`))
        const tailwind = await read(upstream, `<div class="${classes}"></div>`)
        assert.equal(tailwind, writes.length ? '16px' : '4px', `${classes} / ${dir} Tailwind`)
        const routes = [
          ['static Web', await read(web.css, webMarkup)],
          ['static Native', selected(props.style)],
        ]
        if (disjoint) {
          routes.push(['generated Native', selected(resolve(classes))])
          for (const [route, actual] of routes)
            assert.equal(actual, tailwind, `${classes} / ${dir} ${route}`)
        } else {
          // The boundary control: the last direction write in written
          // order applies, on both static routes alike.
          const authored = { 'p-2': '8px', 'p-4': '16px' }[writes.at(-1)?.split(':')[1]] ?? '4px'
          for (const [route, actual] of routes)
            assert.equal(actual, authored, `${classes} / ${dir} ${route}`)
        }
      }
    }
  } finally {
    await page.close()
  }
})

test('adjacent assessed writes keep their shared rank inside the same breakpoint or negated condition', {
  skip: !executablePath,
}, async () => {
  const conditions = [
    ['md', (wide) => wide],
    ['max-md', (wide) => !wide],
    ['not-focus', (_wide, focused) => !focused],
    ['md:not-focus', (wide, focused) => wide && !focused],
  ]
  const names = [
    'p-1',
    'bg-brand',
    ...conditions.flatMap(([guard]) => [`${guard}:p-4`, `${guard}:p-2`]),
  ]
  const css = `@theme { --spacing: .25rem; --breakpoint-md: 48rem; --color-brand: #123456; }
    @tailwind utilities; @utility bg-brand { background-color: #123456; border-width: 3px; }`
  const base = tailwindPackageDir()
  const theme = await loadTheme(css, base)
  const { snapshot, classOrder } = await prepareTailwindOrder(css, base, names)
  const final = prepareFinalTailwindContext(JSON.stringify(snapshot))
  const local = createCompiler(theme)
  const cache = openCandidateCache()
  cache.scanFile('conditions.ts', JSON.stringify(names.join(' ')), 0)
  const candidate = cache.renderNativeModulePlan(final, theme)
  assert.equal(candidate.ordering?.ranks['bg-brand'], undefined)
  const generatedWeb = cache.renderCss(theme, classOrder(cache.candidates()))
  const upstream = (await compile(css)).build(names)
  const page = await browser.newPage()
  try {
    const read = async (sheet, className, focused) => {
      await page.setContent(
        `<!doctype html><style>${sheet}</style><button class="${className}">Target</button>`,
      )
      const owner = page.locator('button')
      if (focused) await owner.focus()
      return owner.evaluate((node) => parseFloat(getComputedStyle(node).paddingTop))
    }
    for (const [guard, matches] of conditions) {
      assert.match(candidate.code, new RegExp(`"${guard}:p-4": "[^"]+static className`))
      for (const pair of [`${guard}:p-4 ${guard}:p-2`, `${guard}:p-2 ${guard}:p-4`]) {
        const classes = `p-1 ${pair} bg-brand`
        const src = `import { Pressable } from '@hozo/core'; const el=<Pressable className="${classes}"/>`
        const web = local.prepareWebModule(src).emit(final)[0]
        const native = local.prepareNativeModule(src).emit(final).components[0]
        const { className } = evaluate(`module.exports=(${web.jsx})`, {
          h: (_type, props) => props,
        })
        assert.equal(native.diagnostics.length, 0, classes)
        for (const wide of [false, true]) {
          await page.setViewportSize({ width: wide ? 850 : 500, height: 450 })
          const props = evaluate(`module.exports=(${native.jsx})`, {
            h: (_type, props) => props,
            Pressable: 'owner',
            HozoPressable: 'owner',
            hozoStyles: runInNewContext(`(${native.styles})`),
            __hozoBp_md: wide,
            __hozoWidth_768: wide,
          })
          for (const focused of [false, true]) {
            const label = `${classes} / wide=${wide} / focused=${focused}`
            const expected = matches(wide, focused) ? 16 : 4
            const styles =
              typeof props.style === 'function' ? props.style({ focused }) : props.style
            const selected = Object.assign({}, ...styles.flat(Infinity).filter(Boolean))
            assert.equal(await read(upstream, classes, focused), expected, `${label} / Tailwind`)
            assert.equal(await read(web.css, className, focused), expected, `${label} / static Web`)
            assert.equal(
              await read(generatedWeb, classes, focused),
              expected,
              `${label} / generated Web`,
            )
            assert.equal(selected.paddingTop, expected, `${label} / static Native`)
          }
        }
      }
    }
  } finally {
    await page.close()
  }
})

test('ranked inline edges match Web physical and logical precedence across directions', {
  skip: !executablePath,
}, async () => {
  const cases = [
    ['hover:ps-6 active:pl-4', 'padding', [16, 0], [16, 24]],
    ['active:pl-4 hover:ps-6', 'padding', [16, 0], [16, 24]],
    ['hover:ms-6 active:ml-4', 'margin', [16, 0], [16, 24]],
    ['active:ml-4 hover:ms-6', 'margin', [16, 0], [16, 24]],
  ]
  const page = await browser.newPage()
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    for (const [classes, property, expectedLtr, expectedRtl] of cases) {
      const source = `import { Pressable } from '@hozo/core'; const el=<Pressable className="${classes} columns-(--layout)"/>`
      const native = compiler.compileNativeModule(source).components[0]
      assert.deepEqual(
        native.diagnostics.map(({ code }) => code),
        ['WEB_ONLY_PROPERTY_ON_NATIVE'],
      )
      const web = compiler.compile(source)[0]
      const webProps = evaluate(`module.exports=(${web.jsx})`, { h: (_type, props) => props })
      for (const [dir, expected] of [
        ['ltr', expectedLtr],
        ['rtl', expectedRtl],
      ]) {
        const nativeProps = evaluate(`module.exports=(${native.jsx})`, {
          h: (_type, props) => props,
          HozoPressable: 'host',
          hozoStyles: runInNewContext(`(${native.styles})`),
          __hozoEnv_ltr: dir === 'ltr',
          __hozoEnv_rtl: dir === 'rtl',
        })
        const selected = Object.assign(
          {},
          ...nativeProps
            .style({ hovered: true, pressed: true, focused: false })
            .flat(Infinity)
            .filter(Boolean),
        )
        await page.setContent(
          `<style>div { ${property}: 0; }${web.css}</style><div dir="${dir}" class="${webProps.className}"></div>`,
        )
        const { root } = await cdp.send('DOM.getDocument')
        const { nodeId } = await cdp.send('DOM.querySelector', {
          nodeId: root.nodeId,
          selector: 'div',
        })
        await cdp.send('CSS.forcePseudoState', {
          nodeId,
          forcedPseudoClasses: ['hover', 'active'],
        })
        assert.deepEqual(
          await page
            .locator('div')
            .evaluate(
              (el, name) =>
                ['left', 'right'].map((edge) =>
                  parseFloat(getComputedStyle(el).getPropertyValue(`${name}-${edge}`)),
                ),
              property,
            ),
          expected,
          `${dir}/${classes} Web`,
        )
        const yoga = Yoga.Node.create()
        try {
          yoga.setWidth(140)
          yoga.setHeight(100)
          const [write, read] =
            property === 'padding'
              ? ['setPadding', 'getComputedPadding']
              : ['setMargin', 'getComputedMargin']
          for (const [suffix, edge] of [
            ['Start', Yoga.EDGE_START],
            ['End', Yoga.EDGE_END],
            ['Left', Yoga.EDGE_LEFT],
            ['Right', Yoga.EDGE_RIGHT],
          ]) {
            const value = selected[`${property}${suffix}`]
            if (typeof value === 'number') yoga[write](edge, value)
          }
          yoga.calculateLayout(
            undefined,
            undefined,
            dir === 'rtl' ? Yoga.DIRECTION_RTL : Yoga.DIRECTION_LTR,
          )
          assert.deepEqual(
            [yoga[read](Yoga.EDGE_LEFT), yoga[read](Yoga.EDGE_RIGHT)],
            expected,
            `${dir}/${classes} Native`,
          )
        } finally {
          yoga.free()
        }
      }
    }
  } finally {
    await page.close()
  }
})

test('authored output composes translate axes across repeated owner guards', {
  skip: !executablePath,
}, async () => {
  await assertRepeatedOwnerRegisters({
    classes:
      'hover:translate-x-2 active:translate-x-4 active:translate-y-5 hover:translate-y-3 columns-(--layout)',
    reference: `
      button:is(:hover, :active) { translate: var(--x) var(--y); }
      button:hover { --x: 8px; }
      button:active { --x: 16px; --y: 20px; }
      button:hover { --y: 12px; }
    `,
    property: 'translate',
    values: ['16px 20px', '8px 12px', '16px 12px', 'none'],
  })
})

test('authored output composes filter functions across repeated owner guards', {
  skip: !executablePath,
}, async () => {
  for (const [base, resting, trailing] of [
    ['blur-sm', 'blur(8px)', ''],
    ['filter-none', 'none', ''],
    ['', 'none', 'hover:shadow-sm'],
    ['shadow-sm', 'none', 'hover:shadow-md hover:ring-2 hover:shadow-red-500'],
    ['hover:shadow-sm', 'none', 'hover:ring-2'],
    ['hover:shadow-sm', 'none', 'active:ring-2'],
    ['hover:bg-linear-to-r hover:from-red-500', 'none', 'active:to-blue-500'],
    ['bg-none hover:bg-linear-to-r hover:from-red-500', 'none', 'active:to-blue-500'],
  ]) {
    await assertRepeatedOwnerRegisters({
      classes: `${base} hover:blur-lg active:blur-xl active:sepia-50 hover:sepia ${trailing} columns-(--layout)`,
      reference: `
      button { filter: ${resting}; }
      button:is(:hover, :active) { filter: var(--blur) var(--sepia,); }
      button:hover { --blur: blur(16px); }
      button:active { --blur: blur(24px); --sepia: sepia(0.5); }
      button:hover { --sepia: sepia(1); }
    `,
      property: 'filter',
      values: ['blur(24px) sepia(0.5)', 'blur(16px) sepia(1)', 'blur(24px) sepia(1)', resting],
    })
  }
})

test('Tailwind filter resets keep the registers a later condition reads', {
  skip: !executablePath,
}, async () => {
  const reference = '@theme { --blur-sm: 8px; } @tailwind utilities;'
  const cases = [
    ['filter', 'blur-sm filter-none hover:sepia'],
    ['backdropFilter', 'backdrop-blur-sm backdrop-filter-none hover:backdrop-sepia'],
  ]
  for (const [property, authored] of cases) {
    const names = authored.split(' ')
    const prepared = await prepareTailwindOrder(reference, tailwindPackageDir(), names)
    const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
    const upstream = (await compile(reference)).build(names)
    const cache = openCandidateCache()
    cache.scanFile('filters.ts', JSON.stringify(authored), 1)
    const sheet = cache.renderCss(undefined, prepared.classOrder(cache.candidates()))
    const page = await browser.newPage()
    const observe = async (css, markup) => {
      await page.setContent(`<style>${css}</style>${markup}`)
      const target = page.getByRole('button', { name: 'Target' })
      const read = () => target.evaluate((el, name) => getComputedStyle(el)[name], property)
      await page.mouse.move(500, 400)
      const resting = await read()
      await target.hover()
      const active = await read()
      await page.mouse.move(500, 400)
      return [resting, active, await read()]
    }
    try {
      const raw = (classes) => `<button class="${classes}">Target</button>`
      const expected = await observe(upstream, raw(authored))
      assert.deepEqual(expected, ['none', 'blur(8px) sepia(1)', 'none'])
      for (const order of [names, names.toReversed()]) {
        const classes = order.join(' ')
        const source = `import {Button} from '@hozo/core';const el=<Button className="${classes}">Target</Button>`
        for (const result of [
          compiler.compile(source)[0],
          compiler.prepareWebModule(source).emit(final)[0],
        ]) {
          const html = renderToStaticMarkup(
            evaluate(`module.exports=(${result.jsx})`, { h: createElement }),
          )
          assert.deepEqual(await observe(result.css, html), expected, `${property}: ${classes}`)
        }
        assert.deepEqual(await observe(sheet, raw(`hozo-candidate-owner ${classes}`)), expected)
      }
    } finally {
      await page.close()
    }
  }
})

test('mixed StyleX/Tailwind inputs match independently ordered source sheets on both targets', {
  skip: !executablePath,
}, async () => {
  // Hozo's defined composition, not a claim about two upstream compilers
  // overwriting the same JSX className. Each source sheet is independently
  // generated; specificity wins first, JSX input order breaks equal weights.
  const compilerRequire = createRequire(
    new URL('../../../packages/compiler/package.json', import.meta.url),
  )
  const babel = compilerRequire('@babel/core')
  const stylexPlugin = compilerRequire('@stylexjs/babel-plugin')
  const rules = `const styles=stylex.create({x:{':focus-visible':{backgroundColor:'#555555'},':hover':{backgroundColor:'#666666'},':focus':{backgroundColor:'#777777'},':active':{backgroundColor:'#888888'}}});`
  const stylexSource = `import * as stylex from '@stylexjs/stylex';${rules}`
  const official = babel.transformSync(stylexSource, {
    filename: '/app/MixedCascade.tsx',
    babelrc: false,
    configFile: false,
    plugins: [[stylexPlugin, { runtimeInjection: false }]],
  }).metadata.stylex
  assert.equal(official.length, 4)
  const stylexCss = [...official]
    .sort((a, b) => a[2] - b[2])
    .map(([, rule]) => rule.ltr)
    .join('\n')
  const stylexClasses = official.map(([name]) => name).join(' ')
  const classes =
    'bg-[#ffffff] active:bg-[#444444] focus-visible:bg-[#333333] focus:bg-[#222222] hover:bg-[#111111]'
  const tailwindCss = (await compile('@tailwind utilities;')).build(classes.split(' '))
  for (const stylexLast of [false, true]) {
    const attributes = [`className="${classes}"`, '{...stylex.props(styles.x)}']
    if (!stylexLast) attributes.reverse()
    const source = `${stylexSource}import {Button} from '@hozo/core';const el=<Button ${attributes.join(' ')}>Label</Button>`
    const web = compiler.compile(source)[0]
    const native = compiler.compileNative(source)[0]
    const nativeProps = evaluate(
      `const hozoStyles=${native.styles};module.exports=(${native.jsx})`,
      {
        HozoPressable: 'owner',
        Text: 'text',
        h: (_type, props) => props,
      },
    )
    const html = renderToStaticMarkup(evaluate(`module.exports=(${web.jsx})`, { h: createElement }))
    const page = await browser.newPage(),
      oracle = await browser.newPage()
    try {
      const sheets = stylexLast ? [tailwindCss, stylexCss] : [stylexCss, tailwindCss]
      await oracle.setContent(
        `${sheets.map((sheet) => `<style>${sheet}</style>`).join('')}<input id="sentinel" aria-label="Before target"><button class="${classes} ${stylexClasses}">Label</button>`,
      )
      await page.setContent(
        `<style>${web.css}</style><input id="sentinel" aria-label="Before target">${html}`,
      )
      const stages = [
        async (p) => p.mouse.move(500, 500),
        async (p) => p.locator('button').hover(),
        async (p) => p.mouse.down(),
        async (p) => p.mouse.up(),
        async (p) => {
          await p.mouse.move(500, 500)
          // A blur does not reset the browser's sequential-navigation
          // cursor. Tab from a known preceding element, not out of the page.
          await p.locator('#sentinel').focus()
          await p.keyboard.press('Tab')
        },
        async (p) => p.locator('button').hover(),
      ]
      for (const [index, stage] of stages.entries()) {
        await stage(page)
        await stage(oracle)
        const facts = async (p) =>
          p.locator('button').evaluate((e) => ({
            color: getComputedStyle(e).backgroundColor,
            state: {
              hovered: e.matches('button:hover'),
              focused: e.matches('button:focus'),
              focusVisible: e.matches('button:focus-visible'),
              pressed: e.matches('button:active'),
            },
          }))
        const expected = await facts(oracle),
          actual = await facts(page)
        if (index === 1) assert.equal(expected.state.hovered, true)
        if (index === 2) assert.equal(expected.state.pressed, true)
        if (index === 4) assert.equal(expected.state.focusVisible, true)
        assert.deepEqual(actual, expected, `${stylexLast}/${index}: browser source-sheet oracle`)
        const selected = Object.assign(
          {},
          ...nativeProps.style(expected.state).filter(Boolean),
        ).backgroundColor
        const rgb = selected.match(/[a-f\d]{2}/gi).map((part) => Number.parseInt(part, 16))
        assert.equal(
          `rgb(${rgb.join(', ')})`,
          expected.color,
          `${stylexLast}/${index}: Native selected target`,
        )
      }
    } finally {
      await page.close()
      await oracle.close()
    }
  }
})

test('Tailwind browser oracle for stateful label inheritance and focus modality', {
  skip: !executablePath,
}, async () => {
  // Independent CSS/browser oracle for the Native owner-event probe. No Hozo
  // lowering or private inheritance algorithm participates in these results.
  const classes =
    'text-[#1355bb] text-[18px] hover:text-[#00aa00] active:text-[#cc0000] focus:font-semibold focus-visible:tracking-[2px] hover:active:text-[22px]'
  const css = (await compile('@theme { --font-weight-semibold: 600; } @tailwind utilities;')).build(
    classes.split(' '),
  )
  const page = await browser.newPage()
  try {
    await page.setContent(`<!doctype html><style>
      main { color:#112233; font-size:20px; font-weight:400; line-height:28px;
        letter-spacing:1px; text-align:left; text-transform:uppercase; }
      button { font:inherit; color:inherit; letter-spacing:inherit;
        text-align:inherit; text-transform:inherit; }
      ${css}
      </style><main><button id="before">Before</button>
      <button id="owner" class="${classes}"><span id="target">Label</span></button>
      <button id="sibling" style="color:#abcdef;font-size:24px"><span id="other">Other</span></button>
      </main>`)
    const read = (id) =>
      page.locator(id).evaluate((node) => {
        const style = getComputedStyle(node)
        return Object.fromEntries(
          [
            'color',
            'fontSize',
            'fontWeight',
            'lineHeight',
            'letterSpacing',
            'textAlign',
            'textTransform',
          ].map((name) => [name, style[name]]),
        )
      })
    const base = {
      color: 'rgb(19, 85, 187)',
      fontSize: '18px',
      fontWeight: '400',
      lineHeight: '28px',
      letterSpacing: '1px',
      textAlign: 'left',
      textTransform: 'uppercase',
    }
    const sibling = await read('#other')
    const check = async (own = {}) => {
      assert.deepEqual(await read('#target'), { ...base, ...own })
      assert.deepEqual(await read('#other'), sibling)
    }
    await check()
    await page.locator('#owner').hover()
    await check({ color: 'rgb(0, 170, 0)' })
    await page.mouse.down()
    await check({ color: 'rgb(204, 0, 0)', fontSize: '22px', fontWeight: '600' })
    await page.mouse.up()
    await check({ color: 'rgb(0, 170, 0)', fontWeight: '600' })
    await page.mouse.move(600, 400)
    await check({ fontWeight: '600' })
    await page.locator('#owner').evaluate((node) => node.blur())
    await check()
    await page.locator('#before').focus()
    await page.keyboard.press('Tab')
    assert.equal(
      await page.locator('#owner').evaluate((node) => document.activeElement === node),
      true,
    )
    await check({ fontWeight: '600', letterSpacing: '2px' })
    await page.locator('#target').evaluate((node) => {
      node.style.color = '#abcdef'
      node.style.fontSize = '10px'
    })
    await check({
      color: 'rgb(171, 205, 239)',
      fontSize: '10px',
      fontWeight: '600',
      letterSpacing: '2px',
    })
    await page.locator('#target').evaluate((node) => node.removeAttribute('style'))
    await check({ fontWeight: '600', letterSpacing: '2px' })
    await page.locator('#owner').hover()
    await page.mouse.down()
    // Chromium retains :focus-visible when clicking an already keyboard-focused
    // button. Hozo's existing Native owner instead clears its explicit modality
    // bit on pointer-down. Record that boundary, not a claim of event parity.
    await check({
      color: 'rgb(204, 0, 0)',
      fontSize: '22px',
      fontWeight: '600',
      letterSpacing: '2px',
    })
    await page.mouse.up()
  } finally {
    await page.close()
  }
})

test('Tailwind browser oracle for shared text and background motion targets', {
  skip: !executablePath,
}, async (t) => {
  const classes =
    'text-[#000000] hover:text-[#ff0000] bg-[#ffffff] hover:bg-[#000000] active:bg-[#0000ff] focus:bg-[#00ff00] focus-visible:bg-[#ffff00] transition-colors duration-100000 delay-20 ease-linear'
  const css = (await compile('@tailwind utilities;')).build(classes.split(' '))
  const source = `import {Button} from '@hozo/core';export const Scene=()=> <Button className="${classes}">Label</Button>`
  const web = compiler.compile(source)[0]
  const native = compiler.compileNativeModule(source).components[0]
  assert.deepEqual(web.diagnostics, [])
  assert.deepEqual(native.diagnostics, [])
  const control = evaluate(`export const owner = ${native.jsx}`, {
    h: (_type, props) => props,
    HozoPressable: 'owner',
    HozoText: 'label',
    hozoStyles: runInNewContext(`(${native.styles})`),
  }).owner
  for (const mode of ['tailwind', 'hozo']) {
    const page = await browser.newPage()
    const stages = []
    try {
      await page.setContent(`<!doctype html><style>
      button { font:inherit; color:inherit; }
      ${mode === 'tailwind' ? css : web.css}</style><button id="before">Before</button>
      <button id="owner" class="${mode === 'tailwind' ? classes : 'hozo-0'}"><span><span id="target">Label</span></span></button>
      <span id="outside" style="color:#123456">Outside</span>`)
      const read = (finish = true) =>
        page.evaluate((finish) => {
          const owner = document.getElementById('owner')
          if (finish) for (const animation of owner.getAnimations()) animation.finish()
          const target = document.getElementById('target')
          return {
            color: getComputedStyle(target).color,
            background: getComputedStyle(owner).backgroundColor,
            late: document.getElementById('late')
              ? getComputedStyle(document.getElementById('late')).color
              : undefined,
            outside: getComputedStyle(document.getElementById('outside')).color,
            retained: target === window.firstText,
            state: {
              pressed: owner.matches(':active'),
              hovered: owner.matches(':hover'),
              focused: owner.matches(':focus'),
              focusVisible: owner.matches(':focus-visible'),
            },
          }
        }, finish)
      const check = async (color, background) => {
        const result = await read()
        assert.equal(result.color, color)
        assert.equal(result.background, background)
        assert.equal(result.outside, 'rgb(18, 52, 86)')
        assert.equal(result.retained, true)
        if (mode === 'hozo') {
          // The ordinary compiled callback is the control, not a copy of its
          // priority rules and not either private inheritance implementation.
          const nativeStyle = Object.assign({}, ...control.style(result.state).filter(Boolean))
          const rgb = (hex) =>
            `rgb(${hex
              .slice(1)
              .match(/../g)
              .map((part) => parseInt(part, 16))
              .join(', ')})`
          assert.equal(result.background, rgb(nativeStyle.backgroundColor))
        }
        stages.push(result)
      }
      await page.mouse.move(600, 400)
      await page.evaluate(() => {
        window.firstText = document.getElementById('target')
      })
      await check('rgb(0, 0, 0)', 'rgb(255, 255, 255)')
      await page.locator('#owner').hover()
      const middle = await page.evaluate(() => {
        const owner = document.getElementById('owner')
        const animations = owner.getAnimations()
        for (const animation of animations) {
          if (
            animation.effect.getTiming().duration !== 100000 ||
            animation.effect.getTiming().delay !== 20
          )
            throw new Error('oracle must use the authored transition timing')
          animation.pause()
          animation.currentTime = 50020
        }
        const target = document.getElementById('target')
        const late = document.createElement('span')
        late.id = 'late'
        late.textContent = 'Late'
        owner.append(late)
        return {
          properties: animations.map((animation) => animation.transitionProperty).sort(),
          owner: getComputedStyle(owner).color,
          background: getComputedStyle(owner).backgroundColor,
          target: getComputedStyle(target).color,
          late: getComputedStyle(late).color,
        }
      })
      assert.deepEqual(middle.properties, ['background-color', 'color'])
      assert.equal(middle.owner, 'rgb(128, 0, 0)')
      assert.equal(middle.background, 'rgb(128, 128, 128)')
      assert.equal(middle.target, middle.owner)
      assert.equal(middle.late, middle.owner)
      await page.locator('#target').evaluate((node) => {
        node.style.color = '#00ff00'
      })
      const masked = await read(false)
      assert.equal(masked.color, 'rgb(0, 255, 0)')
      assert.equal(masked.late, middle.owner)
      await page.locator('#target').evaluate((node) => node.removeAttribute('style'))
      assert.equal((await read(false)).color, middle.owner)
      await check('rgb(255, 0, 0)', 'rgb(0, 0, 0)')
      await page.mouse.down()
      // Static Tailwind input and the Native control now share Tailwind's
      // owner-state order: active beats focus even when written earlier.
      await check('rgb(255, 0, 0)', 'rgb(0, 0, 255)')
      await page.mouse.up()
      await check('rgb(255, 0, 0)', 'rgb(0, 255, 0)')
      await page.mouse.move(600, 400)
      await page.locator('#owner').evaluate((node) => node.blur())
      await check('rgb(0, 0, 0)', 'rgb(255, 255, 255)')
      await page.locator('#before').focus()
      await page.keyboard.press('Tab')
      await check('rgb(0, 0, 0)', 'rgb(255, 255, 0)')
      t.diagnostic(
        `${mode} shared motion: ${stages.length} settled browser stages; midpoint ${JSON.stringify(middle)}`,
      )
    } finally {
      await page.close()
    }
  }
})

test('Tailwind and compiled Web active transform reset outrank hovered transform restoration', {
  skip: !executablePath,
}, async () => {
  const classes = 'rotate-3 rotate-x-30 active:transform-none hover:transform-cpu'
  const css = (await compile('@tailwind utilities;')).build(classes.split(' '))
  const compiled = compiler.compile(
    `import {Button} from '@hozo/core';const el=<Button className="${classes}"/>`,
  )[0]
  for (const mode of ['tailwind', 'hozo']) {
    const page = await browser.newPage()
    try {
      await page.setContent(
        `<style>${mode === 'tailwind' ? css : compiled.css}</style><button class="${mode === 'tailwind' ? classes : 'hozo-0'}">Target</button>`,
      )
      await page.locator('button').hover()
      await page.mouse.down()
      const active = await page.locator('button').evaluate((node) => ({
        transform: getComputedStyle(node).transform,
        rotate: getComputedStyle(node).rotate,
      }))
      assert.equal(active.transform, 'none')
      assert.equal(active.rotate, '3deg')
      await page.mouse.up()
      assert.notEqual(
        await page.locator('button').evaluate((node) => getComputedStyle(node).transform),
        'none',
      )
    } finally {
      await page.close()
    }
  }
})
