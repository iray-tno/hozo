// Shared compiler/candidate composition, not Native pixels or event delivery.
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Fixtures retain authored TSX interpolation.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'
import { createClassResolver, cx } from '@hozo/engine'
import { Chip } from '@hozo/patterns'
import { loadTheme } from '@hozo/tailwind'
import { build, transformSync } from 'esbuild'
import { chromium } from 'playwright-core'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { compile } from 'tailwindcss'
import { hozoSpreadStyles } from '../../../packages/engine/src/spread-styles.ts'
import { transformHozoSource } from '../../../packages/metro/src/transform.ts'

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI must exercise class-composition browser checks')
const directory = mkdtempSync(path.join(tmpdir(), 'hozo-caller-composition-'))
const compiler = createCompiler()
const own = 'rounded-[6px] p-2 text-[#dd1100] text-[20px] leading-[24px] font-semibold'
const caller = 'rounded-[48px] p-8 text-[#0011dd] text-[28px] leading-[36px] font-normal'
const cache = openCandidateCache(path.join(directory, 'candidates.json'))
cache.scanFile('all.ts', JSON.stringify(`${own} ${caller}`), 1)
// Deliberately emit own candidates last. If they leak back onto the owner,
// both lists have caller specificity and this order exposes the regression.
const candidates = cache.renderCss(undefined, `${caller} ${own}`.split(' '))
let browser, oracleCss

function evaluate(code, context) {
  const module = { exports: {} }
  runInNewContext(transformSync(code, { loader: 'tsx', jsxFactory: 'h', format: 'cjs' }).code, {
    module,
    ...context,
  })
  return module.exports
}

// Read the shipped UI sources, not copies with the expected cx already in
// them. This fails if one of the old opaque plus helpers is reintroduced.
const uiRoot = new URL('../../../packages/ui/', import.meta.url)
const uiTheme = await loadTheme(
  '@import "tailwindcss"; @import "./src/theme.css";',
  fileURLToPath(uiRoot),
)
const uiCompiler = createCompiler(uiTheme)
const uiCache = openCandidateCache(path.join(directory, 'ui-candidates.json'))
const layoutCaller = `${caller} flex flex-col gap-8 items-start`
const uiCases = [
  [
    'color-picker',
    'ColorPicker',
    [
      'className',
      'swatchClassName',
      'selectedSwatchClassName',
      'sliderClassName',
      'thumbClassName',
      'inputClassName',
    ],
  ],
  ['skeleton', 'Skeleton', ['className']],
  [
    'avatar',
    'Avatar',
    ['className', 'imageClassName', 'statusClassName'],
    [
      {},
      ...['sm', 'md', 'lg'].flatMap((size) =>
        [undefined, 'online', 'busy', 'offline'].map((status) => ({ size, status })),
      ),
    ],
  ],
  ['card', 'Card', ['className'], [{}, { flat: false }, { flat: true }]],
  [
    'stack',
    'Stack',
    ['className'],
    [
      {},
      ...['row', 'column'].flatMap((direction) =>
        ['none', 'tight', 'normal', 'loose'].flatMap((gap) =>
          ['start', 'center', 'end', 'stretch'].map((align) => ({ direction, gap, align })),
        ),
      ),
    ],
    layoutCaller,
  ],
  [
    'otp-input',
    'OtpInput',
    ['className', 'cellClassName', 'activeCellClassName', 'filledCellClassName', 'inputClassName'],
  ],
  [
    'stepper',
    'Stepper',
    [
      'className',
      'stepClassName',
      'currentStepClassName',
      'indicatorClassName',
      'completedIndicatorClassName',
      'currentIndicatorClassName',
      'errorIndicatorClassName',
      'descriptionClassName',
    ],
  ],
].map(([file, name, slots, variants = [{}], classes = caller]) => {
  const source = readFileSync(new URL(`src/${file}.tsx`, uiRoot), 'utf8')
  uiCache.scanFile(`${file}.tsx`, source, 1)
  return { file, name, slots, source, variants, classes }
})
uiCache.scanFile('caller.ts', JSON.stringify(layoutCaller), 1)
const sliderFocusClasses =
  'focus:opacity-75 focus-visible:outline-2 aria-disabled:border-4 disabled:mt-8'
