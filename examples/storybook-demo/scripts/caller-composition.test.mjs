// Shared compiler/candidate composition, not Native pixels or event delivery.
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Fixtures retain authored TSX interpolation.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import {
  createCompiler,
  openCandidateCache,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
  prepareTailwindContext,
} from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'
import { emitFinalTailwindBatch, TailwindProjectSession } from '@hozo/compiler/project'
import { createClassResolver, cx } from '@hozo/engine'
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
import {
  Accordion,
  Alert,
  Avatar,
  BottomSheet,
  Checkbox,
  Chip,
  CodeBlock,
  CodeClipboardProvider,
  Drawer,
  Pagination,
  Popover,
  RadioGroup,
  ResizablePane,
  Slider,
  Splitter,
  Stepper,
  Switch,
  Tabs,
  Toolbar,
  Tooltip,
  Tree,
} from '@hozo/patterns'
import { loadTheme, prepareTailwindOrder, tailwindPackageDir } from '@hozo/tailwind'
import { build, transformSync } from 'esbuild'
import { chromium } from 'playwright-core'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { compile } from 'tailwindcss'
import Yoga from 'yoga-layout'
import {
  hozoAuthoredEdges,
  hozoEdgeSpreadStyles,
} from '../../../packages/engine/src/authored-edges.ts'
import { hozoAuthoredStyle } from '../../../packages/engine/src/authored-gap.ts'
import {
  hozoMixedTextMetricStyles,
  hozoTextMetricStyles,
} from '../../../packages/engine/src/class-resolver.ts'
import { hozoDomStyle } from '../../../packages/engine/src/dom-style.ts'
import { hozoGapSpreadStyles } from '../../../packages/engine/src/gap-styles.ts'
import { hozoShadowStyles } from '../../../packages/engine/src/generated/shadow-slots.ts'
import { hozoSpreadStyles } from '../../../packages/engine/src/spread-styles.ts'
import { transformHozoSource } from '../../../packages/metro/src/transform.ts'
import { nativeDisabledProps } from '../../../packages/primitives/src/native-disabled.ts'
import {
  gapGeometry,
  gapLayouts,
  prepareGapAliasSubjects,
  yogaGapGeometry,
} from '../../../packages/tailwind-conformance/src/gap-alias-reference.ts'
import {
  prepareOrderSubjects,
  projectOrderNative,
  summarizeOrderCells,
} from '../../../packages/tailwind-conformance/src/tailwind-order-baseline.ts'
import { orderCases } from '../../../packages/tailwind-conformance/src/tailwind-order-corpus.ts'
import { prepareOrderReference } from '../../../packages/tailwind-conformance/src/tailwind-order-reference.ts'

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

// CSS Align now serializes the flex-start/end aliases as flow-start/end;
// Native keeps its legacy API spellings. Logical start/end stay distinct.
// https://drafts.csswg.org/css-align/#changes
const canonicalAlignment = (value) =>
  value === 'flex-start' ? 'flow-start' : value === 'flex-end' ? 'flow-end' : value

