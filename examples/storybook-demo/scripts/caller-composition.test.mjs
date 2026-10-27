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
  prepareFinalTailwindContext,
  prepareTailwindContext,
} from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'
import { emitFinalTailwindBatch } from '@hozo/compiler/project'
import { createClassResolver, cx } from '@hozo/engine'
import { Chip } from '@hozo/patterns'
import { loadTheme, prepareTailwindOrder, tailwindPackageDir } from '@hozo/tailwind'
import { build, transformSync } from 'esbuild'
import { chromium } from 'playwright-core'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { compile } from 'tailwindcss'
import { hozoSpreadStyles } from '../../../packages/engine/src/spread-styles.ts'
import { transformHozoSource } from '../../../packages/metro/src/transform.ts'
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
  assert.ok(plan.ordering)
  const generated = evaluate(plan.code.replace(/^import .*$/gm, ''), {
    createClassResolver: (styles, unsupported, compose, states, ambient) => ({
      styles,
      unsupported,
      compose,
      states,
      ambient,
    }),
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
  const page = await browser.newPage()
  let legacyMismatches = 0
  try {
    for (const [index, classes] of lists.entries()) {
      const web = final.modules.find(({ id }) => id === `w${index}`).output[0]
      const native = final.modules.find(({ id }) => id === `n${index}`).output.components[0]
      const localSource = `import {Pressable} from '@hozo/core';export const Target=()=> <Pressable className="${classes}"/>`
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
        assert.deepEqual(read(resolve), oracle)
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
          ['staticNative', subject.native.selected],
          ['nativeCandidates', subject.fallback],
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