uiCache.scanFile('slider-focus.ts', JSON.stringify(sliderFocusClasses), 1)
const textAreaFocusClasses =
  'focus:opacity-75 focus-visible:outline-2 disabled:opacity-25 read-only:border-4 aria-[invalid=true]:border-4 aria-required:outline-4'
uiCache.scanFile('text-area-focus.ts', JSON.stringify(textAreaFocusClasses), 1)
const selectFocusClasses = `${textAreaFocusClasses} aria-expanded:mt-8`
uiCache.scanFile('select-focus.ts', JSON.stringify(selectFocusClasses), 1)
const radiusCandidates = [
  'size-10',
  'h-4',
  'rounded-full',
  'md:rounded-none',
  'md:rounded-full',
  'rounded-hozo-control',
]
uiCache.scanFile('radius-callers.ts', JSON.stringify(radiusCandidates.join(' ')), 1)
const uiCandidates = uiCache.renderCss(uiTheme)
const { hozoClasses: resolveUiClasses } = evaluate(
  uiCache.renderNativeModule(uiTheme).replace(/^import .*$/gm, ''),
  { createClassResolver },
)

for (const { file, name, slots, source, variants, classes } of uiCases) {
  test(`shipped ${name} compiles its own classes separately on every slot`, {
    skip: !executablePath,
  }, async () => {
    const web = lowerModule(source, `${file}.tsx`, `${file}.tsx`, uiCompiler, '')
    const native = transformHozoSource(source, `${file}.tsx`, directory, uiCompiler)
    assert.ok(web)
    assert.ok(native)
    const calls = []
    const context = {
      cx,
      h: (_type, props) => props,
      [name]: name,
      [`Hozo${name}`]: name,
      View: 'View',
      Animated: { View: 'AnimatedView' },
      // Scheduling/motion delivery are not measured by this style probe.
      useHozoAnimation: () => undefined,
      useHozoEnvironment: () => false,
      StyleSheet: { create: (styles) => styles },
      useHozoDark: () => false,
      hozoSpreadStyles,
      hozoClasses: (classes, state) => {
        calls.push(classes)
        return resolveUiClasses(classes, state)
      },
    }
    const moduleFrom = (code) => {
      const exported = evaluate(code.replace(/^import .*$/gm, ''), context)
      return exported[name] ?? exported[`Hozo${name}`]
    }
    const webComponent = moduleFrom(web.code)
    const nativeComponent = moduleFrom(native)
    const authoredComponent = moduleFrom(source)
    const opaqueSource = `${source.replaceAll('cx(', 'joinOpaque(')}
      const joinOpaque = (...classes) => classes.filter(Boolean).join(' ')`
    const opaque = lowerModule(opaqueSource, `${file}.tsx`, `${file}.tsx`, uiCompiler, '')
    assert.ok(opaque)
    const opaqueProps = moduleFrom(opaque.code)(
      Object.fromEntries(slots.map((slot) => [slot, caller])),
    )
    for (const slot of slots) {
      assert.notEqual(
        opaqueProps[slot]
          .split(/\s+/)
          .filter((value) => !value.startsWith('hozo-'))
          .join(' '),
        caller,
        `${name}.${slot}: the old opaque helper must expose own classes in the residual`,
      )
    }
    const page = await browser.newPage()
    try {
      for (const variant of variants) {
        for (const extra of [undefined, '', classes]) {
          const input = { ...variant, ...Object.fromEntries(slots.map((slot) => [slot, extra])) }
          const webProps = webComponent(input)
          calls.length = 0
          const nativeProps = nativeComponent(input)
          const authoredProps = authoredComponent(input)
          for (const slot of slots) {
            const residual = webProps[slot]
              .split(/\s+/)
              .filter((value) => value && !value.startsWith('hozo-'))
            assert.equal(
              residual.join(' '),
              extra ?? '',
              `${name}.${slot}: caller-only Web residual`,
            )
            assert.ok(authoredProps[slot], `${name}.${slot}: original resting classes exist`)
            if (extra) {
              // All compiler-generated owners are ordinary spans here: this
              // measures the composition boundary, not pattern DOM/event code.
              for (const sheets of [
                [web.css, uiCandidates],
                [uiCandidates, web.css],
              ]) {
                await page.setContent(
                  `${sheets.map((css) => `<style>${css}</style>`).join('')}<span class="${webProps[slot]}">Label</span>`,
                )
                assert.deepEqual(
                  await page.locator('span').evaluate((element) => {
                    const style = getComputedStyle(element)
                    return [
                      style.paddingTop,
                      style.borderTopLeftRadius,
                      style.color,
                      style.fontSize,
                      style.fontWeight,
                      style.lineHeight,
                    ]
                  }),
                  ['32px', '48px', 'rgb(0, 17, 221)', '28px', '400', '36px'],
                  `${name}.${slot}: caller wins in either stylesheet order`,
                )
              }
            }
            const stem = slot === 'className' ? '' : slot.replace(/ClassName$/, '')
            const capital = stem ? stem[0].toUpperCase() + stem.slice(1) : ''
            const style =
              nativeProps[`hozo${capital}Style`] ?? nativeProps[stem ? `${stem}Style` : 'style']
            assert.ok(style, `${name}.${slot}: compiled Native style exists`)
            const flat = Object.assign(
              {},
              ...[typeof style === 'function' ? style({}) : style].flat(Infinity).filter(Boolean),
            )
            if (name === 'ColorPicker' && slot === 'thumbClassName') {
              assert.equal(flat.outlineWidth, undefined)
              const focused = Object.assign(
                {},
                ...style({ focused: true, focusVisible: true, 'aria-disabled': false })
                  .flat(Infinity)
                  .filter(Boolean),
              )
              assert.equal(focused.outlineWidth, 2)
              assert.equal(focused.outlineOffset, 2)
              assert.equal(
                focused.outlineColor,
                uiTheme.colors.find((entry) => entry.token === 'hozo-focus')?.hex,
              )
              for (const sheets of [
                [web.css, uiCandidates],
                [uiCandidates, web.css],
              ]) {
                await page.setContent(
                  `${sheets.map((css) => `<style>${css}</style>`).join('')}<div role="slider" tabindex="0" class="${webProps[slot]}">Thumb</div>`,
                )
                await page.locator('div').focus()
                assert.deepEqual(
                  await page.locator('div').evaluate((element) => {
                    const css = getComputedStyle(element)
                    return [css.outlineWidth, css.outlineOffset, css.outlineStyle]
                  }),
                  ['2px', '2px', 'solid'],
                  'the shipped thumb look has the same focused outline geometry on Web',
                )
              }
            }
            if (name === 'Card') {
              assert.equal(authoredProps.className.includes('shadow-hozo-surface'), !variant.flat)
              // Theme loading currently exports colours/radii/animations,
              // not custom shadow scales. Compare the old resolver path
              // rather than claiming that this composition fix adds them.
              const previous = Object.assign(
                {},
                ...resolveUiClasses(authoredProps.className).flat(Infinity).filter(Boolean),
              )
              if (name === 'Avatar') {
                if (slot === 'className') {
                  const size = { sm: 32, md: 40, lg: 56 }[variant.size ?? 'md']
                  assert.equal(flat.width, size)
                  assert.equal(flat.height, size)
                  assert.equal(
                    flat.fontSize,
                    extra ? 28 : { sm: 12, md: 14, lg: 18 }[variant.size ?? 'md'],
                  )
                }
                if (slot === 'statusClassName') {
                  const token =
                    variant.status === 'online'
                      ? 'hozo-presence'
                      : variant.status === 'busy'
                        ? 'hozo-danger'
                        : 'hozo-border-strong'
                  const color = uiTheme.colors.find((entry) => entry.token === token)?.hex
                  assert.ok(color)
                  assert.equal(flat.backgroundColor, color)
                  assert.equal(flat.width, 12)
                  assert.equal(flat.height, 12)
                }
                if (slot === 'imageClassName') {
                  assert.equal(flat.width, '100%')
                  assert.equal(flat.height, '100%')
                }
              }
              assert.deepEqual(flat.boxShadow, previous.boxShadow)
              if (!extra) {
                assert.equal(flat.paddingTop, 24)
                assert.equal(flat.borderRadius, 16)
              }
            }
            if (name === 'Stack') {
              const direction = extra ? 'column' : (variant.direction ?? 'column')
              const gap = extra
                ? 32
                : { none: 0, tight: 8, normal: 16, loose: 24 }[variant.gap ?? 'normal']
              const align = extra
                ? 'flex-start'
                : { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' }[
                    variant.align ?? 'stretch'
                  ]
              assert.equal(flat.flexDirection, direction)
              assert.equal(flat.gap, gap)
              assert.equal(flat.alignItems, align)
              for (const sheets of [
                [web.css, uiCandidates],
                [uiCandidates, web.css],
              ]) {
                await page.setContent(
                  `${sheets.map((css) => `<style>${css}</style>`).join('')}<div class="${webProps.className}">Label</div>`,
                )
                assert.deepEqual(
                  await page.locator('div').evaluate((element) => {
                    const style = getComputedStyle(element)
                    return [style.display, style.flexDirection, style.gap, style.alignItems]
                  }),
                  ['flex', direction, `${gap}px`, align],
                  `Stack ${JSON.stringify(variant)} preserves its layout choices and caller overrides`,
                )
              }
            }
            if (extra) {
              assert.equal(flat.paddingTop, 32, `${name}.${slot}: Native caller padding`)
              assert.equal(flat.borderRadius, 48, `${name}.${slot}: Native caller radius`)
            } else {
              assert.ok(
                Object.keys(flat).length,
                `${name}.${slot}: resting style survives without a caller`,
              )
            }
          }
          assert.equal(calls.length, slots.length + (name === 'ColorPicker' ? 1 : 0))
          assert.ok(
            calls.every((classes) => classes === extra),
            `${name}: only caller strings reach the Native resolver`,
          )
        }
      }
    } finally {
      await page.close()
    }
  })
}
const { hozoClasses } = evaluate(cache.renderNativeModule().replace(/^import .*$/gm, ''), {
  createClassResolver,
})