function evaluate(code, context) {
  const module = { exports: {} }
  runInNewContext(transformSync(code, { loader: 'tsx', jsxFactory: 'h', format: 'cjs' }).code, {
    module,
    nativeDisabledProps,
    hozoAuthoredEdges,
    hozoEdgeSpreadStyles,
    hozoAuthoredStyle,
    hozoGapSpreadStyles,
    hozoMixedTextMetricStyles,
    hozoShadowStyles,
    I18nManager: { isRTL: false, doLeftAndRightSwapInRTL: true },
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
  { createClassResolver, hozoTextMetricStyles, hozoShadowStyles, I18nManager: { isRTL: false } },
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
      // Observe the residual without dropping the generated resolver's
      // identity tables or the mixed boundary's selective deferral argument.
      hozoClasses: Object.assign((...args) => {
        calls.push(args[0])
        return resolveUiClasses(...args)
      }, resolveUiClasses),
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
              assert.deepEqual([flat.rowGap, flat.columnGap], [gap, gap])
              assert.equal(flat.alignItems, align)
              for (const sheets of [
                [web.css, uiCandidates],
                [uiCandidates, web.css],
              ]) {
                await page.setContent(
                  `${sheets.map((css) => `<style>${css}</style>`).join('')}<div class="${webProps.className}">Label</div>`,
                )
                const layout = await page.locator('div').evaluate((element) => {
                  const style = getComputedStyle(element)
                  return [style.display, style.flexDirection, style.gap, style.alignItems]
                })
                layout[3] = canonicalAlignment(layout[3])
                assert.deepEqual(
                  layout,
                  ['flex', direction, `${gap}px`, canonicalAlignment(align)],
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

test('gap alias boundary compares actual Tailwind and compiled browser geometry with real Yoga', {
  skip: !executablePath,
}, async () => {
  const subjects = await prepareGapAliasSubjects()
  const names = [...new Set(subjects.flatMap((subject) => subject.classes.split(' ')))]
  const sheet = (await compile('@tailwind utilities;')).build(names)
  const page = await browser.newPage()
  let browserObservations = 0
  let knownMismatches = 0
  try {
    for (const subject of subjects) {
      for (const layout of gapLayouts) {
        const element = (id, className, style) =>
          renderToStaticMarkup(
            createElement(
              'div',
              {
                id,
                className,
                style: {
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignContent: 'flex-start',
                  alignItems: 'flex-start',
                  width: 140,
                  height: 140,
                  ...layout,
                  ...style,
                },
              },
              ...[0, 1, 2].map((key) =>
                createElement('div', {
                  key,
                  style: { flex: 'none', width: 50, height: 50 },
                }),
              ),
            ),
          )
        await page.setContent(
          `<!doctype html><style>${sheet}\n${subject.css}</style>${element('raw-reference', subject.classes, subject.inline)}${element('reference', subject.classes, subject.referenceInline)}${element('compiled', subject.webProps.className, subject.webProps.style)}`,
        )
        for (const id of ['raw-reference', 'reference', 'compiled']) {
          const positions = await page.locator(`#${id}`).evaluate((owner) => {
            const box = owner.getBoundingClientRect()
            return [...owner.children].map((child) => {
              const childBox = child.getBoundingClientRect()
              return [childBox.left - box.left, childBox.top - box.top]
            })
          })
          const measured = gapGeometry(positions, layout.flexDirection)
          assert.deepEqual(
            measured,
            id === 'raw-reference' ? subject.rawWeb : subject.web,
            `${subject.id}/${id}/${JSON.stringify(layout)}`,
          )
          browserObservations++
          if (id === 'reference') {
            for (const style of [
              subject.selected,
              subject.dynamic,
              subject.spread,
              subject.dynamicSpread,
            ]) {
              const native = yogaGapGeometry(style, layout)
              assert.deepEqual(native, subject.native)
              if (JSON.stringify(native) !== JSON.stringify(measured)) knownMismatches++
            }
          }
        }
      }
    }
    assert.equal(browserObservations, 480)
    assert.equal(knownMismatches, 0, 'class/inline gap composition matches on both compiler paths')
  } finally {
    await page.close()
  }
})

test('shared assessed rule priorities predict independent Tailwind browser winners', {
  skip: !executablePath,
}, async () => {
  const definitions = [
    ['', '#112233'],
    ['focus:', '#223344'],
    ['active:', '#334455'],
    ['hover:focus:', '#445566'],
    ['', '#556677', '!'],
    ['hover:', '#667788', '!'],
  ].map(([prefix, color, suffix = '']) => ({ candidate: `${prefix}bg-[${color}]${suffix}`, color }))
  const css = '@tailwind utilities;'
  const names = definitions.map(({ candidate }) => candidate)
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const priorities = prepareTailwindContext(JSON.stringify(prepared.snapshot)).rulePriorities()
  const entries = definitions.map((entry) => {
    const priority = priorities.rules.find(
      ({ candidateId }) => candidateId === prepared.lookup(entry.candidate).id,
    )
    assert.equal(typeof priority?.rank, 'number', entry.candidate)
    return { ...entry, rank: priority.rank }
  })
  const sheet = (await compile(css)).build(names)
  const page = await browser.newPage()
  try {
    // Measurement control: bare :hover is deliberately different in quirks
    // mode. Do not mistake that selector quirk for absent pointer delivery.
    await page.setContent('<button id="subject" style="width:80px;height:40px">Probe</button>')
    await page.mouse.move(200, 200)
    await page.locator('#subject').hover()
    await page.waitForFunction(
      () => document.querySelector('#subject').matches('button:hover'),
      null,
      { timeout: 2000 },
    )
    assert.deepEqual(
      await page.locator('#subject').evaluate((element) => ({
        mode: document.compatMode,
        bare: element.matches(':hover'),
        qualified: element.matches('button:hover'),
      })),
      { mode: 'BackCompat', bare: false, qualified: true },
    )
    for (const indices of [
      [0, 1, 2],
      [0, 2, 3],
      [2, 3, 4],
      [3, 4, 5],
    ]) {
      const members = indices.map((index) => entries[index])
      const predicted = members.reduce((a, b) => (a.rank > b.rank ? a : b))
      const expectedColor = [1, 3, 5].map((start) =>
        Number.parseInt(predicted.color.slice(start, start + 2), 16),
      )
      for (const ordered of [members, [...members].reverse()]) {
        await page.setContent(
          `<!doctype html><style>${sheet}</style><button id="subject" style="width:80px;height:40px" class="${ordered.map(({ candidate }) => candidate).join(' ')}">Target</button>`,
        )
        assert.equal(await page.evaluate(() => document.compatMode), 'CSS1Compat')
        // Enter each fresh document with a real pointer movement and verify
        // state before comparing its color. No pseudo-class is forced in JS.
        await page.mouse.move(200, 200)
        const target = page.locator('#subject')
        await target.focus()
        await target.hover()
        await page
          .waitForFunction(
            () => {
              const target = document.querySelector('#subject')
              return target.matches(':focus') && target.matches(':hover')
            },
            null,
            { timeout: 2000 },
          )
          .catch(async (error) => {
            console.error(
              JSON.stringify({
                stage: 'priority-oracle-hover',
                classes: ordered.map(({ candidate }) => candidate),
                document: await target.evaluate((element) => {
                  const rect = element.getBoundingClientRect()
                  const x = rect.x + rect.width / 2,
                    y = rect.y + rect.height / 2
                  return {
                    focus: element.matches(':focus'),
                    mode: document.compatMode,
                    qualifiedHover: element.matches('button:hover'),
                    hover: element.matches(':hover'),
                    active: element.matches(':active'),
                    rect: rect.toJSON(),
                    hit: document.elementFromPoint(x, y)?.outerHTML,
                    hovered: [...document.querySelectorAll(':hover')].map((entry) =>
                      entry.outerHTML.slice(0, 200),
                    ),
                    viewport: [innerWidth, innerHeight],
                    hoverMedia: matchMedia('(hover: hover)').matches,
                  }
                }),
              }),
            )
            throw error
          })
        await page.mouse.down()
        try {
          await page.waitForFunction(
            () => document.querySelector('#subject').matches(':active'),
            null,
            { timeout: 2000 },
          )
          const actual = await target.evaluate((element) => ({
            states: [':focus', ':hover', ':active'].map((selector) => element.matches(selector)),
            color: getComputedStyle(element).backgroundColor,
          }))
          assert.deepEqual(actual.states, [true, true, true])
          assert.equal(
            actual.color,
            `rgb(${expectedColor.join(', ')})`,
            ordered.map(({ candidate }) => candidate).join(' '),
          )
        } finally {
          await page.mouse.up()
        }
      }
    }
  } finally {
    await page.close()
  }
})

test('the common scalar IR plan reaches both actual lowerers and matches independent browser winners', {
  skip: !executablePath,
}, async () => {
  const result = JSON.parse(
    execFileSync(
      'cargo',
      ['run', '--quiet', '-p', 'hozo_napi', '--example', 'tailwind-scalar-plan'],
      {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        encoding: 'utf8',
        env: { ...process.env, CARGO_BUILD_JOBS: '1' },
        timeout: 120_000,
      },
    ),
  )
  assert.equal(result.rows.length, 8)
  const names = [...new Set(result.rows.flatMap((row) => row.classes.split(' ')))]
  const theme = readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')
  const sheet = (await compile(`${theme}\n@tailwind utilities;`)).build(names)
  const page = await browser.newPage()
  let legacyMismatches = 0
  try {
    for (const row of result.rows) {
      assert.deepEqual(row.native.prelude, [])
      const props = evaluate(
        `const hozoStyles=${row.native.styles};module.exports=(${row.native.jsx})`,
        {
          Pressable: 'owner',
          HozoPressable: 'owner',
          h: (_type, props) => props,
        },
      )
      await page.setContent(
        `<!doctype html><style>${sheet}\n${row.webCss}\n${row.legacyCss.replaceAll('.hozo-0', '.legacy-0')}</style><button id="oracle" class="${row.classes}">Target</button><button id="planned" class="hozo-0">Target</button><button id="legacy" class="legacy-0">Target</button>`,
      )
      const read = async (id, stage) => {
        await page.mouse.move(600, 600)
        await page.evaluate(() => document.activeElement?.blur())
        const target = page.locator(`#${id}`)
        if (stage > 0) await target.focus()
        if (stage > 1) await target.hover()
        if (stage > 2) await page.mouse.down()
        try {
          return await target.evaluate(
            (element, keys) => ({
              facts: {
                focused: element.matches(':focus'),
                hovered: element.matches(':hover'),
                pressed: element.matches(':active'),
              },
              values: Object.fromEntries(
                ['backgroundColor', ...keys].map((key) => [key, getComputedStyle(element)[key]]),
              ),
            }),
            row.keys,
          )
        } finally {
          if (stage > 2) await page.mouse.up()
        }
      }
      for (let stage = 0; stage < 4; stage++) {
        const oracle = await read('oracle', stage)
        const planned = await read('planned', stage)
        assert.deepEqual(planned.facts, {
          focused: stage > 0,
          hovered: stage > 1,
          pressed: stage > 2,
        })
        assert.deepEqual(planned, oracle, row.classes)
        const selected =
          typeof props.style === 'function' ? props.style(planned.facts) : props.style
        const native = Object.assign({}, ...[selected].flat(Infinity).filter(Boolean))
        for (const key of row.keys)
          assert.equal(`${native[key]}px`, oracle.values[key], `${row.classes}: ${key}`)
        const legacy = await read('legacy', stage)
        if (JSON.stringify(legacy.values) !== JSON.stringify(oracle.values)) legacyMismatches++
      }
    }
    assert.ok(legacyMismatches > 0, 'the independent oracle must detect old static winners')
  } finally {
    await page.close()
  }
})

test('the generated common-plan resolver agrees with real Tailwind across state changes and reversed classes', {
  skip: !executablePath,
}, async () => {
  const names = [
    'p-2',
    'p-4',
    'bg-[#112233]',
    'focus:bg-[#223344]',
    'active:bg-[#334455]',
    'hover:focus:bg-[#445566]',
  ]
  const css = '@theme { --spacing: .25rem; } @tailwind utilities;'
  const candidates = openCandidateCache()
  candidates.scanFile('probe.ts', `export const classes=${JSON.stringify(names.join(' '))}`, 1)
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), candidates.candidates())
  const plan = candidates.renderNativeModulePlan(
    prepareTailwindContext(JSON.stringify(prepared.snapshot)),
  )
  const localContext = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const expanded = await prepareTailwindOrder(css, tailwindPackageDir(), [
    ...names,
    ...Array.from({ length: 128 }, (_, index) => `m-${index + 1}`),
    'sm:p-8',
    'first:m-4',
    'aria-selected:w-8',
  ])
  const localResolve = evaluate(
    candidates.renderNativeModulePlan(localContext).code.replace(/^import .*$/gm, ''),
    { createClassResolver },
  ).hozoClasses
  const defaultResolve = evaluate(candidates.renderNativeModule().replace(/^import .*$/gm, ''), {
    createClassResolver,
  }).hozoClasses
  assert.ok(plan.ordering)
  const generated = evaluate(plan.code.replace(/^import .*$/gm, ''), {
    createClassResolver: (styles, unsupported, compose, states, ambient) =>
      styles.schema === 1 ? styles : { styles, unsupported, compose, states, ambient },
  }).hozoClasses
  const legacy = createClassResolver(
    generated.styles,
    generated.unsupported,
    generated.compose,
    generated.states,
    generated.ambient,
  )
  const resolve = createClassResolver({ schema: 1, ...generated, ordering: plan.ordering })
  const lists = [
    'p-4 p-2 bg-[#112233] focus:bg-[#223344] active:bg-[#334455] hover:focus:bg-[#445566]',
    'hover:focus:bg-[#445566] active:bg-[#334455] focus:bg-[#223344] bg-[#112233] p-2 p-4',
  ]
  const collected = lists.flatMap((classes, index) => {
    const source = `import {Pressable} from '@hozo/core';export const Target=()=> <Pressable className="${classes}"/>`
    return [
      { id: `w${index}`, revision: 'one', module: compiler.prepareWebModule(source) },
      { id: `n${index}`, revision: 'one', module: compiler.prepareNativeModule(source) },
    ]
  })
  const receipt = { id: 'probe.ts', revision: 'one', record: candidates.exportFile('probe.ts') }
  const final = await emitFinalTailwindBatch({
    expected: collected,
    collected,
    runtime: { expected: [receipt], contributions: [receipt] },
    prepare: async () => JSON.stringify(expanded.snapshot),
  })
  assert.notEqual(final.fingerprint, plan.fingerprint)
  assert.notEqual(final.fingerprint, localContext.fingerprint)
  assert.notEqual(final.native.ordering.ranks['p-4'][0], plan.ordering.ranks['p-4'][0])
  const emittedResolve = evaluate(final.native.code.replace(/^import .*$/gm, ''), {
    createClassResolver,
  }).hozoClasses
  const sheet = (await compile(css)).build(names)
  const session = new TailwindProjectSession(compiler, async (observed) =>
    JSON.stringify((await prepareTailwindOrder(css, tailwindPackageDir(), observed)).snapshot),
  )
  const page = await browser.newPage()
  let legacyMismatches = 0
  try {
    for (const [index, classes] of lists.entries()) {
      const web = final.modules.find(({ id }) => id === `w${index}`).output[0]
      const native = final.modules.find(({ id }) => id === `n${index}`).output.components[0]
      const localSource = `import {Pressable} from '@hozo/core';export const Target=()=> <Pressable className="${classes}"/>`
      const [defaultWeb, defaultNative] = await session.emit(`default-${index}`, [
        (compiler) => compiler.prepareWebModule(localSource),
        (compiler) => compiler.prepareNativeModule(localSource),
      ])
      assert.deepEqual(defaultWeb[0], web, 'the default adapter session uses the common winner')
      assert.deepEqual(defaultNative.components[0], native)
      assert.deepEqual(compiler.prepareWebModule(localSource).emit(localContext)[0], web)
      assert.deepEqual(
        compiler.prepareNativeModule(localSource).emit(localContext).components[0],
        native,
      )
      const nativeProps = evaluate(
        `const hozoStyles=${native.styles};module.exports=(${native.jsx})`,
        {
          Pressable: 'owner',
          HozoPressable: 'owner',
          h: (_type, props) => props,
        },
      )
      const runtimeSource = `import {Pressable} from '@hozo/core';export const Target=({classes})=> <Pressable className={classes}/>`
      const [runtimeOutput] = await session.emit(`dynamic-${index}`, [
        (compiler) => compiler.prepareNativeModule(runtimeSource),
      ])
      const runtimeComponent = runtimeOutput.components[0]
      const runtimeProps = evaluate(`module.exports=(${runtimeComponent.jsx})`, {
        classes,
        hozoClasses: localResolve,
        HozoPressable: 'owner',
        h: (_type, props) => props,
      })
      const [mixedOutput] = await session.emit(`mixed-${index}`, [
        (compiler) =>
          compiler.prepareNativeModule(
            runtimeSource.replace(
              'className={classes}',
              'className={classes} style={{paddingTop:99}}',
            ),
          ),
      ])
      const mixedProps = evaluate(`module.exports=(${mixedOutput.components[0].jsx})`, {
        classes,
        hozoClasses: localResolve,
        HozoPressable: 'owner',
        h: (_type, props) => props,
      })
      await page.setContent(
        `<!doctype html><style>${sheet}\n${web.css}</style><button id="subject" style="width:80px;height:40px" class="${classes}">Target</button><button id="planned" style="width:80px;height:40px" class="hozo-0">Target</button>`,
      )
      assert.equal(await page.evaluate(() => document.compatMode), 'CSS1Compat')
      await page.mouse.move(200, 200)
      const target = page.locator('#subject')
      const check = async (expected) => {
        const actual = await target.evaluate((element) => ({
          state: {
            focused: element.matches(':focus'),
            hovered: element.matches(':hover'),
            pressed: element.matches(':active'),
          },
          color: getComputedStyle(element).backgroundColor,
          padding: Number.parseFloat(getComputedStyle(element).paddingTop),
        }))
        assert.deepEqual(actual.state, expected)
        const read = (resolver) => {
          const value = Object.assign({}, ...resolver(classes, actual.state))
          assert.match(value.backgroundColor, /^#[\da-f]{6}$/i)
          return {
            color: `rgb(${[1, 3, 5].map((start) => Number.parseInt(value.backgroundColor.slice(start, start + 2), 16)).join(', ')})`,
            padding: value.paddingTop,
          }
        }
        const oracle = { color: actual.color, padding: actual.padding }
        const dynamicSelected = runtimeProps.style(actual.state)
        const dynamicStyle = Object.assign({}, ...[dynamicSelected].flat(Infinity).filter(Boolean))
        assert.deepEqual(
          read(() => [dynamicStyle]),
          oracle,
          'actual dynamically compiled Native owner',
        )
        const mixedStyle = Object.assign(
          {},
          ...[mixedProps.style(actual.state)].flat(Infinity).filter(Boolean),
        )
        assert.deepEqual(
          read(() => [mixedStyle]),
          { ...oracle, padding: 99 },
          'authored styles retain their input tier above the generated dynamic plan',
        )
        assert.deepEqual(read(resolve), oracle)
        assert.deepEqual(read(defaultResolve), oracle, 'the ordinary built-in runtime map')
        assert.deepEqual(read(emittedResolve), oracle, 'the actual generated object factory call')
        assert.deepEqual(
          read(localResolve),
          oracle,
          'the actual factory in the smaller, separately numbered namespace',
        )
        const selected =
          typeof nativeProps.style === 'function'
            ? nativeProps.style(actual.state)
            : nativeProps.style
        const staticStyle = Object.assign({}, ...[selected].flat(Infinity).filter(Boolean))
        assert.deepEqual(
          read(() => [staticStyle]),
          oracle,
          'actual final Native module',
        )
        if (JSON.stringify(read(legacy)) !== JSON.stringify(oracle)) legacyMismatches++
      }
      await check({ focused: false, hovered: false, pressed: false })
      await target.focus()
      await check({ focused: true, hovered: false, pressed: false })
      await target.hover()
      await page.waitForFunction(() => document.querySelector('#subject').matches(':hover'), null, {
        timeout: 2000,
      })
      await check({ focused: true, hovered: true, pressed: false })
      await page.mouse.down()
      try {
        await page.waitForFunction(
          () => document.querySelector('#subject').matches(':active'),
          null,
          { timeout: 2000 },
        )
        await check({ focused: true, hovered: true, pressed: true })
      } finally {
        await page.mouse.up()
      }
      // Exercise the other owner separately: its real predicates must match,
      // not a synthetic dispatchEvent that never sets CSS :hover/:active.
      for (let stage = 0; stage < 4; stage++) {
        await page.mouse.move(600, 600)
        await page.evaluate(() => document.activeElement?.blur())
        const planned = page.locator('#planned')
        if (stage > 0) await planned.focus()
        if (stage > 1) await planned.hover()
        if (stage > 2) await page.mouse.down()
        try {
          const value = await planned.evaluate((element) => ({
            state: {
              focused: element.matches(':focus'),
              hovered: element.matches(':hover'),
              pressed: element.matches(':active'),
            },
            color: getComputedStyle(element).backgroundColor,
            padding: Number.parseFloat(getComputedStyle(element).paddingTop),
          }))
          assert.deepEqual(value.state, {
            focused: stage > 0,
            hovered: stage > 1,
            pressed: stage > 2,
          })
          const resolved = Object.assign({}, ...emittedResolve(classes, value.state))
          assert.equal(value.padding, resolved.paddingTop)
          assert.equal(
            value.color,
            `rgb(${[1, 3, 5].map((start) => Number.parseInt(resolved.backgroundColor.slice(start, start + 2), 16)).join(', ')})`,
          )
        } finally {
          if (stage > 2) await page.mouse.up()
        }
      }
    }
    assert.ok(
      legacyMismatches > 0,
      'the same oracle must expose the old string-order padding winner',
    )
  } finally {
    session.invalidate()
    await page.close()
  }
})

test('CSSOM alignment aliases preserve geometry and keep logical start distinct', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage()
  try {
    for (const direction of ['ltr', 'rtl']) {
      const measure = async (value) => {
        await page.setContent(
          `<div id="owner" style="display:flex;flex-direction:row-reverse;direction:${direction};width:120px;height:60px;justify-content:${value}"><i style="width:20px;height:10px;flex:none"></i></div>`,
        )
        return page.locator('#owner').evaluate((element) => {
          const parent = element.getBoundingClientRect()
          const child = element.firstElementChild.getBoundingClientRect()
          return {
            value: getComputedStyle(element).justifyContent,
            offset: [child.x - parent.x, child.y - parent.y, child.width, child.height],
          }
        })
      }
      for (const [legacy, alias] of [
        ['flex-start', 'flow-start'],
        ['flex-end', 'flow-end'],
      ]) {
        const previous = await measure(legacy)
        assert.equal(canonicalAlignment(previous.value), alias)
        if (await page.evaluate((value) => CSS.supports('justify-content', value), alias)) {
          const current = await measure(alias)
          assert.equal(canonicalAlignment(current.value), alias)
          assert.deepEqual(current.offset, previous.offset)
        }
      }
      const flex = await measure('flex-start')
      const logical = await measure('start')
      assert.notDeepEqual(flex.offset, logical.offset)
      assert.notEqual(canonicalAlignment(flex.value), canonicalAlignment(logical.value))
    }
    for (const value of ['start', 'end', 'self-start', 'self-end', 'safe flex-start', 'center']) {
      assert.equal(canonicalAlignment(value), value)
    }
  } finally {
    await page.close()
  }
})

test('simple projected properties use upstream winners in actual static and generated Native output', {
  skip: !executablePath,
}, async () => {
  const fixtures = [
    ['opacity-75 opacity-50', 'opacity', 'opacity', true],
    ['z-20 z-10', 'z-index', 'zIndex', true],
    ['flex-row flex-col', 'flex-direction', 'flexDirection'],
    ['grow grow-0', 'flex-grow', 'flexGrow', true],
    ['shrink shrink-0', 'flex-shrink', 'flexShrink', true],
    ['items-center items-start', 'align-items', 'alignItems'],
    ['self-center self-start', 'align-self', 'alignSelf'],
    ['content-center content-end', 'align-content', 'alignContent'],
    ['justify-center justify-end', 'justify-content', 'justifyContent'],
    ['text-left text-right', 'text-align', 'textAlign'],
    ['uppercase lowercase', 'text-transform', 'textTransform'],
    ['italic not-italic', 'font-style', 'fontStyle'],
    ['flex hidden', 'display', 'display'],
    ['absolute relative', 'position', 'position'],
    ['overflow-hidden overflow-visible', 'overflow', 'overflow'],
    ['basis-8 basis-4', 'flex-basis', 'flexBasis', 'px'],
    ['flex-wrap flex-nowrap', 'flex-wrap', 'flexWrap'],
    ['backface-hidden backface-visible', 'backface-visibility', 'backfaceVisibility'],
    ['box-border box-content', 'box-sizing', 'boxSizing'],
    ['isolate isolation-auto', 'isolation', 'isolation'],
    ['pointer-events-none pointer-events-auto', 'pointer-events', 'pointerEvents'],
    ['static relative', 'position', 'position'],
    ['select-none select-text', 'user-select', 'userSelect'],
    ['align-top align-middle', 'vertical-align', 'verticalAlign'],
    ['underline no-underline', 'text-decoration-line', 'textDecorationLine'],
    ['decoration-solid decoration-dashed', 'text-decoration-style', 'textDecorationStyle'],
    [
      'decoration-[#ff0000] decoration-[#0000ff]',
      'text-decoration-color',
      'textDecorationColor',
      'color',
    ],
    [
      'focus:opacity-50 active:opacity-75 hover:focus:opacity-25 opacity-100',
      'opacity',
      'opacity',
      true,
    ],
  ]
  const names = [...new Set(['p-2', 'p-4', ...fixtures.flatMap(([classes]) => classes.split(' '))])]
  const css = '@theme {--spacing:.25rem;} @tailwind utilities;'
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const cache = openCandidateCache()
  cache.scanFile('simple.ts', JSON.stringify(names.join(' ')), 0)
  const resolve = evaluate(
    cache.renderNativeModulePlan(context).code.replace(/^import .*$/gm, ''),
    { createClassResolver },
  ).hozoClasses
  const sheet = (await compile(css)).build(names)
  const page = await browser.newPage()
  let observations = 0
  try {
    for (const [pair, property, nativeKey, numeric] of fixtures) {
      for (const classes of [`p-4 p-2 ${pair}`, `${pair.split(' ').reverse().join(' ')} p-2 p-4`]) {
        // Observe font style on a real Text owner, not an empty layout host.
        // This ordering probe does not certify parent text inheritance.
        const primitive =
          nativeKey === 'fontStyle' ||
          nativeKey === 'verticalAlign' ||
          nativeKey.startsWith('textDecoration')
            ? 'Text'
            : 'Pressable'
        const input = `import {${primitive}} from '@hozo/core';export const Target=()=> <${primitive} className="${classes}"/>`
        const web = compiler.prepareWebModule(input).emit(context)[0]
        const native = compiler.prepareNativeModule(input).emit(context).components[0]
        const props = evaluate(`const hozoStyles=${native.styles};module.exports=(${native.jsx})`, {
          Pressable: 'owner',
          Text: 'text',
          HozoPressable: 'owner',
          h: (_type, props) => props,
        })
        await page.setContent(
          `<!doctype html><style>${sheet}\n${web.css}</style><button id="upstream" class="${classes}">Upstream</button><button id="compiled" class="hozo-0">Compiled</button>`,
        )
        for (const id of ['upstream', 'compiled']) {
          await page.mouse.move(600, 600)
          await page.evaluate(() => document.activeElement?.blur())
          const owner = page.locator(`#${id}`)
          const stages = pair.includes(':') ? 4 : 1
          for (let stage = 0; stage < stages; stage++) {
            if (stage === 1) await owner.focus()
            if (stage === 2) await owner.hover()
            if (stage === 3) await page.mouse.down()
            try {
              const actual = await owner.evaluate(
                (element, property) => ({
                  value: getComputedStyle(element).getPropertyValue(property),
                  padding: getComputedStyle(element).paddingTop,
                  state: {
                    focused: element.matches(':focus'),
                    hovered: element.matches(':hover'),
                    pressed: element.matches(':active'),
                  },
                }),
                property,
              )
              const selected =
                typeof props.style === 'function' ? props.style(actual.state) : props.style
              // Text properties belong to the generated label frame, not
              // the Pressable host. Read the prop actually wired to it.
              const label =
                typeof props.hozoTextStyle === 'function'
                  ? props.hozoTextStyle(actual.state)
                  : props.hozoTextStyle
              const hostStyle = Object.assign({}, ...[selected].flat(Infinity).filter(Boolean))
              const staticStyle =
                nativeKey === 'textAlign' || nativeKey === 'textTransform'
                  ? Object.assign({}, ...[label].flat(Infinity).filter(Boolean))
                  : hostStyle
              const dynamic = Object.assign({}, ...resolve(classes, actual.state))
              const expected =
                numeric === 'px'
                  ? Number.parseFloat(actual.value)
                  : numeric === 'color'
                    ? `#${actual.value
                        .match(/\d+/g)
                        .map((n) => Number(n).toString(16).padStart(2, '0'))
                        .join('')}`
                    : numeric
                      ? Number(actual.value)
                      : actual.value
              const comparable = [
                'alignItems',
                'alignSelf',
                'alignContent',
                'justifyContent',
              ].includes(nativeKey)
                ? canonicalAlignment
                : (value) => value
              assert.equal(
                comparable(staticStyle[nativeKey]),
                comparable(expected),
                `${id}/${classes}/${stage}/static`,
              )
              assert.equal(
                comparable(dynamic[nativeKey]),
                comparable(expected),
                `${id}/${classes}/${stage}/dynamic`,
              )
              assert.equal(actual.padding, '16px')
              assert.equal(hostStyle.paddingTop, 16)
              assert.equal(dynamic.paddingTop, 16)
              observations++
            } finally {
              if (stage === 3) await page.mouse.up()
            }
          }
        }
      }
    }
    assert.equal(observations, 124)
  } finally {
    await page.close()
  }
})

test(
  'positive ARIA owner ordering matches real Tailwind with independent disabled sources and hover facts',
  {
    skip: !executablePath,
  },
  () => checkAriaOwnerOrdering(false),
)

test(
  'negated ARIA owner ordering matches real Tailwind without replacing missing drivers with false',
  {
    skip: !executablePath,
  },
  () => checkAriaOwnerOrdering(true),
)

async function checkAriaOwnerOrdering(includeNegated) {
  const names = [
    'p-4',
    'p-2',
    'aria-busy:p-3',
    'aria-checked:p-5',
    'aria-expanded:p-7',
    'aria-selected:p-8',
    'aria-[invalid=true]:p-9',
    'disabled:p-10',
    'aria-disabled:p-11',
    'hover:aria-disabled:p-13',
    'disabled:aria-disabled:p-15',
    'hover:aria-selected:p-12',
    'aria-checked:aria-selected:p-14',
  ]
  if (includeNegated)
    names.push(
      'not-aria-busy:p-3',
      'not-aria-checked:p-5',
      'not-aria-expanded:p-7',
      'not-aria-selected:p-8',
      'not-aria-[invalid=true]:p-9',
      'not-aria-disabled:p-11',
      'hover:not-aria-selected:p-12',
      'aria-checked:not-aria-selected:p-14',
      'not-aria-checked:not-aria-selected:p-16',
      'disabled:not-aria-selected:p-17',
    )
  const css = '@theme {--spacing:.25rem;} @tailwind utilities;'
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const legacy = prepareTailwindContext(JSON.stringify(prepared.snapshot))
  const cache = openCandidateCache()
  cache.scanFile('aria.ts', JSON.stringify(names.join(' ')), 0)
  const resolve = evaluate(
    cache.renderNativeModulePlan(context).code.replace(/^import .*$/gm, ''),
    {
      createClassResolver,
    },
  ).hozoClasses
  const sheet = (await compile(css)).build(names)
  const page = await browser.newPage()
  let observations = 0
  let oldMismatches = 0
  try {
    for (const classes of [names.join(' '), names.toReversed().join(' ')]) {
      const source = `import {Button} from '@hozo/core';export const A=({state,invalid,blocked})=><Button accessibilityState={state} aria-invalid={invalid} disabled={blocked} className="${classes}"/>`
      const web = compiler.prepareWebModule(source).emit(context)[0]
      const old = compiler.prepareWebModule(source).emit(legacy)[0]
      const native = compiler.prepareNativeModule(source).emit(context).components[0]
      const dynamicSource = source
        .replace('({state,invalid,blocked})', '({state,invalid,blocked,runtimeNames})')
        .replace(`className="${classes}"`, 'className={runtimeNames}')
      const dynamicNative = compiler.prepareNativeModule(dynamicSource).emit(context).components[0]
      assert.ok(
        dynamicNative.diagnostics.every((d) => d.code === 'DYNAMIC_CLASS_NAME_NOT_RESOLVED'),
      )
      assert.match(
        web.jsx,
        /^<button(?:\s|>)/,
        'probe the actual compiled host, not a fabricated tag',
      )
      assert.equal(native.diagnostics.length, 0)
      const webOwners = [web, old].map((output) =>
        evaluate(`module.exports=(state,invalid,blocked)=>(${output.jsx})`, {
          h: (_type, props) => props,
        }),
      )
      const render = evaluate(
        `const hozoStyles=${native.styles};module.exports=(state,invalid,blocked)=>(${native.jsx})`,
        {
          Pressable: 'owner',
          HozoPressable: 'owner',
          h: (_type, props) => props,
        },
      )
      const renderDynamic = evaluate(
        `const hozoStyles=${dynamicNative.styles};module.exports=(state,invalid,blocked,runtimeNames)=>(${dynamicNative.jsx})`,
        {
          Pressable: 'owner',
          HozoPressable: 'owner',
          hozoClasses: resolve,
          h: (_type, props) => props,
        },
      )
      await page.setContent(
        `<!doctype html><style>${sheet}\n${web.css}\n${old.css.replaceAll('hozo-0', 'legacy')}</style><button id="reference" class="${classes}">Reference</button><button id="compiled" class="hozo-0">Compiled</button><button id="old" class="legacy">Legacy</button>`,
      )
      for (let mask = 0; mask < (includeNegated ? 67 : 64); mask++) {
        const state =
          mask === 64
            ? undefined
            : mask === 65
              ? null
              : mask === 66
                ? { checked: 'mixed', selected: false, disabled: false }
                : Object.fromEntries(
                    ['busy', 'checked', 'expanded', 'selected', 'disabled'].map((key, bit) => [
                      key,
                      Boolean(mask & (1 << (key === 'disabled' ? 5 : bit))),
                    ]),
                  )
        const invalid = mask < 64 ? Boolean(mask & 16) : 'grammar'
        const blocked = mask < 64 && mask % 3 === 0
        const unavailable = blocked || state?.disabled === true
        const props = render(state, invalid, blocked)
        const dynamicProps = renderDynamic(state, invalid, blocked, classes)
        const projected = webOwners.map((render) => render(state, invalid, blocked))
        assert.equal(Boolean(projected[0]['aria-disabled']), unavailable)
        assert.equal(Boolean(projected[0].disabled), unavailable)
        assert.equal(Boolean(props.disabled), unavailable)
        await page.evaluate(
          ({ state, invalid, unavailable, projected }) => {
            for (const element of document.querySelectorAll('button')) {
              const attributes =
                element.id === 'reference'
                  ? {
                      ...Object.fromEntries(
                        Object.entries(state ?? {}).map(([key, value]) => [`aria-${key}`, value]),
                      ),
                      'aria-invalid': invalid,
                      'aria-disabled': unavailable,
                      disabled: unavailable,
                    }
                  : projected[element.id === 'compiled' ? 0 : 1]
              for (const name of [
                'aria-busy',
                'aria-checked',
                'aria-disabled',
                'aria-expanded',
                'aria-selected',
                'aria-invalid',
                'data-hozo-disabled',
              ]) {
                const value = attributes[name]
                if (value == null) element.removeAttribute(name)
                else element.setAttribute(name, String(value))
              }
              element.disabled = Boolean(attributes.disabled)
            }
          },
          {
            state,
            invalid,
            unavailable,
            projected,
          },
        )
        await page.mouse.move(700, 500)
        for (const id of ['reference', 'compiled', 'old']) {
          const owner = page.locator(`#${id}`)
          // Hover some selected states but not all; the fact is read back
          // from the browser, including on a disabled button.
          if (mask % 2 === 0) await owner.hover({ force: true })
          const observed = await owner.evaluate((element) => ({
            padding: Number.parseFloat(getComputedStyle(element).paddingTop),
            hovered: element.matches(':hover'),
          }))
          const facts = {
            ...Object.fromEntries(
              Object.entries(state ?? {}).map(([key, value]) => [`aria-${key}`, value === true]),
            ),
            'aria-invalid': String(invalid) === 'true',
            disabled: unavailable,
            'aria-disabled': unavailable,
            hovered: observed.hovered,
          }
          const style = typeof props.style === 'function' ? props.style(facts) : props.style
          const selected = Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
          const dynamic = Object.assign(
            {},
            ...[
              typeof dynamicProps.style === 'function'
                ? dynamicProps.style(facts)
                : dynamicProps.style,
            ]
              .flat(Infinity)
              .filter(Boolean),
          )
          if (id === 'old') oldMismatches += Number(observed.padding !== selected.paddingTop)
          else {
            assert.equal(selected.paddingTop, observed.padding, `${id}/${mask}/static`)
            assert.equal(dynamic.paddingTop, observed.padding, `${id}/${mask}/generated`)
            observations++
          }
          await page.mouse.move(700, 500)
        }
      }
    }
    assert.equal(observations, includeNegated ? 268 : 256)
    assert.ok(oldMismatches > 0, 'the independent oracle detects legacy whole-input string order')
  } finally {
    await page.close()
  }
}

test('font-weight registration and custom theme values agree in actual Web, Native and generated outputs', {
  skip: !executablePath,
}, async () => {
  const names = [
    'font-bold',
    'font-normal',
    'p-4',
    'p-2',
    'focus:font-normal',
    'active:font-bold',
    'hover:focus:font-normal',
  ]
  const page = await browser.newPage()
  let observations = 0
  try {
    for (const [bold, normal] of [
      [700, 400],
      [900, 300],
    ]) {
      const css = `@theme {--spacing:.25rem;--app-bold:${bold};--font-weight-bold:var(--app-bold);--font-weight-normal:${normal};} @tailwind utilities;`
      const theme = await loadTheme(css, tailwindPackageDir())
      const themedCompiler = createCompiler(theme)
      const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
      const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
      const cache = openCandidateCache()
      cache.scanFile('fonts.ts', JSON.stringify(names.join(' ')), 0)
      const resolver = evaluate(
        cache.renderNativeModulePlan(context, theme).code.replace(/^import .*$/gm, ''),
        { createClassResolver },
      ).hozoClasses
      const sheet = (await compile(css)).build(names)
      for (const classes of [names.join(' '), [...names].reverse().join(' ')]) {
        const input = `import {Pressable} from '@hozo/core';export const Target=()=> <Pressable className="${classes}"/>`
        const web = themedCompiler.prepareWebModule(input).emit(context)[0]
        const native = themedCompiler.prepareNativeModule(input).emit(context).components[0]
        const props = evaluate(`const hozoStyles=${native.styles};module.exports=(${native.jsx})`, {
          HozoPressable: 'owner',
          Pressable: 'owner',
          h: (_type, props) => props,
        })
        assert.equal(typeof props.hozoTextStyle, 'function')
        await page.setContent(
          `<!doctype html><style>${sheet}\n${web.css}</style><button id="upstream" class="${classes}">Label</button><button id="compiled" class="hozo-0">Label</button>`,
        )
        for (const id of ['upstream', 'compiled']) {
          await page.mouse.move(600, 600)
          await page.evaluate(() => document.activeElement?.blur())
          const owner = page.locator(`#${id}`)
          for (let stage = 0; stage < 4; stage++) {
            if (stage === 1) await owner.focus()
            if (stage === 2) await owner.hover()
            if (stage === 3) await page.mouse.down()
            try {
              const actual = await owner.evaluate((element) => ({
                weight: getComputedStyle(element).fontWeight,
                padding: getComputedStyle(element).paddingTop,
                state: {
                  focused: element.matches(':focus'),
                  hovered: element.matches(':hover'),
                  pressed: element.matches(':active'),
                },
              }))
              const label = Object.assign(
                {},
                ...[props.hozoTextStyle(actual.state)].flat(Infinity).filter(Boolean),
              )
              const dynamic = Object.assign({}, ...resolver(classes, actual.state))
              assert.equal(label.fontWeight, actual.weight, `${bold}/${id}/${stage}/static`)
              assert.equal(dynamic.fontWeight, actual.weight, `${bold}/${id}/${stage}/dynamic`)
              assert.equal(actual.padding, '16px')
              assert.equal(dynamic.paddingTop, 16)
              observations++
            } finally {
              if (stage === 3) await page.mouse.up()
            }
          }
        }
      }
    }
    assert.equal(observations, 32)
  } finally {
    await page.close()
  }
})

test('absolute text metrics preserve upstream defaults and explicit leading across all owner-state combinations', {
  skip: !executablePath,
}, async () => {
  const cases = [
    'text-xl text-lg',
    'text-lg leading-6',
    'text-lg hover:text-xl focus:leading-6 active:text-2xl',
    'text-lg focus:leading-6 active:leading-8 hover:focus:text-3xl',
    'text-lg tracking-[2px] tracking-[1px]',
  ]
  const names = [...new Set([...cases.flatMap((value) => value.split(' ')), 'p-4', 'p-2'])]
  const css = `${readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')}\n@tailwind utilities;`
  const theme = await loadTheme(css, tailwindPackageDir())
  const compiler = createCompiler(theme)
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const cache = openCandidateCache()
  cache.scanFile('metrics.ts', JSON.stringify(names.join(' ')), 0)
  const resolve = evaluate(
    cache.renderNativeModulePlan(context, theme).code.replace(/^import .*$/gm, ''),
    { createClassResolver, hozoTextMetricStyles },
  ).hozoClasses
  const sheet = (await compile(css)).build(names)
  const page = await browser.newPage()
  let observations = 0
  try {
    for (const value of cases)
      for (const classes of [
        `${value} p-4 p-2`,
        `p-2 p-4 ${value.split(' ').reverse().join(' ')}`,
      ]) {
        const source = `import {Pressable} from '@hozo/core';export const A=()=> <Pressable className="${classes}"/>`
        const web = compiler.prepareWebModule(source).emit(context)[0]
        const native = compiler.prepareNativeModule(source).emit(context).components[0]
        const props = evaluate(`const hozoStyles=${native.styles};module.exports=(${native.jsx})`, {
          Pressable: 'owner',
          HozoPressable: 'owner',
          Text: 'label',
          HozoText: 'label',
          h: (_type, props) => props,
        })
        await page.setContent(
          `<!doctype html><style>${sheet}\n${web.css}</style><button id="upstream" class="${classes}">Label</button><button id="compiled" class="hozo-0">Label</button>`,
        )
        for (const id of ['upstream', 'compiled']) {
          const owner = page.locator(`#${id}`)
          for (const focused of [false, true])
            for (const hovered of [false, true])
              for (const pressed of [false, true]) {
                await page.mouse.up()
                await page.evaluate(() => document.activeElement?.blur())
                if (focused) await owner.focus()
                if (hovered || pressed) await owner.hover()
                else await page.mouse.move(600, 600)
                if (pressed) await page.mouse.down()
                try {
                  const actual = await owner.evaluate((element) => ({
                    size: parseFloat(getComputedStyle(element).fontSize),
                    line: parseFloat(getComputedStyle(element).lineHeight),
                    tracking: getComputedStyle(element).letterSpacing,
                    state: {
                      focused: element.matches(':focus'),
                      hovered: element.matches(':hover'),
                      pressed: element.matches(':active'),
                    },
                  }))
                  const label =
                    typeof props.hozoTextStyle === 'function'
                      ? props.hozoTextStyle(actual.state)
                      : props.hozoTextStyle
                  const selected = Object.assign({}, ...[label].flat(Infinity).filter(Boolean))
                  const dynamic = Object.assign({}, ...resolve(classes, actual.state))
                  for (const [key, expected] of [
                    ['fontSize', actual.size],
                    ['lineHeight', actual.line],
                  ]) {
                    assert.equal(
                      selected[key],
                      expected,
                      `${id}/${classes}/${JSON.stringify(actual.state)}/static/${key}`,
                    )
                    assert.equal(
                      dynamic[key],
                      expected,
                      `${id}/${classes}/${JSON.stringify(actual.state)}/dynamic/${key}`,
                    )
                  }
                  if (actual.tracking !== 'normal') {
                    assert.equal(selected.letterSpacing, parseFloat(actual.tracking))
                    assert.equal(dynamic.letterSpacing, parseFloat(actual.tracking))
                  }
                  observations++
                } finally {
                  await page.mouse.up()
                }
              }
        }
      }
    assert.equal(observations, 160)
  } finally {
    await page.close()
  }
})

test('the canonical-order reference has independent browser winners under reversed classes and RTL', {
  skip: !executablePath,
}, async () => {
  const { css } = await prepareOrderReference()
  const page = await browser.newPage()
  try {
    for (const entry of orderCases)
      for (const dir of ['ltr', 'rtl'])
        for (const classes of [entry.classes, entry.classes.split(' ').reverse().join(' ')]) {
          await page.setContent(
            `<html dir="${dir}"><style>${css}\nbutton { appearance:none; border:0; padding:0; }</style><button class="${classes}">Label</button></html>`,
          )
          if (entry.state) await page.locator('button').hover()
          if (entry.state === 'active') await page.mouse.down()
          const actual = await page.locator('button').evaluate((node, keys) => {
            const style = getComputedStyle(node)
            return Object.fromEntries(keys.map((key) => [key, style[key]]))
          }, Object.keys(entry.expected))
          if (entry.state === 'active') await page.mouse.up()
          assert.deepEqual(actual, entry.expected, `${entry.id}/${dir}/${classes}`)
        }
  } finally {
    await page.close()
  }
})

test('canonical-order baseline records current Hozo divergences without claiming they conform', {
  skip: !executablePath,
}, async () => {
  const baseline = await prepareOrderSubjects()
  const expectedPage = await browser.newPage(),
    actualPage = await browser.newPage()
  const cells = []
  let measurementValid = false
  let failure
  let stage = 'start'
  const capturedAt = new Date().toISOString()
  try {
    for (const subject of baseline.subjects)
      for (const dir of ['ltr', 'rtl']) {
        stage = `${subject.id}/${dir}/${subject.classes}`
        await expectedPage.setContent(
          `<html dir="${dir}"><style>${baseline.reference.css}</style><button class="${subject.classes}">Label</button></html>`,
        )
        const html = renderToStaticMarkup(
          evaluate(`module.exports=(${subject.web.jsx})`, { h: createElement }),
        )
        const variants = [
          ['staticWeb', subject.web.css, html, '[data-testid="order-probe"]'],
          [
            'defaultCandidates',
            baseline.defaultCss,
            `<button class="${subject.classes}">Label</button>`,
            'button',
          ],
          [
            'projectOrderedCandidates',
            baseline.orderedCss,
            `<button class="${subject.classes}">Label</button>`,
            'button',
          ],
        ]
        const keys = Object.keys(subject.expected)
        for (const [route, css, markup, selector] of variants) {
          await actualPage.setContent(`<html dir="${dir}"><style>${css}</style>${markup}</html>`)
          if (subject.state) {
            await expectedPage.locator('button').hover()
            await actualPage.locator(selector).hover()
          }
          if (subject.state === 'active') {
            await expectedPage.mouse.down()
            await actualPage.mouse.down()
          }
          const read = (page, target) =>
            page.locator(target).evaluate((node, keys) => {
              const style = getComputedStyle(node)
              return Object.fromEntries(keys.map((key) => [key, style[key]]))
            }, keys)
          const expected = await read(expectedPage, 'button')
          assert.deepEqual(expected, subject.expected, `oracle ${subject.id}`)
          const actual = await read(actualPage, selector)
          if (subject.state === 'active') {
            await expectedPage.mouse.up()
            await actualPage.mouse.up()
          }
          cells.push({
            id: subject.id,
            classes: subject.classes,
            dir,
            route,
            expected,
            actual,
            diagnostics: subject.web.diagnostics,
          })
        }
        for (const [route, raw] of [
          ['staticNative', dir === 'rtl' ? subject.rtl.selected : subject.native.selected],
          ['nativeCandidates', dir === 'rtl' ? subject.rtl.fallback : subject.fallback],
        ])
          cells.push({
            id: subject.id,
            classes: subject.classes,
            dir,
            route,
            expected: subject.expected,
            actual: projectOrderNative(raw, keys, dir),
            raw,
            diagnostics: subject.native.diagnostics,
          })
      }
    assert.equal(cells.length, orderCases.length * 2 * 2 * 5)
    measurementValid = true
  } catch (error) {
    failure = { stage, message: String(error) }
    throw error
  } finally {
    const destination = fileURLToPath(
      new URL('../../../artifacts/tailwind-order/browser-baseline.json', import.meta.url),
    )
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(
      destination,
      `${JSON.stringify({ schema: 1, capturedAt, provenance: baseline.provenance, reference: baseline.reference.snapshot, measurementValid, failure, note: 'Selected Native scalar projection, not device pixels/AT. Mismatches are observations, not conformance passes.', summary: summarizeOrderCells(cells), cells }, null, 2)}\n`,
    )
    await expectedPage.close()
    await actualPage.close()
  }
})

test('Web candidate container branches preserve Tailwind cascade across breakpoints', {
  skip: !executablePath,
}, async () => {
  const cases = [
    'container',
    'container max-w-5xl',
    'container md:max-w-none',
    'container lg:max-w-xs',
    'container w-auto',
  ]
  const css = `${readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')}\n@tailwind utilities;`
  const names = [...new Set(cases.flatMap((value) => value.split(' ')))]
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const cache = openCandidateCache()
  cache.scanFile('container-candidates.ts', JSON.stringify(names.join(' ')), 1)
  const upstreamOrder = prepared.classOrder(cache.candidates())
  const sheets = [
    (await compile(css)).build(names),
    cache.renderCss(),
    cache.renderCss(undefined, upstreamOrder),
    cache.renderCss(undefined, upstreamOrder.toReversed()),
  ]
  const page = await browser.newPage()
  let reversedDifferences = 0
  try {
    for (const width of [500, 700, 900, 1100, 1400, 1700]) {
      await page.setViewportSize({ width, height: 300 })
      const orders = cases.flatMap((value) => [value, value.split(' ').toReversed().join(' ')])
      for (const marker of ['', 'hozo-candidate-owner ']) {
        const read = async (sheet) => {
          await page.setContent(
            `<!doctype html><style>body { margin: 0; }${sheet}</style>${orders.map((value) => `<main class="${marker}${value}"></main>`).join('')}`,
          )
          return page.locator('main').evaluateAll((nodes) =>
            nodes.map((node) => {
              const { width, maxWidth } = getComputedStyle(node)
              return [width, maxWidth]
            }),
          )
        }
        const expected = await read(sheets[0])
        assert.deepEqual(await read(sheets[1]), expected, `built-in/${width}/${marker}`)
        assert.deepEqual(await read(sheets[2]), expected, `captured/${width}/${marker}`)
        const reversed = await read(sheets[3])
        reversedDifferences += reversed.filter(
          ([value, max], index) => value !== expected[index][0] || max !== expected[index][1],
        ).length
      }
    }
    assert.ok(reversedDifferences > 0, 'the same rules emitted in reverse order change the cascade')
  } finally {
    await page.close()
  }
})

async function authoredOwnerContext(classes) {
  const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
  const { snapshot } = await prepareTailwindOrder(
    css,
    tailwindPackageDir(),
    classes.trim().split(/\s+/),
  )
  return prepareAuthoredTailwindContext(JSON.stringify(snapshot))
}

test('Web leaves authored conjunction specificity to the browser', {
  skip: !executablePath,
}, async () => {
  const classes = 'hover:focus:p-2 active:p-4 columns-(--layout)'
  const result = compiler
    .prepareWebModule(
      `import {Button} from '@hozo/core';const el=<Button className="${classes}">Target</Button>`,
    )
    .emit(await authoredOwnerContext(classes))[0]
  assert.match(result.css, /:hover:focus[\s\S]*:active/)
  const html = renderToStaticMarkup(
    evaluate(`module.exports=(${result.jsx})`, { h: createElement }),
  )
  const css = (await compile('@theme { --spacing: 0.25rem; } @tailwind utilities;')).build(
    classes.split(' '),
  )
  const page = await browser.newPage()
  const oracle = await browser.newPage()
  try {
    await page.setContent(`<style>${result.css}</style>${html}`)
    await oracle.setContent(`<style>${css}</style><button class="${classes}">Target</button>`)
    for (const target of [page, oracle]) {
      const button = target.getByRole('button', { name: 'Target' })
      await button.hover()
      await target.mouse.down()
      const state = await button.evaluate((el) => ({
        overlap: el.matches(':hover:focus:active'),
        padding: getComputedStyle(el).paddingTop,
      }))
      assert.deepEqual(state, { overlap: true, padding: '8px' })
      await target.mouse.up()
    }
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('authored output keeps repeated owner guards in CSS order', {
  skip: !executablePath,
}, async () => {
  const classes = 'hover:p-2 active:p-4 hover:p-6 columns-(--layout)'
  const result = compiler
    .prepareWebModule(
      `import {Button} from '@hozo/core';const el=<Button className="${classes}">Target</Button>`,
    )
    .emit(await authoredOwnerContext(classes))[0]
  const html = renderToStaticMarkup(
    evaluate(`module.exports=(${result.jsx})`, { h: createElement }),
  )
  // This is the explicit authored control, not the classified default.
  const reference =
    'button:hover {padding:8px} button:active {padding:16px} button:hover {padding:24px}'
  const page = await browser.newPage()
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    for (const [css, markup] of [
      [reference, '<button>Target</button>'],
      [result.css, html],
    ]) {
      await page.setContent(`<style>${css}</style>${markup}`)
      const { root } = await cdp.send('DOM.getDocument')
      const { nodeId } = await cdp.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: 'button',
      })
      assert.ok(nodeId)
      for (const [forcedPseudoClasses, padding] of [
        [['active'], '16px'],
        [['hover'], '24px'],
        [['hover', 'active'], '24px'],
      ]) {
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses })
        assert.equal(
          await page.locator('button').evaluate((el) => getComputedStyle(el).paddingTop),
          padding,
          forcedPseudoClasses.join(':'),
        )
      }
    }
  } finally {
    await page.close()
  }
})

async function assertRepeatedOwnerRegisters({ classes, reference, property, values }) {
  const result = compiler
    .prepareWebModule(
      `import {Button} from '@hozo/core';const el=<Button className="${classes}">Target</Button>`,
    )
    .emit(await authoredOwnerContext(classes))[0]
  const html = renderToStaticMarkup(
    evaluate(`module.exports=(${result.jsx})`, { h: createElement }),
  )
  const page = await browser.newPage()
  try {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    for (const [css, markup] of [
      [reference, '<button>Target</button>'],
      [result.css, html],
    ]) {
      await page.setContent(`<style>${css}</style>${markup}`)
      const { root } = await cdp.send('DOM.getDocument')
      const { nodeId } = await cdp.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: 'button',
      })
      assert.ok(nodeId)
      for (const [index, forcedPseudoClasses] of [
        ['active'],
        ['hover'],
        ['hover', 'active'],
        [],
      ].entries()) {
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses })
        assert.equal(
          await page.locator('button').evaluate((el, name) => getComputedStyle(el)[name], property),
          values[index],
          forcedPseudoClasses.join(':'),
        )
      }
    }
  } finally {
    await page.close()
  }
}

