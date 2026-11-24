// Shared browser, compiler, UI-candidate, and owner-register harness for
// `caller-composition-*.test.mjs`.

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareAuthoredTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '@hozo/engine'
import { loadTheme, prepareTailwindOrder, tailwindPackageDir } from '@hozo/tailwind'
import { transformSync } from 'esbuild'
import { chromium } from 'playwright-core'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { compile } from 'tailwindcss'
import {
  hozoAuthoredEdges,
  hozoEdgeSpreadStyles,
} from '../../../packages/engine/src/authored-edges.ts'
import { hozoAuthoredStyle } from '../../../packages/engine/src/authored-gap.ts'
import {
  hozoMixedTextMetricStyles,
  hozoTextMetricStyles,
} from '../../../packages/engine/src/class-resolver.ts'
import { hozoGapSpreadStyles } from '../../../packages/engine/src/gap-styles.ts'
import { hozoShadowStyles } from '../../../packages/engine/src/generated/shadow-slots.ts'
import { nativeDisabledProps } from '../../../packages/primitives/src/native-disabled.ts'

export const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((file) => file && existsSync(file))

if (process.env.CI) assert.ok(executablePath, 'CI must exercise class-composition browser checks')

export const own = 'rounded-[6px] p-2 text-[#dd1100] text-[20px] leading-[24px] font-semibold'
export const caller = 'rounded-[48px] p-8 text-[#0011dd] text-[28px] leading-[36px] font-normal'
export const layoutCaller = `${caller} flex flex-col gap-8 items-start`

export const sliderFocusClasses =
  'focus:opacity-75 focus-visible:outline-2 aria-disabled:border-4 disabled:mt-8'
export const textAreaFocusClasses =
  'focus:opacity-75 focus-visible:outline-2 disabled:opacity-25 read-only:border-4 aria-[invalid=true]:border-4 aria-required:outline-4'
export const selectFocusClasses = `${textAreaFocusClasses} aria-expanded:mt-8`

export const radiusCandidates = [
  'size-10',
  'h-4',
  'rounded-full',
  'md:rounded-none',
  'md:rounded-full',
  'rounded-hozo-control',
]

export async function launchCallerBrowser() {
  if (!executablePath) return undefined
  return chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  })
}

export async function buildOracleCss() {
  return (
    await compile(
      '@theme { --spacing: .25rem; --font-weight-normal: 400; --font-weight-semibold: 600; } @tailwind utilities;',
    )
  ).build(`${own} ${caller}`.split(' '))
}

export function createTempDirectory(prefix = 'hozo-caller-composition-') {
  return mkdtempSync(path.join(tmpdir(), prefix))
}

export function removeTempDirectory(directory) {
  // Only this test's exact mkdtemp directory is owned here.
  rmSync(directory, { recursive: true, force: true })
}

// CSS Align now serializes the flex-start/end aliases as flow-start/end;
// Native keeps its legacy API spellings. Logical start/end stay distinct.
// https://drafts.csswg.org/css-align/#changes
export const canonicalAlignment = (value) =>
  value === 'flex-start' ? 'flow-start' : value === 'flex-end' ? 'flow-end' : value

export function evaluate(code, context) {
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

export function createBaseCandidates(directory) {
  const cache = openCandidateCache(path.join(directory, 'candidates.json'))
  cache.scanFile('all.ts', JSON.stringify(`${own} ${caller}`), 1)
  // Deliberately emit own candidates last. If they leak back onto the owner,
  // both lists have caller specificity and this order exposes the regression.
  const candidates = cache.renderCss(undefined, `${caller} ${own}`.split(' '))
  const { hozoClasses } = evaluate(cache.renderNativeModule().replace(/^import .*$/gm, ''), {
    createClassResolver,
  })
  return { cache, candidates, hozoClasses }
}

// Read the shipped UI sources, not copies with the expected cx already in
// them. This fails if one of the old opaque plus helpers is reintroduced.
export async function createUiCompositionHarness(directory) {
  const uiRoot = new URL('../../../packages/ui/', import.meta.url)
  const uiTheme = await loadTheme(
    '@import "tailwindcss"; @import "./src/theme.css";',
    fileURLToPath(uiRoot),
  )
  const uiCompiler = createCompiler(uiTheme)
  const uiCache = openCandidateCache(path.join(directory, 'ui-candidates.json'))
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
      [
        'className',
        'cellClassName',
        'activeCellClassName',
        'filledCellClassName',
        'inputClassName',
      ],
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
  uiCache.scanFile('slider-focus.ts', JSON.stringify(sliderFocusClasses), 1)
  uiCache.scanFile('text-area-focus.ts', JSON.stringify(textAreaFocusClasses), 1)
  uiCache.scanFile('select-focus.ts', JSON.stringify(selectFocusClasses), 1)
  uiCache.scanFile('radius-callers.ts', JSON.stringify(radiusCandidates.join(' ')), 1)
  const uiCandidates = uiCache.renderCss(uiTheme)
  const { hozoClasses: resolveUiClasses } = evaluate(
    uiCache.renderNativeModule(uiTheme).replace(/^import .*$/gm, ''),
    { createClassResolver, hozoTextMetricStyles, hozoShadowStyles, I18nManager: { isRTL: false } },
  )
  return { uiTheme, uiCompiler, uiCache, uiCases, uiCandidates, resolveUiClasses }
}

export async function authoredOwnerContext(classes) {
  const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
  const { snapshot } = await prepareTailwindOrder(
    css,
    tailwindPackageDir(),
    classes.trim().split(/\s+/),
  )
  return prepareAuthoredTailwindContext(JSON.stringify(snapshot))
}

export async function assertRepeatedOwnerRegisters(
  browser,
  compiler,
  { classes, reference, property, values },
) {
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
