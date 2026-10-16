import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { gzipSync } from 'node:zlib'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'
import { createClassResolver } from '@hozo/engine'
import { NativeSelect } from '@hozo/form'
import { Button as ButtonFallback } from '@hozo/primitives'
import { build, transformSync } from 'esbuild'
import { chromium } from 'playwright-core'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { compile } from 'tailwindcss'
import { chipAncestorFixture } from './chip-ancestor-fixture.mjs'

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI must run candidate cascade browser regressions')
const directory = mkdtempSync(path.join(tmpdir(), 'hozo-candidate-cascade-'))
const cache = openCandidateCache(path.join(directory, 'candidates.json'))
cache.scanFile(
  'helpers.ts',
  "export const classes = 'grid-cols-1 flex-col flex-row p-3 p-4 p-8 sm:p-4 md:p-8'",
  1,
)
const candidateCss = cache.renderCss(undefined, [
  'flex-col',
  'flex-row',
  'grid-cols-1',
  'p-3',
  'p-4',
  'p-8',
  'sm:p-4',
  'md:p-8',
])
const compiler = createCompiler()
assert.match(candidateCss, /\.grid-cols-1 \{/)
assert.match(candidateCss, /\.flex-col \{/)
let browser
let tailwindCss
before(async () => {
  tailwindCss = (
    await compile(
      '@theme { --spacing: 0.25rem; --breakpoint-sm: 40rem; --breakpoint-md: 48rem; } @tailwind utilities;',
    )
  ).build([
    'grid',
    'grid-cols-1',
    'md:grid-cols-3',
    'flex',
    'flex-col',
    'sm:flex-row',
    'p-4',
    'md:p-8',
    'p-4!',
  ])
  if (executablePath)
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu'],
    })
})
after(async () => {
  await browser?.close()
  // This exact mkdtemp result owns only this test's candidate snapshot.
  rmSync(directory, { recursive: true, force: true })
})

test('responsive font sizes preserve explicit leading against real Tailwind at every breakpoint', {
  skip: !executablePath,
}, async () => {
  const root = path.dirname(createRequire(import.meta.url).resolve('tailwindcss/package.json'))
  const oracle = await compile('@import "tailwindcss";', {
    base: root,
    loadStylesheet: async (id) => {
      const file = id === 'tailwindcss' ? path.join(root, 'index.css') : id
      return { path: file, base: path.dirname(file), content: readFileSync(file, 'utf8') }
    },
  })
  const cases = [
    'text-lg sm:text-xl leading-relaxed',
    'leading-relaxed sm:text-xl text-lg',
    'text-lg sm:text-xl leading-6',
    'leading-6 sm:text-xl text-lg',
    'text-lg sm:text-xl leading-relaxed sm:leading-tight',
    'text-lg sm:leading-tight md:text-xl',
    'text-lg sm:text-xl',
  ]
  const css = oracle.build(cases.flatMap((classes) => classes.split(' ')))
  const page = await browser.newPage()
  try {
    for (const classes of cases) {
      const [web] = compiler.compile(
        `import {Paragraph} from '@hozo/core'; export function C() { return <Paragraph className="${classes}">One<br/>Two<br/>Three</Paragraph> }`,
      )
      assert.deepEqual(web.diagnostics, [])
      const { C } = evaluate(`export function C(){return ${web.jsx}}`)
      const html = renderToStaticMarkup(createElement(C))
      for (const width of [375, 639, 640, 767, 768, 1280]) {
        await page.setViewportSize({ width, height: 700 })
        await page.setContent(
          `<style>${css}</style><style>${web.css}</style><div id="compiled">${html}</div><div id="oracle"><p class="${classes}">One<br/>Two<br/>Three</p></div>`,
        )
        const measure = (selector) =>
          page.locator(selector).evaluate((element) => {
            const style = getComputedStyle(element)
            return [style.fontSize, style.lineHeight, element.getBoundingClientRect().height]
          })
        const actual = await measure('#compiled > p')
        assert.deepEqual(actual, await measure('#oracle > p'), `${classes} at ${width}px`)
        if (classes === cases[0] && width === 1280)
          assert.deepEqual(actual, ['20px', '32.5px', 97.5])
      }
    }
  } finally {
    await page.close()
  }
})

function evaluate(code, globals = {}) {
  const module = { exports: {} }
  const js = transformSync(code, {
    loader: 'tsx',
    format: 'cjs',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  runInNewContext(js, { module, h: createElement, Fragment, ...globals })
  return module.exports
}

test('Pagination semantic classes distinguish disabled buttons from disabled links at either boundary', {
  skip: !executablePath,
}, async () => {
  const classes =
    'p-0 border-0 opacity-100 enabled:px-2 disabled:opacity-25 aria-disabled:border-4 aria-selected:opacity-50'
  const css = (await compile('@theme { --spacing: 0.25rem; } @tailwind utilities;')).build([
    ...classes.split(' '),
    'border-2',
  ])
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Pagination} from '@hozo/patterns';
        window.paginationSelections = [];
        createRoot(document.getElementById('root')).render(<>{[false, true].map(link =>
          <section key={String(link)} id={link ? 'links' : 'buttons'}><Pagination pageCount={3}
            getPageHref={link ? page => '#page-' + page : undefined}
            onPageChange={page => window.paginationSelections.push([link, page])}
            itemClassName=${JSON.stringify(classes)} currentItemClassName="border-2"
            disabledItemClassName="disabled:opacity-25 aria-disabled:border-4"/></section>
        )}</>);`,
      loader: 'tsx',
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
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.setContent(
      `<style>${css}</style><div id="aria-control" aria-selected="true" class="${classes}"></div><div id="root"></div>`,
    )
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(
      () => document.querySelectorAll('#root button, #root a').length === 10,
    )
    assert.equal(
      await page.locator('#aria-control').evaluate((e) => getComputedStyle(e).opacity),
      '0.5',
    )
    for (const link of [false, true]) {
      const controls = page.locator(link ? '#links a' : '#buttons button')
      const check = async (boundary, current) => {
        const styles = await controls.evaluateAll((nodes) =>
          nodes.map((e) => {
            const css = getComputedStyle(e)
            return {
              border: css.borderTopWidth,
              opacity: css.opacity,
              padding: css.paddingLeft,
              selected: e.getAttribute('aria-selected'),
              current: e.getAttribute('aria-current'),
              ariaDisabled: e.getAttribute('aria-disabled'),
              disabled: e.matches(':disabled'),
              enabled: e.matches(':enabled'),
            }
          }),
        )
        for (const [index, facts] of styles.entries())
          assert.deepEqual(facts, {
            border: link && index === boundary ? '4px' : index === current ? '2px' : '0px',
            opacity: !link && index === boundary ? '0.25' : '1',
            padding: !link && index !== boundary ? '8px' : '0px',
            selected: null,
            current: index === current ? 'page' : null,
            ariaDisabled: link && index === boundary ? 'true' : null,
            disabled: !link && index === boundary,
            enabled: !link && index !== boundary,
          })
      }
      await check(0, 1)
      if (link) {
        await controls.first().focus()
        await page.keyboard.press('Enter')
        assert.deepEqual(await page.evaluate(() => window.paginationSelections), [[false, 3]])
      }
      await controls.nth(3).click()
      await check(4, 3)
    }
    assert.deepEqual(await page.evaluate(() => window.paginationSelections), [
      [false, 3],
      [true, 3],
    ])
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
})

test('Chip semantic classes observe the Web class owner across standalone and composite shapes', {
  skip: !executablePath,
}, async () => {
  const classes =
    'border-0 opacity-100 aria-pressed:border-2 disabled:opacity-25 aria-checked:opacity-50 aria-disabled:border-4'
  const css = (await compile('@tailwind utilities;')).build(classes.split(' '))
  assert.ok(css.includes('[aria-pressed="true"]'))
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Chip} from '@hozo/patterns';
        window.chipSelections = []; window.chipRemovals = [];
        const shapes = [];
        for (const selectable of [false, true]) for (const removable of [false, true])
          for (const disabled of [false, true]) shapes.push({selectable, removable, disabled});
        createRoot(document.getElementById('root')).render(<>{shapes.map((s, index) =>
          <div key={index} id={'chip-' + index}><Chip disabled={s.disabled}
            {...(s.selectable ? {defaultSelected: true, onSelectedChange: on => window.chipSelections.push([index, on])} : {})}
            {...(s.removable ? {onRemove: () => window.chipRemovals.push(index)} : {})}
            className=${JSON.stringify(classes)} removeClassName=${JSON.stringify(classes)}>Remote</Chip></div>
        )}</>);`,
      loader: 'tsx',
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
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.setContent(
      `<style>${css}</style><div id="aria-control" aria-checked="true" class="${classes}"></div><div id="root"></div>`,
    )
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(() => document.querySelectorAll('#root > div').length === 8)
    assert.equal(
      await page.locator('#aria-control').evaluate((e) => getComputedStyle(e).opacity),
      '0.5',
      'the checked selector must have real CSS',
    )
    let index = 0
    const changes = []
    const removals = []
    for (const selectable of [false, true])
      for (const removable of [false, true])
        for (const disabled of [false, true]) {
          const owner = page.locator(`#chip-${index} > :first-child`)
          const buttons = page.locator(`#chip-${index} button`)
          const read = (locator) =>
            locator.evaluate((e) => {
              const css = getComputedStyle(e)
              return {
                border: css.borderTopWidth,
                opacity: css.opacity,
                checked: e.getAttribute('aria-checked'),
                ariaDisabled: e.getAttribute('aria-disabled'),
              }
            })
          const check = async (selected) => {
            assert.deepEqual(await read(owner), {
              border: selectable && !removable && selected ? '2px' : '0px',
              opacity: selectable && !removable && disabled ? '0.25' : '1',
              checked: null,
              ariaDisabled: null,
            })
            if (removable)
              assert.deepEqual(await read(buttons.last()), {
                border: '0px',
                opacity: disabled ? '0.25' : '1',
                checked: null,
                ariaDisabled: null,
              })
          }
          await check(selectable)
          if (selectable) {
            assert.equal(await buttons.first().getAttribute('aria-pressed'), 'true')
            assert.equal(await buttons.first().isDisabled(), disabled)
            if (!disabled) {
              await buttons.first().click()
              changes.push([index, false])
              assert.equal(await buttons.first().getAttribute('aria-pressed'), 'false')
              await check(false)
            }
          }
          if (removable) {
            assert.equal(await buttons.last().isDisabled(), disabled)
            if (!disabled) {
              await buttons.last().click()
              removals.push(index)
            }
          }
          index++
        }
    assert.deepEqual(await page.evaluate(() => window.chipSelections), changes)
    assert.deepEqual(await page.evaluate(() => window.chipRemovals), removals)
    assert.deepEqual(errors, [], 'browser callbacks must not throw')
  } finally {
    await page.close()
  }
})