before(async () => {
  oracleCss = (
    await compile(
      '@theme { --spacing: .25rem; --font-weight-normal: 400; --font-weight-semibold: 600; } @tailwind utilities;',
    )
  ).build(`${own} ${caller}`.split(' '))
  if (executablePath)
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu'],
    })
})
after(async () => {
  await browser?.close()
  // Only this test's exact mkdtemp directory is owned here.
  rmSync(directory, { recursive: true, force: true })
})

test('Skeleton resting corners survive outside a caller breakpoint and lose inside it', {
  skip: !executablePath,
}, async () => {
  const { source } = uiCases.find((entry) => entry.name === 'Skeleton')
  const web = lowerModule(source, 'skeleton.tsx', 'skeleton.tsx', uiCompiler, '')
  assert.ok(web)
  const { HozoSkeleton } = evaluate(web.code.replace(/^import .*$/gm, ''), {
    cx,
    h: (_type, props) => props,
    Skeleton: 'Skeleton',
    View: 'View',
  })
  // Force the default's candidate rule after the callers: leaking it back
  // into that tier must visibly break the full/desktop radii below.
  const css = uiCache.renderCss(uiTheme, radiusCandidates)
  const page = await browser.newPage()
  const read = () =>
    page
      .locator('div')
      .evaluate((element) => parseFloat(getComputedStyle(element).borderTopLeftRadius))
  try {
    for (const className of [
      undefined,
      'size-10 rounded-full',
      'h-4 md:rounded-none',
      'h-4 md:rounded-full',
    ]) {
      const props = HozoSkeleton({ className })
      for (const width of [375, 1024]) {
        await page.setViewportSize({ width, height: 400 })
        const round =
          className?.includes('rounded-full') && (!className.includes('md:') || width >= 768)
        const expected = width >= 768 && className?.includes('md:rounded-none') ? 0 : 8
        for (const sheets of [
          [web.css, css],
          [css, web.css],
        ]) {
          await page.setContent(
            `${sheets.map((value) => `<style>${value}</style>`).join('')}<div class="${props.className}">Loading</div>`,
          )
          const actual = await read()
          if (round) assert.ok(actual >= 20, `${className} at ${width}: full radius`)
          else assert.equal(actual, expected, `${className} at ${width}: resting/responsive radius`)
          if (round || expected === 0) {
            await page
              .locator('div')
              .evaluate((element) => element.classList.add('rounded-hozo-control'))
            assert.equal(
              await read(),
              8,
              'reintroducing the default candidate must expose the original leak',
            )
          }
        }
      }
    }
  } finally {
    await page.close()
  }
})