test('authored gap and logical edge writes retain repeated owner runs', {
  skip: !executablePath,
}, async () => {
  for (const [classes, property, css, resting] of [
    ['hover:p-2 active:p-4 hover:p-6 hover:gap-2', 'paddingTop', 'padding-top', '1px'],
    ['hover:gap-x-2 active:gap-x-4 hover:gap-x-6', 'columnGap', 'column-gap', 'normal'],
    ['hover:px-2 active:px-4 hover:ps-6', 'paddingInlineStart', 'padding-inline-start', '6px'],
  ]) {
    await assertRepeatedOwnerRegisters({
      classes: `${classes} columns-(--layout)`,
      reference: `
        button { ${css}: ${resting}; }
        button:hover { ${css}: 8px; }
        button:active { ${css}: 16px; }
        button:hover { ${css}: 24px; }
      `,
      property,
      values: ['16px', '24px', '24px', resting],
    })
  }
})

test('an unknown owner write keeps repeated metric runs without losing explicit leading', {
  skip: !executablePath,
}, async () => {
  const css = `${readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')}
    @tailwind utilities;
    @theme { --color-brand: #123456; }
    @utility bg-brand { background-color: #abcdef; }
    @utility text-xl { font-size: 20px; }
    @utility text-2xl { font-size: 24px; }
    @utility leading-8 { line-height: 32px; }`
  const theme = await loadTheme(css, tailwindPackageDir())
  const local = createCompiler(theme)
  const cases = [
    'hover:text-lg active:text-2xl hover:text-xl',
    'hover:leading-6 active:leading-8 hover:leading-7 hover:text-xl',
    'active:leading-8 hover:text-xl active:leading-6',
    'active:leading-8 hover:text-xl hover:focus:leading-6',
  ]
  const names = [
    ...new Set(cases.flatMap((classes) => classes.split(' '))),
    'text-sm',
    'bg-brand',
    'hover:mt-2',
    'hover:bg-brand',
  ]
  const { snapshot } = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const final = prepareFinalTailwindContext(JSON.stringify(snapshot))
  const cache = openCandidateCache()
  cache.scanFile('metric-fallback.ts', JSON.stringify(names.join(' ')), 1)
  const candidates = cache.renderNativeModulePlan(final, theme)
  assert.equal(candidates.ordering.ranks['bg-brand'], undefined)
  assert.equal(candidates.ordering.ranks['hover:text-xl'], undefined)
  assert.equal(
    candidates.entries.find((entry) => entry.candidate === 'bg-brand').groups[0].writes[0].reason,
    'ambiguous-property-owner',
  )
  const candidateCode = candidates.code.replace(/^import .*$/gm, '')
  const resolve = evaluate(candidateCode, {
    hozoTextMetricStyles,
    // Exercise Native specificity on its own. Leaving the compact ranks in
    // this control also activates the production assessed-run projection.
    createClassResolver: (plan) =>
      createClassResolver(plan.styles, plan.unsupported, plan.compose, plan.states, plan.ambient),
  }).hozoClasses
  const metrics = (style) => {
    const { fontSize, lineHeight } = Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
    return [fontSize, lineHeight]
  }
  assert.deepEqual(
    metrics(
      resolve(`text-sm ${cases[0]} bg-brand`, { hovered: true, pressed: true, focused: false }),
    ),
    [20, 28],
  )
  // Ambiguous active and hover metric owners pin the authored boundary.
  // The independent CSS checks the declarations Hozo can project.
  const rules = {
    'hover:text-lg': ':hover { font-size: 18px; line-height: var(--tw-leading, 28px) }',
    'hover:text-xl': ':hover { font-size: 20px; line-height: var(--tw-leading, 28px) }',
    'active:text-2xl': ':active { font-size: 24px; line-height: var(--tw-leading, 32px) }',
    'hover:leading-6': ':hover { --tw-leading: 24px; line-height: 24px }',
    'hover:leading-7': ':hover { --tw-leading: 28px; line-height: 28px }',
    'active:leading-6': ':active { --tw-leading: 24px; line-height: 24px }',
    'active:leading-8': ':active { --tw-leading: 32px; line-height: 32px }',
    'hover:focus:leading-6': ':hover:focus { --tw-leading: 24px; line-height: 24px }',
  }
  const page = await browser.newPage()
  try {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    for (const authored of cases)
      for (const classes of [authored, authored.split(' ').toReversed().join(' ')]) {
        const input = `text-sm ${classes} bg-brand`
        const source = `import { Pressable } from '@hozo/core'; const el=<Pressable className="${input}"/>`
        const native = local.prepareNativeModule(source).emit(final).components[0]
        const { hozoTextStyle } = evaluate(
          `const hozoStyles=${native.styles};module.exports=(${native.jsx})`,
          { HozoPressable: 'host', Pressable: 'host', h: (_type, props) => props },
        )
        const web = local.prepareWebModule(source).emit(final)[0]
        const { className } = evaluate(`module.exports=(${web.jsx})`, {
          h: (_type, props) => props,
        })
        const reference = [
          '#oracle { font-size: 14px; line-height: var(--tw-leading, 20px) }',
          ...classes.split(' ').map((name) => `#oracle${rules[name]}`),
        ].join('\n')
        await page.setContent(`<!doctype html><style>${reference}\n${web.css}</style>
          <button id="oracle">Label</button><button id="compiled" class="${className}">Label</button>`)
        const { root } = await cdp.send('DOM.getDocument')
        const ids = await Promise.all(
          ['#oracle', '#compiled'].map((selector) =>
            cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector }),
          ),
        )
        for (const hovered of [false, true])
          for (const pressed of [false, true])
            for (const focused of [false, true]) {
              const state = { hovered, pressed, focused }
              const forcedPseudoClasses = [
                hovered && 'hover',
                pressed && 'active',
                focused && 'focus',
              ].filter(Boolean)
              for (const { nodeId } of ids)
                await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses })
              const [expected, compiled] = await page.locator('button').evaluateAll((buttons) =>
                buttons.map((button) => {
                  const style = getComputedStyle(button)
                  return [parseFloat(style.fontSize), parseFloat(style.lineHeight)]
                }),
              )
              const label = `${input}/${forcedPseudoClasses.join(':')}`
              assert.deepEqual(compiled, expected, `${label}/web`)
              assert.deepEqual(metrics(hozoTextStyle(state)), expected, `${label}/native`)
              assert.deepEqual(
                metrics(resolve(input, state)),
                expected,
                `${label}/specificity-only`,
              )
            }
      }
  } finally {
    await page.close()
  }
})