test('ColorPicker semantic classes read each radio checked and disabled state without invented ARIA', {
  skip: !executablePath,
}, async () => {
  const classes =
    'size-8 border-0 border-solid outline-0 rounded-none opacity-100 disabled:opacity-25 enabled:rounded-lg not-disabled:mt-1 not-enabled:mb-1 aria-checked:border-2 not-aria-checked:border-4 aria-disabled:outline-8 aria-selected:opacity-50 not-aria-disabled:pt-1 not-aria-selected:pb-1'
  const selectedClasses =
    'aria-checked:mt-2 not-aria-checked:mb-2 disabled:opacity-50 enabled:outline-2 not-enabled:outline-4'
  const css = (
    await compile('@theme { --spacing: 0.25rem; --radius-lg: 8px; } @tailwind utilities;')
  ).build([...classes.split(' '), ...selectedClasses.split(' ')])
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {ColorPicker} from '@hozo/patterns';
        window.colorPickerSemanticChanges = [];
        const root = createRoot(document.getElementById('root'));
        window.renderColorPickerSemantics = value => root.render(<>{[false, true].map(disabled =>
          <section key={String(disabled)} id={'colors-' + disabled}>
            <ColorPicker accessibilityLabel="Theme colour" presets={['#ef4444','#3b82f6']}
              value={value} defaultValue="#3b82f6" disabled={disabled}
              onChange={hex => window.colorPickerSemanticChanges.push([disabled, hex])}
              swatchClassName=${JSON.stringify(classes)}
              selectedSwatchClassName=${JSON.stringify(selectedClasses)}/>
          </section>)}<section id="equivalent-colors"><ColorPicker accessibilityLabel="Equivalent colours"
            presets={['#f00','#ff0000','not-a-colour','#000000']} value={value ?? '#ff0000'}
            swatchClassName=${JSON.stringify(classes)} selectedSwatchClassName=${JSON.stringify(selectedClasses)}/>
          </section></>);
        window.renderColorPickerSemantics();`,
      loader: 'tsx',
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
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.setContent(`<style>${css}</style><div id="color-aria-control"
      aria-disabled="true" aria-selected="true" class="${classes}"></div><div id="root"></div>`)
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(
      () => document.querySelectorAll('#root button[role="radio"]').length === 8,
    )
    const control = await page.locator('#color-aria-control').evaluate((e) => {
      const css = getComputedStyle(e)
      return [css.outlineWidth, css.opacity]
    })
    assert.deepEqual(control, ['8px', '0.5'], 'absent-attribute selectors must have real CSS')
    const radios = (disabled) => page.locator(`#colors-${disabled} button[role="radio"]`)
    const check = async (disabled, selected) => {
      for (let index = 0; index < 2; index++) {
        const checked = index === selected
        assert.deepEqual(
          await radios(disabled)
            .nth(index)
            .evaluate((e) => {
              const css = getComputedStyle(e)
              return {
                checked: e.getAttribute('aria-checked'),
                disabled: e.matches(':disabled'),
                enabled: e.matches(':enabled'),
                ariaDisabled: e.getAttribute('aria-disabled'),
                selected: e.getAttribute('aria-selected'),
                border: css.borderTopWidth,
                radius: css.borderTopLeftRadius,
                opacity: css.opacity,
                outline: css.outlineWidth,
                margins: [css.marginTop, css.marginBottom],
                padding: [css.paddingTop, css.paddingBottom],
                background: css.backgroundColor,
              }
            }),
          {
            checked: String(checked),
            disabled,
            enabled: !disabled,
            ariaDisabled: null,
            selected: null,
            border: checked ? '2px' : '4px',
            radius: disabled ? '0px' : '8px',
            opacity: disabled ? (checked ? '0.5' : '0.25') : '1',
            outline: checked ? (disabled ? '4px' : '2px') : '0px',
            margins: [checked ? '8px' : disabled ? '0px' : '4px', disabled ? '4px' : '0px'],
            padding: ['4px', '4px'],
            background: index === 0 ? 'rgb(239, 68, 68)' : 'rgb(59, 130, 246)',
          },
          `${disabled}/${selected}/${index}`,
        )
      }
    }
    await check(false, 1)
    await check(true, 1)
    const equivalent = page.locator('#equivalent-colors button[role="radio"]')
    const readEquivalent = () =>
      equivalent.evaluateAll((nodes) =>
        nodes.map((e) => ({
          checked: e.getAttribute('aria-checked') === 'true',
          border: getComputedStyle(e).borderTopWidth,
        })),
      )
    assert.deepEqual(
      await readEquivalent(),
      [true, false, false, false].map((checked) => ({
        checked,
        border: checked ? '2px' : '4px',
      })),
    )
    await radios(false).nth(0).click()
    await check(false, 0)
    await check(true, 1)
    assert.deepEqual(await page.evaluate(() => window.colorPickerSemanticChanges), [
      [false, '#ef4444'],
    ])
    for (const radio of await radios(true).all()) assert.equal(await radio.isDisabled(), true)
    await page.evaluate(() => window.renderColorPickerSemantics('#ef4444'))
    await page.waitForFunction(
      () =>
        document.querySelector('#colors-true button[role="radio"]').getAttribute('aria-checked') ===
        'true',
    )
    await check(true, 0)
    await check(false, 0)
    await page.evaluate(() => window.renderColorPickerSemantics('#000000'))
    await page.waitForFunction(
      () =>
        document
          .querySelectorAll('#equivalent-colors button[role="radio"]')[3]
          .getAttribute('aria-checked') === 'true',
    )
    assert.deepEqual(
      await readEquivalent(),
      [false, false, false, true].map((checked) => ({
        checked,
        border: checked ? '2px' : '4px',
      })),
      'invalid preset fallback is not a checked colour',
    )
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
})

test('Stepper semantic classes distinguish button disabled state from descriptive rows and announcements', {
  skip: !executablePath,
}, async () => {
  const classes =
    'border-0 border-solid p-0 opacity-100 disabled:opacity-25 enabled:px-2 not-disabled:py-1 not-enabled:border-4 aria-selected:opacity-50 aria-disabled:px-4'
  const css = (await compile('@theme { --spacing: 0.25rem; } @tailwind utilities;')).build(
    classes.split(' '),
  )
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Stepper} from '@hozo/patterns';
        window.stepperSemanticSelections = [];
        createRoot(document.getElementById('root')).render(<>{[false, true].flatMap(clickable =>
          [false, true].map(disabled => <section key={clickable + '-' + disabled}
            id={'steps-' + clickable + '-' + disabled}><Stepper activeStep={1}
              steps={['completed','current','error','upcoming'].map(status => ({label:status,status,disabled,description:'Details'}))}
              {...(clickable ? {onStepPress: index => window.stepperSemanticSelections.push(index)} : {})}
              stepClassName=${JSON.stringify(classes)}
              completedStepClassName=${JSON.stringify(classes)}
              currentStepClassName=${JSON.stringify(classes)}
              errorStepClassName=${JSON.stringify(classes)}
              indicatorClassName=${JSON.stringify(classes)}
              completedIndicatorClassName=${JSON.stringify(classes)}
              currentIndicatorClassName=${JSON.stringify(classes)}
              errorIndicatorClassName=${JSON.stringify(classes)}
              descriptionClassName=${JSON.stringify(classes)} /></section>)
        )}</>);`,
      loader: 'tsx',
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
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.setContent(`<style>${css}</style><div id="step-aria-control" aria-selected="true"
      aria-disabled="true" class="${classes}"></div><div id="root"></div>`)
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(() => document.querySelectorAll('#root li').length === 16)
    const read = (locator) =>
      locator.evaluate((e) => {
        const style = getComputedStyle(e)
        return {
          disabled: e.matches(':disabled'),
          enabled: e.matches(':enabled'),
          selected: e.getAttribute('aria-selected'),
          ariaDisabled: e.getAttribute('aria-disabled'),
          opacity: style.opacity,
          border: style.borderTopWidth,
          padding: [style.paddingTop, style.paddingLeft],
        }
      })
    assert.equal((await read(page.locator('#step-aria-control'))).opacity, '0.5')
    assert.equal((await read(page.locator('#step-aria-control'))).padding[1], '16px')
    for (const clickable of [false, true])
      for (const disabled of [false, true]) {
        const rows = page.locator(`#steps-${clickable}-${disabled} li`)
        for (let index = 0; index < 4; index++) {
          const row = rows.nth(index)
          const owner = clickable ? row.locator('button') : row
          assert.deepEqual(
            await read(owner),
            {
              disabled: clickable && disabled,
              enabled: clickable && !disabled,
              selected: null,
              ariaDisabled: null,
              opacity: clickable && disabled ? '0.25' : '1',
              border: clickable && !disabled ? '0px' : '4px',
              padding: [
                clickable && disabled ? '0px' : '4px',
                clickable && !disabled ? '8px' : '0px',
              ],
            },
            `${clickable}/${disabled}/${index}`,
          )
          assert.equal(await row.getAttribute('aria-current'), index === 1 ? 'step' : null)
          // Decorations are spans: they match neither positive pseudo-class,
          // even when their enclosing button is disabled or current.
          for (const position of [0, 2]) {
            assert.deepEqual(await read(owner.locator('span[aria-hidden="true"]').nth(position)), {
              disabled: false,
              enabled: false,
              selected: null,
              ariaDisabled: null,
              opacity: '1',
              border: '4px',
              padding: ['4px', '0px'],
            })
          }
          if (clickable && !disabled) await owner.click()
        }
      }
    assert.deepEqual(await page.evaluate(() => window.stepperSemanticSelections), [0, 1, 2, 3])
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
})

