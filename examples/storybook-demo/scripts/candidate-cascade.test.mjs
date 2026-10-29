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
import { createClassResolver, hozoSplitTextStyle } from '@hozo/engine'
import { hozoAuthoredStyle, hozoGapSpreadStyles } from '@hozo/engine/generated/gap-styles'
import { hozoSpreadStyles } from '@hozo/engine/generated/spread-styles'
import { NativeSelect } from '@hozo/form'
import { Button as ButtonFallback } from '@hozo/primitives'
import { build, transformSync } from 'esbuild'
import { chromium } from 'playwright-core'
import { Children, createElement, Fragment } from 'react'
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
const candidateMutationChecks = []
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
  if (candidateMutationChecks.length)
    console.info(
      'candidate-sheet negative controls passed:',
      JSON.stringify(candidateMutationChecks),
    )
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
  const reference = await browser.newPage()
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
        await reference.setViewportSize({ width, height: 700 })
        await page.setContent(`<style>${web.css}</style><div id="compiled">${html}</div>`)
        await reference.setContent(
          `<style>${css}</style><p class="${classes}">One<br/>Two<br/>Three</p>`,
        )
        const measure = (locator) =>
          locator.evaluate((element) => {
            const style = getComputedStyle(element)
            return [style.fontSize, style.lineHeight, element.getBoundingClientRect().height]
          })
        const actual = await measure(page.locator('#compiled > p'))
        assert.deepEqual(actual, await measure(reference.locator('p')), `${classes} at ${width}px`)
        if (classes === cases[0] && width === 1280)
          assert.deepEqual(actual, ['20px', '32.5px', 97.5])
      }
    }
  } finally {
    await page.close()
    await reference.close()
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

// Ordering names do not populate a candidate cache. Scan the authored source,
// never generated JSX or compiler metadata, before asking it for rules.
function scannedCandidateCss(name, source, names) {
  const candidates = openCandidateCache(path.join(directory, `${name}.json`))
  candidates.scanFile(`${name}.tsx`, source, 1)
  const css = candidates.renderCss(undefined, names)
  assert.ok(css.includes('.px-2'), `${name}: authored candidates must emit actual rules`)
  return css
}

function compiledStyles(sheets, candidates) {
  return sheets
    .map((css) => `<style${css === candidates ? ' data-hozo-candidates' : ''}>${css}</style>`)
    .join('')
}

// A passing comparison must depend on the candidate sheet, not on oracle
// leakage or AOT rules alone. Restore it even when this negative control fails.
async function assertCandidateStylesRequired(page, read, label) {
  const expected = await read()
  const toggle = (disabled) =>
    page.locator('style[data-hozo-candidates]').evaluate((e, disabled) => {
      e.sheet.disabled = disabled
    }, disabled)
  try {
    await toggle(true)
    assert.notDeepEqual(await read(), expected, `${label}: removing candidates must change pixels`)
  } finally {
    await toggle(false)
  }
  assert.deepEqual(await read(), expected, `${label}: restoring candidates must restore pixels`)
  candidateMutationChecks.push(label)
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

test('AOT Chip root disabled predicates ask the actual Web owner, as Tailwind does, in every shape', {
  skip: !executablePath,
}, async () => {
  // #993: AOT `disabled:` on the root compiled to `[data-hozo-disabled]`,
  // which the retained Chip never puts on its class owner. The owner is a
  // button for a standalone toggle and a span otherwise; a span is neither
  // :disabled nor :enabled, which negation has to keep.
  const classes =
    'outline-offset-0 opacity-100 mt-0 mb-0 disabled:outline-offset-4 enabled:opacity-50 not-disabled:mt-1 not-enabled:mb-1'
  const oracle = (await compile('@theme { --spacing: 0.25rem; } @tailwind utilities;')).build(
    classes.split(' '),
  )
  const shapes = []
  for (const selectable of [false, true])
    for (const removable of [false, true]) shapes.push({ selectable, removable })
  const compiled = shapes.map(({ selectable, removable }) => {
    const [web] = compiler.compile(
      `import { Chip } from '@hozo/core'
      export function C({ disabled }) {
        return <Chip disabled={disabled}${selectable ? ' defaultSelected' : ''}${removable ? ' onRemove={() => {}}' : ''} className="${classes}">Token</Chip>
      }`,
    )
    assert.deepEqual(web.diagnostics, [])
    assert.doesNotMatch(web.css, /data-hozo-disabled/, 'no marker the owner never receives')
    return web
  })
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Chip as HozoChip} from '@hozo/patterns';
        const raw = window.hozoRawChip === true;
        const Compiled = [${compiled.map((web) => `({ disabled }) => ${web.jsx}`).join(', ')}];
        const shapes = ${JSON.stringify(shapes)};
        createRoot(document.getElementById('root')).render(<>{shapes.flatMap((s, index) =>
          [false, true].map(disabled => {
            const C = Compiled[index];
            return <div key={index + '-' + disabled} id={'chip-' + index + '-' + disabled}>
              {raw ? <HozoChip disabled={disabled}
                {...(s.selectable ? {defaultSelected: true} : {})}
                {...(s.removable ? {onRemove: () => {}} : {})}
                className=${JSON.stringify(classes)}>Token</HozoChip> : <C disabled={disabled}/>}
            </div>
          }))}</>);`,
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
  const readAll = async (raw) => {
    const sheets = raw ? [oracle] : compiled.map((web) => web.css)
    await page.setContent(
      `<style>html {font-size:16px}</style>${sheets.map((css) => `<style>${css}</style>`).join('')}<div id="root"></div><script>window.hozoRawChip = ${raw}</script>`,
    )
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(() => document.querySelectorAll('#root > div').length === 8)
    return page.locator('#root > div > :first-child').evaluateAll((owners) =>
      owners.map((e) => {
        const css = getComputedStyle(e)
        return {
          tag: e.tagName,
          offset: css.outlineOffset,
          opacity: css.opacity,
          margins: [css.marginTop, css.marginBottom],
        }
      }),
    )
  }
  try {
    const actual = await readAll(false)
    assert.deepEqual(actual, await readAll(true), 'compiled Chip against Tailwind on the same Chip')
    // And the facts themselves, so a shared mistake cannot pass both sides.
    let index = 0
    for (const { selectable, removable } of shapes)
      for (const disabled of [false, true]) {
        const button = selectable && !removable
        assert.deepEqual(
          actual[index++],
          {
            tag: button ? 'BUTTON' : 'SPAN',
            offset: button && disabled ? '4px' : '0px',
            opacity: button && !disabled ? '0.5' : '1',
            margins: [button && disabled ? '0px' : '4px', button && !disabled ? '0px' : '4px'],
          },
          `selectable=${selectable} removable=${removable} disabled=${disabled}`,
        )
      }
    assert.deepEqual(errors, [])
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

test('OTP cells and gaps forward mouse and touch input to the single field', {
  skip: !executablePath,
}, async () => {
  const cases = [
    { name: 'empty' },
    { name: 'filled', defaultValue: '12' },
    { name: 'masked', defaultValue: '12', mask: true },
    { name: 'disabled', defaultValue: '12', disabled: true },
    { name: 'readonly', defaultValue: '12', readOnly: true },
  ]
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {OtpInput} from '../../packages/patterns/src/otp-input.tsx';
        createRoot(document.getElementById('root')).render(<>
          <button id="before">Before</button>
          {${JSON.stringify(cases)}.map(({name,...props}) => <section key={name}>
            <OtpInput {...props} testID={name} accessibilityLabel={name}
              className="otp-row" cellClassName="otp-cell"/>
          </section>)}
          <button id="after">After</button>
        </>);`,
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
  const page = await browser.newPage({ hasTouch: true, viewport: { width: 1200, height: 900 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.setContent(`<style>
      .otp-row { gap: 8px; margin: 4px; }
      .otp-cell { display: flex; width: 44px; height: 44px; align-items: center;
        justify-content: center; background: white; border: 1px solid black; }
      </style><div id="root"></div>`)
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.getByTestId('empty').waitFor()
    for (const method of ['mouse', 'touch']) {
      for (const { name, defaultValue = '', disabled, readOnly } of cases) {
        const row = page.getByTestId(name)
        const field = row.locator('input')
        const cells = row.locator(':scope > span[aria-hidden]')
        assert.equal(await field.count(), 1)
        assert.equal(await cells.count(), 6)
        const boxes = await cells.evaluateAll((nodes) =>
          nodes.map((node) => {
            const { x, y, width, height } = node.getBoundingClientRect()
            return { x, y, width, height }
          }),
        )
        const points = [
          {
            label: 'gap',
            x: (boxes[0].x + boxes[0].width + boxes[1].x) / 2,
            y: boxes[0].y + boxes[0].height / 2,
          },
          ...boxes.map((box, index) => ({
            label: `cell ${index}`,
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
          })),
        ]
        for (const { label, x, y } of points) {
          await page.locator('#before').click()
          if (method === 'mouse') await page.mouse.click(x, y)
          else await page.touchscreen.tap(x, y)
          assert.equal(
            await field.evaluate((node) => node === document.activeElement),
            !disabled,
            `${method} ${name} ${label}: focus reaches only an enabled field`,
          )
          await page.keyboard.press('End')
          await page.keyboard.type('7')
          assert.equal(
            await field.inputValue(),
            disabled || readOnly ? defaultValue : `${defaultValue}7`,
            `${method} ${name} ${label}: typing respects field mutability`,
          )
          if (!disabled && !readOnly) await field.fill(defaultValue)
        }
      }
    }
    await page.locator('#before').focus()
    for (const { name, disabled } of cases) {
      if (disabled) continue
      await page.keyboard.press('Tab')
      assert.equal(
        await page
          .getByTestId(name)
          .locator('input')
          .evaluate((node) => node === document.activeElement),
        true,
        `${name}: decorative cells add no tab stops`,
      )
    }
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'after')
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

test('mixed Chip root keeps compiled states above caller candidates on Web and Native', {
  skip: !executablePath,
}, async () => {
  const caller = 'p-4 opacity-75 rounded-none focus:outline-2'
  const other = 'hover:outline-offset-8'
  // Tailwind orders rules, not authored class tokens. Pick resting values
  // for which its raw utility order also agrees with Hozo's caller-over-AOT
  // resting contract (opacity-100 would beat opacity-75 in raw Tailwind).
  const own =
    'p-2 opacity-25 outline-0 hover:opacity-50 not-focus:rounded-lg disabled:outline-offset-4'
  const callerCache = openCandidateCache(path.join(directory, 'chip-root-candidates.json'))
  callerCache.scanFile('caller.ts', `export const classes = '${caller} ${other}'`, 1)
  const callerCss = callerCache.renderCss()
  const tailwindOracle = (
    await compile('@theme { --spacing: 0.25rem; --radius-lg: 0.5rem; } @tailwind utilities;')
  ).build(`${own} ${caller} ${other}`.split(' '))
  const source = `import { Chip, cx } from '@hozo/core';
    const Example = () => <Chip defaultSelected disabled={disabled}
      className={cx('${own}', first(), second())}>Token</Chip>`
  const web = compiler.compile(source)[0]
  const native = compiler.compileNative(source)[0]
  const { hozoClasses } = evaluate(callerCache.renderNativeModule().replace(/^import .*$/gm, ''), {
    createClassResolver,
  })
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Chip as HozoChip} from '@hozo/patterns';
        function App() {
          const disabled = false;
          const first = () => ${JSON.stringify(caller)};
          const second = () => ${JSON.stringify(other)};
          return ${web.jsx};
        }
        createRoot(document.getElementById('root')).render(<App/>);`,
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
  // The actual Native pattern lifecycle is exercised in
  // pattern-dynamic-slots.test.ts; here its emitted callback is compared to
  // the actual Web Chip/CSS cascade, in both stylesheet import orders.
  const readNative = ({ hovered = false, focused = false, disabled = false } = {}) => {
    const calls = []
    const element = evaluate(
      `const hozoStyles = ${native.styles}; module.exports = (${native.jsx})`,
      {
        disabled,
        hozoClasses,
        first: () => {
          calls.push('first')
          return caller
        },
        second: () => {
          calls.push('second')
          return other
        },
        HozoChip: 'Chip',
        StyleSheet: { create: (styles) => styles },
        h: (_type, props) => ({ props }),
      },
    )
    const state = {
      hovered,
      focused,
      focusVisible: focused,
      pressed: false,
      disabled,
      enabled: !disabled,
      'aria-pressed': true,
      'aria-checked': false,
      'aria-disabled': false,
    }
    const styles = Object.assign(
      {},
      ...[
        hozoClasses(element.props.className, state),
        element.props.hozoStyle?.(state),
        element.props.style,
      ]
        .flat(Infinity)
        .filter(Boolean),
    )
    assert.deepEqual(Array.from(calls), ['first', 'second'])
    return {
      padding: `${styles.paddingTop}px`,
      opacity: String(styles.opacity),
      radius: `${styles.borderRadius ?? 0}px`,
      outline: `${styles.outlineWidth}px`,
      offset: `${styles.outlineOffset ?? 0}px`,
    }
  }
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    assert.deepEqual(readNative(), {
      padding: '16px',
      opacity: '0.75',
      radius: '8px',
      outline: '0px',
      offset: '0px',
    })
    for (const { sheets, raw } of [
      { sheets: [web.css, callerCss], raw: false },
      { sheets: [callerCss, web.css], raw: false },
      { sheets: [tailwindOracle], raw: true },
    ]) {
      await page.setContent(
        `<style>html {font-size:16px}</style>${sheets.map((css) => `<style>${css}</style>`).join('')}<div id="root">${raw ? `<button class="${own} ${caller} ${other}">Token</button>` : ''}</div>`,
      )
      if (!raw) await page.addScriptTag({ content: bundle.outputFiles[0].text })
      const button = page.locator('#root button')
      await button.waitFor()
      const read = () =>
        button.evaluate((e) => {
          const css = getComputedStyle(e)
          return {
            padding: css.paddingTop,
            opacity: css.opacity,
            radius: css.borderRadius,
            outline: css.outlineWidth,
            offset: css.outlineOffset,
          }
        })
      await page.mouse.move(0, 0)
      assert.deepEqual(
        await read(),
        readNative(),
        raw ? 'raw Tailwind resting' : 'compiled Web resting',
      )
      await button.hover()
      assert.deepEqual(await read(), readNative({ hovered: true }))
      await button.focus()
      assert.deepEqual(await read(), readNative({ hovered: true, focused: true }))
      await page.evaluate(() => document.activeElement.blur())
      await page.mouse.move(0, 0)
      assert.deepEqual(await read(), readNative())
      if (raw) {
        await page.evaluate(() => {
          const button = document.querySelector('#root button')
          button.disabled = true
        })
        assert.deepEqual(await read(), readNative({ disabled: true }))
      }
      // #993: the retained Web Chip does not supply the marker used by AOT
      // disabled selectors. Do not certify that unrelated broken path here;
      // the independent Tailwind button above checks Native's owner fact.
      // Native-only explicit style is exercised by the lifecycle fixture,
      // not passed to a Web Chip API that does not publish a style prop.
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
})

test('mixed secondary AOT classes use the actual button or link rather than a widget-root marker', {
  skip: !executablePath,
}, async () => {
  const own =
    'outline-0 rounded-none m-0 enabled:outline-2 disabled:outline-offset-4 not-disabled:rounded-lg aria-disabled:mt-2'
  const caller = 'opacity-75'
  const source = `import {Pagination,cx} from '@hozo/core'; const C = () =>
    <Pagination pageCount={3} getPageHref={getPageHref} itemClassName={cx('${own}', getClasses())} />`
  const web = compiler.compile(source)[0]
  const candidates = openCandidateCache(path.join(directory, 'mixed-secondary.json'))
  candidates.scanFile('caller.ts', `const classes = '${caller}'`, 1)
  const candidateCss = candidates.renderCss()
  assert.ok(candidateCss.includes('.opacity-75'))
  const oracleCss = (
    await compile('@theme { --spacing:0.25rem; --radius-lg:0.5rem; } @tailwind utilities;')
  ).build(`${own} ${caller}`.split(' '))
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Pagination as HozoPagination} from '@hozo/patterns';
        createRoot(document.getElementById('root')).render(<>{[false,true].map(link => {
          const getPageHref = link ? page => '#page-' + page : undefined;
          const getClasses = () => '${caller}';
          return <section key={String(link)} id={link ? 'links' : 'buttons'}>${web.jsx}</section>;
        })}</>);`,
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
  const oracle = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await oracle.setContent(
      `<style>html{font-size:16px}</style><style>${oracleCss}</style><div id="oracle"></div>`,
    )
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: bundle.outputFiles[0].text })
      await page.waitForFunction(
        () => document.querySelectorAll('#root button,#root a').length === 10,
      )
      const read = (locator) =>
        locator.evaluate((e) => {
          const css = getComputedStyle(e)
          return {
            opacity: css.opacity,
            radius: css.borderRadius,
            outline: css.outlineWidth,
            offset: css.outlineOffset,
            margin: css.marginTop,
          }
        })
      for (const link of [false, true])
        for (const boundary of [true, false]) {
          const controls = page.locator(link ? '#links a' : '#buttons button')
          const actual = await read(controls.nth(boundary ? 0 : 1))
          const expected = {
            opacity: '0.75',
            radius: !link && boundary ? '0px' : '8px',
            outline: !link && !boundary ? '2px' : '0px',
            offset: !link && boundary ? '4px' : '0px',
            margin: link && boundary ? '8px' : '0px',
          }
          assert.deepEqual(actual, expected, `compiled link=${link}, boundary=${boundary}`)
          await oracle.locator('#oracle').evaluate(
            (root, { link, boundary, classes }) => {
              const owner = document.createElement(link ? 'a' : 'button')
              owner.className = classes
              if (link) {
                owner.href = '#'
                if (boundary) owner.setAttribute('aria-disabled', 'true')
              } else owner.disabled = boundary
              root.replaceChildren(owner)
            },
            { link, boundary, classes: `${own} ${caller}` },
          )
          assert.deepEqual(
            actual,
            await read(oracle.locator('#oracle > *')),
            'independent Tailwind owner',
          )
          await assertCandidateStylesRequired(
            page,
            () => read(controls.nth(boundary ? 0 : 1)),
            `mixed secondary link=${link}, boundary=${boundary}`,
          )
        }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('ordered secondary guards preserve empty classes and abrupt evaluation without new lexical scopes', () => {
  const source = `import {Chip,cx} from '@hozo/core'; const C = () =>
    <Chip removeClassName={cx(first(), guard() && 'p-2', last())} />`
  const web = compiler.compile(source)[0]
  for (const enabled of [false, true]) {
    const calls = []
    const element = evaluate(`module.exports = (${web.jsx})`, {
      HozoChip: 'Chip',
      first() {
        calls.push('first')
      },
      guard() {
        calls.push('guard')
        return enabled
      },
      last() {
        calls.push('last')
      },
    })
    assert.deepEqual(calls, ['first', 'guard', 'last'])
    assert.equal(
      Boolean(element.props.removeClassName),
      enabled,
      'inactive guards cannot leave truthy internal markers',
    )
  }
  const calls = []
  assert.throws(
    () =>
      evaluate(`module.exports = (${web.jsx})`, {
        HozoChip: 'Chip',
        first() {
          calls.push('first')
        },
        guard() {
          calls.push('guard')
          throw new Error('guard failed')
        },
        last() {
          calls.push('last')
        },
      }),
    /guard failed/,
  )
  assert.deepEqual(calls, ['first', 'guard'])
})

test('ordered secondary guards match actual owner pixels and independent Tailwind in both stylesheet orders', {
  skip: !executablePath,
}, async () => {
  const own = 'p-0 rounded-none not-focus:rounded-lg hover:opacity-50'
  const source = `import {Pagination,cx} from '@hozo/core'; const C = () =>
    <Pagination pageCount={3} itemClassName={cx('${own}', first(), outer() ? inner() ? 'p-2' : 'p-4' : off() && 'p-6', last())} />`
  const web = compiler.compile(source)[0]
  const candidates = openCandidateCache(path.join(directory, 'ordered-secondary.json'))
  candidates.scanFile('caller.ts', "const classes = 'opacity-75'", 1)
  const candidateCss = candidates.renderCss()
  assert.ok(candidateCss.includes('.opacity-75'))
  const oracleCss = (
    await compile('@theme { --spacing:0.25rem; --radius-lg:0.5rem; } @tailwind utilities;')
  ).build(`${own} p-2 p-4 p-6 opacity-75`.split(' '))
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Pagination as HozoPagination} from '@hozo/patterns';
        const root = createRoot(document.getElementById('root'));
        function Example({values}) {
          window.calls = [];
          const read = (name, value) => () => {window.calls.push(name); return value;};
          const first = read('first', undefined), last = read('last', 'opacity-75');
          const outer = read('outer', values.outer), inner = read('inner', values.inner), off = read('off', values.off);
          return <section data-case={values.id}>${web.jsx}</section>;
        }
        window.show = values => root.render(<Example values={values}/>);`,
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
  const oracle = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await oracle.setContent(
      `<style>html{font-size:16px}</style><style>${oracleCss}</style><button id="oracle"></button>`,
    )
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: bundle.outputFiles[0].text })
      const read = (locator) =>
        locator.evaluate((e) => {
          const css = getComputedStyle(e)
          return { padding: css.paddingTop, radius: css.borderRadius, opacity: css.opacity }
        })
      for (const values of [
        { id: 1, outer: true, inner: true, off: false, padding: 8 },
        { id: 2, outer: true, inner: false, off: false, padding: 16 },
        { id: 3, outer: false, inner: true, off: false, padding: 0 },
        { id: 4, outer: false, inner: true, off: true, padding: 24 },
      ]) {
        await page.mouse.move(0, 0)
        await page.evaluate(() => document.activeElement?.blur())
        await page.evaluate((values) => window.show(values), values)
        await page.waitForFunction(
          (id) => document.querySelector('[data-case]')?.dataset.case === String(id),
          values.id,
        )
        const owner = page.locator('#root button').nth(1)
        const expected = { padding: `${values.padding}px`, radius: '8px', opacity: '0.75' }
        assert.deepEqual(await read(owner), expected)
        await oracle.locator('#oracle').evaluate(
          (e, classes) => {
            e.className = classes
          },
          `${own} ${values.padding ? `p-${values.padding / 4}` : ''} opacity-75`,
        )
        assert.deepEqual(await read(oracle.locator('#oracle')), expected, 'independent Tailwind')
        await assertCandidateStylesRequired(page, () => read(owner), `ordered guard ${values.id}`)
        const calls = ['first', 'outer', values.outer ? 'inner' : 'off', 'last']
        assert.deepEqual(await page.evaluate(() => window.calls), calls)
        await owner.hover()
        assert.equal((await read(owner)).opacity, '0.5')
        await owner.focus()
        assert.equal((await read(owner)).radius, '0px')
        assert.deepEqual(
          await page.evaluate(() => window.calls),
          calls,
          'owner events cannot rerun author inputs',
        )
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

// A real component on one page and an independent raw Tailwind input on
// another: a modal focus trap must not pull focus away from the oracle.
async function patternInputFixture(component, own, props) {
  const negative = 'enabled:px-3 not-focus:mb-2'
  const expression = (mode) =>
    mode === 'literal'
      ? JSON.stringify(`${own} ${negative}`)
      : mode === 'opaque'
        ? `{getClasses('${mode}', ${JSON.stringify(`${own} ${negative}`)})}`
        : `{cx('p-2 rounded-none opacity-100 ${negative}',getClasses('${mode}',${JSON.stringify(own.replace('p-2 rounded-none opacity-100 ', ''))}))}`
  const source = `import {View,${component},cx} from '@hozo/core'; const C=()=> <View>
    ${['literal', 'opaque', 'mixed']
      .map(
        (mode) => `<View testID="${mode}"><${component} ${props(mode)}
      inputClassName=${expression(mode)} /></View>`,
      )
      .join('')}
  </View>`
  const web = compiler.compile(source)[0]
  assert.equal(web.diagnostics.length, 1)
  const [diagnostic] = web.diagnostics
  assert.equal(diagnostic.code, 'DYNAMIC_CLASS_NAME_NOT_RESOLVED')
  assert.equal(diagnostic.severity, 'warning')
  assert.match(source.slice(diagnostic.spanStart, diagnostic.spanEnd), /getClasses\('mixed'/)
  const names = `${own} ${negative}`.split(' ')
  const candidates = openCandidateCache(path.join(directory, `${component}-input.json`))
  candidates.scanFile('InputFixture.tsx', source, 1)
  const candidateCss = candidates.renderCss(undefined, names)
  assert.ok(candidateCss.includes('.p-2'), 'the actual candidate stylesheet must be populated')
  const oracleCss = (
    await compile('@theme {--spacing:0.25rem;--radius-lg:0.5rem;} @tailwind utilities;')
  ).build(names)
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {${component} as Hozo${component}} from '@hozo/patterns';
      const root=createRoot(document.getElementById('root'));
      function Example({mode='literal',open=true,disabled=false,stamp}) {
        window.calls=[];
        const getClasses=(name,value)=>{window.calls.push(name);return value};
        const commands=[{id:'a',label:'Alpha',onSelect:()=>{}},{id:'b',label:'Beta',onSelect:()=>{}}];
        return <section data-stamp={stamp}>${web.jsx}</section>;
      }
      window.show=value=>root.render(<Example {...value}/>);`,
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
  return { web, candidateCss, oracleCss, bundle, rawClasses: `${own} ${negative}` }
}

const readPatternInput = (locator) =>
  locator.evaluate((e) => {
    const s = getComputedStyle(e)
    return [
      s.paddingLeft,
      s.paddingTop,
      s.opacity,
      s.borderRadius,
      s.borderTopWidth,
      s.outlineWidth,
      s.marginTop,
      s.marginBottom,
    ]
  })

async function comparePatternInput(page, oracle, field, raw, focused) {
  await page.bringToFront()
  if (focused) await field.focus()
  else await field.evaluate((e) => e.blur())
  const actual = await readPatternInput(field)
  await oracle.bringToFront()
  if (focused) await raw.focus()
  else await raw.evaluate((e) => e.blur())
  assert.deepEqual(actual, await readPatternInput(raw))
  await page.bringToFront()
  return actual
}

test('CommandPalette real input matches independent Tailwind across focus and class routes', {
  skip: !executablePath,
}, async () => {
  const own =
    'p-2 rounded-none opacity-100 border-0 focus:opacity-50 focus-visible:outline-2 disabled:opacity-25 read-only:rounded-lg aria-expanded:border-2 aria-disabled:mt-4 aria-selected:mb-8'
  const fixture = await patternInputFixture(
    'CommandPalette',
    own,
    (mode) => `open={open && mode==='${mode}'} portal={false} commands={commands}`,
  )
  const page = await browser.newPage()
  const oracle = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await oracle.setContent(
      `<style>html{font-size:16px}</style><style>${fixture.oracleCss}</style><input id="oracle" type="text" role="combobox" aria-expanded="true" class="${fixture.rawClasses}"/>`,
    )
    const raw = oracle.locator('#oracle')
    for (const sheets of [
      [fixture.web.css, fixture.candidateCss],
      [fixture.candidateCss, fixture.web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, fixture.candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: fixture.bundle.outputFiles[0].text })
      for (const mode of ['literal', 'opaque', 'mixed']) {
        const show = async (open, stamp) => {
          await page.evaluate((props) => window.show(props), { mode, open, stamp })
          await page.waitForFunction(
            (stamp) => document.querySelector('[data-stamp]')?.dataset.stamp === stamp,
            stamp,
          )
          assert.equal((await page.evaluate(() => window.calls)).length, 2)
        }
        await show(true, `${mode}-open`)
        const section = page.getByTestId(mode)
        const field = section.locator('input')
        const focused = await comparePatternInput(page, oracle, field, raw, true)
        assert.deepEqual(focused.slice(0, 4), ['12px', '8px', '0.5', '0px'])
        assert.equal(focused[4], '2px')
        assert.equal(focused[5], '2px')
        if (mode !== 'literal')
          await assertCandidateStylesRequired(
            page,
            () => readPatternInput(field),
            `Command input ${mode}`,
          )
        await field.fill('Beta')
        assert.equal(await section.locator('[role="option"]').count(), 1)
        assert.deepEqual(await readPatternInput(field), focused)
        assert.equal(
          (await page.evaluate(() => window.calls)).length,
          2,
          'query/focus does not rerun authored inputs',
        )
        await comparePatternInput(page, oracle, field, raw, false)
        assert.equal((await readPatternInput(field))[2], '1')
        await show(false, `${mode}-closed`)
        assert.equal(await section.locator('input').count(), 0)
        await show(true, `${mode}-reopen`)
        assert.equal(await field.inputValue(), '')
        await comparePatternInput(page, oracle, field, raw, true)
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('ColorPicker real input matches independent Tailwind across focus, disabled and draft changes', {
  skip: !executablePath,
}, async () => {
  const own =
    'p-2 rounded-none opacity-100 border-0 focus:opacity-50 focus-visible:outline-2 disabled:opacity-25 read-only:rounded-lg aria-disabled:mt-4 aria-selected:mb-8 aria-checked:ml-8'
  const fixture = await patternInputFixture(
    'ColorPicker',
    own,
    () =>
      `accessibilityLabel="Theme" disabled={disabled} defaultValue="#123456" presets={['#123456','#654321']}`,
  )
  const page = await browser.newPage()
  const oracle = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await oracle.setContent(
      `<style>html{font-size:16px}</style><style>${fixture.oracleCss}</style><input id="oracle" type="text" class="${fixture.rawClasses}"/>`,
    )
    const raw = oracle.locator('#oracle')
    for (const sheets of [
      [fixture.web.css, fixture.candidateCss],
      [fixture.candidateCss, fixture.web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, fixture.candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: fixture.bundle.outputFiles[0].text })
      for (const mode of ['literal', 'opaque', 'mixed']) {
        const show = async (disabled, stamp) => {
          await page.evaluate((props) => window.show(props), { mode, disabled, stamp })
          await page.waitForFunction(
            (stamp) => document.querySelector('[data-stamp]')?.dataset.stamp === stamp,
            stamp,
          )
          await raw.evaluate((e, disabled) => {
            e.disabled = disabled
          }, disabled)
          assert.equal((await page.evaluate(() => window.calls)).length, 2)
        }
        await show(false, `${mode}-enabled`)
        const field = page.getByTestId(mode).locator('input[type="text"]')
        const focused = await comparePatternInput(page, oracle, field, raw, true)
        assert.deepEqual(focused.slice(0, 4), ['12px', '8px', '0.5', '0px'])
        assert.equal(focused[5], '2px')
        if (mode !== 'literal')
          await assertCandidateStylesRequired(
            page,
            () => readPatternInput(field),
            `Color input ${mode}`,
          )
        await field.fill('#abc')
        assert.equal(await field.inputValue(), '#abc')
        await comparePatternInput(page, oracle, field, raw, false)
        assert.equal(
          await field.inputValue(),
          '#aabbcc',
          'blur normalizes without losing the editing draft',
        )
        await field.focus()
        await field.fill('#f')
        assert.equal(
          (await page.evaluate(() => window.calls)).length,
          2,
          'draft/focus do not rerun authored inputs',
        )
        await show(true, `${mode}-disabled`)
        const disabled = await comparePatternInput(page, oracle, field, raw, false)
        assert.deepEqual(disabled.slice(0, 4), ['8px', '8px', '0.25', '8px'])
        await page.waitForFunction(
          (mode) =>
            document.querySelector(`[data-testid="${mode}"] input[type="text"]`)?.value ===
            '#aabbcc',
          mode,
        )
        assert.equal(await field.evaluate((e) => e.matches(':focus')), false)
        await show(false, `${mode}-again`)
        const resting = await comparePatternInput(page, oracle, field, raw, false)
        assert.equal(resting[2], '1', 'enable does not revive stale focus')
        assert.equal(resting[3], '0px')
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('Menu button expansion and action-div states match isolated Tailwind in both CSS orders', {
  skip: !executablePath,
}, async () => {
  const looks = {
    root: 'p-2 opacity-75 text-[#654321] disabled:opacity-25 enabled:opacity-50 aria-selected:mt-8',
    trigger:
      'p-2 border-0 opacity-100 rounded-none focus:opacity-50 focus-visible:outline-2 hover:bg-[#123456] active:opacity-75 aria-expanded:border-2 read-only:rounded-lg enabled:px-3 disabled:mt-8 aria-disabled:mb-8 aria-selected:ml-8',
    menu: 'p-2 opacity-100 text-[#123456] read-only:rounded-lg disabled:opacity-25 enabled:opacity-50 aria-selected:border-8',
    item: 'p-1 border-0 opacity-100 rounded-none focus:opacity-50 focus-visible:outline-2 hover:bg-[#654321] active:opacity-75 aria-disabled:opacity-25 read-only:rounded-lg disabled:mt-8 enabled:mb-8 aria-selected:ml-8 aria-checked:mr-8',
  }
  const expression = (mode, part) => {
    const classes = looks[part]
    const base =
      part === 'root'
        ? 'p-2 opacity-75'
        : part === 'menu'
          ? 'p-2 opacity-100'
          : `${part === 'item' ? 'p-1' : 'p-2'} border-0 opacity-100 rounded-none`
    return mode === 'literal'
      ? JSON.stringify(classes)
      : mode === 'opaque'
        ? `{getClasses(${JSON.stringify(classes)})}`
        : `{cx(${JSON.stringify(base)},getClasses(${JSON.stringify(classes.slice(base.length))}))}`
  }
  // Keep the original adjacent stacking contexts: the popup must escape
  // them, not rely on test-only spacing to receive real pointer events.
  const source = `import {View,Menu,cx} from '@hozo/core';const C=()=> <View>
    ${['literal', 'opaque', 'mixed']
      .map(
        (
          mode,
        ) => `<View testID="${mode}"><Menu trigger="Actions" items={items} accessibilityLabel="Letters"
      className=${expression(mode, 'root')} triggerClassName=${expression(mode, 'trigger')}
      menuClassName=${expression(mode, 'menu')} itemClassName=${expression(mode, 'item')}/></View>`,
      )
      .join('')}
    </View>`
  const web = compiler.compile(source)[0]
  assert.ok(web.diagnostics.length > 0)
  for (const diagnostic of web.diagnostics) {
    assert.equal(diagnostic.code, 'DYNAMIC_CLASS_NAME_NOT_RESOLVED')
    assert.match(source.slice(diagnostic.spanStart, diagnostic.spanEnd), /getClasses\(/)
  }
  const candidates = openCandidateCache(path.join(directory, 'menu-owners.json'))
  candidates.scanFile('MenuFixture.tsx', source, 1)
  const candidateCss = candidates.renderCss()
  assert.ok(candidateCss.includes('.p-1') && candidateCss.includes('.p-2'))
  const oracleCss = (
    await compile('@theme {--spacing:0.25rem;--radius-lg:0.5rem;} @tailwind utilities;')
  ).build(Object.values(looks).flatMap((classes) => classes.split(' ')))
  // The same official reset on each page, without any oracle utilities on
  // the target. Tailwind's reset makes button typography inherit as in apps.
  const tailwindRoot = path.dirname(
    createRequire(import.meta.url).resolve('tailwindcss/package.json'),
  )
  const preflight = readFileSync(path.join(tailwindRoot, 'preflight.css'), 'utf8')
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';
        import {Menu as HozoMenu} from '@hozo/patterns';window.calls=0;window.changes=[];
        const getClasses=value=>{window.calls++;return value};
        const items=[{label:'Alpha',onSelect:()=>window.changes.push('a')},{label:'Beta',disabled:true,onSelect:()=>window.changes.push('b')},{label:'Gamma',onSelect:()=>window.changes.push('c')}];
        createRoot(document.getElementById('root')).render(${web.jsx});`,
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
  const oracle = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const read = (locator) =>
    locator.evaluate((e) => {
      const s = getComputedStyle(e)
      return [
        s.paddingLeft,
        s.opacity,
        s.borderRadius,
        s.borderTopWidth,
        s.outlineWidth,
        s.marginTop,
        s.marginBottom,
        s.marginLeft,
        s.marginRight,
        s.color,
        s.backgroundColor,
      ]
    })
  try {
    await oracle.setContent(`<style>${preflight}</style><style>${oracleCss}</style><div id="owner" class="${looks.root}">
      <button id="trigger" type="button" aria-expanded="false" class="${looks.trigger}">Actions</button>
      <div id="menu" role="menu" class="${looks.menu}"><div id="item" tabindex="0" role="menuitem" class="${looks.item}">Item</div></div></div>`)
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      await page.setContent(
        `<style>${preflight}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: bundle.outputFiles[0].text })
      for (const mode of ['literal', 'opaque', 'mixed']) {
        const section = page.getByTestId(mode)
        const owner = section.locator(':scope > div').first()
        const trigger = section.getByRole('button', { name: 'Actions' })
        const menu = section.getByRole('menu')
        const rows = menu.getByRole('menuitem')
        await trigger.waitFor()
        const initialCalls = await page.evaluate(() => window.calls)
        assert.deepEqual(await read(owner), await read(oracle.locator('#owner')))
        const compare = async (target, reference, { focus = false, hover = false } = {}) => {
          await page.bringToFront()
          await page.mouse.move(1200, 700)
          await page.evaluate(() => document.activeElement?.blur())
          if (focus) {
            await page.keyboard.press('Shift')
            await target.focus()
          }
          if (hover) await target.hover()
          const actual = await read(target)
          await oracle.bringToFront()
          await oracle.mouse.move(1200, 700)
          await oracle.evaluate(() => document.activeElement?.blur())
          if (focus) {
            await oracle.keyboard.press('Shift')
            await reference.focus()
          }
          if (hover) await reference.hover()
          assert.deepEqual(
            actual,
            await read(reference),
            `${mode}: ${(await target.getAttribute('role')) ?? 'trigger'}`,
          )
          await page.bringToFront()
        }
        await oracle.locator('#trigger').evaluate((e) => e.setAttribute('aria-expanded', 'false'))
        await compare(trigger, oracle.locator('#trigger'), { focus: true })
        assert.equal(await menu.count(), 0, 'trigger focus alone does not open')
        await trigger.click()
        await menu.waitFor()
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('role') === 'menuitem',
        )
        assert.equal(await rows.first().evaluate((e) => e === document.activeElement), true)
        await rows.nth(2).focus()
        await page.evaluate(() => window.dispatchEvent(new Event('resize')))
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        )
        assert.equal(
          await rows.nth(2).evaluate((e) => e === document.activeElement),
          true,
          'position updates do not rerun the initial focus effect',
        )
        await oracle.locator('#trigger').evaluate((e) => e.setAttribute('aria-expanded', 'true'))
        await compare(trigger, oracle.locator('#trigger'))
        assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
        assert.deepEqual(await read(menu), await read(oracle.locator('#menu')))
        const checkItem = async (at, disabled = false, interaction = {}) => {
          await oracle.locator('#item').evaluate((e, disabled) => {
            if (disabled) e.setAttribute('aria-disabled', 'true')
            else e.removeAttribute('aria-disabled')
          }, disabled)
          await compare(rows.nth(at), oracle.locator('#item'), interaction)
          assert.equal(await rows.nth(at).getAttribute('aria-selected'), null)
        }
        await checkItem(0)
        await checkItem(1, true)
        await checkItem(0, false, { focus: true })
        await checkItem(2, false, { hover: true })
        await checkItem(0) // Stable geometry/modality for CSS-removal controls.
        if (mode !== 'literal') {
          for (const [part, node] of [
            ['root', owner],
            ['trigger', trigger],
            ['menu', menu],
            ['item', rows.first()],
          ])
            await assertCandidateStylesRequired(page, () => read(node), `Menu ${part} ${mode}`)
        }
        const before = await page.evaluate(() => window.changes.length)
        await rows.nth(1).evaluate((e) => e.click())
        assert.equal(await menu.count(), 1)
        assert.equal(await page.evaluate(() => window.changes.length), before)
        // Existing Web roving-focus behavior is exercised independently of
        // Native host events: Down skips disabled Beta and Enter acts once.
        await rows.first().focus()
        await page.keyboard.press('ArrowDown')
        await page.waitForFunction(() => document.activeElement?.textContent === 'Gamma')
        await page.keyboard.press('Enter')
        assert.equal(await menu.count(), 0)
        assert.equal(await page.evaluate(() => window.changes.at(-1)), 'c')
        assert.equal(await trigger.evaluate((e) => e === document.activeElement), true)
        assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
        await trigger.press('ArrowUp')
        await page.waitForFunction(() => document.activeElement?.textContent === 'Gamma')
        await page.keyboard.press('Escape')
        assert.equal(await menu.count(), 0)
        await trigger.click()
        await rows.first().waitFor()
        await page.waitForFunction(() => document.activeElement?.textContent === 'Alpha')
        await rows.first().click()
        assert.equal(await page.evaluate(() => window.changes.at(-1)), 'a')
        assert.equal(await menu.count(), 0)
        assert.equal(
          await page.evaluate(() => window.calls),
          initialCalls,
          'open and item events do not rerun authored class inputs',
        )
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('Menu top layer escapes clipping while retaining live CSS ancestry and modal boundaries', {
  skip: !executablePath,
}, async () => {
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';
    import {HozoMenu as Menu} from '../../packages/patterns/src/menu.tsx';
    window.actions=[];
    const items=[{label:'Alpha',onSelect:()=>window.actions.push('a')},{label:'Beta',disabled:true,onSelect:()=>window.actions.push('b')},{label:'Gamma',onSelect:()=>window.actions.push('c')}];
    const menu=<Menu trigger="Actions" items={items} accessibilityLabel="Letters" menuClassName="panel" itemClassName="item"/>;
    createRoot(document.getElementById('root')).render(<React.StrictMode>
      <div id="theme" className="theme" dir="rtl" lang="ja"><div id="clip">{menu}</div></div>
      <button id="outside">Outside</button><dialog id="modal">{menu}</dialog>
    </React.StrictMode>);`
  const bundleFor = async (mutation = false) => {
    let mutations = 0
    const result = await build({
      stdin: {
        contents: source,
        loader: 'tsx',
        resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"development"' },
      plugins: mutation
        ? [
            {
              name: 'inline-menu-negative-control',
              setup(builder) {
                builder.onLoad({ filter: /patterns[\\/]src[\\/]menu\.tsx$/ }, ({ path: file }) => {
                  const contents = readFileSync(file, 'utf8')
                  assert.equal((contents.match(/\s+topLayer\b/g) ?? []).length, 1)
                  mutations++
                  return {
                    contents: contents.replace(/\s+topLayer\b/, ''),
                    loader: 'tsx',
                    resolveDir: path.dirname(file),
                  }
                })
              },
            },
          ]
        : [],
    })
    assert.equal(mutations, mutation ? 1 : 0, 'negative control must mutate the real Menu source')
    return result.outputFiles[0].text
  }
  const script = await bundleFor()
  const mutationScript = await bundleFor(true)
  const css = `body{margin:0}#theme{position:absolute;left:35px;top:35px;width:180px;opacity:.7;transform:translate(20px,15px) scale(1.1)}
    #clip{height:44px;overflow:hidden}.theme{--ink:rgb(23,45,67);--surface:rgb(235,241,247);color:var(--ink);font:19px/1.4 monospace}
    .theme.hot{--ink:rgb(123,45,67);--surface:rgb(245,231,217);font-size:23px}
    .theme [role=menuitem]{border-inline-start:3px solid currentColor}.panel{background:var(--surface);min-width:170px}.item{padding:8px}
    #outside{position:absolute;left:500px;top:20px}#blocker{position:fixed;z-index:2147483647;background:pink}`
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const init = async (script, unsupported = false) => {
    await page.goto('about:blank')
    await page.setContent(
      `<style>${css}</style><div id="root"></div><div id="blocker" hidden></div>`,
    )
    await page.evaluate((unsupported) => {
      window.showCount = 0
      window.fallbackWarnings = []
      const original = HTMLElement.prototype.showPopover
      if (unsupported)
        Object.defineProperty(HTMLElement.prototype, 'showPopover', {
          configurable: true,
          value: undefined,
        })
      else
        HTMLElement.prototype.showPopover = function (...args) {
          window.showCount++
          return original.apply(this, args)
        }
      const warn = console.warn
      console.warn = (...args) => {
        window.fallbackWarnings.push(args.join(' '))
        warn(...args)
      }
    }, unsupported)
    await page.addScriptTag({ content: script })
    await page.locator('#theme button').waitFor()
  }
  const trigger = () => page.locator('#theme button')
  const menu = () => page.locator('#theme [role=menu]')
  const rows = () => menu().getByRole('menuitem')
  const hit = (node) =>
    node.evaluate((e) => {
      const r = e.getBoundingClientRect()
      const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return target === e || e.contains(target)
    })
  const blocker = async () =>
    menu().evaluate((e) => {
      const r = e.getBoundingClientRect()
      Object.assign(document.getElementById('blocker').style, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      })
      document.getElementById('blocker').hidden = false
    })
  try {
    // Mutate only the opt-in, retaining the real Menu and positioner. This
    // reproduces the original missing layer rather than comparing two copies
    // of the new algorithm. No forced click/hover bypasses hit testing.
    await init(mutationScript)
    await trigger().click()
    await menu().waitFor()
    await blocker()
    assert.equal(
      await hit(rows().last()),
      false,
      'the old inline path must fail the hit-test control',
    )

    await init(script)
    await trigger().click()
    await menu().waitFor()
    assert.equal(
      await page.locator('#theme [popover]').evaluate((e) => e.matches(':popover-open')),
      true,
    )
    assert.equal(
      await rows()
        .first()
        .evaluate((e) => e === document.activeElement),
      true,
    )
    assert.equal(
      await page.evaluate(() => window.showCount),
      1,
      'StrictMode setup does not repeatedly show an open host',
    )
    await blocker()
    assert.equal(await hit(rows().last()), true)
    await rows().last().hover()
    const inherited = () =>
      rows()
        .last()
        .evaluate((e) => {
          const s = getComputedStyle(e)
          return [
            s.color,
            s.fontSize,
            s.fontFamily,
            s.direction,
            s.borderInlineStartWidth,
            e.closest('[lang]')?.getAttribute('lang'),
            getComputedStyle(e.parentElement).backgroundColor,
          ]
        })
    assert.deepEqual(await inherited(), [
      'rgb(23, 45, 67)',
      '19px',
      'monospace',
      'rtl',
      '3px',
      'ja',
      'rgb(235, 241, 247)',
    ])
    await rows().last().focus()
    await page.locator('#theme').evaluate((e) => {
      e.classList.add('hot')
      e.dir = 'ltr'
      e.lang = 'en'
    })
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('#theme [role=menuitem]')).fontSize === '23px',
    )
    assert.deepEqual(await inherited(), [
      'rgb(123, 45, 67)',
      '23px',
      'monospace',
      'ltr',
      '3px',
      'en',
      'rgb(245, 231, 217)',
    ])
    assert.equal(
      await rows()
        .last()
        .evaluate((e) => e === document.activeElement),
      true,
    )
    await page.evaluate(() => window.dispatchEvent(new Event('resize')))
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
    const alignment = await page.locator('#theme').evaluate((e) => {
      const anchor = e.querySelector('button').getBoundingClientRect(),
        popup = e.querySelector('[data-placement]').getBoundingClientRect()
      return [Math.abs(anchor.left - popup.left), Math.abs(anchor.bottom + 4 - popup.top)]
    })
    assert.ok(
      alignment.every((delta) => delta < 1),
      `viewport coordinates survive transformed ancestors: ${alignment}`,
    )
    assert.equal(await rows().nth(1).getAttribute('aria-disabled'), 'true')
    await rows().last().click()
    assert.deepEqual(await page.evaluate(() => window.actions), ['c'])
    assert.equal(await page.locator(':popover-open').count(), 0)
    assert.equal(await trigger().evaluate((e) => e === document.activeElement), true)
    await page.locator('#blocker').evaluate((e) => {
      e.hidden = true
    })
    await trigger().press('ArrowUp')
    await page.waitForFunction(() => document.activeElement?.textContent === 'Gamma')
    await page.keyboard.press('Escape')
    assert.equal(await trigger().evaluate((e) => e === document.activeElement), true)
    await trigger().click()
    await menu().waitFor()
    await page.locator('#outside').click()
    assert.equal(await menu().count(), 0)
    assert.equal(await page.locator('#outside').evaluate((e) => e === document.activeElement), true)
    assert.equal(await page.locator(':popover-open').count(), 0)
    assert.equal(await page.evaluate(() => window.showCount), 3)
    await page.locator('#modal').evaluate((e) => e.showModal())
    const dialog = page.locator('#modal')
    await dialog.getByRole('button', { name: 'Actions' }).click()
    await dialog.getByRole('menu').waitFor()
    assert.equal(await hit(dialog.getByRole('menuitem').last()), true)
    await dialog.getByRole('menuitem').last().click()
    assert.deepEqual(await page.evaluate(() => window.actions), ['c', 'c'])
    assert.equal(await dialog.evaluate((e) => e.open), true)
    await dialog.evaluate((e) => e.close())
    assert.deepEqual(errors, [])

    // Fresh document/script: unsupported capability is explicit and remains
    // usable inline in a layout that does not need the missing layer.
    await init(script, true)
    await page.locator('#theme').evaluate((e) => {
      e.style.transform = 'none'
      e.style.opacity = '1'
      e.querySelector('#clip').style.overflow = 'visible'
    })
    for (let n = 0; n < 2; n++) {
      await trigger().click()
      await menu().waitFor()
      assert.equal(await page.locator('#theme [popover]').count(), 0)
      await page.keyboard.press('Escape')
    }
    assert.equal(
      await page.evaluate(
        () =>
          window.fallbackWarnings.filter((x) => x.includes('showPopover is unavailable')).length,
      ),
      1,
    )
    assert.equal(await trigger().evaluate((e) => e === document.activeElement), true)
  } finally {
    await page.close()
  }
})

test('Listbox option focus and committed selection match isolated Tailwind in both CSS orders', {
  skip: !executablePath,
}, async () => {
  const looks = {
    root: 'p-2 opacity-75 text-[#654321] disabled:opacity-25 enabled:opacity-50 aria-selected:mt-8',
    option:
      'p-1 border-0 opacity-100 rounded-none focus:opacity-50 focus-visible:outline-2 hover:bg-[#123456] active:opacity-75 aria-selected:border-2 aria-selected:text-[#123456] aria-disabled:opacity-25 read-only:rounded-lg disabled:mt-8 enabled:mb-8 aria-checked:ml-8',
  }
  const expression = (mode, part) => {
    const classes = looks[part]
    const base = part === 'root' ? 'p-2 opacity-75' : 'p-1 border-0 opacity-100 rounded-none'
    return mode === 'literal'
      ? JSON.stringify(classes)
      : mode === 'opaque'
        ? `{getClasses(${JSON.stringify(classes)})}`
        : `{cx(${JSON.stringify(base)},getClasses(${JSON.stringify(classes.slice(base.length))}))}`
  }
  const source = `import {View,Listbox,cx} from '@hozo/core';const C=()=> <View>
    ${['literal', 'opaque', 'mixed']
      .map(
        (mode) => `<View testID="${mode}"><Listbox options={options} multiple={multiple}
          value={value} defaultValue={initial} onValueChange={choose} accessibilityLabel="Letters"
          className=${expression(mode, 'root')} optionClassName=${expression(mode, 'option')}/></View>`,
      )
      .join('')}
    </View>`
  const web = compiler.compile(source)[0]
  assert.ok(web.diagnostics.length > 0)
  for (const diagnostic of web.diagnostics) {
    assert.equal(diagnostic.code, 'DYNAMIC_CLASS_NAME_NOT_RESOLVED')
    assert.match(source.slice(diagnostic.spanStart, diagnostic.spanEnd), /getClasses\(/)
  }
  const candidates = openCandidateCache(path.join(directory, 'listbox-owners.json'))
  candidates.scanFile('ListboxFixture.tsx', source, 1)
  const candidateCss = candidates.renderCss()
  assert.ok(candidateCss.includes('.p-1') && candidateCss.includes('.p-2'))
  const oracleCss = (
    await compile('@theme {--spacing:0.25rem;--radius-lg:0.5rem;} @tailwind utilities;')
  ).build(Object.values(looks).flatMap((value) => value.split(' ')))
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';
        import {Listbox as HozoListbox} from '@hozo/patterns';
        window.calls=0;window.changes=[];
        const getClasses=value=>{window.calls++;return value};
        const choose=value=>window.changes.push(value);
        function App(){
          const [options,setOptions]=React.useState([{value:'a',label:'Alpha'},{value:'b',label:'Beta',disabled:true},{value:'c',label:'Gamma'}]);
          const [value,setValue]=React.useState(window.kind==='controlled'?'c':undefined);
          const multiple=window.kind==='multiple';const initial=multiple?['c']:'c';
          window.updateListbox=(value)=>{setValue(value);setOptions(options=>[...options].reverse())};
          return ${web.jsx};
        }
        createRoot(document.getElementById('root')).render(<App/>);`,
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
  const oracle = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const read = (locator) =>
    locator.evaluate((e) => {
      const s = getComputedStyle(e)
      return [
        s.paddingLeft,
        s.opacity,
        s.borderRadius,
        s.borderTopWidth,
        s.outlineWidth,
        s.marginTop,
        s.marginBottom,
        s.marginLeft,
        s.color,
        s.backgroundColor,
      ]
    })
  try {
    await oracle.setContent(`<style>html{font-size:16px}</style><style>${oracleCss}</style>
      <div id="owner" role="listbox" class="${looks.root}"><div id="option" tabindex="0" role="option" class="${looks.option}" aria-selected="false">Option</div></div>`)
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      for (const kind of ['single', 'multiple', 'controlled']) {
        await page.setContent(
          `<style>html{font-size:16px}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
        )
        await page.evaluate((kind) => {
          window.kind = kind
        }, kind)
        await page.addScriptTag({ content: bundle.outputFiles[0].text })
        for (const mode of ['literal', 'opaque', 'mixed']) {
          const owner = page.getByTestId(mode).getByRole('listbox')
          const rows = owner.getByRole('option')
          await rows.first().waitFor()
          const initialCalls = await page.evaluate(() => window.calls)
          await oracle.locator('#option').evaluate((e) => e.blur())
          await oracle.mouse.move(0, 0)
          assert.deepEqual(await read(owner), await read(oracle.locator('#owner')))
          assert.equal((await read(owner))[1], '0.75', 'a list div is neither enabled nor disabled')
          const check = async (
            at,
            selected,
            { disabled = false, focus = false, hover = false } = {},
          ) => {
            await page.bringToFront()
            await page.mouse.move(0, 0)
            await page.evaluate(() => document.activeElement?.blur())
            if (focus) {
              await page.keyboard.press('Shift')
              await rows.nth(at).focus()
            }
            if (hover) await rows.nth(at).hover()
            const actual = await read(rows.nth(at))
            assert.equal(await rows.nth(at).getAttribute('aria-selected'), String(selected))
            await oracle.bringToFront()
            await oracle.mouse.move(0, 0)
            const reference = oracle.locator('#option')
            await reference.evaluate(
              (e, { selected, disabled }) => {
                e.blur()
                e.setAttribute('aria-selected', String(selected))
                if (disabled) e.setAttribute('aria-disabled', 'true')
                else e.removeAttribute('aria-disabled')
              },
              { selected, disabled },
            )
            if (focus) {
              await oracle.keyboard.press('Shift')
              await reference.focus()
            }
            if (hover) await reference.hover()
            assert.deepEqual(actual, await read(reference), `${kind}/${mode}/${at}/${selected}`)
            await page.bringToFront()
          }
          await check(0, false)
          await check(1, false, { disabled: true })
          await check(2, true)
          await check(0, false, { focus: true })
          assert.equal(
            await rows.nth(2).getAttribute('aria-selected'),
            'true',
            'focus is not selection',
          )
          await check(0, false, { hover: true })
          if (mode !== 'literal') {
            // Removing candidate padding can move the row away from the
            // pointer. Probe a resting owner so restoring CSS does not also
            // require another physical mouse move to restore :hover.
            await check(0, false)
            await assertCandidateStylesRequired(
              page,
              () => read(owner),
              `Listbox root ${kind}/${mode}`,
            )
            await assertCandidateStylesRequired(
              page,
              () => read(rows.first()),
              `Listbox option ${kind}/${mode}`,
            )
          }
          await rows.first().click()
          await check(0, kind !== 'controlled')
          await check(2, kind !== 'single')
          const count = await page.evaluate(() => window.changes.length)
          await rows.nth(1).evaluate((e) => e.click())
          assert.equal(
            await page.evaluate(() => window.changes.length),
            count,
            'disabled option cannot commit',
          )
          if (kind === 'multiple') {
            assert.deepEqual(await page.evaluate(() => window.changes.at(-1)), ['c', 'a'])
            await rows.first().click()
            await check(0, false)
            await check(2, true)
          } else if (kind === 'controlled') {
            assert.equal(await page.evaluate(() => window.changes.at(-1)), 'a')
          }
          assert.equal(
            await page.evaluate(() => window.calls),
            initialCalls,
            'option events do not rerun authored expressions',
          )
        }
        // A caller update may rerun expressions; DOM identity and focus still
        // follow the option value, rather than the old array position.
        const rows = page.getByTestId('literal').getByRole('option')
        await rows.first().focus()
        await page.evaluate(() => window.updateListbox(window.kind === 'multiple' ? ['a'] : 'a'))
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="literal"] [role="option"]').textContent ===
            'Gamma',
        )
        assert.equal(await rows.nth(2).evaluate((e) => e === document.activeElement), true)
        assert.equal(await rows.nth(2).getAttribute('aria-selected'), 'true')
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('Combobox real owners match isolated Tailwind across focus, filtering, active options and blur', {
  skip: !executablePath,
}, async () => {
  const looks = {
    root: 'text-[#654321] opacity-75 disabled:opacity-25 enabled:opacity-50 aria-selected:mt-8',
    input:
      'p-2 opacity-100 rounded-none border-0 focus:opacity-50 focus-visible:outline-2 aria-expanded:border-2 enabled:px-3 disabled:mt-8 read-only:mb-8 aria-selected:ml-8',
    list: 'p-2 opacity-100 rounded-none read-only:rounded-lg disabled:opacity-25 enabled:opacity-50 aria-selected:border-8 text-[#123456]',
    option:
      'p-1 opacity-100 border-0 rounded-none hover:opacity-50 active:opacity-75 aria-selected:border-2 aria-disabled:opacity-25 read-only:rounded-lg disabled:mt-8 enabled:mb-8 aria-checked:ml-8',
  }
  const expression = (mode, part) => {
    const classes = looks[part]
    const base = {
      root: 'text-[#654321]',
      input: 'p-2 opacity-100 rounded-none border-0',
      list: 'p-2 opacity-100 rounded-none',
      option: 'p-1 opacity-100 border-0 rounded-none',
    }[part]
    assert.ok(classes.startsWith(base))
    return mode === 'literal'
      ? JSON.stringify(classes)
      : mode === 'opaque'
        ? `{getClasses(${JSON.stringify(classes)})}`
        : `{cx(${JSON.stringify(base)},getClasses(${JSON.stringify(classes.slice(base.length))}))}`
  }
  const source = `import {View,Combobox,cx} from '@hozo/core'; const C=()=> <View>
    ${['literal', 'opaque', 'mixed']
      .map(
        (
          mode,
        ) => `<View testID="${mode}"><Combobox options={options} value="a" onValueChange={choose}
      accessibilityLabel="Country" emptyMessage="Nothing" className=${expression(mode, 'root')}
      ${['input', 'list', 'option'].map((part) => `${part}ClassName=${expression(mode, part)}`).join(' ')}/></View>`,
      )
      .join('')}
    </View>`
  const web = compiler.compile(source)[0]
  assert.equal(web.diagnostics.length, 5)
  for (const diagnostic of web.diagnostics) {
    assert.equal(diagnostic.code, 'DYNAMIC_CLASS_NAME_NOT_RESOLVED')
    assert.equal(diagnostic.severity, 'warning')
    assert.match(source.slice(diagnostic.spanStart, diagnostic.spanEnd), /getClasses\(/)
  }
  const candidates = openCandidateCache(path.join(directory, 'combobox-owners.json'))
  candidates.scanFile('ComboboxFixture.tsx', source, 1)
  const candidateCss = candidates.renderCss()
  assert.ok(candidateCss.includes('.p-1') && candidateCss.includes('.p-2'))
  const oracleCss = (
    await compile('@theme {--spacing:0.25rem;--radius-lg:0.5rem;} @tailwind utilities;')
  ).build(Object.values(looks).flatMap((classes) => classes.split(' ')))
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';
      import {Combobox as HozoCombobox} from '@hozo/patterns';
      window.calls=0;window.changes=[];
      const getClasses=value=>{window.calls++;return value};
      const choose=value=>window.changes.push(value);
      const options=[{value:'a',label:'Alpha'},{value:'b',label:'Beta',disabled:true},{value:'c',label:'Gamma'}];
      createRoot(document.getElementById('root')).render(${web.jsx});`,
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
  const oracle = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const read = (locator) =>
    locator.evaluate((e) => {
      const s = getComputedStyle(e)
      return [
        s.paddingLeft,
        s.paddingTop,
        s.opacity,
        s.borderRadius,
        s.borderTopWidth,
        s.outlineWidth,
        s.marginTop,
        s.marginBottom,
        s.color,
      ]
    })
  try {
    await oracle.setContent(`<style>html{font-size:16px}</style><style>${oracleCss}</style><div id="root-owner" class="${looks.root}">
      <input id="input" type="text" class="${looks.input}" aria-expanded="false"/>
      <div id="list" role="listbox" class="${looks.list}"><div id="option" role="option" class="${looks.option}" aria-selected="false"></div></div></div>`)
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: bundle.outputFiles[0].text })
      for (const mode of ['literal', 'opaque', 'mixed']) {
        const section = page.getByTestId(mode)
        const rootOwner = section.locator(':scope > div').first()
        const field = section.locator('input')
        const listbox = section.locator('[role="listbox"]')
        const rows = section.locator('[role="option"]')
        await field.waitFor()
        assert.deepEqual(await read(rootOwner), await read(oracle.locator('#root-owner')))
        assert.equal((await read(rootOwner))[2], '0.75', 'a wrapper div is not an enabled input')
        if (mode !== 'literal')
          await assertCandidateStylesRequired(page, () => read(rootOwner), `Combobox root ${mode}`)
        const inputCheck = async (expanded) => {
          await oracle
            .locator('#input')
            .evaluate((e, expanded) => e.setAttribute('aria-expanded', String(expanded)), expanded)
          await comparePatternInput(page, oracle, field, oracle.locator('#input'), true)
          assert.equal(await field.getAttribute('aria-expanded'), String(expanded))
          assert.equal(await field.evaluate((e) => e === document.activeElement), true)
        }
        const optionCheck = async (index, selected, disabled = false, hover = false) => {
          const owner = rows.nth(index)
          await page.bringToFront()
          if (hover) await owner.hover()
          else await page.mouse.move(0, 0)
          const actual = await read(owner)
          await oracle.locator('#option').evaluate(
            (e, { selected, disabled }) => {
              e.setAttribute('aria-selected', String(selected))
              if (disabled) e.setAttribute('aria-disabled', 'true')
              else e.removeAttribute('aria-disabled')
            },
            { selected, disabled },
          )
          await oracle.bringToFront()
          if (hover) await oracle.locator('#option').hover()
          else await oracle.mouse.move(0, 0)
          assert.deepEqual(actual, await read(oracle.locator('#option')), `${mode} option ${index}`)
          await page.bringToFront()
          assert.equal(await owner.getAttribute('aria-selected'), String(selected))
          assert.equal(
            await field.evaluate((e) => e === document.activeElement),
            true,
            'options never steal DOM focus',
          )
        }
        await inputCheck(false)
        assert.equal(await listbox.count(), 0, 'focus alone does not open the popup')
        await field.fill('')
        await listbox.waitFor()
        assert.equal(await rows.count(), 3)
        await inputCheck(true)
        assert.deepEqual(await read(listbox), await read(oracle.locator('#list')))
        await optionCheck(0, false)
        await optionCheck(1, false, true)
        if (mode !== 'literal') {
          await assertCandidateStylesRequired(page, () => read(field), `Combobox input ${mode}`)
          await assertCandidateStylesRequired(page, () => read(listbox), `Combobox list ${mode}`)
          await assertCandidateStylesRequired(
            page,
            () => read(rows.first()),
            `Combobox option ${mode}`,
          )
        }
        await field.press('ArrowDown')
        await optionCheck(0, true)
        await optionCheck(2, false, false, true)
        await optionCheck(0, true)
        await field.press('ArrowDown')
        await optionCheck(1, true, true)
        const changes = await page.evaluate(() => window.changes.length)
        await field.press('Enter')
        assert.equal(await page.evaluate(() => window.changes.length), changes)
        await field.press('ArrowDown')
        await optionCheck(2, true)
        await field.fill('Ga')
        assert.equal(await rows.count(), 1)
        await optionCheck(0, false)
        await field.press('ArrowUp')
        await optionCheck(0, true)
        await field.press('Enter')
        assert.equal(await field.inputValue(), 'Gamma')
        assert.equal(await listbox.count(), 0)
        assert.equal(await page.evaluate(() => window.changes.at(-1)), 'c')
        await field.press('ArrowDown')
        await listbox.waitFor()
        await field.evaluate((e) => e.blur())
        assert.equal(await listbox.count(), 0)
        await field.focus()
        await field.fill('no-match')
        await listbox.waitFor()
        assert.equal(await rows.count(), 0)
        assert.equal(await listbox.textContent(), 'Nothing')
        await field.press('Escape')
        assert.equal(await listbox.count(), 0)
        await field.press('Escape')
        assert.equal(await field.inputValue(), '')
        assert.equal(
          await page.evaluate(() => window.calls),
          8,
          'owner events do not rerun authored class inputs',
        )
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('Avatar decorative owners match independent Tailwind through image failure, retry and status changes', {
  skip: !executablePath,
}, async () => {
  const own =
    'px-2 py-1 mb-2 bg-[#123456] opacity-100 disabled:opacity-25 read-only:rounded-lg aria-selected:mb-8 aria-disabled:mt-4'
  const negative = 'not-disabled:px-2 not-enabled:py-1 not-aria-selected:mb-2'
  const slots = ['imageClassName', 'fallbackClassName', 'statusClassName']
  const expression = (mode, slot) =>
    mode === 'literal'
      ? JSON.stringify(`${own} ${negative}`)
      : mode === 'opaque'
        ? `{getClasses('${mode}/${slot}', ${JSON.stringify(own)})}`
        : `{cx(${JSON.stringify(`${own.replace('read-only:rounded-lg', 'rounded-none')} ${negative}`)},getClasses('${mode}/${slot}','read-only:rounded-lg'))}`
  const source = `import {View,Avatar,cx} from '@hozo/core'; const C=()=> <View>
    ${['literal', 'opaque', 'mixed']
      .map(
        (
          mode,
        ) => `<View testID="${mode}"><Avatar src={src} name={name} status={status} fallback={fallback}
      className="text-[#654321] font-bold"
      ${slots.map((slot) => `${slot}=${expression(mode, slot)}`).join(' ')} /></View>`,
      )
      .join('')}
  </View>`
  const web = compiler.compile(source)[0]
  assert.equal(web.diagnostics.length, 3)
  for (const diagnostic of web.diagnostics) {
    assert.equal(diagnostic.code, 'DYNAMIC_CLASS_NAME_NOT_RESOLVED')
    assert.equal(diagnostic.severity, 'warning')
    assert.match(source.slice(diagnostic.spanStart, diagnostic.spanEnd), /getClasses\('mixed\//)
  }
  const names = `${own} ${negative} rounded-none text-[#654321] font-bold`.split(' ')
  const candidateCss = scannedCandidateCss('avatar-decorations', source, names)
  assert.ok(candidateCss.includes('read-only'))
  const oracleCss = (
    await compile(
      '@theme { --spacing:0.25rem; --radius-lg:0.5rem; --font-weight-bold:700; } @tailwind utilities;',
    )
  ).build(names)
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Avatar as HozoAvatar} from '@hozo/patterns';
        const root=createRoot(document.getElementById('root'));
        function Example({src,name='Ada Lovelace',status,stamp}) {
          window.calls=[];
          const getClasses=(name,value)=>{window.calls.push(name);return value};
          const fallback=<b>?</b>;
          return <section data-stamp={stamp}>${web.jsx}</section>;
        }
        window.show=value=>root.render(<Example {...value}/>);`,
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
  const read = (locator) =>
    locator.evaluate((e) => {
      const s = getComputedStyle(e)
      return [
        s.paddingLeft,
        s.paddingTop,
        s.marginBottom,
        s.marginTop,
        s.opacity,
        s.borderRadius,
        s.backgroundColor,
      ]
    })
  const picture = (color) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="${color}"/></svg>`)}`
  const oracle = await browser.newPage()
  try {
    await oracle.setContent(
      `<style>html{font-size:16px}</style><style>${oracleCss}</style><img id="image-oracle" class="${own} ${negative}"/><span id="span-oracle" class="${own} ${negative}"></span>`,
    )
    await page.route('https://avatar.test/**', (route) => route.abort())
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: bundle.outputFiles[0].text })
      const show = async (props, stamp) => {
        await page.evaluate((props) => window.show(props), { ...props, stamp })
        await page.waitForFunction(
          (stamp) => document.querySelector('[data-stamp]')?.dataset.stamp === stamp,
          stamp,
        )
        assert.equal((await page.evaluate(() => window.calls)).length, 6)
      }
      const check = async (part, image = false) => {
        const actual = await read(part)
        assert.deepEqual(
          actual,
          await read(oracle.locator(image ? '#image-oracle' : '#span-oracle')),
        )
        assert.deepEqual(actual, ['8px', '4px', '8px', '0px', '1', '8px', 'rgb(18, 52, 86)'])
        assert.equal(await part.getAttribute('aria-hidden'), 'true')
      }
      const owners = () =>
        ['literal', 'opaque', 'mixed'].map((mode) => page.locator(`[data-testid="${mode}"] > span`))
      await show({ src: picture('red'), status: 'online' }, 'initial')
      for (const owner of owners()) {
        assert.equal(await owner.getAttribute('role'), 'img')
        assert.equal(await owner.getAttribute('aria-label'), 'Ada Lovelace, online')
        await check(owner.locator('img'), true)
        await check(owner.locator('[data-hozo-status]'))
        assert.equal(await owner.locator('span:not([data-hozo-status])').count(), 0)
      }
      for (const mode of ['opaque', 'mixed']) {
        const owner = page.getByTestId(mode).locator('img')
        await assertCandidateStylesRequired(page, () => read(owner), `Avatar ${mode}`)
      }
      // Exercise the actual image error handler with a failed request, not
      // a reimplemented fallback condition in the test.
      await show({ src: 'https://avatar.test/broken.png', status: 'busy' }, 'failure')
      for (const owner of owners()) {
        await owner.locator('span:not([data-hozo-status])').waitFor()
        assert.equal(await owner.locator('img').count(), 0)
        const fallback = owner.locator('span:not([data-hozo-status])')
        await check(fallback)
        assert.equal(await fallback.textContent(), 'AL')
        assert.deepEqual(
          await fallback.evaluate((e) => [
            getComputedStyle(e).color,
            getComputedStyle(e).fontWeight,
          ]),
          ['rgb(101, 67, 33)', '700'],
        )
        await check(owner.locator('[data-hozo-status]'))
      }
      for (const mode of ['opaque', 'mixed']) {
        const owner = page.getByTestId(mode).locator('span:not([data-hozo-status])').last()
        await assertCandidateStylesRequired(page, () => read(owner), `Avatar fallback ${mode}`)
      }
      assert.equal(
        (await page.evaluate(() => window.calls)).length,
        6,
        'image errors do not rerun authored inputs',
      )
      await show({ src: picture('blue') }, 'retry')
      for (const owner of owners()) {
        await check(owner.locator('img'), true)
        assert.equal(
          await owner.locator('span').count(),
          0,
          'retry removes fallback; missing status removes dot',
        )
      }
      await show({ name: '' }, 'custom-fallback')
      for (const owner of owners()) {
        assert.equal(await owner.getAttribute('role'), null)
        assert.equal(await owner.getAttribute('aria-hidden'), 'true')
        assert.equal(await owner.locator('img,[data-hozo-status]').count(), 0)
        await check(owner.locator('span'))
        assert.equal(await owner.locator('span > b').textContent(), '?')
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('CommandPalette decorative owners match independent Tailwind through query and active-command changes', {
  skip: !executablePath,
}, async () => {
  const own =
    'px-2 py-1 mb-2 text-[#123456] opacity-100 disabled:opacity-25 read-only:rounded-lg aria-selected:text-[#ff0000] aria-disabled:mt-4'
  const negative = 'not-disabled:px-2 not-enabled:py-1 not-aria-selected:text-[#123456]'
  const extra = 'bg-[#123456]'
  const slots = ['shortcutClassName', 'groupHeadingClassName', 'emptyClassName']
  const expression = (mode, slot) =>
    mode === 'literal'
      ? JSON.stringify(`${own} ${negative} ${extra}`)
      : mode === 'opaque'
        ? `{getClasses('${mode}/${slot}', ${JSON.stringify(`${own} ${extra}`)})}`
        : `{cx(${JSON.stringify(`${own.replace('read-only:rounded-lg', 'rounded-none')} ${negative}`)},getClasses('${mode}/${slot}','${extra} read-only:rounded-lg'))}`
  const source = `import {View,CommandPalette,cx} from '@hozo/core'; const C=()=> <View>
    ${['literal', 'opaque', 'mixed']
      .map(
        (mode) => `<View testID="${mode}"><CommandPalette
      open={mode === '${mode}'} portal={false} commands={commands} accessibilityLabel="Decorative commands"
      itemClassName="aria-selected:font-bold" panelClassName="text-[#654321]"
      ${slots.map((slot) => `${slot}=${expression(mode, slot)}`).join(' ')} /></View>`,
      )
      .join('')}
  </View>`
  const web = compiler.compile(source)[0]
  assert.equal(web.diagnostics.length, 3)
  for (const diagnostic of web.diagnostics) {
    assert.equal(diagnostic.code, 'DYNAMIC_CLASS_NAME_NOT_RESOLVED')
    assert.equal(diagnostic.severity, 'warning')
    assert.match(source.slice(diagnostic.spanStart, diagnostic.spanEnd), /getClasses\('mixed\//)
  }
  const names = `${own} ${negative} ${extra} aria-selected:font-bold`.split(' ')
  const candidateCss = scannedCandidateCss('command-decorations', source, names)
  const oracleCss = (
    await compile(
      '@theme { --spacing:0.25rem; --radius-lg:0.5rem; --font-weight-bold:700; } @tailwind utilities;',
    )
  ).build(names)
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {CommandPalette as HozoCommandPalette} from '@hozo/patterns';
        const root=createRoot(document.getElementById('root'));
        const initial=[{id:'a',label:'Alpha',group:'Group',shortcut:'A',onSelect:()=>{}},
          {id:'b',label:'Beta',group:'Group',shortcut:'B',disabled:true,onSelect:()=>{}},
          {id:'c',label:'Gamma',onSelect:()=>{}}];
        function Example({mode,stamp,plain}) {
          window.calls=[];
          const commands=plain ? [{id:'plain',label:'Plain',onSelect:()=>{}}] : initial;
          const getClasses=(name,value)=>{window.calls.push(name);return value};
          return <section data-stamp={stamp}>${web.jsx}</section>;
        }
        window.show=value=>root.render(<Example {...value}/>);`,
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
  const read = (locator) =>
    locator.evaluate((e) => {
      const s = getComputedStyle(e)
      return [
        s.paddingLeft,
        s.paddingTop,
        s.opacity,
        s.borderRadius,
        s.color,
        s.marginTop,
        s.marginBottom,
        s.backgroundColor,
        s.fontWeight,
      ]
    })
  const oracle = await browser.newPage()
  try {
    await oracle.setContent(
      `<style>html{font-size:16px}</style><style>${oracleCss}</style><div><span id="oracle" class="${own} ${negative} ${extra}"></span></div>`,
    )
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: bundle.outputFiles[0].text })
      for (const mode of ['literal', 'opaque', 'mixed']) {
        await page.evaluate((mode) => window.show({ mode, stamp: mode, plain: false }), mode)
        await page.waitForFunction(
          (mode) => document.querySelector('[data-stamp]')?.dataset.stamp === mode,
          mode,
        )
        const section = page.locator(`[data-testid="${mode}"]`)
        const input = section.locator('[role="combobox"]')
        await input.waitFor()
        const option = (label) => section.locator('[role="option"]').filter({ hasText: label })
        const shortcut = (label) => option(label).locator('span[aria-hidden="true"]')
        const heading = section.locator('[role="group"] > [role="presentation"]')
        const check = async (locator, bold = false) => {
          await oracle.locator('#oracle').evaluate((e, bold) => {
            e.parentElement.style.fontWeight = bold ? '700' : '400'
          }, bold)
          const actual = await read(locator)
          assert.deepEqual(actual, await read(oracle.locator('#oracle')), mode)
          assert.deepEqual(actual, [
            '8px',
            '4px',
            '1',
            '8px',
            'rgb(18, 52, 86)',
            '0px',
            '8px',
            'rgb(18, 52, 86)',
            bold ? '700' : '400',
          ])
        }
        assert.equal(await section.locator('[role="option"]').count(), 3)
        assert.equal(
          (await page.evaluate(() => window.calls)).length,
          6,
          'closed palettes still evaluate authored props',
        )
        await check(heading)
        await check(shortcut('Alpha'), true)
        await check(shortcut('Beta'))
        if (mode !== 'literal') {
          await assertCandidateStylesRequired(page, () => read(heading), `Command heading ${mode}`)
          await assertCandidateStylesRequired(
            page,
            () => read(shortcut('Alpha')),
            `Command shortcut ${mode}`,
          )
        }
        await option('Gamma').hover()
        await page.waitForFunction(
          () =>
            document.querySelector('[role="option"][aria-selected="true"]')?.textContent ===
            'Gamma',
        )
        await check(shortcut('Alpha'))
        await input.fill('Beta')
        await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 1)
        await check(shortcut('Beta'))
        await input.fill('no-match')
        await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0)
        assert.equal(await heading.count(), 0)
        const empty = section.locator('[role="listbox"] + div').first()
        await check(empty)
        if (mode !== 'literal')
          await assertCandidateStylesRequired(page, () => read(empty), `Command empty ${mode}`)
        assert.equal(
          (await page.evaluate(() => window.calls)).length,
          6,
          'query/hover must not rerun author inputs',
        )
        await input.fill('')
        await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 3)
        await check(shortcut('Alpha'), true)
        await page.evaluate(
          (mode) => window.show({ mode, stamp: `${mode}-plain`, plain: true }),
          mode,
        )
        await page.waitForFunction(
          () => document.querySelector('[role="option"]')?.textContent === 'Plain',
        )
        assert.equal(await heading.count(), 0)
        assert.equal(await section.locator('[role="option"] span[aria-hidden]').count(), 0)
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('decorative Stepper and Pagination owners match independent non-control Tailwind across class routes', {
  skip: !executablePath,
}, async () => {
  const own =
    'px-2 py-1 mb-2 text-[#123456] opacity-100 disabled:opacity-25 read-only:rounded-lg aria-selected:text-[#ff0000] aria-disabled:mt-4'
  const negative = 'not-disabled:px-2 not-enabled:py-1 not-aria-selected:text-[#123456]'
  const extra = 'bg-[#123456]'
  const slots = {
    indicatorClassName: '',
    completedIndicatorClassName: 'border-2',
    currentIndicatorClassName: 'border-4',
    errorIndicatorClassName: 'border-8',
    descriptionClassName: '',
  }
  const expression = (mode, slot, status = '') => {
    const classes = `${own} ${status}`
    return mode === 'literal'
      ? JSON.stringify(`${classes} ${negative} ${extra}`)
      : mode === 'opaque'
        ? `{getClasses('${mode}/${slot}', ${JSON.stringify(`${classes} ${extra}`)})}`
        : `{cx(${JSON.stringify(`${classes.replace('read-only:rounded-lg', 'rounded-none')} ${negative}`)}, getClasses('${mode}/${slot}', '${extra} read-only:rounded-lg'))}`
  }
  const source = `import {View,Stepper,Pagination,cx} from '@hozo/core'; const C = () => <View>
    ${['literal', 'opaque', 'mixed']
      .map(
        (mode) => `<View testID="${mode}">
      <Stepper steps={steps} activeStep={activeStep} onStepPress={clickable ? press : undefined}
        stepClassName="text-[#654321]" ${Object.entries(slots)
          .map(([slot, status]) => `${slot}=${expression(mode, slot, status)}`)
          .join(' ')} />
      <Pagination pageCount={pageCount} page={10} className="text-[#654321]" ellipsisClassName=${expression(mode, 'ellipsisClassName')} />
    </View>`,
      )
      .join('')}
  </View>`
  const web = compiler.compile(source)[0]
  assert.equal(
    web.diagnostics.length,
    6,
    'each mixed decorative slot retains its residual candidate warning',
  )
  for (const diagnostic of web.diagnostics) {
    assert.equal(diagnostic.code, 'DYNAMIC_CLASS_NAME_NOT_RESOLVED')
    assert.equal(diagnostic.severity, 'warning')
    assert.match(source.slice(diagnostic.spanStart, diagnostic.spanEnd), /getClasses\('mixed\//)
  }
  const names = `${own} ${negative} ${extra} border-2 border-4 border-8`.split(' ')
  const candidateCss = scannedCandidateCss('decorative-owners', source, names)
  const oracleCss = (
    await compile('@theme { --spacing:0.25rem; --radius-lg:0.5rem; } @tailwind utilities;')
  ).build(names)
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Stepper as HozoStepper, Pagination as HozoPagination} from '@hozo/patterns';
        const root=createRoot(document.getElementById('root'));
        const steps=[{label:'Done',description:'Done details'}, {label:'Now',description:'Now details',disabled:true},
          {label:'Error',description:'Error details',status:'error'}, {label:'Later',description:'Later details'}];
        const press=()=>{};
        function Example({activeStep,pageCount,clickable,stamp}) {
          window.calls=[];
          const getClasses=(slot,value)=>{window.calls.push(slot); return value};
          return <section data-stamp={stamp}>${web.jsx}</section>;
        }
        window.show=value=>root.render(<Example {...value}/>);`,
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
  const read = (locator) =>
    locator.evaluate((e) => {
      const s = getComputedStyle(e)
      return [
        s.paddingLeft,
        s.paddingTop,
        s.opacity,
        s.borderRadius,
        s.color,
        s.marginTop,
        s.marginBottom,
        s.backgroundColor,
        s.borderTopWidth,
      ]
    })
  const oracle = await browser.newPage()
  try {
    await oracle.setContent(
      `<style>html{font-size:16px}</style><style>${oracleCss}</style><span id="oracle"></span>`,
    )
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: bundle.outputFiles[0].text })
      for (const value of [
        { activeStep: 1, pageCount: 20, clickable: true, stamp: 'first' },
        { activeStep: 0, pageCount: 3, clickable: true, stamp: 'changed' },
        { activeStep: 1, pageCount: 20, clickable: false, stamp: 'descriptive' },
      ]) {
        await page.evaluate((value) => window.show(value), value)
        await page.waitForFunction(
          (stamp) => document.querySelector('[data-stamp]')?.dataset.stamp === stamp,
          value.stamp,
        )
        assert.equal((await page.evaluate(() => window.calls)).length, 12)
        const borders = value.activeStep === 1 ? [2, 4, 8, 0] : [4, 0, 8, 0]
        for (const mode of ['literal', 'opaque', 'mixed']) {
          const section = page.locator(`[data-testid="${mode}"]`)
          const rows = section.locator('ol > li')
          assert.equal(await rows.count(), 4)
          for (let index = 0; index < 4; index++) {
            const owner = value.clickable ? rows.nth(index).locator('button') : rows.nth(index)
            const spans = owner.locator('span[aria-hidden="true"]')
            for (const [position, border] of [
              [0, borders[index]],
              [2, 0],
            ]) {
              await oracle.locator('#oracle').evaluate(
                (e, classes) => {
                  e.className = classes
                },
                `${own} ${negative} ${extra} ${border ? `border-${border}` : ''}`,
              )
              const actual = await read(spans.nth(position))
              assert.deepEqual(
                actual,
                await read(oracle.locator('#oracle')),
                `${mode}/${value.stamp}/${index}/${position}`,
              )
              assert.deepEqual(actual, [
                '8px',
                '4px',
                '1',
                '8px',
                'rgb(18, 52, 86)',
                '0px',
                '8px',
                'rgb(18, 52, 86)',
                `${border}px`,
              ])
              if (mode !== 'literal')
                await assertCandidateStylesRequired(
                  page,
                  () => read(spans.nth(position)),
                  `Stepper ${mode}/${value.stamp}/${index}/${position}`,
                )
            }
          }
          const ellipses = section.locator('nav li[aria-hidden="true"]')
          if (value.pageCount === 3) assert.equal(await ellipses.count(), 0)
          else {
            assert.ok((await ellipses.count()) > 0)
            await oracle.locator('#oracle').evaluate((e, classes) => {
              e.className = classes
            }, `${own} ${negative} ${extra}`)
            for (const ellipsis of await ellipses.all()) {
              assert.deepEqual(await read(ellipsis), await read(oracle.locator('#oracle')))
              if (mode !== 'literal')
                await assertCandidateStylesRequired(
                  page,
                  () => read(ellipsis),
                  `Pagination ellipsis ${mode}/${value.stamp}`,
                )
            }
          }
          if (value.clickable) {
            await rows.nth(0).locator('button').focus()
            assert.equal(
              (await page.evaluate(() => window.calls)).length,
              12,
              'focus does not re-evaluate author classes',
            )
          }
        }
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
  }
})

test('root capture scopes keep inherited and loop-owned pixels aligned with independent Tailwind', {
  skip: !executablePath,
}, async () => {
  const source = `import {View,Text,cx} from '@hozo/core'; const C = () =>
    <View className={cx(first(), guard() ? 'text-[#123456]' : 'text-[#654321]', last())} testID={after()}>
      <Text>Known</Text><Foreign><Text>Opaque</Text></Foreign><><Text>Fragment</Text></>
      {rows.map(row => <Text className={readRow(row) ? 'p-2' : 'p-4'} key={row}>{row}</Text>)}
    </View>`
  const web = compiler.compile(source)[0]
  const candidates = openCandidateCache(path.join(directory, 'root-capture.json'))
  candidates.scanFile('caller.ts', "const classes = 'opacity-75'", 1)
  const candidateCss = candidates.renderCss()
  assert.ok(candidateCss.includes('.opacity-75'))
  const oracleCss = (await compile('@theme { --spacing:0.25rem; } @tailwind utilities;')).build([
    'text-[#123456]',
    'text-[#654321]',
    'p-2',
    'p-4',
    'opacity-75',
  ])
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        const root = createRoot(document.getElementById('root'));
        function Foreign({children}) {return <article>{children}</article>}
        function Probe({value}) {
          window.calls = [];
          const first = () => {window.calls.push('first'); return 'opacity-75'};
          const guard = () => {window.calls.push('guard'); return value};
          const last = () => {window.calls.push('last')};
          const after = () => {window.calls.push('after'); return 'captured-root'};
          const rows = ['one','two'];
          const readRow = row => {window.calls.push(row); return (row === 'one') === value};
          return <section data-case={String(value)}>{${web.jsx}}</section>;
        }
        window.show = value => root.render(<Probe value={value}/>);`,
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
  const oracle = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await oracle.setContent(
      `<style>html{font-size:16px}</style><style>${oracleCss}</style><section id="oracle"></section>`,
    )
    for (const sheets of [
      [web.css, candidateCss],
      [candidateCss, web.css],
    ]) {
      await page.setContent(
        `<style>html{font-size:16px}</style>${compiledStyles(sheets, candidateCss)}<div id="root"></div>`,
      )
      await page.addScriptTag({ content: bundle.outputFiles[0].text })
      for (const value of [true, false]) {
        await page.evaluate((value) => window.show(value), value)
        await page.waitForFunction(
          (value) => document.querySelector('[data-case]')?.dataset.case === String(value),
          value,
        )
        assert.deepEqual(await page.evaluate(() => window.calls), [
          'first',
          'guard',
          'last',
          'after',
          'one',
          'two',
        ])
        const expectedColor = value ? 'rgb(18, 52, 86)' : 'rgb(101, 67, 33)'
        const actual = await page.locator('#root span').evaluateAll((elements) =>
          elements.map((e) => ({
            text: e.textContent,
            color: getComputedStyle(e).color,
            padding: getComputedStyle(e).paddingTop,
          })),
        )
        assert.deepEqual(
          actual.map((item) => item.text),
          ['Known', 'Opaque', 'Fragment', 'one', 'two'],
        )
        assert.ok(actual.every((item) => item.color === expectedColor))
        assert.deepEqual(
          actual.slice(3).map((item) => item.padding),
          value ? ['8px', '16px'] : ['16px', '8px'],
        )
        await oracle.locator('#oracle').evaluate((e, value) => {
          e.className = value ? 'text-[#123456]' : 'text-[#654321]'
          const nodes = ['Known', 'Opaque', 'Fragment', 'one', 'two'].map((text, index) => {
            const span = document.createElement('span')
            span.textContent = text
            if (index > 2) span.className = (index === 3) === value ? 'p-2' : 'p-4'
            return span
          })
          e.replaceChildren(...nodes)
        }, value)
        const expected = await oracle.locator('#oracle span').evaluateAll((elements) =>
          elements.map((e) => ({
            text: e.textContent,
            color: getComputedStyle(e).color,
            padding: getComputedStyle(e).paddingTop,
          })),
        )
        assert.deepEqual(
          actual,
          expected,
          'independent Tailwind inheritance and per-row guard selection',
        )
        const rootOpacity = () =>
          page.getByTestId('captured-root').evaluate((e) => getComputedStyle(e).opacity)
        assert.equal(await rootOpacity(), '0.75')
        await assertCandidateStylesRequired(page, rootOpacity, `root capture ${value}`)
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
    await oracle.close()
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
    assert.equal(
      props.removeClassName,
      dynamic ? `hozo-candidate-owner hozo-candidate-slot-owner ${dynamic}` : dynamic,
    )
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
test("@hozo/patterns' Native Tabs applies its class props, selected, pressed, hovered and focus-visible included", async () => {
  const states = 'hover:bg-red-500 focus-visible:border-2'
  const look = `p-4 px-3 aria-selected:bg-blue-500 active:opacity-80 disabled:opacity-50 ${states}`
  const { load } = await patternHarness('tabs-candidates.json', look)
  const { HozoTabs } = load('tabs.native.tsx')
  const tree = HozoTabs({
    className: 'p-4',
    tabClassName: `px-3 aria-selected:bg-blue-500 active:opacity-80 disabled:opacity-50 ${states}`,
    tabs: [
      { label: 'One', content: 'first' },
      { label: 'Two', content: 'second', disabled: true },
      { label: 'Three', content: 'third' },
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
  const [first, second, third] = found
  const at = (tab, pressed, extra = {}) =>
    flat(
      tab.props.style({ pressed, hovered: false, focused: false, focusVisible: false, ...extra }),
    )
  assert.equal(at(first, false).paddingStart, 12)
  assert.equal(at(first, false).backgroundColor, '#2b7fff', 'the selected tab')
  assert.equal(at(first, false).opacity, undefined)
  assert.equal(at(first, true).opacity, 0.8, 'pressed')
  assert.equal(at(second, false).backgroundColor, undefined, 'not selected')
  assert.equal(at(second, false).opacity, 0.5, 'disabled')
  // #897: the pattern's pressable reports more than `pressed`, so a pointer
  // over a tab and keyboard focus on one each have a look on Native too.
  assert.equal(at(third, false).backgroundColor, undefined, 'at rest')
  assert.equal(at(third, false, { hovered: true }).backgroundColor, '#fb2c36', 'hovered')
  assert.equal(at(third, false).borderTopWidth, undefined)
  assert.equal(at(third, false, { focused: true }).borderTopWidth, undefined, 'focused by a press')
  assert.equal(
    at(third, false, { focused: true, focusVisible: true }).borderTopWidth,
    2,
    'focused from the keyboard',
  )
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
  const modules = (name) => {
    if (name.startsWith('./')) return load(name.slice(2))
    const resolved = {
      react: {
        // The real ones: they build elements and touch no renderer state.
        Children,
        createElement,
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
      '@hozo/engine/generated/gap-styles': { hozoAuthoredStyle },
      // Use the real shared partition; this fixture only stands in for
      // hosts/hooks, not for the production style classification rules.
      '@hozo/engine': { hozoSplitTextStyle },
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
      // An app without a `<SafeAreaProvider>`: Menu's sheet adds no inset.
      '@hozo/engine/generated/safe-area': {
        useHozoProvidedSafeArea: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
      },
    }[name]
    assert.ok(resolved, `Native pattern fixture has no module binding for ${name}`)
    return resolved
  }
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
// #1054: `@hozo/ui`'s Listbox, compiled from its real source, rendered by the
// real Native pattern. A caller's `style` reaches it through the wrapper's
// `...rest`, and used to replace the compiled box instead of following it.
test("a UI wrapper keeps its compiled look when a caller's Native style comes through its spread", async () => {
  const { load, flat } = await patternHarness('ui-spread-candidates.json', 'p-1')
  const source = readFileSync(
    new URL('../../../packages/ui/src/listbox.tsx', import.meta.url),
    'utf8',
  )
  const native = compiler.compileNative(source).find((part) => part.jsx.includes('HozoListbox'))
  assert.ok(native.jsx.includes('{...hozoGapSpreadStyles('), native.jsx)
  const { HozoListbox } = load('listbox.native.tsx')
  const render = (rest) => {
    const element = evaluate(
      `const hozoStyles = ${native.styles};module.exports = (${native.jsx})`,
      {
        rest,
        className: undefined,
        // The module constant the compiled class residual still names.
        box: /const box =\s*'([^']+)'/.exec(source)[1],
        hozoClasses: () => undefined,
        hozoSpreadStyles,
        hozoGapSpreadStyles,
        HozoListbox,
      },
    )
    return element.type(element.props)
  }
  const options = [{ value: 'a', label: 'A' }]

  const bare = flat(render({ options }).props.style)
  assert.equal(bare.maxHeight, 240, 'without a caller style, the compiled bound')

  let reads = 0
  const rest = {
    options,
    get style() {
      reads += 1
      return { paddingTop: 19, marginTop: 7, gap: 16 }
    },
  }
  const styled = flat(render(rest).props.style)
  assert.equal(styled.maxHeight, 240, 'the compiled bound survives a caller style')
  assert.equal(styled.paddingTop, 19, "the caller's edge beats the compiled padding")
  assert.equal(styled.marginTop, 7, "and the caller's own property arrives")
  assert.equal(styled.rowGap, 16, 'the caller gap reaches both Native axes')
  assert.equal(styled.columnGap, 16)
  assert.equal(reads, 1, 'the spread is read once')
})

test("@hozo/patterns' Native controls apply their class props with each one's state", async () => {
  const look =
    'p-2 text-red-500 aria-expanded:bg-blue-500 aria-checked:bg-blue-500 aria-selected:bg-blue-500 active:opacity-80 disabled:opacity-50'
  const menuLook = `${look} aria-disabled:opacity-50 disabled:mt-8`
  const { load, pressables, at } = await patternHarness(
    'controls-candidates.json',
    `${look} ${menuLook}`,
  )

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
    itemClassName: menuLook,
    trigger: 'More',
    items: [{ label: 'Delete', disabled: true }],
  })
  const [trigger, item] = pressables(menu)
  assert.equal(at(trigger, true).box.opacity, 0.8, 'menu: pressed trigger')
  assert.equal(at(trigger, false).text.color, '#fb2c36', 'menu: trigger label')
  assert.equal(at(item, false).box.opacity, 0.5, 'menu: disabled item')
  assert.equal(at(item, false).box.marginTop, undefined, 'menu: aria-disabled is not form disabled')
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