test('authored font weight and family retain repeated owner runs in Web and Native', {
  skip: !executablePath,
}, async () => {
  // Compare the explicit authored path to independent declaration order.
  const cases = [
    ['hover:font-bold', ':hover', 'font-weight:700'],
    ['active:font-medium', ':active', 'font-weight:500'],
    ['hover:font-normal', ':hover', 'font-weight:400'],
    ['hover:font-sans', ':hover', 'font-family: Arial'],
    ['active:font-mono', ':active', 'font-family: Courier'],
    ['hover:font-serif', ':hover', 'font-family: Georgia'],
  ]
  const local = createCompiler({
    colors: [],
    fontFamilies: [
      { name: 'sans', web: 'Arial', value: 'Arial' },
      { name: 'mono', web: 'Courier', value: 'Courier' },
      { name: 'serif', web: 'Georgia', value: 'Georgia' },
    ],
  })
  const page = await browser.newPage()
  try {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    for (const input of [cases, cases.toReversed()]) {
      const classes = input.map(([name]) => name).join(' ')
      const source = `import { Pressable,Text } from '@hozo/core';const el=<Pressable><Text className="${classes} columns-(--layout)"/></Pressable>`
      const authored = await authoredOwnerContext(`${classes} columns-(--layout)`)
      const web = local.prepareWebModule(source).emit(authored)[0]
      const native = local.prepareNativeModule(source).emit(authored).components[0]
      const getChild = (_type, props, child) => child ?? props
      const { className } = evaluate(`module.exports=(${web.jsx})`, { h: getChild })
      const { style: selectStyle } = evaluate(
        `const hozoStyles=${native.styles}; module.exports=(${native.jsx})`,
        { HozoPressable: 'host', HozoText: 'text', h: getChild },
      )
      await page.setContent(`<!doctype html><style>
        ${input.map(([, guard, declaration]) => `#oracle${guard}{${declaration}}`).join('\n')}
        ${web.css}
        </style><button id="oracle"></button><button id="compiled" class="${className}"></button>`)
      const { root } = await cdp.send('DOM.getDocument')
      const ids = []
      for (const selector of ['#oracle', '#compiled'])
        ids.push((await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })).nodeId)
      for (const [hovered, pressed] of [
        [true, true],
        [true, false],
        [false, true],
      ]) {
        const forcedPseudoClasses = [hovered && 'hover', pressed && 'active'].filter(Boolean)
        for (const nodeId of ids)
          await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses })
        const [expected, actual] = await page.locator('button').evaluateAll((nodes) =>
          nodes.map((node) => {
            const { fontFamily, fontWeight } = getComputedStyle(node)
            return [fontFamily, fontWeight]
          }),
        )
        const style = Object.assign({}, ...selectStyle({ hovered, pressed }).filter(Boolean))
        assert.deepEqual(actual, expected, classes)
        assert.deepEqual([style.fontFamily, style.fontWeight], expected, classes)
      }
    }
  } finally {
    await page.close()
  }
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

test('real Web Chip and Tailwind preserve row and removal typography at their actual owners', {
  skip: !executablePath,
}, async (t) => {
  const classes =
    'p-4 text-[#1355bb] text-[18px] hover:text-[#00aa00] active:text-[#cc0000] focus:font-semibold'
  const removalClasses = 'p-2 focus:text-[#eecc00] active:font-bold'
  const css = (
    await compile(
      '@theme { --spacing: .25rem; --font-weight-semibold: 600; --font-weight-bold: 700; } @tailwind utilities;',
    )
  ).build(`${classes} ${removalClasses}`.split(' '))
  // Actual Web pattern plus Tailwind, not Hozo lowering or the inheritance
  // reference. Browser UA button resets are an explicit preflight assumption.
  const fixture = await build({
    stdin: {
      contents: `import {createElement as h,memo,useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {HozoChip} from ${JSON.stringify(fileURLToPath(new URL('../../../packages/patterns/src/chip.tsx', import.meta.url)))};
      const root=createRoot(document.getElementById('root'));let next=0;
      const Leaf=memo(({id,own})=>{const [token]=useState(()=>++next);return h('span',{id,style:own,'data-token':token},id)});
      window.removed=[];window.changed=[];const remove=()=>window.removed.push(true),change=(value)=>window.changed.push(value);
      window.renderChip=({selectable,removable,host,childOwn,disabled})=>{
        flushSync(()=>root.render(h('main',{style:{...host,lineHeight:host.lineHeight+'px'}},h('div',{id:'chip'},h(HozoChip,{defaultSelected:selectable?false:undefined,onSelectedChange:selectable?change:undefined,onRemove:removable?remove:undefined,disabled,accessibilityLabel:'Filter',className:${JSON.stringify(classes)},removeClassName:${JSON.stringify(removalClasses)},removeIcon:h(Leaf,{id:'icon',own:childOwn})},h(Leaf,{id:'label'}))))));
        const owner=document.getElementById('chip').firstElementChild;owner.id='owner';
        const removal=owner.querySelector('button[aria-label="Remove Filter"]');if(removal)removal.id='remove';
      };`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    },
    bundle: true,
    write: false,
    metafile: true,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  assert.ok(
    Object.keys(fixture.metafile.inputs).some((file) => file.endsWith('patterns/src/chip.tsx')),
  )
  const rest = {
    color: '#112233',
    fontSize: 20,
    fontWeight: '400',
    lineHeight: 28,
    letterSpacing: 1,
    textAlign: 'left',
    textTransform: 'uppercase',
  }
  for (const selectable of [false, true]) {
    for (const removable of [false, true]) {
      const page = await browser.newPage()
      let host = rest,
        rowOwn,
        removeOwn,
        childOwn,
        stages = 0
      try {
        await page.setContent(`<!doctype html><style>
          button { font:inherit; color:inherit; letter-spacing:inherit; text-align:inherit; text-transform:inherit; }
          ${css}</style><div id="root"></div>`)
        await page.addScriptTag({ content: fixture.outputFiles[0].text })
        await page.mouse.move(600, 400)
        const update = async () => {
          await page.evaluate(
            ({ selectable, removable, host, childOwn }) => {
              window.renderChip({ selectable, removable, host, childOwn })
            },
            { selectable, removable, host, childOwn },
          )
        }
        const setOwn = async (selector, style) => {
          await page.locator(selector).evaluate((node, own) => {
            node.removeAttribute('style')
            for (const [key, value] of Object.entries(own ?? {}))
              node.style[key] = typeof value === 'number' ? `${value}px` : value
          }, style)
        }
        const read = (selector) =>
          page.locator(selector).evaluate((node) => {
            const style = getComputedStyle(node)
            return {
              color:
                '#' +
                style.color
                  .match(/\d+/g)
                  .map((part) => Number(part).toString(16).padStart(2, '0'))
                  .join(''),
              fontSize: parseFloat(style.fontSize),
              fontWeight: style.fontWeight,
              lineHeight: parseFloat(style.lineHeight),
              letterSpacing: parseFloat(style.letterSpacing),
              textAlign: style.textAlign,
              textTransform: style.textTransform,
            }
          })
        const check = async (rowState = {}, removeState = {}) => {
          const frame = { ...host, color: '#1355bb', fontSize: 18, ...rowState, ...rowOwn }
          assert.deepEqual(await read('#label'), frame)
          if (removable) {
            assert.deepEqual(await read('#icon'), {
              ...frame,
              ...removeState,
              ...removeOwn,
              ...childOwn,
            })
            assert.equal(
              await page
                .locator('#icon')
                .evaluate((node) => node.closest('[aria-hidden]')?.getAttribute('aria-hidden')),
              'true',
            )
          }
          assert.equal(
            await page.locator('#chip button').count(),
            Number(selectable) + Number(removable),
          )
          assert.equal(
            await page.locator('#label').evaluate((node) => node === window.firstLabel),
            true,
          )
          if (removable)
            assert.equal(
              await page.locator('#icon').evaluate((node) => node === window.firstIcon),
              true,
            )
          stages++
        }
        await update()
        await page.evaluate(() => {
          window.firstLabel = document.getElementById('label')
          window.firstIcon = document.getElementById('icon')
        })
        await check()
        if (removable) {
          await page.locator('#remove').focus()
          await check({}, { color: '#eecc00' })
          await page.locator('#remove').hover()
          await check({ color: '#00aa00' }, { color: '#eecc00' })
          await page.mouse.down()
          await check({ color: '#cc0000' }, { color: '#eecc00', fontWeight: '700' })
          await page.mouse.up()
          await check({ color: '#00aa00' }, { color: '#eecc00' })
          assert.deepEqual(await page.evaluate(() => window.removed), [true])
          assert.deepEqual(await page.evaluate(() => window.changed), [])
          await page.mouse.move(600, 400)
          await page.locator('#remove').evaluate((node) => node.blur())
          await check()
        }
        if (selectable) {
          const toggle = page.locator('#chip button[aria-pressed]')
          await toggle.focus()
          // A composite row is not focused merely because its toggle is.
          const focused = removable ? {} : { fontWeight: '600' }
          await check(focused)
          await page.keyboard.press('Space')
          assert.deepEqual(await page.evaluate(() => window.changed), [true])
          assert.equal(await toggle.getAttribute('aria-pressed'), 'true')
          assert.deepEqual(await page.evaluate(() => window.removed), removable ? [true] : [])
          await check(focused)
          await toggle.evaluate((node) => node.blur())
          await check()
        }
        host = { ...rest, color: '#334455', fontSize: 28, lineHeight: 40 }
        await update()
        await check()
        rowOwn = { color: '#abcdef', fontSize: 30 }
        await setOwn('#owner', rowOwn)
        if (removable) {
          removeOwn = { color: '#ff00aa', fontSize: 12 }
          await setOwn('#remove', removeOwn)
        }
        await check()
        childOwn = { color: '#222222', fontSize: 10 }
        await update()
        await check()
        childOwn = undefined
        rowOwn = undefined
        removeOwn = undefined
        await setOwn('#owner')
        if (removable) await setOwn('#remove')
        await update()
        await check()
        assert.equal(stages, 5 + Number(selectable) * 3 + Number(removable) * 5)
        t.diagnostic(
          `Chip selectable=${selectable}, removable=${removable}: ${stages} browser stages`,
        )
      } finally {
        await page.close()
      }
    }
  }
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

test('the real Web portal inherits destination typography instead of the React opener', {
  skip: !executablePath,
}, async () => {
  const fixture = await build({
    stdin: {
      contents: `import {createElement as h,useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {Portal,PortalProvider} from ${JSON.stringify(fileURLToPath(new URL('../../../packages/behaviors/src/portal.tsx', import.meta.url)))};
      const root=createRoot(document.getElementById('root'));let next=0;
      function Label({own}){const [token]=useState(()=>++next);return h('span',{id:'label',style:own,'data-token':token},'Label',h('span',{id:'small',style:{fontSize:(5/6)+'em'}},'Small'))}
      window.renderPortal=({opener,own,disabled,custom})=>flushSync(()=>root.render(h('div',{id:'opener',style:{...opener,lineHeight:String(opener.lineHeight)+'px'}},h(PortalProvider,{container:custom?document.getElementById('destination'):null},h(Portal,{disabled},h(Label,{own}))))));`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const rest = {
    color: '#112233',
    fontSize: 20,
    fontWeight: '400',
    lineHeight: 28,
    letterSpacing: 1,
    textAlign: 'left',
    textTransform: 'uppercase',
  }
  const next = { ...rest, color: '#334455', fontSize: 28, lineHeight: 40 }
  for (const [custom, disabled] of [
    [true, false],
    [false, false],
    [true, true],
  ]) {
    const page = await browser.newPage()
    try {
      await page.setContent('<!doctype html><div id="root"></div><div id="destination"></div>')
      await page.addScriptTag({ content: fixture.outputFiles[0].text })
      let host = rest,
        opener = { ...rest, color: '#abcdef', fontSize: 30 },
        own
      const update = async () => {
        await page.evaluate(
          ({ host, opener, own, custom, disabled }) => {
            for (const element of [document.body, document.getElementById('destination')]) {
              for (const [key, value] of Object.entries(host))
                element.style[key] = typeof value === 'number' ? `${value}px` : value
            }
            window.renderPortal({ opener, own, custom, disabled })
          },
          { host, opener, own, custom, disabled },
        )
        await page.locator('#label').waitFor()
      }
      const check = async () => {
        const expected = { ...(disabled ? opener : host), ...own }
        const actual = await page.locator('#label').evaluate((node) => {
          const style = getComputedStyle(node)
          const color =
            '#' +
            style.color
              .match(/\d+/g)
              .map((part) => Number(part).toString(16).padStart(2, '0'))
              .join('')
          return {
            color,
            fontSize: parseFloat(style.fontSize),
            fontWeight: style.fontWeight,
            lineHeight: parseFloat(style.lineHeight),
            letterSpacing: parseFloat(style.letterSpacing),
            textAlign: style.textAlign,
            textTransform: style.textTransform,
          }
        })
        assert.deepEqual(actual, expected)
        const identity = await page
          .locator('#label')
          .evaluate((node) => [node === window.firstLabel, node.dataset.token])
        assert.equal(identity[0], true)
        assert.equal(identity[1], '1')
        assert.equal(
          await page
            .locator('#small')
            .evaluate((node) => Math.round(parseFloat(getComputedStyle(node).fontSize))),
          Math.round((expected.fontSize * 5) / 6),
        )
        assert.equal(
          await page.locator('#label').evaluate((node) => Boolean(node.closest('#opener'))),
          disabled,
        )
        assert.equal(
          await page.locator('#label').evaluate((node) => Boolean(node.closest('#destination'))),
          custom && !disabled,
        )
      }
      await update()
      await page.evaluate(() => {
        window.firstLabel = document.getElementById('label')
      })
      await check()
      opener = { ...opener, color: '#eecc00', fontSize: 42 }
      await update()
      await check()
      host = next
      await update()
      await check()
      own = { color: '#abcdef', fontSize: 30 }
      await update()
      await check()
      own = undefined
      await update()
      await check()
    } finally {
      await page.close()
    }
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
    await page.waitForFunction(
      () => {
        const textarea = document.querySelector('textarea')
        return textarea?.matches(':disabled') && !textarea.matches(':focus')
      },
      null,
      { timeout: 2000 },
    )
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
    await page.waitForFunction(
      () => {
        const select = document.querySelector('select')
        return select?.matches(':disabled') && !select.matches(':focus')
      },
      null,
      { timeout: 2000 },
    )
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

test('the real Web Calendar separates group, header and table typography without borrowing disabled', {
  skip: !executablePath,
}, async () => {
  const source = (relative) =>
    fileURLToPath(new URL(`../../../${relative}`, import.meta.url)).replaceAll('\\', '/')
  const chrome = {
    className: 'p-2 text-[#123456] font-bold disabled:opacity-25',
    headerClassName: 'p-3 text-[14px] text-[#abcdef] disabled:opacity-25',
    gridClassName: 'p-4 text-[18px] disabled:opacity-25',
  }
  const monthClasses =
    'enabled:border-2 disabled:opacity-25 aria-selected:outline-4 aria-disabled:mt-8 hover:bg-[#dd1100] focus:opacity-75 focus-visible:font-bold active:opacity-50'
  const dayClasses =
    'p-2 aria-selected:border-2 aria-disabled:opacity-25 data-[hozo-range-start]:border-4 data-[hozo-range-end]:border-4 data-[hozo-in-range]:opacity-75 data-[hozo-outside]:opacity-50 disabled:mt-8 enabled:mb-8 focus:font-bold hover:underline data-[hozo-disabled]:hover:no-underline'
  const fixture = await build({
    stdin: {
      contents: `import {createElement} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {HozoCalendar} from ${JSON.stringify(source('packages/form/src/calendar.tsx'))};
      const root = createRoot(document.getElementById('root'));
      window.calendarChanges = [];
      window.renderCalendar = (props = {}) => flushSync(() => root.render(createElement(HozoCalendar, {onChange:value => window.calendarChanges.push(value),defaultMonth:{year:2026,month:6},today:{year:2026,month:6,day:15},locale:'en-US',weeks:6,min:{year:2026,month:6,day:1},max:{year:2026,month:6,day:30},...${JSON.stringify(chrome)}, ...props})));
      window.renderCalendar();`,
      resolveDir: source('examples/storybook-demo'),
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'calendar-web-i18n',
        setup(builder) {
          builder.onResolve({ filter: /^@hozo\/behaviors$/ }, () => ({
            path: source('packages/behaviors/src/i18n.ts'),
          }))
        },
      },
    ],
  })
  const css = (
    await compile('@theme { --spacing: .25rem; --font-weight-bold:700; } @tailwind utilities;')
  ).build([...Object.values(chrome), monthClasses, dayClasses].flatMap((value) => value.split(' ')))
  const page = await browser.newPage()
  try {
    // Actual Tailwind Preflight in standards mode, like the application.
    // Quirks mode gives tables legacy color behavior unrelated to Hozo.
    const preflight = readFileSync(
      fileURLToPath(import.meta.resolve('tailwindcss/preflight.css')),
      'utf8',
    )
    await page.setContent(`<!doctype html><style>${preflight}\n${css}</style><div id="root"></div>`)
    assert.equal(await page.evaluate(() => document.compatMode), 'CSS1Compat')
    await page.addScriptTag({ content: fixture.outputFiles[0].text })
    const root = page.locator('[role="group"]')
    const header = root.locator(':scope > div')
    const grid = root.locator('table')
    for (const [owner, padding] of [
      [root, '8px'],
      [header, '12px'],
      [grid, '16px'],
    ]) {
      assert.deepEqual(
        await owner.evaluate((element) => {
          const s = getComputedStyle(element)
          return [
            element.matches(':disabled'),
            element.matches(':enabled'),
            element.matches(':read-only'),
            s.paddingTop,
            s.opacity,
          ]
        }),
        [false, false, true, padding, '1'],
      )
    }
    assert.equal(await header.locator('button:disabled').count(), 2)
    const read = (locator) =>
      locator.evaluate((element) => {
        const s = getComputedStyle(element)
        return [s.color, s.fontSize, s.fontWeight]
      })
    assert.deepEqual(await read(header.locator('[aria-live]')), [
      'rgb(171, 205, 239)',
      '14px',
      '700',
    ])
    assert.deepEqual(await read(grid.locator('th').first()), ['rgb(18, 52, 86)', '18px', '700'])
    assert.deepEqual(await read(grid.locator('td').first()), ['rgb(18, 52, 86)', '18px', '700'])
    assert.equal(await grid.locator('td').count(), 42)
    await page.evaluate(
      (classes) =>
        window.renderCalendar({
          max: { year: 2026, month: 8, day: 31 },
          monthButtonClassName: classes,
        }),
      monthClasses,
    )
    const back = header.locator('button').first()
    const next = header.locator('button').last()
    assert.equal(await back.evaluate((element) => getComputedStyle(element).opacity), '0.25')
    assert.deepEqual(
      await next.evaluate((element) => {
        const s = getComputedStyle(element)
        return [
          element.matches(':disabled'),
          element.matches(':enabled'),
          element.matches(':read-only'),
          element.hasAttribute('aria-selected'),
          element.hasAttribute('aria-disabled'),
          s.borderTopWidth,
          s.outlineWidth === '4px',
          s.marginTop,
        ]
      }),
      [false, true, true, false, false, '2px', false, '0px'],
    )
    await next.hover()
    assert.equal(
      await next.evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgb(221, 17, 0)',
    )
    assert.notEqual(
      await back.evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgb(221, 17, 0)',
    )
    await next.focus()
    assert.equal(await next.evaluate((element) => getComputedStyle(element).opacity), '0.75')
    assert.equal(await next.evaluate((element) => element.matches(':focus-visible')), true)
    await page.mouse.down()
    assert.equal(await next.evaluate((element) => getComputedStyle(element).opacity), '0.5')
    await page.mouse.up()
    await page.evaluate(() => window.renderCalendar({ max: { year: 2026, month: 7, day: 31 } }))
    assert.equal(await next.isDisabled(), true)
    // Blink clears focus from a newly disabled control on a post-layout task,
    // not synchronously when `disabled` is set.
    await page.waitForFunction(
      () => {
        const buttons = document.querySelectorAll('[role="group"] > div button')
        const last = buttons[buttons.length - 1]
        return last?.matches(':disabled') && !last.matches(':focus')
      },
      null,
      { timeout: 2000 },
    )
    assert.equal(await next.evaluate((element) => element.matches(':focus')), false)
    const dayProps = {
      month: { year: 2026, month: 6 },
      min: { year: 2026, month: 6, day: 10 },
      max: { year: 2026, month: 6, day: 20 },
      range: true,
      value: { start: { year: 2026, month: 6, day: 12 }, end: { year: 2026, month: 6, day: 15 } },
      dayClassName: dayClasses,
    }
    await page.evaluate((props) => window.renderCalendar(props), dayProps)
    const day = (n) => grid.locator(`td[aria-label*="June ${n},"]`)
    for (const end of [12, 15])
      assert.equal(
        await day(end).evaluate((element) => getComputedStyle(element).borderTopWidth),
        '4px',
      )
    assert.equal(await day(12).getAttribute('data-hozo-range-start'), '')
    assert.equal(await day(15).getAttribute('data-hozo-range-end'), '')
    assert.equal(await day(13).getAttribute('data-hozo-in-range'), '')
    assert.equal(await day(13).evaluate((element) => getComputedStyle(element).opacity), '0.75')
    assert.equal(await day(13).getAttribute('aria-selected'), 'true')
    assert.deepEqual(
      await day(9).evaluate((element) => {
        const s = getComputedStyle(element)
        return [
          element.matches(':disabled'),
          element.matches(':enabled'),
          element.matches(':read-only'),
          s.marginTop,
          s.marginBottom,
          s.opacity,
        ]
      }),
      [false, false, true, '0px', '0px', '0.25'],
    )
    assert.equal(await day(9).getAttribute('data-hozo-disabled'), '')
    const outside = grid.locator('td[data-hozo-outside]').first()
    assert.equal(await outside.evaluate((element) => getComputedStyle(element).opacity), '0.5')
    await day(12).focus()
    await page.evaluate(
      (props) => window.renderCalendar({ ...props, min: { year: 2026, month: 6, day: 14 } }),
      dayProps,
    )
    assert.equal(await day(12).getAttribute('aria-disabled'), 'true')
    assert.equal(
      await day(12).evaluate((element) => document.activeElement === element),
      true,
      'aria-disabled td retains actual focus',
    )
    await day(12).dispatchEvent('click')
    assert.deepEqual(await page.evaluate(() => window.calendarChanges), [])
    await page.evaluate(
      (props) =>
        window.renderCalendar({ ...props, range: false, value: { year: 2026, month: 6, day: 12 } }),
      dayProps,
    )
    assert.equal(await day(12).getAttribute('data-hozo-range-start'), null)
    assert.equal(await day(12).getAttribute('data-hozo-range-end'), null)
    assert.equal(
      await day(12).evaluate((element) => getComputedStyle(element).borderTopWidth),
      '2px',
    )
  } finally {
    await page.close()
  }
})

for (const [name, file, value] of [
  ['DatePicker', 'date-picker', { year: 2026, month: 6, day: 12 }],
  [
    'DateRangePicker',
    'date-range-picker',
    { start: { year: 2026, month: 6, day: 12 }, end: { year: 2026, month: 6, day: 15 } },
  ],
  ['DateTimePicker', 'date-time-picker', { year: 2026, month: 6, day: 12, hour: 9, minute: 10 }],
]) {
  test(`the real Web ${name} trigger owns form, expansion and interaction facts`, {
    skip: !executablePath,
  }, async () => {
    const source = (relative) =>
      fileURLToPath(new URL(`../../../${relative}`, import.meta.url)).replaceAll('\\', '/')
    const classes =
      'p-4 hover:bg-[#dd1100] focus:opacity-75 active:opacity-50 aria-expanded:border-2 disabled:opacity-25 aria-disabled:mt-8'
    const frameClasses = 'p-6 text-[#dd1100] text-[#0011dd] text-[#118800] text-lg font-bold'
    const fixture = await build({
      stdin: {
        contents: `import {createElement} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {Hozo${name}} from ${JSON.stringify(source(`packages/form/src/${file}.tsx`))};
        const root = createRoot(document.getElementById('picker'));
        window.pickerChanges = []; window.pickerOpens = [];
        window.renderPicker = (disabled = false, extra = {}) => flushSync(() => root.render(createElement(Hozo${name}, {disabled, value:${JSON.stringify(value)}, defaultMonth:{year:2026,month:6},today:{year:2026,month:6,day:15},locale:'en-US',accessibilityLabel:'Departure',formatValue:()=>'Chosen 2026',className:'disabled:opacity-25',triggerClassName:${JSON.stringify(classes)},doneClassName:${JSON.stringify(classes)},onChange: value => window.pickerChanges.push(value),onOpenChange: open => window.pickerOpens.push(open),...extra}, () => null)));
        window.renderPicker();`,
        resolveDir: source('examples/storybook-demo'),
      },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [
        {
          name: 'picker-web-behaviors',
          setup(builder) {
            builder.onResolve({ filter: /^@hozo\/behaviors$/ }, () => ({
              path: 'web-picker-behaviors',
              namespace: 'picker-probe',
            }))
            builder.onLoad({ filter: /.*/, namespace: 'picker-probe' }, () => ({
              contents: [
                `export {useHozoI18n,useHozoMessage} from ${JSON.stringify(source('packages/behaviors/src/i18n.ts'))};`,
                ...['FloatingPositioner', 'FocusScope', 'DismissableLayer'].map(
                  (entry, i) =>
                    `export {${entry}} from ${JSON.stringify(source(`packages/behaviors/src/${['floating-positioner', 'focus-scope', 'dismissable-layer'][i]}.tsx`))};`,
                ),
              ].join('\n'),
              loader: 'ts',
              resolveDir: source(''),
            }))
          },
        },
      ],
    })
    const css = (
      await compile(
        '@theme { --spacing:.25rem; --text-lg:1.125rem; --font-weight-bold:700; } @tailwind utilities;',
      )
    ).build(`${classes} ${frameClasses}`.split(' '))
    const page = await browser.newPage()
    try {
      const preflight = readFileSync(
        fileURLToPath(import.meta.resolve('tailwindcss/preflight.css')),
        'utf8',
      )
      await page.setContent(
        `<!doctype html><style>${preflight}\n${css}</style><div id="picker"></div>`,
      )
      await page.addScriptTag({ content: fixture.outputFiles[0].text })
      const trigger = page.locator('#picker > div > button')
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
      assert.equal(await trigger.getAttribute('aria-disabled'), null)
      assert.equal(await trigger.getAttribute('aria-selected'), null)
      assert.deepEqual(
        await trigger.evaluate((element) => [
          element.matches(':read-only'),
          element.matches(':enabled'),
        ]),
        [true, true],
      )
      assert.equal(
        await trigger.evaluate((element) => getComputedStyle(element).paddingTop),
        '16px',
      )
      await trigger.hover()
      assert.equal(
        await trigger.evaluate((element) => getComputedStyle(element).backgroundColor),
        'rgb(221, 17, 0)',
      )
      await trigger.focus()
      assert.equal(await trigger.evaluate((element) => getComputedStyle(element).opacity), '0.75')
      await page.mouse.down()
      assert.equal(await trigger.evaluate((element) => getComputedStyle(element).opacity), '0.5')
      await page.mouse.up()
      await page.locator('[role="dialog"]').waitFor({ state: 'visible' })
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
      assert.equal(
        await trigger.evaluate((element) => getComputedStyle(element).borderTopWidth),
        '2px',
      )
      if (name === 'DateTimePicker') {
        // This button is inside the dialog, but is not its expansion trigger.
        // Even disabling the already-open field must leave its exit operable.
        await page.evaluate(() => window.renderPicker(true))
        const done = page.getByRole('button', { name: 'Done', exact: true })
        assert.equal(await done.isEnabled(), true)
        assert.equal(await done.getAttribute('aria-expanded'), null)
        assert.equal(await done.getAttribute('aria-disabled'), null)
        assert.deepEqual(
          await done.evaluate((element) => [
            element.matches(':enabled'),
            element.matches(':read-only'),
          ]),
          [true, true],
        )
        assert.equal(await done.evaluate((element) => getComputedStyle(element).paddingTop), '16px')
        assert.equal(
          await done.evaluate((element) => getComputedStyle(element).borderTopWidth),
          '0px',
        )
        assert.equal(await done.evaluate((element) => getComputedStyle(element).marginTop), '0px')
        await done.hover()
        assert.equal(
          await done.evaluate((element) => getComputedStyle(element).backgroundColor),
          'rgb(221, 17, 0)',
        )
        await done.focus()
        assert.equal(await done.evaluate((element) => getComputedStyle(element).opacity), '0.75')
        await done.press('Enter')
        await page.locator('[role="dialog"]').waitFor({ state: 'detached' })
        assert.deepEqual(await page.evaluate(() => window.pickerChanges), [])
        assert.deepEqual(await page.evaluate(() => window.pickerOpens), [true, false])
        await page.evaluate(() => window.renderPicker(false))
        await trigger.click()
        await page.locator('[role="dialog"]').waitFor({ state: 'visible' })
      }
      await page.keyboard.press('Escape')
      await page.locator('[role="dialog"]').waitFor({ state: 'detached' })
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
      // Dialog removal is not a browser focus-settled signal. Establish
      // this next case's focus explicitly, then observe the result of the
      // one disabled update rather than sampling a transient focus pseudo.
      await trigger.focus()
      assert.equal(await trigger.evaluate((element) => element.matches(':focus')), true)
      await page.evaluate(() => window.renderPicker(true))
      assert.equal(await trigger.isDisabled(), true)
      await page.waitForFunction(
        () => {
          const button = document.querySelector('#picker > div > button')
          return button?.matches(':disabled') && !button.matches(':focus')
        },
        null,
        { timeout: 2000 },
      )
      assert.equal(await trigger.evaluate((element) => element.matches(':focus')), false)
      assert.equal(await trigger.evaluate((element) => getComputedStyle(element).opacity), '0.25')
      assert.equal(await trigger.evaluate((element) => getComputedStyle(element).marginTop), '0px')
      assert.equal(
        await trigger.evaluate((element) => getComputedStyle(element.parentElement).opacity),
        '1',
      )
      assert.equal(await trigger.locator('[hidden]').innerText(), 'Departure')
      assert.equal(await trigger.locator('span').last().innerText(), 'Chosen 2026')
      const frame = {
        className: 'p-4 text-[#dd1100] font-bold',
        dialogClassName: 'p-6 text-[#0011dd] text-lg',
        triggerClassName: '',
        doneClassName: '',
      }
      await page.evaluate((frame) => window.renderPicker(false, frame), frame)
      assert.equal(
        await trigger.evaluate((element) => getComputedStyle(element).color),
        'rgb(221, 17, 0)',
      )
      await trigger.click()
      const dialog = page.locator('[role="dialog"]')
      await dialog.waitFor({ state: 'visible' })
      assert.equal(await dialog.evaluate((element) => getComputedStyle(element).paddingTop), '24px')
      assert.equal(
        await trigger.evaluate((element) => getComputedStyle(element.parentElement).paddingTop),
        '16px',
      )
      const heading = dialog.locator('[aria-live="polite"]')
      for (const label of [heading, dialog.locator('td').first()]) {
        assert.deepEqual(
          await label.evaluate((element) => {
            const style = getComputedStyle(element)
            return [style.color, style.fontSize, style.fontWeight]
          }),
          ['rgb(0, 17, 221)', '18px', '700'],
        )
      }
      await page.evaluate(
        (frame) =>
          window.renderPicker(false, {
            ...frame,
            calendarClassName: 'text-[#118800]',
            triggerClassName: 'text-[#118800]',
            doneClassName: 'text-[#118800]',
          }),
        frame,
      )
      assert.equal(
        await heading.evaluate((element) => getComputedStyle(element).color),
        'rgb(17, 136, 0)',
      )
      assert.equal(
        await trigger.evaluate((element) => getComputedStyle(element).color),
        'rgb(17, 136, 0)',
      )
      if (name === 'DateTimePicker')
        assert.equal(
          await page
            .getByRole('button', { name: 'Done', exact: true })
            .evaluate((element) => getComputedStyle(element).color),
          'rgb(17, 136, 0)',
        )
      await page.evaluate(() =>
        window.renderPicker(false, { triggerClassName: '', doneClassName: '' }),
      )
      assert.equal(await dialog.evaluate((element) => getComputedStyle(element).paddingTop), '0px')
      assert.equal(await heading.evaluate((element) => getComputedStyle(element).fontWeight), '400')
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'detached' })
    } finally {
      await page.close()
    }
  })
}

test('the real Web FileDropzone keeps drag-active separate from focus, press and disabled', {
  skip: !executablePath,
}, async () => {
  const source = (relative) =>
    fileURLToPath(new URL(`../../../${relative}`, import.meta.url)).replaceAll('\\', '/')
  const props = {
    accessibilityLabel: 'Upload photo',
    className: 'p-4 hover:bg-[#dd1100] focus:opacity-75 disabled:opacity-25',
    activeClassName: 'border-4',
  }
  const fixture = await build({
    stdin: {
      contents: `import {createElement} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {HozoFileDropzone} from ${JSON.stringify(source('packages/form/src/file-dropzone.tsx'))};
      const root=createRoot(document.getElementById('zone')); window.zonePicks=0;
      window.renderZone=props=>flushSync(()=>root.render(createElement(HozoFileDropzone,props,'Choose a file')));
      window.renderZone(${JSON.stringify(props)});
      document.querySelector('input[type=file]').addEventListener('click',event=>{event.preventDefault();window.zonePicks++});`,
      resolveDir: source('examples/storybook-demo'),
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const css = (await compile('@theme {--spacing:.25rem;} @tailwind utilities;')).build(
    `${props.className} ${props.activeClassName}`.split(' '),
  )
  const preflight = readFileSync(
    fileURLToPath(import.meta.resolve('tailwindcss/preflight.css')),
    'utf8',
  )
  const page = await browser.newPage()
  try {
    await page.setContent(`<!doctype html><style>${preflight}\n${css}</style><div id="zone"></div>`)
    await page.addScriptTag({ content: fixture.outputFiles[0].text })
    const zone = page.getByRole('button', { name: 'Upload photo', exact: true })
    const border = () => zone.evaluate((element) => getComputedStyle(element).borderTopWidth)
    const drag = async (type, expected) => {
      // Delivery is not the concurrent React root's continuous-event commit.
      // Dispatch once, cross render turns (including for negative assertions),
      // then observe the actual marker AND pixels. Never retry the action.
      await zone.dispatchEvent(type)
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      )
      await page.waitForFunction(
        (expected) => {
          const button = document.querySelector('#zone button')
          return (
            button?.getAttribute('data-hozo-drag-active') === expected.active &&
            getComputedStyle(button).borderTopWidth === expected.border
          )
        },
        expected,
        { timeout: 5000 },
      )
      return zone.evaluate((button) => ({
        active: button.getAttribute('data-hozo-drag-active'),
        border: getComputedStyle(button).borderTopWidth,
      }))
    }
    const active = { active: '', border: '4px' }
    const inactive = { active: null, border: '0px' }
    assert.equal(await border(), '0px')
    assert.equal(await zone.evaluate((element) => getComputedStyle(element).paddingTop), '16px')
    await zone.focus()
    assert.equal(await zone.evaluate((element) => getComputedStyle(element).opacity), '0.75')
    assert.equal(await border(), '0px', 'focus is not drag-active')
    await zone.press('Enter')
    await zone.press('Space')
    await zone.click()
    assert.equal(await page.evaluate(() => window.zonePicks), 3)
    assert.equal(await border(), '0px', 'activation is not drag-active')
    assert.deepEqual(await drag('dragenter', active), active)
    assert.deepEqual(await drag('dragenter', active), active)
    assert.deepEqual(
      await drag('dragleave', active),
      active,
      'one nested leave is not leaving the zone',
    )
    assert.deepEqual(await drag('dragleave', inactive), inactive)
    await page.evaluate((props) => window.renderZone({ ...props, disabled: true }), props)
    assert.equal(await zone.isDisabled(), true)
    assert.equal(await zone.evaluate((element) => getComputedStyle(element).opacity), '0.25')
    assert.deepEqual(await drag('dragenter', inactive), inactive)
    await page.evaluate((props) => window.renderZone({ ...props, className: undefined }), props)
    assert.equal(await zone.evaluate((element) => getComputedStyle(element).paddingTop), '0px')
  } finally {
    await page.close()
  }
})

test('the real Web TimePicker keeps owner form, text and interaction facts distinct', {
  skip: !executablePath,
}, async () => {
  const source = (relative) =>
    fileURLToPath(new URL(`../../../${relative}`, import.meta.url)).replaceAll('\\', '/')
  const frame = {
    className: 'p-4 text-[#dd1100] font-bold disabled:opacity-25 aria-disabled:mt-8',
    fieldClassName: 'p-3 text-[#0011dd] text-lg disabled:opacity-25 aria-disabled:mt-8',
  }
  const valueClasses =
    'p-5 hover:bg-[#dd1100] focus:opacity-75 focus-visible:font-bold aria-disabled:border-4 disabled:opacity-25 data-[hozo-disabled]:mt-8'
  const periodClasses =
    'p-4 hover:bg-[#dd1100] focus:opacity-75 disabled:opacity-25 aria-disabled:border-4 data-[hozo-disabled]:mt-8'
  const stepClasses =
    'absolute end-0 size-6 data-[hozo-step=increase]:top-0 data-[hozo-step=decrease]:bottom-0 data-[hozo-step=increase]:hover:opacity-50 data-[hozo-step=decrease]:hover:opacity-75 disabled:opacity-25'
  const fixture = await build({
    stdin: {
      contents: `import {createElement} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {HozoTimePicker} from ${JSON.stringify(source('packages/form/src/time-picker.tsx'))};
      const root=createRoot(document.getElementById('time')); window.timeChanges=[];
      window.renderTime = props => flushSync(() => root.render(createElement(HozoTimePicker,{defaultValue:{hour:9,minute:10},hour12:true,locale:'en-US',onChange:next=>window.timeChanges.push(next),...props})));
      window.renderTime(${JSON.stringify({ ...frame, disabled: true })});`,
      resolveDir: source('examples/storybook-demo'),
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'time-i18n',
        setup(builder) {
          builder.onResolve({ filter: /^@hozo\/behaviors$/ }, () => ({
            path: source('packages/behaviors/src/i18n.ts'),
          }))
        },
      },
    ],
  })
  const css = (
    await compile(
      '@theme { --spacing:.25rem; --text-lg:1.125rem; --font-weight-bold:700; } @tailwind utilities;',
    )
  ).build(
    `${frame.className} ${frame.fieldClassName} ${valueClasses} ${periodClasses} ${stepClasses} relative min-h-12 pe-6`.split(
      ' ',
    ),
  )
  const page = await browser.newPage()
  try {
    const preflight = readFileSync(
      fileURLToPath(import.meta.resolve('tailwindcss/preflight.css')),
      'utf8',
    )
    await page.setContent(`<!doctype html><style>${preflight}\n${css}</style><div id="time"></div>`)
    await page.addScriptTag({ content: fixture.outputFiles[0].text })
    const root = page.locator('#time > div')
    const field = page.locator('[data-hozo-field="hour"]')
    for (const box of [root, field]) {
      assert.deepEqual(
        await box.evaluate((e) => [
          e.matches(':disabled'),
          e.matches(':enabled'),
          e.matches(':read-only'),
        ]),
        [false, false, true],
      )
      assert.equal(await box.evaluate((e) => getComputedStyle(e).opacity), '1')
      assert.equal(await box.evaluate((e) => getComputedStyle(e).marginTop), '0px')
    }
    assert.equal(await root.evaluate((e) => getComputedStyle(e).paddingTop), '16px')
    assert.equal(await field.evaluate((e) => getComputedStyle(e).paddingTop), '12px')
    for (const label of [field.getByRole('spinbutton'), field.getByRole('button').first()])
      assert.deepEqual(
        await label.evaluate((e) => {
          const s = getComputedStyle(e)
          return [s.color, s.fontSize, s.fontWeight]
        }),
        ['rgb(0, 17, 221)', '18px', '700'],
      )
    const period = page.getByRole('button', { name: 'AM or PM', exact: true })
    assert.equal(await period.evaluate((e) => getComputedStyle(e).color), 'rgb(221, 17, 0)')
    assert.equal(await period.evaluate((e) => getComputedStyle(e).fontSize), '16px')
    await page.evaluate(() => window.renderTime({ disabled: true }))
    assert.equal(await field.evaluate((e) => getComputedStyle(e).paddingTop), '0px')
    assert.equal(await root.evaluate((e) => getComputedStyle(e).paddingTop), '0px')
    assert.equal(await field.evaluate((e) => getComputedStyle(e).fontWeight), '400')
    const owned = {
      valueClassName: valueClasses,
      periodClassName: periodClasses,
      fieldClassName: 'relative min-h-12 pe-6',
      stepClassName: stepClasses,
    }
    await page.evaluate((props) => window.renderTime(props), owned)
    const up = field.getByRole('button', { name: 'Increase Hour', exact: true })
    const down = field.getByRole('button', { name: 'Decrease Hour', exact: true })
    const geometry = () =>
      field.evaluate((element) => {
        const field = element.getBoundingClientRect()
        const buttons = [...element.querySelectorAll('button')].map((button) => {
          const r = button.getBoundingClientRect()
          return {
            top: r.top - field.top,
            bottom: field.bottom - r.bottom,
            width: r.width,
            height: r.height,
            left: r.left - field.left,
            right: field.right - r.right,
          }
        })
        return buttons
      })
    let arrows = await geometry()
    assert.equal(arrows[0].top, 0)
    assert.equal(arrows[1].bottom, 0)
    for (const arrow of arrows)
      assert.deepEqual([arrow.width, arrow.height, arrow.right], [24, 24, 0])
    await page.locator('html').evaluate((element) => {
      element.dir = 'rtl'
    })
    arrows = await geometry()
    for (const arrow of arrows) assert.equal(arrow.left, 0, 'end follows actual direction')
    await page.locator('html').evaluate((element) => {
      element.dir = 'ltr'
    })
    await up.hover()
    assert.equal(await up.evaluate((element) => getComputedStyle(element).opacity), '0.5')
    await down.hover()
    assert.equal(await down.evaluate((element) => getComputedStyle(element).opacity), '0.75')
    const value = field.getByRole('spinbutton')
    assert.deepEqual(
      await value.evaluate((e) => [
        e.matches(':disabled'),
        e.matches(':enabled'),
        e.matches(':read-only'),
      ]),
      [false, false, true],
    )
    assert.equal(await value.evaluate((e) => getComputedStyle(e).paddingTop), '20px')
    await value.hover()
    assert.equal(
      await value.evaluate((e) => getComputedStyle(e).backgroundColor),
      'rgb(221, 17, 0)',
    )
    await page.keyboard.press('Tab')
    await value.focus()
    assert.equal(await value.evaluate((e) => e.matches(':focus-visible')), true)
    assert.equal(await value.evaluate((e) => getComputedStyle(e).opacity), '0.75')
    assert.equal(await value.evaluate((e) => getComputedStyle(e).fontWeight), '700')
    await page.evaluate((props) => window.renderTime({ ...props, disabled: true }), owned)
    assert.equal(
      await value.evaluate((e) => e.matches(':focus')),
      true,
      'aria-disabled div retains focus',
    )
    assert.equal(await value.evaluate((e) => getComputedStyle(e).opacity), '0.75')
    assert.equal(await value.evaluate((e) => getComputedStyle(e).borderTopWidth), '4px')
    assert.equal(await value.evaluate((e) => getComputedStyle(e).marginTop), '32px')
    assert.equal(await period.isDisabled(), true)
    assert.equal(await up.isDisabled(), true)
    assert.equal(await down.isDisabled(), true)
    assert.equal(await up.evaluate((element) => getComputedStyle(element).opacity), '0.25')
    assert.equal(await down.evaluate((element) => getComputedStyle(element).opacity), '0.25')
    assert.equal(await period.getAttribute('aria-disabled'), null)
    assert.equal(await period.evaluate((e) => getComputedStyle(e).borderTopWidth), '0px')
    assert.equal(await period.evaluate((e) => getComputedStyle(e).opacity), '0.25')
    assert.equal(await period.evaluate((e) => getComputedStyle(e).marginTop), '32px')
    await value.press('ArrowUp')
    assert.deepEqual(await page.evaluate(() => window.timeChanges), [])
    await page.evaluate((props) => window.renderTime(props), owned)
    await period.hover()
    assert.equal(
      await period.evaluate((e) => getComputedStyle(e).backgroundColor),
      'rgb(221, 17, 0)',
    )
    await period.focus()
    assert.equal(await period.evaluate((e) => getComputedStyle(e).opacity), '0.75')
    await period.press('Enter')
    assert.deepEqual(await page.evaluate(() => window.timeChanges), [{ hour: 21, minute: 10 }])
    assert.equal(await period.innerText(), 'PM')
    await page.evaluate(() => window.renderTime({ hour12: false }))
    assert.equal(await period.count(), 0)
    assert.equal(await value.evaluate((e) => getComputedStyle(e).paddingTop), '0px')
    assert.equal(await up.evaluate((element) => getComputedStyle(element).position), 'static')
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

test('Chromium and Yoga agree on logical and physical inline edges across directions, orders, states and the RTL swap (#2018, #2050)', {
  skip: !executablePath,
}, async () => {
  const css = `${readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')}\n@tailwind utilities;`
  const cases = [
    {
      id: 'px-pl',
      classes: 'px-8 pl-1',
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'ps-pl',
      classes: 'ps-8 pl-1',
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'pe-pl',
      classes: 'pe-8 pl-1',
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'p-ps-pl',
      classes: 'p-8 ps-4 pl-1',
      props: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
      family: 'padding',
    },
    {
      id: 'p-px',
      classes: 'p-8 px-2',
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'ps-pe-mirrored',
      classes: 'ps-4 pe-1',
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'hover-pl-over-px',
      classes: 'px-8 hover:pl-1',
      hovered: true,
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'hover-ps-over-pl',
      classes: 'hover:ps-8 pl-1',
      hovered: true,
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'mx-ml',
      classes: 'mx-8 ml-1',
      props: ['marginLeft', 'marginRight'],
      family: 'margin',
    },
    {
      id: 'ms-ml',
      classes: 'ms-8 ml-1',
      props: ['marginLeft', 'marginRight'],
      family: 'margin',
    },
    {
      id: 'border-x-l',
      classes: 'border-x-4 border-l-2',
      props: ['borderLeftWidth', 'borderRightWidth'],
      family: 'border',
    },
    // #2050: a physical utility on its own keeps its side in RTL, as in
    // Tailwind, rather than following the swap.
    {
      id: 'pl-alone',
      classes: 'pl-1',
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'p-pr',
      classes: 'p-4 pr-2',
      props: ['paddingLeft', 'paddingRight'],
      family: 'padding',
    },
    {
      id: 'ml-alone',
      classes: 'ml-2',
      props: ['marginLeft', 'marginRight'],
      family: 'margin',
    },
    {
      id: 'border-l-alone',
      classes: 'border-l-2',
      props: ['borderLeftWidth', 'borderRightWidth'],
      family: 'border',
    },
  ]
  const allNames = [...new Set(cases.flatMap((c) => c.classes.split(' ')))]
  const compiled = await compile(css, { base: process.cwd() })
  const referenceCss = compiled.build(allNames)
  const compiler = createCompiler()
  const cache = openCandidateCache()
  cache.scanFile('edge-matrix.ts', JSON.stringify(allNames.join(' ')), 1)
  const nativeModuleCode = cache.renderNativeModule()

  // React Native's `swapLeftAndRightInRTL`, on by default on Android and
  // iOS: in an RTL layout, left overwrites start and right overwrites end
  // before Yoga sees them (`YogaLayoutableShadowNode::swapStyleLeftAndRight`).
  const swapped = (styleObj) => {
    const out = {}
    const physical = []
    for (const [k, v] of Object.entries(styleObj)) {
      const to = k
        .replace(/^left$/, 'start')
        .replace(/^right$/, 'end')
        .replace(/Left(?=Width$|Color$|$)/, 'Start')
        .replace(/Right(?=Width$|Color$|$)/, 'End')
      if (to === k) out[k] = v
      else physical.push([to, v])
    }
    for (const [k, v] of physical) out[k] = v
    return out
  }
  const yogaEdge = (input, family, dir, swap) => {
    const styleObj = swap && dir === 'rtl' ? swapped(input) : input
    const root = Yoga.Node.create()
    root.setWidth(200)
    root.setHeight(100)
    const node = Yoga.Node.create()
    const apply = (k, v) => {
      if (typeof v !== 'number') return
      const map = {
        paddingLeft: [Yoga.EDGE_LEFT, 'setPadding'],
        paddingRight: [Yoga.EDGE_RIGHT, 'setPadding'],
        paddingTop: [Yoga.EDGE_TOP, 'setPadding'],
        paddingBottom: [Yoga.EDGE_BOTTOM, 'setPadding'],
        paddingStart: [Yoga.EDGE_START, 'setPadding'],
        paddingEnd: [Yoga.EDGE_END, 'setPadding'],
        marginLeft: [Yoga.EDGE_LEFT, 'setMargin'],
        marginRight: [Yoga.EDGE_RIGHT, 'setMargin'],
        marginStart: [Yoga.EDGE_START, 'setMargin'],
        marginEnd: [Yoga.EDGE_END, 'setMargin'],
        borderLeftWidth: [Yoga.EDGE_LEFT, 'setBorder'],
        borderRightWidth: [Yoga.EDGE_RIGHT, 'setBorder'],
        borderStartWidth: [Yoga.EDGE_START, 'setBorder'],
        borderEndWidth: [Yoga.EDGE_END, 'setBorder'],
      }[k]
      if (map) node[map[1]](map[0], v)
    }
    for (const [k, v] of Object.entries(styleObj)) apply(k, v)
    root.insertChild(node, 0)
    root.calculateLayout(200, 100, dir === 'rtl' ? Yoga.DIRECTION_RTL : Yoga.DIRECTION_LTR)
    const out =
      family === 'padding'
        ? {
            paddingLeft: `${node.getComputedPadding(Yoga.EDGE_LEFT)}px`,
            paddingRight: `${node.getComputedPadding(Yoga.EDGE_RIGHT)}px`,
            paddingTop: `${node.getComputedPadding(Yoga.EDGE_TOP)}px`,
            paddingBottom: `${node.getComputedPadding(Yoga.EDGE_BOTTOM)}px`,
          }
        : family === 'margin'
          ? {
              marginLeft: `${node.getComputedMargin(Yoga.EDGE_LEFT)}px`,
              marginRight: `${node.getComputedMargin(Yoga.EDGE_RIGHT)}px`,
            }
          : {
              borderLeftWidth: `${node.getComputedBorder(Yoga.EDGE_LEFT)}px`,
              borderRightWidth: `${node.getComputedBorder(Yoga.EDGE_RIGHT)}px`,
            }
    root.freeRecursive()
    return out
  }

  const page = await browser.newPage()
  try {
    for (const entry of cases) {
      const tokens = entry.classes.split(' ')
      const permutations = [tokens.join(' '), tokens.toReversed().join(' ')]
      for (const dir of ['ltr', 'rtl']) {
        const resolve = evaluate(nativeModuleCode.replace(/^import .*$/gm, ''), {
          createClassResolver,
          I18nManager: { isRTL: dir === 'rtl' },
        }).hozoClasses
        for (const classes of permutations) {
          await page.setContent(
            `<html dir="${dir}"><style>${referenceCss}</style><div class="${classes}" style="width:100px;height:40px">x</div></html>`,
          )
          if (entry.hovered) await page.locator('div').hover()
          const expected = await page.locator('div').evaluate((el, props) => {
            const s = getComputedStyle(el)
            return Object.fromEntries(props.map((p) => [p, s[p]]))
          }, entry.props)

          // Ordinary static Native route
          const host = entry.hovered ? 'Pressable' : 'View'
          const [native] = compiler.compileNative(
            `import { ${host} } from '@hozo/core'; export const C = () => <${host} className="${classes}" />`,
          )
          const rendered = evaluate(
            `const hozoStyles=${native.styles};${native.prelude.join('\n')};module.exports=(${native.jsx})`,
            {
              View: 'View',
              Pressable: 'Pressable',
              HozoPressable: 'HozoPressable',
              h: (_type, props) => props,
              useHozoEnvironment: (q) => q === dir,
            },
          )
          const facts = {
            hovered: Boolean(entry.hovered),
            pressed: false,
            focused: false,
            focusVisible: false,
          }
          const rawStatic =
            typeof rendered.style === 'function' ? rendered.style(facts) : rendered.style
          const staticFlat = Object.assign({}, ...[rawStatic].flat(Infinity).filter(Boolean))
          for (const swap of [false, true]) {
            const staticYoga = yogaEdge(staticFlat, entry.family, dir, swap)
            for (const prop of entry.props) {
              assert.equal(
                staticYoga[prop],
                expected[prop],
                `static ${entry.id}/${dir}/swap=${swap}/${classes}/${prop}`,
              )
            }
          }

          // Generated Native candidate map route
          const dynFlat = Object.assign(
            {},
            ...[resolve(classes, facts)].flat(Infinity).filter(Boolean),
          )
          for (const swap of [false, true]) {
            const dynYoga = yogaEdge(dynFlat, entry.family, dir, swap)
            for (const prop of entry.props) {
              assert.equal(
                dynYoga[prop],
                expected[prop],
                `candidate ${entry.id}/${dir}/swap=${swap}/${classes}/${prop}`,
              )
            }
          }
        }
      }
    }
  } finally {
    await page.close()
  }
})

test("an author's style edge beats a class's edge on the side React Native gives it, named or spread, static and candidate (#2050)", {
  skip: !executablePath,
}, async () => {
  const css = `${readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')}\n@tailwind utilities;`
  // `style` is React Native's own: with the swap, RTL moves a physical key to
  // the logical side, so the reference there is the logical CSS property.
  const cases = [
    { classes: 'px-8', style: { paddingRight: 99 }, family: 'padding' },
    { classes: 'ps-8', style: { paddingRight: 99 }, family: 'padding' },
    { classes: 'pe-8', style: { paddingLeft: 99 }, family: 'padding' },
    { classes: 'pl-1', style: { paddingRight: 99 }, family: 'padding' },
    { classes: 'pl-1', style: { paddingLeft: 99 }, family: 'padding' },
    { classes: 'p-4', style: { paddingRight: 99 }, family: 'padding' },
    { classes: 'px-8', style: { paddingEnd: 99 }, family: 'padding' },
    { classes: 'mx-8', style: { marginLeft: 9 }, family: 'margin' },
  ]
  const cssProperty = (key, logical) =>
    ({
      paddingLeft: logical ? 'padding-inline-start' : 'padding-left',
      paddingRight: logical ? 'padding-inline-end' : 'padding-right',
      paddingStart: 'padding-inline-start',
      paddingEnd: 'padding-inline-end',
      marginLeft: logical ? 'margin-inline-start' : 'margin-left',
    })[key]
  const props = { padding: ['paddingLeft', 'paddingRight'], margin: ['marginLeft', 'marginRight'] }
  const allNames = [...new Set(cases.flatMap((c) => c.classes.split(' ')))]
  const compiled = await compile(css, { base: process.cwd() })
  const referenceCss = compiled.build(allNames)
  const compiler = createCompiler()
  const cache = openCandidateCache()
  cache.scanFile('authored-edge-matrix.ts', JSON.stringify(allNames.join(' ')), 1)
  const nativeModuleCode = cache.renderNativeModule()
  const yoga = (styleObj, family, dir) => {
    const root = Yoga.Node.create()
    root.setWidth(400)
    root.setHeight(100)
    const node = Yoga.Node.create()
    const edges = {
      Left: Yoga.EDGE_LEFT,
      Right: Yoga.EDGE_RIGHT,
      Start: Yoga.EDGE_START,
      End: Yoga.EDGE_END,
    }
    for (const [k, v] of Object.entries(styleObj)) {
      const match = /^(padding|margin)(Left|Right|Start|End)$/.exec(k)
      if (match && typeof v === 'number')
        node[match[1] === 'padding' ? 'setPadding' : 'setMargin'](edges[match[2]], v)
    }
    root.insertChild(node, 0)
    root.calculateLayout(400, 100, dir === 'rtl' ? Yoga.DIRECTION_RTL : Yoga.DIRECTION_LTR)
    const get = family === 'padding' ? 'getComputedPadding' : 'getComputedMargin'
    const out = {
      [`${family}Left`]: `${node[get](Yoga.EDGE_LEFT)}px`,
      [`${family}Right`]: `${node[get](Yoga.EDGE_RIGHT)}px`,
    }
    root.freeRecursive()
    return out
  }
  // `swapLeftAndRightInRTL`, as in the matrix above.
  const swapped = (styleObj) => {
    const out = {}
    const physical = []
    for (const [k, v] of Object.entries(styleObj)) {
      const to = k.replace(/Left$/, 'Start').replace(/Right$/, 'End')
      if (to === k) out[k] = v
      else physical.push([to, v])
    }
    for (const [k, v] of physical) out[k] = v
    return out
  }
  const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
  const literal = (style) =>
    `{ ${Object.entries(style)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')} }`

  const page = await browser.newPage()
  try {
    for (const entry of cases) {
      const id = `${entry.classes} + ${JSON.stringify(entry.style)}`
      const [staticNative] = compiler.compileNative(
        `import { View } from '@hozo/core'; export const C = () => <View className="${entry.classes}" style={${literal(entry.style)}} />`,
      )
      const [opaqueNative] = compiler.compileNative(
        `import { View } from '@hozo/core'; export const C = ({ cls }) => <View className={cls} style={${literal(entry.style)}} />`,
      )
      // The caller's style handed on through a spread, as a UI wrapper does.
      const [spreadNative] = compiler.compileNative(
        `import { View } from '@hozo/core'; export const C = (rest) => <View className="${entry.classes}" {...rest} />`,
      )
      const [opaqueSpreadNative] = compiler.compileNative(
        `import { View } from '@hozo/core'; export const C = ({ cls, ...rest }) => <View {...rest} className={cls} />`,
      )
      assert.ok(staticNative.jsx.includes('hozoAuthoredEdges(') || entry.classes === 'p-4', id)
      for (const dir of ['ltr', 'rtl']) {
        for (const swap of [false, true]) {
          const logical = dir === 'rtl' && swap
          const inline = Object.entries(entry.style)
            .map(([k, v]) => `${cssProperty(k, logical)}:${v}px`)
            .join(';')
          await page.setContent(
            `<html dir="${dir}"><style>${referenceCss}</style><div class="${entry.classes}" style="width:100px;height:40px;${inline}">x</div></html>`,
          )
          const expected = await page.locator('div').evaluate((el, names) => {
            const s = getComputedStyle(el)
            return Object.fromEntries(names.map((p) => [p, s[p]]))
          }, props[entry.family])
          const I18nManager = { isRTL: dir === 'rtl', doLeftAndRightSwapInRTL: swap }
          const hozoClasses = evaluate(nativeModuleCode.replace(/^import .*$/gm, ''), {
            createClassResolver,
            I18nManager,
          }).hozoClasses
          const scope = {
            View: 'View',
            h: (_type, elementProps) => elementProps,
            useHozoEnvironment: (q) => q === dir,
            hozoAuthoredEdges,
            hozoAuthoredStyle,
            hozoEdgeSpreadStyles,
            hozoSpreadStyles,
            hozoClasses,
            I18nManager,
            cls: entry.classes,
            rest: { style: entry.style },
          }
          for (const [route, native] of [
            ['static', staticNative],
            ['candidate', opaqueNative],
            ['spread', spreadNative],
            ['candidate spread', opaqueSpreadNative],
          ]) {
            const rendered = evaluate(
              `const hozoStyles=${native.styles};${native.prelude.join('\n')};module.exports=(${native.jsx})`,
              scope,
            )
            const style = flat(rendered.style)
            const actual = yoga(logical ? swapped(style) : style, entry.family, dir)
            assert.deepEqual(actual, expected, `${route} ${id}/${dir}/swap=${swap}`)
          }
        }
      }
    }
  } finally {
    await page.close()
  }
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
        className="pt-2"
        triggerClassName="${triggerClasses}"
        dialogClassName="pt-3"
        calendarClassName="pt-4"
        headerClassName="pt-5"
        gridClassName="pt-6"
        monthButtonClassName="p-1"
        dayClassName="p-1"
      />
      <DateRangePicker
        defaultOpen={open}
        disabled={disabled}
        accessibilityLabel="Stay"
        today={{ year: 2026, month: 9, day: 24 }}
        defaultMonth={{ year: 2026, month: 9 }}
        className="pt-2"
        triggerClassName="${triggerClasses}"
        dialogClassName="pt-3"
      />
      <DateTimePicker
        defaultOpen={open}
        disabled={disabled}
        accessibilityLabel="Meeting"
        today={{ year: 2026, month: 9, day: 24 }}
        defaultMonth={{ year: 2026, month: 9 }}
        className="pt-2"
        triggerClassName="${triggerClasses}"
        dialogClassName="pt-3"
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
  assert.equal(flat(nativeElements.DatePicker.hozoDatePickerStyle()).paddingTop, 8)
  assert.equal(flat(nativeElements.DatePicker.hozoDialogStyle()).paddingTop, 12)
  assert.equal(flat(nativeElements.DatePicker.hozoCalendarStyle()).paddingTop, 16)
  assert.equal(flat(nativeElements.DatePicker.hozoHeaderStyle()).paddingTop, 20)
  assert.equal(flat(nativeElements.DatePicker.hozoGridStyle()).paddingTop, 24)

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
    const openMarkers = await page.evaluate(() => {
      const dialog = document.querySelector('#wrap > div:nth-child(1) [role="dialog"]')
      const cal = dialog.querySelector('[role="group"]')
      const header = cal.firstElementChild
      const grid = cal.querySelector('table[role="grid"]')
      return {
        dialogPaddingTop: parseFloat(getComputedStyle(dialog).paddingTop),
        calPaddingTop: parseFloat(getComputedStyle(cal).paddingTop),
        headerPaddingTop: parseFloat(getComputedStyle(header).paddingTop),
        gridPaddingTop: parseFloat(getComputedStyle(grid).paddingTop),
      }
    })
    assert.deepEqual(openMarkers, {
      dialogPaddingTop: 12,
      calPaddingTop: 16,
      headerPaddingTop: 20,
      gridPaddingTop: 24,
    })

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

  const webMod = { exports: {} }
  runInNewContext(webJs, {
    module: webMod,
    exports: webMod.exports,
    h: createElement,
    require: (id) => {
      if (id === '@hozo/form') return { FileDropzone, NativeSelect }
      throw new Error(`unexpected web import ${id}`)
    },
  })

  // Native compiles NativeSelect's 4 Native-only props and leaves FileDropzone.activeClassName untouched.
  const nativeCode = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(nativeCode)
  assert.match(nativeCode, /activeClassName="bg-\[#336699\] border-\[#0055aa\]"/)
  assert.match(nativeCode, /hozoIndicatorStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(nativeCode, /hozoSheetStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(nativeCode, /hozoScrimStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(nativeCode, /hozoOptionStyle=\{__hozoOwner\d+_Plan\d+\}/)

  const html = renderToStaticMarkup(createElement(webMod.exports.Screen))
  const page = await browser.newPage()
  try {
    await page.setContent(`<!doctype html><style>${web.css}</style>${html}`)
    const styles = await page.evaluate((activeClass) => {
      const button = document.querySelector('#wrap button[aria-label="Upload"]')
      const resting = {
        paddingTop: parseFloat(getComputedStyle(button).paddingTop),
        backgroundColor: getComputedStyle(button).backgroundColor,
        borderTopColor: getComputedStyle(button).borderTopColor,
      }
      button.classList.add(...activeClass.split(' '))
      const active = {
        paddingTop: parseFloat(getComputedStyle(button).paddingTop),
        backgroundColor: getComputedStyle(button).backgroundColor,
        borderTopColor: getComputedStyle(button).borderTopColor,
      }
      return { resting, active }
    }, compiledActiveClass)
    assert.deepEqual(styles.resting, {
      paddingTop: 8,
      backgroundColor: 'rgb(17, 17, 17)',
      borderTopColor: 'rgb(34, 34, 34)',
    })
    assert.deepEqual(styles.active, {
      paddingTop: 8,
      backgroundColor: 'rgb(51, 102, 153)',
      borderTopColor: 'rgb(0, 85, 170)',
    })
  } finally {
    await page.close()
  }
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