test('Stepper focus stays on each button while decorative slots inherit only its typography', {
  skip: !executablePath,
}, async () => {
  const decorationClasses =
    'border-2 focus:outline-4 focus-visible:font-bold focus:focus-visible:border-4'
  const buttonClasses = 'focus:outline-4 focus-visible:font-bold'
  const css = (
    await compile(
      '@theme { --font-weight-normal: 400; --font-weight-bold: 700; } @tailwind utilities;',
    )
  ).build([...decorationClasses.split(' '), ...buttonClasses.split(' '), 'font-normal'])
  assert.ok(css.includes('font-weight: var(--font-weight-bold)'))
  const bundle = await build({
    stdin: {
      contents: `
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {Stepper} from '@hozo/patterns';
        window.stepperSelections = [];
        const steps = ['completed', 'current', 'error', 'upcoming'].map(status => ({
          label: status, status, description: 'Details for ' + status,
        })).concat({label: 'Disabled', disabled: true});
        const inherited = ${JSON.stringify(decorationClasses)};
        createRoot(document.getElementById('root')).render(<>
          {['inherit', 'own'].map(mode => {
            const classes = mode === 'own' ? 'font-normal ' + inherited : inherited;
            return <section key={mode} id={mode}><Stepper steps={steps} activeStep={1}
              onStepPress={index => window.stepperSelections.push([mode, index])}
              stepClassName=${JSON.stringify(buttonClasses)}
              indicatorClassName={classes} completedIndicatorClassName={classes}
              currentIndicatorClassName={classes} errorIndicatorClassName={classes}
              descriptionClassName={classes}/></section>;
          })}
        </>);
      `,
      loader: 'tsx',
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
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.setContent(
      `<style>${css}</style><button id="before">Before</button><div id="root"></div><button id="after">After</button>`,
    )
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(() => document.querySelectorAll('#root button').length === 10)
    await page.locator('#before').focus()
    for (const mode of ['inherit', 'own']) {
      for (let index = 0; index < 4; index++) {
        await page.keyboard.press('Tab')
        const button = page.locator(`#${mode} button`).nth(index)
        assert.equal(await button.evaluate((e) => e === document.activeElement), true)
        assert.equal(await button.evaluate((e) => getComputedStyle(e).outlineWidth), '4px')
        assert.equal(await button.evaluate((e) => getComputedStyle(e).fontWeight), '700')
        const spans = button.locator('span[aria-hidden="true"]')
        assert.equal(await spans.count(), 3, 'mark, label and description')
        for (const position of [0, 2]) {
          const decoration = spans.nth(position)
          const facts = await decoration.evaluate((e) => {
            e.focus()
            const style = getComputedStyle(e)
            return {
              focused: e.matches(':focus'),
              visible: e.matches(':focus-visible'),
              outline: style.outlineWidth,
              weight: style.fontWeight,
              border: style.borderTopWidth,
            }
          })
          assert.equal(facts.focused, false)
          assert.equal(facts.visible, false)
          assert.notEqual(facts.outline, '4px')
          assert.equal(facts.border, '2px')
          assert.equal(facts.weight, mode === 'inherit' ? '700' : '400')
        }
        assert.equal(await button.evaluate((e) => e === document.activeElement), true)
        await page.keyboard.press('Enter')
      }
      assert.equal(await page.locator(`#${mode} button`).nth(4).isDisabled(), true)
    }
    await page.keyboard.press('Tab')
    assert.equal(await page.locator('#after').evaluate((e) => e === document.activeElement), true)
    await page.keyboard.press('Shift+Tab')
    assert.equal(
      await page
        .locator('#own button')
        .nth(3)
        .evaluate((e) => e === document.activeElement),
      true,
    )
    assert.deepEqual(
      await page.evaluate(() => window.stepperSelections),
      ['inherit', 'own'].flatMap((mode) => [0, 1, 2, 3].map((index) => [mode, index])),
    )
    assert.deepEqual(errors, [], 'browser callbacks must not throw')
  } finally {
    await page.close()
  }
})

test('CommandPalette semantic classes follow option attributes while shortcuts only inherit typography', {
  skip: !executablePath,
}, async () => {
  const classes =
    'm-0 border-0 border-solid outline-0 opacity-100 font-normal text-black disabled:ml-8 enabled:mr-8 not-disabled:mt-1 not-enabled:mb-1 aria-selected:font-bold aria-selected:text-blue-500 not-aria-selected:border-2 aria-disabled:opacity-50 not-aria-disabled:rounded-lg aria-checked:outline-8 not-aria-checked:pt-1'
  const activeClasses = 'aria-selected:border-4 not-aria-selected:outline-8'
  const shortcutClasses =
    'border-0 border-solid aria-selected:border-4 aria-disabled:opacity-25 disabled:ml-8 enabled:mr-8'
  const css = (
    await compile(
      '@theme { --spacing: 0.25rem; --radius-lg: 8px; --font-weight-normal: 400; --font-weight-bold: 700; --color-black: #000; --color-blue-500: #2b7fff; } @tailwind utilities;',
    )
  ).build([...classes.split(' '), ...activeClasses.split(' '), ...shortcutClasses.split(' ')])
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {CommandPalette} from '@hozo/patterns';
        window.paletteSemanticSelections = []; window.paletteSemanticClosures = [];
        const root = createRoot(document.getElementById('root'));
        window.renderPaletteSemantics = (disabledNames = ['Blocked'], open = true) =>
          root.render(<CommandPalette open={open} portal={false}
            commands={['Blocked','Alpha','Beta'].map(label => ({id:label,label,shortcut:label[0],
              disabled:disabledNames.includes(label),onSelect:()=>window.paletteSemanticSelections.push(label)}))}
            onOpenChange={open => window.paletteSemanticClosures.push(open)}
            itemClassName=${JSON.stringify(classes)} activeItemClassName=${JSON.stringify(activeClasses)}
            shortcutClassName=${JSON.stringify(shortcutClasses)}/>);
        window.renderPaletteSemantics();`,
      loader: 'tsx',
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
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.setContent(
      `<style>${css}</style><button id="pseudo-control" disabled aria-checked="true" class="${classes}">Control</button><div id="root"></div>`,
    )
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'combobox')
    assert.deepEqual(
      await page.locator('#pseudo-control').evaluate((e) => {
        const css = getComputedStyle(e)
        return [css.marginLeft, css.outlineWidth]
      }),
      ['32px', '8px'],
      'non-matching pseudo-class/ARIA rules must have real CSS',
    )
    const field = page.getByRole('combobox')
    const option = (label) => page.getByRole('option', { name: label, exact: true })
    const check = async (
      current,
      disabledNames = ['Blocked'],
      visible = ['Blocked', 'Alpha', 'Beta'],
    ) => {
      assert.equal(await page.getByRole('option').count(), visible.length)
      for (const label of visible) {
        const selected = label === current
        const disabled = disabledNames.includes(label)
        assert.deepEqual(
          await option(label).evaluate((e) => {
            const css = getComputedStyle(e)
            return {
              selected: e.getAttribute('aria-selected'),
              ariaDisabled: e.getAttribute('aria-disabled'),
              checked: e.getAttribute('aria-checked'),
              disabled: e.matches(':disabled'),
              enabled: e.matches(':enabled'),
              margins: [css.marginTop, css.marginRight, css.marginBottom, css.marginLeft],
              border: css.borderTopWidth,
              outline: css.outlineWidth,
              opacity: css.opacity,
              padding: css.paddingTop,
              weight: css.fontWeight,
              color: css.color,
            }
          }),
          {
            selected: String(selected),
            ariaDisabled: disabled ? 'true' : null,
            checked: null,
            disabled: false,
            enabled: false,
            margins: ['4px', '0px', '4px', '0px'],
            border: selected ? '4px' : '2px',
            outline: '0px',
            opacity: disabled ? '0.5' : '1',
            padding: '4px',
            weight: selected ? '700' : '400',
            color: selected ? 'rgb(43, 127, 255)' : 'rgb(0, 0, 0)',
          },
          label,
        )
        const shortcut = option(label).locator('span[aria-hidden]')
        assert.deepEqual(
          await shortcut.evaluate((e) => {
            e.focus()
            const css = getComputedStyle(e)
            return {
              selected: e.getAttribute('aria-selected'),
              ariaDisabled: e.getAttribute('aria-disabled'),
              disabled: e.matches(':disabled'),
              enabled: e.matches(':enabled'),
              focused: e.matches(':focus'),
              border: css.borderTopWidth,
              opacity: css.opacity,
              weight: css.fontWeight,
              color: css.color,
              margins: [css.marginLeft, css.marginRight],
            }
          }),
          {
            selected: null,
            ariaDisabled: null,
            disabled: false,
            enabled: false,
            focused: false,
            border: '0px',
            opacity: '1',
            weight: selected ? '700' : '400',
            color: selected ? 'rgb(43, 127, 255)' : 'rgb(0, 0, 0)',
            margins: ['0px', '0px'],
          },
          `${label} shortcut`,
        )
      }
      assert.equal(
        await field.getAttribute('aria-activedescendant'),
        current === null ? null : await option(current).getAttribute('id'),
      )
      assert.equal(
        await field.evaluate((e) => e === document.activeElement),
        true,
        'input keeps physical focus',
      )
    }
    await check('Alpha')
    // aria-disabled divs still receive DOM clicks. Bypass Playwright's own
    // ARIA actionability refusal to test the component's real run guard.
    await option('Blocked').click({ force: true })
    await check('Alpha')
    assert.deepEqual(await page.evaluate(() => window.paletteSemanticSelections), [])
    await option('Beta').hover()
    await check('Beta')
    await page.keyboard.press('Enter')
    assert.deepEqual(await page.evaluate(() => window.paletteSemanticSelections), ['Beta'])
    await field.fill('Alpha')
    await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 1)
    await check('Alpha', ['Blocked'], ['Alpha'])
    await field.fill('')
    await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 3)
    await page.evaluate(() => window.renderPaletteSemantics(['Blocked', 'Alpha', 'Beta']))
    await page.waitForFunction(
      () => !document.querySelector('[role="combobox"]').hasAttribute('aria-activedescendant'),
    )
    await check(null, ['Blocked', 'Alpha', 'Beta'])
    await page.keyboard.press('Enter')
    assert.deepEqual(await page.evaluate(() => window.paletteSemanticSelections), ['Beta'])
    assert.deepEqual(await page.evaluate(() => window.paletteSemanticClosures), [false])
    await page.evaluate(() => window.renderPaletteSemantics(['Blocked'], false))
    await page.waitForFunction(() => !document.querySelector('[role="combobox"]'))
    await page.evaluate(() => window.renderPaletteSemantics())
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'combobox')
    assert.equal(await field.inputValue(), '')
    await check('Alpha')
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
})

test('CommandPalette shortcuts remain decorative while the real input keeps DOM focus', {
  skip: !executablePath,
}, async () => {
  const classes =
    'border-2 font-normal focus:outline-4 focus-visible:font-bold focus:focus-visible:border-4'
  const inputClasses = 'focus:outline-4 focus-visible:font-bold'
  const css = (
    await compile(
      '@theme { --font-weight-normal: 400; --font-weight-bold: 700; } @tailwind utilities;',
    )
  ).build([...classes.split(' '), ...inputClasses.split(' ')])
  assert.ok(css.includes('font-weight: var(--font-weight-bold)'))
  const bundle = await build({
    stdin: {
      contents: `
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {CommandPalette} from '@hozo/patterns';
        window.paletteSelections = []; window.paletteClosures = [];
        const commands = ['Alpha', 'Beta'].map(label => ({id: label, label,
          shortcut: label[0], onSelect: () => window.paletteSelections.push(label)}));
        createRoot(document.getElementById('root')).render(<CommandPalette open portal={false}
          commands={commands} onOpenChange={open => window.paletteClosures.push(open)}
          itemClassName=${JSON.stringify(classes)} activeItemClassName="focus:outline-4"
          shortcutClassName=${JSON.stringify(classes)} inputClassName=${JSON.stringify(inputClasses)}/>);
      `,
      loader: 'tsx',
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
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.setContent(`<style>${css}</style><div id="root"></div>`)
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const field = page.getByRole('combobox')
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'combobox')
    assert.equal(await field.evaluate((e) => getComputedStyle(e).outlineWidth), '4px')
    assert.equal(await field.evaluate((e) => getComputedStyle(e).fontWeight), '700')
    const shortcuts = page.getByRole('option').locator('span[aria-hidden]')
    assert.equal(await shortcuts.count(), 2)
    const assertShortcuts = async () => {
      const options = await page.getByRole('option').evaluateAll((nodes) =>
        nodes.map((e) => {
          e.focus()
          return {
            focused: e.matches(':focus'),
            visible: e.matches(':focus-visible'),
            outline: getComputedStyle(e).outlineWidth,
            weight: getComputedStyle(e).fontWeight,
          }
        }),
      )
      for (const option of options) {
        assert.equal(option.focused, false)
        assert.equal(option.visible, false)
        assert.notEqual(option.outline, '4px')
        assert.equal(option.weight, '400')
      }
      const results = await shortcuts.evaluateAll((nodes) =>
        nodes.map((e) => {
          // A decorative shortcut cannot take focus, even via a programmatic request.
          e.focus()
          const style = getComputedStyle(e)
          return {
            focused: e.matches(':focus'),
            visible: e.matches(':focus-visible'),
            outline: style.outlineWidth,
            weight: style.fontWeight,
            border: style.borderTopWidth,
          }
        }),
      )
      for (const result of results) {
        assert.equal(result.focused, false)
        assert.equal(result.visible, false)
        assert.notEqual(result.outline, '4px')
        assert.equal(result.weight, '400')
        assert.equal(result.border, '2px')
      }
      assert.equal(await field.evaluate((e) => e === document.activeElement), true)
    }
    await assertShortcuts()
    await page.keyboard.press('ArrowDown')
    assert.equal(
      await field.getAttribute('aria-activedescendant'),
      await page.getByRole('option').nth(1).getAttribute('id'),
    )
    await assertShortcuts()
    await shortcuts.nth(1).click()
    assert.deepEqual(errors, [], 'browser callbacks must not throw')
    assert.deepEqual(await page.evaluate(() => window.paletteSelections), ['Beta'])
    assert.equal(await field.evaluate((e) => e === document.activeElement), true)
    await field.fill('Alpha')
    await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 1)
    await assertShortcuts()
    await page.keyboard.press('Enter')
    assert.deepEqual(errors, [], 'browser callbacks must not throw')
    assert.deepEqual(await page.evaluate(() => window.paletteSelections), ['Beta', 'Alpha'])
    assert.deepEqual(await page.evaluate(() => window.paletteClosures), [false, false])
  } finally {
    await page.close()
  }
})

test('OTP semantic classes separate real input mutability from decorative spans', {
  skip: !executablePath,
}, async () => {
  const inputClasses =
    'outline-0 rounded-none enabled:rounded-lg disabled:outline-offset-4 not-disabled:outline-offset-2 read-only:outline-2 not-read-only:outline-4 read-only:focus:outline-6 aria-disabled:opacity-25'
  const decorationClasses =
    'size-8 outline-0 read-only:outline-2 disabled:outline-offset-8 enabled:opacity-25 aria-disabled:rounded-lg'
  const css = (
    await compile('@theme {--spacing:0.25rem; --radius-lg:8px;} @tailwind utilities;')
  ).build([...inputClasses.split(' '), ...decorationClasses.split(' ')])
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {OtpInput} from '@hozo/patterns';
      const cases = []; for(const mask of [false,true]) for(const disabled of [false,true])
        for(const readOnly of [false,true]) cases.push({mask,disabled,readOnly});
      createRoot(document.getElementById('root')).render(<>{cases.map((props,index)=><section key={index} id={'otp-sem-'+index}>
        <OtpInput {...props} accessibilityLabel={'Code '+index} value="1" length={2} showCaret={false}
          inputClassName=${JSON.stringify(inputClasses)} className=${JSON.stringify(decorationClasses)}
          cellClassName=${JSON.stringify(decorationClasses)} filledCellClassName=${JSON.stringify(decorationClasses)}
          activeCellClassName=${JSON.stringify(decorationClasses)} /></section>)}</>);`,
      loader: 'tsx',
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
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.setContent(
      `<style>${css}</style><div id="otp-aria-control" aria-disabled="true" class="${inputClasses}"></div><div id="root"></div>`,
    )
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(() => document.querySelectorAll('#root input').length === 8)
    assert.equal(
      await page.locator('#otp-aria-control').evaluate((e) => getComputedStyle(e).opacity),
      '0.25',
    )
    let index = 0
    for (const mask of [false, true])
      for (const disabled of [false, true])
        for (const readOnly of [false, true]) {
          const wrapper = page.locator(`#otp-sem-${index} > div`)
          const input = wrapper.locator('input')
          assert.deepEqual(
            await input.evaluate((e) => {
              const css = getComputedStyle(e)
              return {
                disabled: e.matches(':disabled'),
                enabled: e.matches(':enabled'),
                readOnly: e.matches(':read-only'),
                ariaDisabled: e.getAttribute('aria-disabled'),
                outline: css.outlineWidth,
                offset: css.outlineOffset,
                radius: css.borderTopLeftRadius,
                opacity: css.opacity,
                type: e.getAttribute('type'),
              }
            }),
            {
              disabled,
              enabled: !disabled,
              readOnly: disabled || readOnly,
              ariaDisabled: null,
              outline: disabled || readOnly ? '2px' : '4px',
              offset: disabled ? '4px' : '2px',
              radius: disabled ? '0px' : '8px',
              opacity: '1',
              type: mask ? 'password' : 'text',
            },
          )
          if (!disabled) {
            await input.focus()
            assert.equal(await input.evaluate((e) => e === document.activeElement), true)
            assert.equal(
              await input.evaluate((e) => getComputedStyle(e).outlineWidth),
              readOnly ? '6px' : '4px',
            )
          }
          for (const decoration of [
            wrapper,
            ...(await wrapper.locator('span[aria-hidden="true"]').all()),
          ]) {
            assert.deepEqual(
              await decoration.evaluate((e) => {
                const css = getComputedStyle(e)
                return {
                  disabled: e.matches(':disabled'),
                  enabled: e.matches(':enabled'),
                  readOnly: e.matches(':read-only'),
                  focused: e.matches(':focus'),
                  ariaDisabled: e.getAttribute('aria-disabled'),
                  outline: css.outlineWidth,
                  opacity: css.opacity,
                }
              }),
              {
                disabled: false,
                enabled: false,
                readOnly: true,
                focused: false,
                ariaDisabled: null,
                outline: '2px',
                opacity: '1',
              },
            )
          }
          index++
        }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
})

test('OTP focus belongs to the one input, not active or filled decorative cells', {
  skip: !executablePath,
}, async () => {
  const cellClasses =
    'border-2 opacity-50 font-normal focus:outline-4 focus-visible:font-bold focus:focus-visible:border-4'
  const inputClasses = 'focus:outline-4 focus-visible:font-bold'
  const css = (
    await compile(
      '@theme { --font-weight-normal: 400; --font-weight-bold: 700; } @tailwind utilities;',
    )
  ).build([...cellClasses.split(' '), ...inputClasses.split(' ')])
  assert.ok(
    css.includes('font-weight: var(--font-weight-bold)'),
    'the focus typography rule must exist',
  )
  const bundle = await build({
    stdin: {
      contents: `
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {OtpInput} from '@hozo/patterns';
        const slots = ['cellClassName', 'activeCellClassName', 'filledCellClassName'];
        createRoot(document.getElementById('root')).render(<>
          <button id="before">Before</button>
          {slots.map(slot => <OtpInput key={slot} testID={slot} accessibilityLabel={slot}
            length={3} defaultValue="1" inputClassName=${JSON.stringify(inputClasses)}
            {...{[slot]: ${JSON.stringify(cellClasses)}}}/>) }
          <button id="after">After</button>
        </>);
      `,
      loader: 'tsx',
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
    await page.setContent(`<style>${css}</style><div id="root"></div>`)
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.locator('#before').focus()
    for (const slot of ['cellClassName', 'activeCellClassName', 'filledCellClassName']) {
      const root = page.getByTestId(slot)
      const field = root.locator('input')
      const cells = root.locator(':scope > span[aria-hidden]')
      assert.equal(await field.count(), 1)
      assert.equal(await cells.count(), 3)
      // Real Tab navigation: the virtual cells must not insert extra stops.
      await page.keyboard.press('Tab')
      assert.equal(await field.evaluate((e) => e === document.activeElement), true, slot)
      await page.keyboard.press('End')
      assert.equal(await field.evaluate((e) => getComputedStyle(e).outlineWidth), '4px', slot)
      assert.equal(await field.evaluate((e) => getComputedStyle(e).fontWeight), '700', slot)
      assert.equal(await root.evaluate((e) => e.matches(':focus')), false, slot)
      const assertCells = async () => {
        const styles = await cells.evaluateAll((nodes) =>
          nodes.map((e) => {
            const style = getComputedStyle(e)
            return {
              focused: e.matches(':focus'),
              visible: e.matches(':focus-visible'),
              outline: style.outlineWidth,
              weight: style.fontWeight,
            }
          }),
        )
        for (const style of styles) {
          assert.equal(style.focused, false, slot)
          assert.equal(style.visible, false, slot)
          assert.notEqual(style.outline, '4px', slot)
          assert.notEqual(style.weight, '700', slot)
        }
      }
      await assertCells()
      const target = slot === 'activeCellClassName' ? 1 : 0
      assert.deepEqual(
        await cells.nth(target).evaluate((e) => {
          const style = getComputedStyle(e)
          return [style.opacity, style.borderTopWidth, style.fontWeight]
        }),
        ['0.5', '2px', '400'],
        `${slot}: unconditional decoration still applies`,
      )
      await field.press('Home')
      await page.waitForFunction((slot) => {
        const root = document.querySelector(`[data-testid="${slot}"]`)
        return (
          root.querySelector('[data-hozo-otp-caret]')?.parentElement ===
          root.querySelector('span[aria-hidden]')
        )
      }, slot)
      await assertCells()
      assert.equal(await root.locator('[data-hozo-otp-caret]').getAttribute('aria-hidden'), 'true')
      assert.equal(
        await root
          .locator('[data-hozo-otp-caret]')
          .evaluate((e) => getComputedStyle(e).pointerEvents),
        'none',
      )
      await field.press('Shift+ArrowRight')
      assert.equal(
        await root.locator('[data-hozo-otp-caret]').count(),
        0,
        'a selection range hides the caret',
      )
      // Blur independently of Tab, then restore the field so the next Tab
      // continues the real browser's order rather than a simulated iterator.
      await field.evaluate((e) => e.blur())
      await page.waitForFunction(
        (slot) => !document.querySelector(`[data-testid="${slot}"] [data-hozo-otp-caret]`),
        slot,
      )
      await assertCells()
      if (slot === 'activeCellClassName')
        assert.equal(await cells.nth(0).evaluate((e) => getComputedStyle(e).opacity), '1')
      await field.focus()
    }
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'after')
    await page.keyboard.press('Shift+Tab')
    assert.equal(
      await page.getByLabel('filledCellClassName').evaluate((e) => e === document.activeElement),
      true,
    )
  } finally {
    await page.close()
  }
})

test('standalone NativeSelect SSR shares the pointer policy without hydration', {
  skip: !executablePath,
}, async () => {
  const utilities = ['cursor-default', 'cursor-auto', 'cursor-wait', 'cursor-not-allowed']
  cache.scanFile('picker-cursors.ts', `export const classes = '${utilities.join(' ')}'`, 1)
  const cssVariants = [
    ['Hozo candidates', cache.renderCss(undefined, utilities)],
    ['Tailwind', (await compile('@tailwind utilities;')).build(utilities)],
  ]
  for (const [name, css] of cssVariants) {
    for (const utility of utilities) assert.ok(css.includes(`.${utility}`), `${name}: ${utility}`)
  }
  // NativeSelect is a platform-owned picker, not a DOM primitive that may
  // be substituted. Exercise the same module-lowering boundary as bundlers;
  // an unchanged module is still rendered through its published form entry.
  const source = `import {NativeSelect} from '@hozo/form';
    export function C(props) { return <NativeSelect {...props}/> }`
  const lowered = lowerModule(source, 'Picker.tsx', 'Picker.tsx', compiler, '')
  assert.deepEqual(lowered?.diagnostics ?? [], [])
  const { C } = evaluate(lowered?.code ?? source, {
    require: (specifier) => {
      assert.equal(specifier, '@hozo/form')
      return { NativeSelect }
    },
  })
  const options = [
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
  ]
  const page = await browser.newPage()
  try {
    for (const [pipeline, Component] of [
      ['SSR', NativeSelect],
      ['compiler', C],
    ]) {
      for (const [cssName, css] of cssVariants) {
        for (const [className, expected] of [
          [undefined, 'pointer'],
          ['cursor-default', 'default'],
          ['cursor-auto', 'auto'],
          ['cursor-wait', 'wait'],
          ['cursor-not-allowed', 'not-allowed'],
        ]) {
          const label = `${pipeline}/${cssName}/${className ?? 'default'}`
          const render = (disabled) =>
            renderToStaticMarkup(
              createElement(Component, {
                options,
                id: 'language',
                accessibilityLabel: 'Language',
                defaultValue: 'en',
                className,
                disabled,
              }),
            )
          await page.setContent(`<style>${css}</style>${render(false)}`)
          const select = page.locator('#language')
          const cursor = () => select.evaluate((e) => getComputedStyle(e).cursor)
          assert.equal(await cursor(), expected, label)
          assert.equal(await select.getAttribute('data-hozo-pressable'), '', label)
          // The consumer uses a DOM listener, not a React root or hydration.
          await select.evaluate((e) =>
            e.addEventListener('change', () => {
              document.body.dataset.language = e.value
            }),
          )
          await select.selectOption('ja')
          assert.equal(await page.locator('body').getAttribute('data-language'), 'ja', label)
          // Native DOM disabled and disabled fieldset inheritance must work
          // even when React never updates data-hozo-disabled.
          await select.evaluate((e) => {
            e.disabled = true
          })
          assert.equal(await cursor(), className ? expected : 'default', `${label}/DOM disabled`)
          await select.evaluate((e) => {
            e.disabled = false
          })
          assert.equal(await cursor(), expected, `${label}/re-enabled`)
          await page.setContent(
            `<style>${css}</style><fieldset disabled>${render(false)}</fieldset>`,
          )
          assert.equal(await cursor(), className ? expected : 'default', `${label}/fieldset`)
          await page.setContent(`<style>${css}</style>${render(true)}`)
          assert.equal(await select.getAttribute('data-hozo-disabled'), '', label)
          assert.equal(await cursor(), className ? expected : 'default', `${label}/SSR disabled`)
        }
      }
    }
  } finally {
    await page.close()
  }
})

test('disabled navigation keeps compiled, fallback and spread hosts out of Tab order and activation', {
  skip: !executablePath,
}, async () => {
  const fixtures = []
  for (const name of ['Button', 'Link', 'Pressable']) {
    for (const mode of ['compiled', 'fallback', 'spread']) {
      const id = `${name}-${mode}`
      const attrs = 'href="#docs" disabled={blocked} onPress={onPress} nativeID={id}'
      const element =
        mode === 'spread'
          ? `<${name} {...{href: '#docs', disabled: blocked, onPress}} nativeID={id}>Docs</${name}>`
          : `<${name} ${attrs}>Docs</${name}>`
      const jsx =
        mode === 'fallback'
          ? element
          : compiler.compile(
              `import {${name}} from '@hozo/core'; function C({blocked, onPress, id}) {return ${element}}`,
            )[0].jsx
      fixtures.push({ id, jsx })
    }
  }
  // Measured/responder-capable Pressable keeps its richer host. It must
  // delegate the same anchor contract rather than become a disabled div.
  fixtures.push({
    id: 'Pressable-measured',
    jsx: compiler.compile(
      `import {Pressable} from '@hozo/core'; function C({blocked, onPress, id}) {return <Pressable href="#docs" onLayout={()=>{}} disabled={blocked} onPress={onPress} nativeID={id}>Docs</Pressable>}`,
    )[0].jsx,
  })
  const definitions = fixtures
    .map(({ jsx }, index) => `function C${index}({blocked, onPress, id}) {return ${jsx}}`)
    .join('\n')
  const bundle = await build({
    stdin: {
      contents: `
      import React, {useEffect, useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {Button, Link, Pressable} from '@hozo/primitives';
      ${definitions}
      window.activations = [];
      const cases = [${fixtures.map(({ id }, index) => `{id:${JSON.stringify(id)}, C:C${index}}`).join(',')}];
      function App() {
        const [blocked, setBlocked] = useState(true);
        window.setBlocked = setBlocked;
        useEffect(() => {document.body.dataset.blocked = String(blocked)}, [blocked]);
        return <><button id="before">Before</button>{cases.map(({id,C}) =>
          <C key={id} id={id} blocked={blocked} onPress={event=>{window.activations.push(id);event.preventDefault()}}/>
        )}<button id="after">After</button></>
      }
      createRoot(document.getElementById('root')).render(<App/>);
    `,
      loader: 'tsx',
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
    await page.setContent('<div id="root"></div>')
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(() => document.body.dataset.blocked === 'true')
    const assertDisabled = async () => {
      for (const { id } of fixtures) {
        const host = page.locator(`#${id}`)
        assert.equal(await host.evaluate((e) => e.tagName), 'A', id)
        assert.equal(await host.getAttribute('disabled'), null, id)
        assert.equal(await host.getAttribute('aria-disabled'), 'true', id)
        assert.equal(await host.getAttribute('data-hozo-disabled'), '', id)
        assert.equal(await host.getAttribute('tabindex'), '-1', id)
        await host.evaluate((e) => e.click())
        const cancelled = await host.evaluate(
          (e) =>
            !e.dispatchEvent(
              new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }),
            ),
        )
        assert.equal(cancelled, true, `${id}: auxiliary activation must be prevented`)
        await host.focus()
        await page.keyboard.press('Enter')
      }
      assert.deepEqual(await page.evaluate(() => window.activations), [])
      await page.locator('#before').focus()
      await page.keyboard.press('Tab')
      assert.equal(await page.evaluate(() => document.activeElement.id), 'after')
      await page.keyboard.press('Shift+Tab')
      assert.equal(await page.evaluate(() => document.activeElement.id), 'before')
    }
    await assertDisabled()
    await page.evaluate(() => window.setBlocked(false))
    await page.waitForFunction(() => document.body.dataset.blocked === 'false')
    await page.locator('#before').focus()
    for (const { id } of fixtures) {
      await page.keyboard.press('Tab')
      assert.equal(await page.evaluate(() => document.activeElement.id), id)
      assert.equal(await page.locator(`#${id}`).getAttribute('data-hozo-disabled'), null)
      await page.keyboard.press('Enter')
    }
    assert.deepEqual(
      await page.evaluate(() => window.activations),
      fixtures.map(({ id }) => id),
    )
    await page.evaluate(() => {
      window.activations = []
      window.setBlocked(true)
    })
    await page.waitForFunction(() => document.body.dataset.blocked === 'true')
    await assertDisabled()
  } finally {
    await page.close()
  }
})

test('Button host IDs and metadata work with DOM listeners without React hydration', {
  skip: !executablePath,
}, async () => {
  const [web] = compiler.compile(
    `import {Button} from '@hozo/core'; export function C(){return <Button nativeID="winget-copy" data-copy-label="コピー" data-copied-label="完了">Copy</Button>}`,
  )
  const { C } = evaluate(`export function C(){return ${web.jsx}}`)
  const markup = [
    renderToStaticMarkup(createElement(C)),
    renderToStaticMarkup(
      createElement(
        ButtonFallback,
        {
          nativeID: 'winget-copy',
          'data-copy-label': 'コピー',
          'data-copied-label': '完了',
        },
        'Copy',
      ),
    ),
  ]
  const page = await browser.newPage()
  try {
    for (const html of markup) {
      await page.setContent(html)
      await page.evaluate(() => {
        const button = document.getElementById('winget-copy')
        if (!(button instanceof HTMLButtonElement)) throw new Error('ID must name the real button')
        if (button.type !== 'button') throw new Error('safe non-submitting default changed')
        button.addEventListener('click', () => {
          button.textContent = button.dataset.copiedLabel
        })
      })
      await page.locator('#winget-copy').click()
      assert.equal(await page.locator('#winget-copy').textContent(), '完了')
      assert.equal(await page.locator('#winget-copy').getAttribute('data-copy-label'), 'コピー')
      await page.evaluate(() => {
        document.getElementById('winget-copy').disabled = true
        document.getElementById('winget-copy').textContent = 'disabled'
        document.getElementById('winget-copy').click()
      })
      assert.equal(await page.locator('#winget-copy').textContent(), 'disabled')
    }
  } finally {
    await page.close()
  }
})

test('the real Web Chip keeps ancestor hover/active on its row but child focus on its buttons', {
  skip: !executablePath,
}, async () => {
  const { html, css } = await chipAncestorFixture()
  const page = await browser.newPage()
  try {
    await page.setContent(`<style>${css}</style><div id="fixture">${html}</div>`)
    const row = page.locator('#fixture > span')
    const buttons = row.locator('button')
    assert.equal(await buttons.count(), 2)
    const look = () =>
      row.evaluate((node) => ({
        background: getComputedStyle(node).backgroundColor,
        opacity: getComputedStyle(node).opacity,
        focused: node.matches(':focus'),
        focusVisible: node.matches(':focus-visible'),
      }))
    await buttons.nth(0).hover()
    assert.equal((await look()).background, 'rgb(18, 52, 86)')
    await buttons.nth(1).hover()
    assert.equal((await look()).background, 'rgb(18, 52, 86)')
    await buttons.nth(1).focus()
    assert.equal((await look()).focused, false)
    assert.equal((await look()).focusVisible, false)
    assert.equal((await look()).opacity, '1')
    assert.equal(
      await buttons.nth(1).evaluate((node) => getComputedStyle(node).outlineWidth),
      '2px',
    )
    await page.mouse.down()
    assert.equal((await look()).opacity, '0.5')
    await page.mouse.up()
    assert.equal((await look()).opacity, '1')
    const box = await row.boundingBox()
    assert.ok(box)
    await page.mouse.move(box.x + 2, box.y + 2)
    assert.equal((await look()).background, 'rgb(18, 52, 86)', 'row padding is also hovered')
    await page.mouse.move(500, 500)
    assert.equal((await look()).background, 'rgba(0, 0, 0, 0)')
  } finally {
    await page.close()
  }
})

test('the previous unlayered candidate sheet reproduces the reported raw-markup failure', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  try {
    await page.setContent(`<style>${candidateCss}</style>`)
    // Ask Chrome for the actual generated fallback rules, then remove only
    // their new layer wrapper. This is the old candidate cascade, not a
    // hand-written stand-in that might omit the interfering utility.
    const legacy = await page.evaluate(() => {
      const layer = [...document.styleSheets[0].cssRules].find(
        (rule) => rule.name === 'utilities.hozo-candidates',
      )
      return [...layer.cssRules].map((rule) => rule.cssText).join('\n')
    })
    await page.setContent(
      `<style>html { font-size: 16px }</style><style>${tailwindCss}</style><style>${legacy}</style><div id="grid" class="grid grid-cols-1 md:grid-cols-3"></div><div id="flex" class="flex flex-col sm:flex-row"></div>`,
    )
    assert.deepEqual(
      await page.evaluate(() => ({
        columns: getComputedStyle(document.getElementById('grid')).gridTemplateColumns.split(' ')
          .length,
        direction: getComputedStyle(document.getElementById('flex')).flexDirection,
      })),
      { columns: 1, direction: 'column' },
    )
  } finally {
    await page.close()
  }
})

for (const order of ['candidate-first', 'tailwind-first']) {
  test(`raw Tailwind variants keep their cascade with ${order}`, {
    skip: !executablePath,
  }, async () => {
    assert.doesNotMatch(candidateCss, /\.md\\:grid-cols-3/)
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    try {
      const sheets =
        order === 'candidate-first' ? [candidateCss, tailwindCss] : [tailwindCss, candidateCss]
      await page.setContent(`<style>html { font-size: 16px }</style>${sheets.map((css) => `<style>${css}</style>`).join('')}
        <div id="grid" class="grid grid-cols-1 md:grid-cols-3"></div>
        <div id="flex" class="flex flex-col sm:flex-row"></div>
        <div id="padding" class="p-4 md:p-8"></div><div id="important" class="p-4! md:p-8"></div>`)
      for (const width of [375, 700, 1200]) {
        await page.setViewportSize({ width, height: 800 })
        const actual = await page.evaluate(() => ({
          columns: getComputedStyle(document.getElementById('grid')).gridTemplateColumns.split(' ')
            .length,
          direction: getComputedStyle(document.getElementById('flex')).flexDirection,
          padding: getComputedStyle(document.getElementById('padding')).paddingTop,
          important: getComputedStyle(document.getElementById('important')).paddingTop,
        }))
        assert.deepEqual(actual, {
          columns: width >= 768 ? 3 : 1,
          direction: width >= 640 ? 'row' : 'column',
          padding: width >= 768 ? '32px' : '16px',
          important: '16px',
        })
      }
    } finally {
      await page.close()
    }
  })
}

test('owned static plus dynamic styles still match the Native style array, without styling raw descendants', {
  skip: !executablePath,
}, async () => {
  const source =
    // biome-ignore lint/suspicious/noTemplateCurlyInString: authored TSX, not this test's interpolation
    "import { View } from '@hozo/core'; const Example = () => <View className={`p-3 ${dynamic}`} />"
  const web = compiler.compile(source)[0]
  const native = compiler.compileNative(source)[0]
  const { hozoClasses } = evaluate(cache.renderNativeModule().replace(/^import .*$/gm, ''), {
    createClassResolver,
  })
  const nativeElement = evaluate(
    `const hozoStyles = ${native.styles}\nmodule.exports = (${native.jsx})`,
    {
      dynamic: 'p-4 flex-row',
      hozoClasses,
      View: 'View',
      StyleSheet: { create: (styles) => styles },
      h: (type, props) => ({ type, props }),
    },
  )
  const nativeStyle = Object.assign(
    {},
    ...[nativeElement.props.style].flat(Infinity).filter(Boolean),
  )
  assert.equal(nativeStyle.paddingTop, 16)
  assert.equal(nativeStyle.flexDirection, 'row')
  const html = renderToStaticMarkup(
    evaluate(`module.exports = (${web.jsx})`, { dynamic: 'p-4 flex-row' }),
  )
  assert.match(html, /hozo-candidate-owner/)
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  try {
    await page.setContent(
      `<style>html { font-size: 16px }</style><style>${tailwindCss}</style><style>${web.css}</style><style>${candidateCss}</style>${html}`,
    )
    const actual = await page.locator('.hozo-candidate-owner').evaluate((element) => {
      element.innerHTML = '<div id="raw-child" class="grid grid-cols-1 md:grid-cols-3"></div>'
      return {
        padding: getComputedStyle(element).paddingTop,
        direction: getComputedStyle(element).flexDirection,
        columns: getComputedStyle(element.firstElementChild).gridTemplateColumns.split(' ').length,
      }
    })
    assert.deepEqual(actual, {
      padding: `${nativeStyle.paddingTop}px`,
      direction: nativeStyle.flexDirection,
      columns: 3,
    })
  } finally {
    await page.close()
  }
})

test('owned candidates work without Tailwind, and empty roots/slots keep absent values', {
  skip: !executablePath,
}, async () => {
  const source =
    "import { View } from '@hozo/core'; const Example = () => <View className={dynamic} />"
  const web = compiler.compile(source)[0]
  const html = renderToStaticMarkup(
    evaluate(`module.exports = (${web.jsx})`, { dynamic: 'flex-row p-4 sm:p-4 md:p-8' }),
  )
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  try {
    // Reversed base/candidate import order cannot make base column/padding
    // win against dynamic utilities in a standalone Hozo project.
    await page.setContent(
      `<style>html { font-size: 16px }</style><style>${candidateCss}</style><style>${web.css}</style>${html}`,
    )
    assert.deepEqual(
      await page.locator('.hozo-candidate-owner').evaluate((element) => ({
        direction: getComputedStyle(element).flexDirection,
        padding: getComputedStyle(element).paddingTop,
      })),
      { direction: 'row', padding: '32px' },
    )
  } finally {
    await page.close()
  }
  const emptySource =
    "import { Text } from '@hozo/core'; const Example = () => <Text className={dynamic}>Text</Text>"
  assert.doesNotMatch(
    renderToStaticMarkup(
      evaluate(`module.exports = (${compiler.compile(emptySource)[0].jsx})`, { dynamic: null }),
    ),
    /hozo-candidate-owner/,
  )
  const chipSource =
    'import { Chip } from \'@hozo/core\'; const Example = () => <Chip label="Filter" removeClassName={dynamic} onRemove={remove} />'
  const chip = compiler.compile(chipSource)[0]
  for (const dynamic of [undefined, null, '', 'p-4']) {
    const props = evaluate(`module.exports = (${chip.jsx})`, {
      dynamic,
      remove: () => {},
      HozoChip: 'Chip',
      h: (_type, props) => props,
    })
    assert.equal(props.removeClassName, dynamic ? `hozo-candidate-owner ${dynamic}` : dynamic)
  }
  console.log(
    `[candidate-cascade] ${cache.candidates().length} candidates, ${Buffer.byteLength(candidateCss)} CSS bytes, ${gzipSync(candidateCss).length} gzip bytes`,
  )
})

// #881. A component's own classes compile statically; its caller's
// `className` arrives at runtime. The caller wins over the resting look --
// unconditional classes and a branch the source picked -- and loses to the
// element's state, on both platforms and whichever stylesheet comes first.
test("a caller's className beats the component's resting look and loses to its state", {
  skip: !executablePath,
}, async () => {
  const callerCache = openCandidateCache(path.join(directory, 'caller-candidates.json'))
  callerCache.scanFile('app.ts', "export const caller = 'bg-red-500 px-8 opacity-100'", 1)
  const callerCss = callerCache.renderCss(undefined, ['bg-red-500', 'px-8', 'opacity-100'])
  const source =
    "import clsx from 'clsx'\nimport { Button } from '@hozo/core'\n" +
    "const Example = () => <Button disabled={off} className={clsx('bg-blue-500 p-2 disabled:opacity-50', big ? 'px-6' : 'px-1', caller)}>Save</Button>"
  const web = compiler.compile(source)[0]
  const native = compiler.compileNative(source)[0]
  const { hozoClasses } = evaluate(callerCache.renderNativeModule().replace(/^import .*$/gm, ''), {
    createClassResolver,
  })
  const caller = 'bg-red-500 px-8 opacity-100'
  for (const off of [false, true]) {
    const nativeElement = evaluate(
      `const hozoStyles = ${native.styles}\nmodule.exports = (${native.jsx})`,
      {
        off,
        big: true,
        caller,
        hozoClasses,
        Pressable: 'Pressable',
        HozoPressable: 'HozoPressable',
        Text: 'Text',
        StyleSheet: { create: (styles) => styles },
        h: (type, props) => ({ type, props }),
      },
    )
    // A pressable with a runtime class resolves its style per state (#886);
    // at rest here.
    const style = nativeElement.props.style
    const resting =
      typeof style === 'function'
        ? style({ pressed: false, hovered: false, focused: false, focusVisible: false })
        : style
    const nativeStyle = Object.assign({}, ...[resting].flat(Infinity).filter(Boolean))
    assert.equal(
      nativeStyle.backgroundColor,
      '#fb2c36',
      'Native: the caller beats the resting colour',
    )
    assert.equal(nativeStyle.paddingStart, 32, 'Native: the caller beats the picked branch')
    assert.equal(nativeStyle.opacity, off ? 0.5 : 1, 'Native: the disabled state beats the caller')
    const html = renderToStaticMarkup(
      evaluate(`module.exports = (${web.jsx})`, { off, big: true, caller }),
    )
    for (const order of ['component-first', 'candidates-first']) {
      const sheets = order === 'component-first' ? [web.css, callerCss] : [callerCss, web.css]
      const page = await browser.newPage()
      try {
        await page.setContent(
          `<style>html { font-size: 16px }</style>${sheets.map((css) => `<style>${css}</style>`).join('')}${html}`,
        )
        const actual = await page.locator('button').evaluate((element) => {
          const style = getComputedStyle(element)
          return {
            background: style.backgroundColor,
            padding: style.paddingLeft,
            opacity: style.opacity,
          }
        })
        assert.deepEqual(
          actual,
          {
            background: 'oklch(0.637 0.237 25.331)',
            padding: `${nativeStyle.paddingStart}px`,
            opacity: String(nativeStyle.opacity),
          },
          `${order}, disabled ${off}`,
        )
      } finally {
        await page.close()
      }
    }
  }
})

// #883. A branch on an element the compiler keeps as a component -- the
// `Button` primitive with a spread that may carry `href` -- reaches the DOM
// only through `className`, the prop that component passes on. It was an
// attribute the component dropped, so the negated branch always applied.
test('a className branch on a component applies both ways', {
  skip: !executablePath,
}, async () => {
  const { Button } = await import('@hozo/primitives')
  const source =
    "import clsx from 'clsx'\nimport { Button } from '@hozo/primitives'\n" +
    "const Example = () => <Button {...rest} className={clsx('p-2', small ? 'px-3' : 'px-4')}>Go</Button>"
  const web = compiler.compile(source)[0]
  assert.doesNotMatch(web.jsx, /<button/, 'the element stays a component')
  const page = await browser.newPage()
  try {
    for (const [small, padding] of [
      [true, '12px'],
      [false, '16px'],
    ]) {
      const html = renderToStaticMarkup(
        evaluate(`module.exports = (${web.jsx})`, {
          Button,
          rest: {},
          small,
          hozoDomProps: (props) => props,
        }),
      )
      await page.setContent(
        `<style>html { font-size: 16px }</style><style>${web.css}</style>${html}`,
      )
      assert.equal(
        await page.locator('button').evaluate((element) => getComputedStyle(element).paddingLeft),
        padding,
        `small ${small}`,
      )
    }
  } finally {
    await page.close()
  }
})

// #886. A class string that reaches a pressable at runtime keeps its states
// on Native: the compiler hands the resolver the state the pressable
// tracks, and the candidate module keeps the classes that need it.
test('a runtime class keeps its pressed and disabled looks on Native', () => {
  const stateCache = openCandidateCache(path.join(directory, 'state-candidates.json'))
  stateCache.scanFile(
    'app.ts',
    "export const look = 'bg-blue-500 active:opacity-80 disabled:opacity-50'",
    1,
  )
  const source =
    "import { Pressable } from '@hozo/core'\n" +
    'const Example = () => <Pressable disabled={off} onPress={go} className={look}>Go</Pressable>'
  const native = compiler.compileNative(source)[0]
  const { hozoClasses } = evaluate(stateCache.renderNativeModule().replace(/^import .*$/gm, ''), {
    createClassResolver,
  })
  const styleFor = (off, pressed) => {
    const element = evaluate(
      `const hozoStyles = ${native.styles}\nmodule.exports = (${native.jsx})`,
      {
        off,
        go: () => {},
        look: 'bg-blue-500 active:opacity-80 disabled:opacity-50',
        hozoClasses,
        HozoPressable: 'HozoPressable',
        Text: 'Text',
        StyleSheet: { create: (styles) => styles },
        h: (type, props) => ({ type, props }),
      },
    )
    assert.equal(
      typeof element.props.style,
      'function',
      'the pressable resolves its style per state',
    )
    const resolved = element.props.style({
      pressed,
      hovered: false,
      focused: false,
      focusVisible: false,
    })
    return Object.assign({}, ...[resolved].flat(Infinity).filter(Boolean))
  }
  assert.equal(styleFor(false, false).backgroundColor, '#2b7fff')
  assert.equal(styleFor(false, false).opacity, undefined)
  assert.equal(styleFor(false, true).opacity, 0.8)
  assert.equal(styleFor(true, false).opacity, 0.5)
})

// #886, slice 2. `@hozo/patterns`' Native Tabs resolves its class props
// through the project's resolver, with each tab's state. Run from its own
// source against stand-ins for React Native and React: what is asserted is
// the style each element is handed, not how React Native draws it.
test("@hozo/patterns' Native Tabs applies its class props, selected and pressed included", async () => {
  const look = 'p-4 px-3 aria-selected:bg-blue-500 active:opacity-80 disabled:opacity-50'
  const { load } = await patternHarness('tabs-candidates.json', look)
  const { HozoTabs } = load('tabs.native.tsx')
  const tree = HozoTabs({
    className: 'p-4',
    tabClassName: 'px-3 aria-selected:bg-blue-500 active:opacity-80 disabled:opacity-50',
    tabs: [
      { label: 'One', content: 'first' },
      { label: 'Two', content: 'second', disabled: true },
    ],
  })
  const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
  assert.equal(flat(tree.props.style).paddingTop, 16, 'the root applies className')
  const found = []
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'Pressable') found.push(node)
    for (const child of [node.props?.children].flat(Infinity)) walk(child)
  }
  walk(tree)
  const [first, second] = found
  const at = (tab, pressed) => flat(tab.props.style({ pressed }))
  assert.equal(at(first, false).paddingStart, 12)
  assert.equal(at(first, false).backgroundColor, '#2b7fff', 'the selected tab')
  assert.equal(at(first, false).opacity, undefined)
  assert.equal(at(first, true).opacity, 0.8, 'pressed')
  assert.equal(at(second, false).backgroundColor, undefined, 'not selected')
  assert.equal(at(second, false).opacity, 0.5, 'disabled')
})