test('the real Web slider keeps focus when aria-disabled changes, until its host blurs', {
  skip: !executablePath,
}, async () => {
  const fixture = await build({
    stdin: {
      contents: `import {createElement} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {HozoSlider} from ${JSON.stringify(fileURLToPath(new URL('../../../packages/patterns/src/slider.tsx', import.meta.url)))};
      const root = createRoot(document.getElementById('root'));
      window.renderSlider = (disabled) => flushSync(() => root.render(createElement(HozoSlider, {disabled, defaultValue:50, thumbClassName:${JSON.stringify(sliderFocusClasses)}})));
      window.renderSlider(false);`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
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
    await page.setContent(`<style>${uiCandidates}</style><div id="root"></div>`)
    await page.addScriptTag({ content: fixture.outputFiles[0].text })
    const thumb = page.locator('[role="slider"]')
    await thumb.focus()
    await page.evaluate(() => window.renderSlider(true))
    assert.equal(await thumb.getAttribute('tabindex'), '-1')
    assert.equal(await thumb.getAttribute('aria-disabled'), 'true')
    assert.deepEqual(
      await thumb.evaluate((element) => {
        const style = getComputedStyle(element)
        return [
          document.activeElement === element,
          style.opacity,
          style.outlineWidth,
          style.borderTopWidth,
          style.marginTop,
        ]
      }),
      [true, '0.75', '2px', '4px', '0px'],
    )
    await thumb.press('ArrowRight')
    assert.equal(await thumb.getAttribute('aria-valuenow'), '50')
    await thumb.evaluate((element) => element.blur())
    await page.evaluate(() => window.renderSlider(false))
    assert.equal(await thumb.evaluate((element) => document.activeElement === element), false)
    assert.equal(await thumb.evaluate((element) => getComputedStyle(element).opacity), '1')
  } finally {
    await page.close()
  }
})

test('the real Web TextArea owns editable focus and form predicates, not its wrapper or count', {
  skip: !executablePath,
}, async () => {
  const source = (relative) =>
    fileURLToPath(new URL(`../../../${relative}`, import.meta.url)).replaceAll('\\', '/')
  const fixture = await build({
    stdin: {
      contents: `import {createElement} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {HozoTextArea} from ${JSON.stringify(source('packages/form/src/text-area.tsx'))};
      const root = createRoot(document.getElementById('root'));
      window.renderTextArea = (props = {}) => flushSync(() => root.render(createElement(HozoTextArea, {maxLength:20, className:'disabled:opacity-25', countClassName:'disabled:opacity-25', fieldClassName:${JSON.stringify(textAreaFocusClasses)}, ...props})));
      window.renderTextArea();`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'web-form-behaviors',
        setup(builder) {
          builder.onResolve({ filter: /^@hozo\/behaviors$/ }, () => ({
            path: 'web-form-behaviors',
            namespace: 'form-probe',
          }))
          builder.onLoad({ filter: /.*/, namespace: 'form-probe' }, () => ({
            contents: `export {useAnnounce} from ${JSON.stringify(source('packages/behaviors/src/live-region.tsx'))}; export {useHozoMessage} from ${JSON.stringify(source('packages/behaviors/src/i18n.ts'))};`,
            loader: 'ts',
            resolveDir: source(''),
          }))
        },
      },
    ],
  })
  const page = await browser.newPage()
  try {
    await page.setContent(`<style>${uiCandidates}</style><div id="root"></div>`)
    await page.addScriptTag({ content: fixture.outputFiles[0].text })
    const field = page.locator('textarea')
    const read = () =>
      field.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          focused: element.matches(':focus'),
          readOnly: element.matches(':read-only'),
          opacity: style.opacity,
          border: style.borderTopWidth,
          outline: style.outlineWidth,
          wrapperOpacity: getComputedStyle(element.parentElement).opacity,
          countOpacity: getComputedStyle(element.parentElement.querySelector('span')).opacity,
        }
      })
    await field.focus()
    assert.equal((await read()).opacity, '0.75')
    assert.equal((await read()).wrapperOpacity, '1')
    assert.equal((await read()).countOpacity, '1')
    await page.evaluate(() => window.renderTextArea({ readOnly: true }))
    assert.equal((await read()).focused, true)
    assert.equal((await read()).readOnly, true)
    assert.equal((await read()).border, '4px')
    await page.evaluate(() => window.renderTextArea({ disabled: true }))
    assert.equal((await read()).focused, false)
    assert.equal((await read()).readOnly, true)
    assert.equal((await read()).opacity, '0.25')
    await page.evaluate(() =>
      window.renderTextArea({ 'aria-invalid': true, 'aria-required': true }),
    )
    assert.equal((await read()).focused, false)
    assert.equal((await read()).opacity, '1')
    assert.equal((await read()).border, '4px')
    assert.equal((await read()).outline, '4px')
  } finally {
    await page.close()
  }
})