// Runs `@hozo/patterns`' Native components from their own source, against
// stand-ins for React, React Native and the hooks they read, with a real
// candidate module scanned for `look` behind `@hozo/engine/project`.
async function patternHarness(cacheName, look) {
  const { readFileSync } = await import('node:fs')
  const cache = openCandidateCache(path.join(directory, cacheName))
  cache.scanFile('app.ts', `export const c = '${look}'`, 1)
  const { hozoClasses } = evaluate(cache.renderNativeModule().replace(/^import .*$/gm, ''), {
    createClassResolver,
  })
  const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
  const loaded = new Map()
  const load = (file) => {
    // These tree tests feed explicit interaction facts into the style/label
    // callbacks. The real shared tracker and host bridge are exercised by
    // native-control-indicators.test.mjs without launching a browser.
    if (file === 'pressable.native.tsx') return { Pressable: 'Pressable' }
    if (!loaded.has(file)) {
      const source = readFileSync(
        new URL(`../../../packages/patterns/src/${file}`, import.meta.url),
        'utf8',
      )
      loaded.set(file, evaluate(source, { require: (name) => modules(name) }))
    }
    return loaded.get(file)
  }
  const modules = (name) =>
    name.startsWith('./')
      ? load(name.slice(2))
      : {
          react: {
            useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
            useCallback: (fn) => fn,
            useRef: (current) => ({ current }),
            useMemo: (fn) => fn(),
            useEffect: () => {},
            // This stateless probe does not mount React. OTP's committed
            // selection-buffer effect is exercised by the real renderer
            // in otp-caret.test.ts, not by these resting style lookups.
            useLayoutEffect: () => {},
          },
          'react-native': {
            View: 'View',
            Pressable: 'Pressable',
            Text: 'Text',
            Modal: 'Modal',
            TextInput: 'TextInput',
            Image: 'Image',
            Linking: { openURL: () => {} },
            StyleSheet: { flatten: flat },
          },
          '@hozo/engine/project': { hozoClasses },
          '@hozo/behaviors': {
            hozoTextChildren: (children) => children,
            useHozoMessage: () => (key, _values, fallback) => fallback ?? key,
            useHozoI18n: () => ({ dir: 'ltr', locale: 'en' }),
          },
          // Initial input state only in these structural probes. Real events
          // and tracker updates are tested in the browser-free React probe.
          '@hozo/behaviors/pressable-interaction': {
            usePressableInteraction: () => ({
              state: { pressed: false, hovered: false, focused: false, focusVisible: false },
              handlers: {},
            }),
          },
          '@hozo/engine/navigation': {
            activateHozoNavigation: () => {},
            useHozoNavigation: () => ({}),
          },
        }[name]
  const pressables = (tree) => {
    const found = []
    const walk = (node) => {
      if (!node || typeof node !== 'object') return
      // The ones that resolve a look; a Modal's backdrop has a fixed style.
      if (node.type === 'Pressable' && typeof node.props.style === 'function') found.push(node)
      for (const child of [node.props?.children].flat(Infinity)) walk(child)
    }
    walk(tree)
    return found
  }
  // A pressable's box at a state, and the Text its children render then.
  const at = (pressable, pressed, extra = {}) => {
    const state = { pressed, hovered: false, focused: false, focusVisible: false, ...extra }
    const children = pressable.props.children
    const label = typeof children === 'function' ? children(state) : children
    return {
      box: flat(pressable.props.style(state)),
      text: flat(label?.type === 'Text' ? label.props.style : undefined),
    }
  }

  return { load, pressables, at, flat }
}

// #886, slice 3: the rest of `@hozo/patterns`' Native components, through
// `patternHarness`. `text-style.native.ts` -- which moves a label's colour and
// weight off a Pressable onto its Text -- is loaded as the real one.
test("@hozo/patterns' Native controls apply their class props with each one's state", async () => {
  const look =
    'p-2 text-red-500 aria-expanded:bg-blue-500 aria-checked:bg-blue-500 aria-selected:bg-blue-500 active:opacity-80 disabled:opacity-50'
  const { load, pressables, at } = await patternHarness('controls-candidates.json', look)

  const accordion = load('accordion.native.tsx').HozoAccordion({
    triggerClassName: look,
    defaultExpanded: 'a',
    items: [
      { id: 'a', header: 'Open', content: 'x' },
      { id: 'b', header: 'Shut', content: 'y', disabled: true },
    ],
  })
  const [open, shut] = pressables(accordion)
  assert.equal(at(open, false).box.backgroundColor, '#2b7fff', 'accordion: expanded')
  assert.equal(at(open, false).box.color, undefined, 'accordion: the label colour leaves the box')
  assert.equal(at(open, false).text.color, '#fb2c36', 'accordion: and reaches the Text')
  assert.equal(at(open, true).box.opacity, 0.8, 'accordion: pressed')
  assert.equal(at(shut, false).box.backgroundColor, undefined, 'accordion: collapsed')
  assert.equal(at(shut, false).box.opacity, 0.5, 'accordion: disabled')

  const radio = load('radio.native.tsx').HozoRadioGroup({
    optionClassName: look,
    defaultValue: 1,
    options: [
      { value: 1, label: 'One' },
      { value: 2, label: 'Two' },
    ],
  })
  const [one, two] = pressables(radio)
  assert.equal(at(one, false).box.backgroundColor, '#2b7fff', 'radio: checked')
  assert.equal(at(two, false).box.backgroundColor, undefined, 'radio: unchecked')
  assert.equal(at(one, false).text.color, '#fb2c36', 'radio: label')

  const listbox = load('listbox.native.tsx').HozoListbox({
    optionClassName: look,
    defaultValue: 'b',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  })
  const [a, b] = pressables(listbox)
  assert.equal(at(a, false).box.backgroundColor, undefined, 'listbox: unselected')
  assert.equal(at(b, false).box.backgroundColor, '#2b7fff', 'listbox: selected')

  const checkbox = load('toggle.native.tsx').HozoCheckbox({
    className: look,
    defaultChecked: true,
    children: 'Agree',
  })
  assert.equal(at(checkbox, false).box.backgroundColor, '#2b7fff', 'checkbox: checked')
  assert.equal(at(checkbox, false).text.color, '#fb2c36', 'checkbox: label')

  const menu = load('menu.native.tsx').HozoMenu({
    triggerClassName: look,
    itemClassName: look,
    trigger: 'More',
    items: [{ label: 'Delete', disabled: true }],
  })
  const [trigger, item] = pressables(menu)
  assert.equal(at(trigger, true).box.opacity, 0.8, 'menu: pressed trigger')
  assert.equal(at(trigger, false).text.color, '#fb2c36', 'menu: trigger label')
  assert.equal(at(item, false).box.opacity, 0.5, 'menu: disabled item')
})