test('the real Web NativeSelect is read-only, blurs when disabled and has no authored expanded fact', {
  skip: !executablePath,
}, async () => {
  const fixture = await build({
    stdin: {
      contents: `import {createElement} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {HozoNativeSelect} from ${JSON.stringify(fileURLToPath(new URL('../../../packages/form/src/native-select.tsx', import.meta.url)))};
      const root = createRoot(document.getElementById('root'));
      window.renderSelect = (props = {}) => flushSync(() => root.render(createElement(HozoNativeSelect, {options:[{value:'slow', label:'Standard'},{value:'fast',label:'Express'},{value:'closed',label:'Unavailable',disabled:true}], defaultValue:'slow', className:${JSON.stringify(selectFocusClasses)}, ...props})));
      window.renderSelect();`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
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
    await page.setContent(`<style>${uiCandidates}</style><div id="root"></div>`)
    await page.addScriptTag({ content: fixture.outputFiles[0].text })
    const control = page.locator('select')
    const read = () =>
      control.evaluate((element) => {
        const s = getComputedStyle(element)
        return [
          element.matches(':focus'),
          element.matches(':read-only'),
          s.opacity,
          s.borderTopWidth,
          s.marginTop,
          element.value,
        ]
      })
    await control.focus()
    assert.deepEqual(await read(), [true, true, '0.75', '4px', '0px', 'slow'])
    assert.equal(await control.getAttribute('aria-expanded'), null)
    await page.evaluate(() => window.renderSelect({ disabled: true }))
    assert.deepEqual(await read(), [false, true, '0.25', '4px', '0px', 'slow'])
    await page.evaluate(() => window.renderSelect({ 'aria-invalid': true, 'aria-required': true }))
    assert.deepEqual(await read(), [false, true, '1', '4px', '0px', 'slow'])
    assert.equal(await control.evaluate((element) => getComputedStyle(element).outlineWidth), '4px')
    await control.selectOption('fast')
    assert.equal(await control.inputValue(), 'fast')
    assert.equal(await page.locator('option[value="closed"]').isDisabled(), true)
  } finally {
    await page.close()
  }
})

for (const host of ['View', 'Text', 'Chip root', 'Chip remove']) {
  test(`a mixed ternary keeps own classes below caller classes on ${host}`, {
    skip: !executablePath,
  }, async () => {
    const secondary = host === 'Chip remove'
    const tag = host.startsWith('Chip') ? 'Chip' : host
    const input = 'selected ? `${own} ${caller}` : own'
    const usage = secondary
      ? `<Chip onRemove={remove} removeClassName={${input}}>Label</Chip>`
      : `<${tag} className={${input}}>Label</${tag}>`
    const source = `import {${tag}} from '@hozo/core'; const own=${JSON.stringify(own)}; const el=${usage}`
    const web = compiler.compile(source)[0]
    const native = compiler.compileNative(source)[0]
    const page = await browser.newPage()
    const oracle = await browser.newPage()
    const select = secondary ? 'button' : tag === 'View' ? 'div' : 'span'
    const read = (p) =>
      p
        .locator(select)
        .first()
        .evaluate((e) => {
          const s = getComputedStyle(e)
          return {
            padding: s.paddingTop,
            radius: s.borderTopLeftRadius,
            color: s.color,
            weight: s.fontWeight,
            size: s.fontSize,
            leading: s.lineHeight,
          }
        })
    try {
      for (const selected of [false, true]) {
        const nativeProps = evaluate(
          `const hozoStyles=${native.styles};module.exports=(${native.jsx})`,
          {
            selected,
            own,
            caller,
            remove() {},
            hozoClasses,
            StyleSheet: { create: (s) => s },
            View: 'View',
            Text: 'Text',
            HozoChip: 'Chip',
            h: (_type, props) => props,
          },
        )
        const style = secondary
          ? nativeProps.hozoRemoveStyle
          : tag === 'Chip'
            ? nativeProps.hozoStyle
            : nativeProps.style
        const nativeStyle = Object.assign(
          {},
          ...[typeof style === 'function' ? style({}) : style].flat(Infinity).filter(Boolean),
        )
        assert.equal(nativeStyle.paddingTop, selected ? 32 : 8)
        assert.equal(nativeStyle.borderRadius, selected ? 48 : 6)
        // A Native View cannot draw typography; descendant propagation is
        // RFC 006's separate integration gate, not certified by a box style.
        if (tag !== 'View') {
          assert.equal(nativeStyle.color, selected ? '#0011dd' : '#dd1100')
          assert.equal(String(nativeStyle.fontWeight), selected ? '400' : '600')
          assert.equal(nativeStyle.fontSize, selected ? 28 : 20)
          assert.equal(nativeStyle.lineHeight, selected ? 36 : 24)
        }
        const html = renderToStaticMarkup(
          evaluate(`module.exports=(${web.jsx})`, {
            selected,
            own,
            caller,
            remove() {},
            HozoChip: Chip,
            h: createElement,
          }),
        )
        // The oracle has only the independently expected winning class set,
        // not the same conflicting expression or Hozo's generated CSS.
        await oracle.setContent(
          `<style>${oracleCss}</style><${secondary ? 'button' : tag === 'View' ? 'div' : 'span'} class="${selected ? caller : own}">Label</${secondary ? 'button' : tag === 'View' ? 'div' : 'span'}>`,
        )
        const expected = await read(oracle)
        for (const sheets of [
          [web.css, candidates],
          [candidates, web.css],
        ]) {
          await page.setContent(`${sheets.map((css) => `<style>${css}</style>`).join('')}${html}`)
          assert.deepEqual(await read(page), expected)
          if (selected) {
            // Reintroduce precisely #1152's leak. The same candidate sheet
            // must expose it, or this fixture could pass before the fix too.
            await page
              .locator(select)
              .first()
              .evaluate((element, classes) => {
                element.classList.add(...classes.split(' '))
              }, own)
            assert.notDeepEqual(
              await read(page),
              expected,
              'leaked own candidates must fail the oracle',
            )
            await page
              .locator(select)
              .first()
              .evaluate((element, classes) => {
                element.classList.remove(...classes.split(' '))
              }, own)
            assert.deepEqual(await read(page), expected)
            await page.evaluate(() => {
              for (const style of document.querySelectorAll('style'))
                if (style.textContent.includes(':not(hozo-none)')) style.remove()
            })
            assert.notDeepEqual(
              await read(page),
              expected,
              'the caller candidate sheet must actually contribute',
            )
          }
        }
      }
    } finally {
      await page.close()
      await oracle.close()
    }
  })
}