// #886, slice 3, second batch: Tabs' labels, Chip, Pagination, Tree,
// Combobox and Toolbar. Popover, Drawer, BottomSheet, Dialog and Tooltip
// resolve the same way but sit on Animated, a Portal or a positioner,
// which these stand-ins do not model.
test("@hozo/patterns' second batch of Native controls apply their class props", async () => {
  const look =
    'p-2 text-red-500 aria-checked:bg-blue-500 aria-selected:bg-blue-500 aria-expanded:bg-blue-500 active:opacity-80 disabled:opacity-50'
  const chipLook =
    'p-2 text-red-500 aria-pressed:bg-blue-500 aria-checked:outline-4 active:opacity-80 disabled:opacity-50'
  const currentPageLook = 'p-2 bg-blue-500'
  const { load, pressables, at, flat } = await patternHarness(
    'batch-candidates.json',
    `${look} ${chipLook} ${currentPageLook}`,
  )

  const [tab] = pressables(
    load('tabs.native.tsx').HozoTabs({
      tabClassName: look,
      tabs: [{ label: 'One', content: 'x' }],
    }),
  )
  assert.equal(at(tab, false).text.color, '#fb2c36', 'tabs: a string label takes the text half')
  assert.equal(at(tab, false).box.color, undefined, 'tabs: and the box does not')

  const chip = load('chip.native.tsx').HozoChip({
    className: chipLook,
    defaultSelected: true,
    children: 'Filter',
  })
  assert.equal(at(chip, false).box.backgroundColor, '#2b7fff', 'chip: aria-pressed selection')
  assert.equal(
    at(chip, false).box.outlineWidth,
    undefined,
    'chip: RN checked is not CSS aria-checked',
  )
  assert.equal(at(chip, true).box.opacity, 0.8, 'chip: pressed')
  assert.equal(at(chip, false).text.color, '#fb2c36', 'chip: label')

  const pages = pressables(
    load('pagination.native.tsx').HozoPagination({
      itemClassName: look,
      currentItemClassName: currentPageLook,
      pageCount: 3,
      defaultPage: 1,
    }),
  )
  const [previous, first, second] = pages
  assert.equal(at(previous, false).box.opacity, 0.5, 'pagination: disabled previous')
  assert.equal(
    at(first, false).box.backgroundColor,
    '#2b7fff',
    'pagination: current-page class gate',
  )
  assert.equal(at(second, false).box.backgroundColor, undefined, 'pagination: another page')

  const [branch, leaf] = pressables(
    load('tree.native.tsx').HozoTree({
      rowClassName: look,
      defaultExpanded: ['a'],
      selectedId: 'b',
      nodes: [{ id: 'a', label: 'A', children: [{ id: 'b', label: 'B' }] }],
    }),
  )
  assert.equal(at(branch, false).box.backgroundColor, '#2b7fff', 'tree: expanded branch')
  assert.equal(at(leaf, false).box.backgroundColor, '#2b7fff', 'tree: selected leaf')
  assert.equal(at(leaf, false).text.color, '#fb2c36', 'tree: label')

  const toolbar = load('toolbar.native.tsx').HozoToolbar({ className: 'p-2', items: [] })
  assert.equal(flat(toolbar.props.style).paddingTop, 8, 'toolbar: className')
})

// #886, slice 3, third batch: the patterns with several slots. Avatar,
// Stepper and OtpInput here; ColorPicker, CommandPalette and Slider resolve
// the same way but sit on a slider, a portal or a responder these stand-ins
// do not model.
test("@hozo/patterns' Native slotted patterns apply their class props", async () => {
  const look = 'p-2 p-4 text-red-500 bg-blue-500 opacity-50'
  const { load, flat } = await patternHarness('slotted-candidates.json', look)
  const find = (tree, test) => {
    const found = []
    const walk = (node) => {
      if (!node || typeof node !== 'object') return
      if (test(node)) found.push(node)
      for (const child of [node.props?.children].flat(Infinity)) walk(child)
    }
    walk(tree)
    return found
  }

  const avatar = load('avatar.native.tsx').HozoAvatar({
    name: 'Ada Lovelace',
    className: 'p-2',
    fallbackClassName: 'bg-blue-500 text-red-500',
  })
  assert.equal(flat(avatar.props.style).paddingTop, 8, 'avatar: className')
  const [initials] = find(avatar, (node) => node.type === 'Text')
  assert.equal(flat(initials.props.style).color, '#fb2c36', 'avatar: fallback text')

  const stepper = load('stepper.native.tsx').HozoStepper({
    steps: [{ label: 'One' }, { label: 'Two' }],
    activeStep: 0,
    className: 'p-4',
    currentStepClassName: 'opacity-50',
  })
  assert.equal(flat(stepper.props.style).paddingTop, 16, 'stepper: className')
  const faded = find(stepper, (node) => flat(node.props?.style).opacity === 0.5)
  assert.ok(faded.length > 0, 'stepper: the current step takes currentStepClassName')

  const otp = load('otp-input.native.tsx').HozoOtpInput({
    accessibilityLabel: 'Code',
    length: 2,
    defaultValue: '1',
    cellClassName: 'p-2',
    filledCellClassName: 'bg-blue-500',
  })
  const otpContents = otp.props.children({
    pressed: false,
    hovered: false,
    focused: false,
    focusVisible: false,
  })
  const cells = find(
    otpContents,
    (node) => node.type === 'View' && node.props.accessibilityElementsHidden,
  )
  assert.equal(flat(cells[0].props.style).backgroundColor, '#2b7fff', 'otp: a filled cell')
  assert.equal(flat(cells[1].props.style).backgroundColor, undefined, 'otp: an empty cell')
  assert.equal(flat(cells[1].props.style).paddingTop, 8, 'otp: cellClassName')
})
