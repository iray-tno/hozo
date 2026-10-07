// Compiled and fallback semantic boxes share Native's View defaults, not
// HTML's layout defaults. Browser measurements catch the original #781
// mismatch AND the tempting but wrong fix of removing the compiled base.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileNative, createCompiler } from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'
import { build, stop } from 'esbuild'
import { chromium } from 'playwright-core'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const root = fileURLToPath(new URL('../', import.meta.url))
const file = path.join(root, 'src/semantic-layout-fixture.tsx')
const require = createRequire(file)
const repoRequire = createRequire(new URL('../../../package.json', import.meta.url))
const tailwind = repoRequire('tailwindcss')
const tailwindRoot = path.dirname(repoRequire.resolve('tailwindcss/package.json'))
const artifacts = path.join(root, 'artifacts/semantic-layout')
mkdirSync(artifacts, { recursive: true })
const output = mkdtempSync(path.join(artifacts, 'run-'))
const report = {
  passed: false,
  scope:
    'Chromium compiled/fallback layout with RN-shaped box defaults; not a Native device measurement',
  cases: [],
}
const save = () =>
  writeFileSync(path.join(output, 'evidence.json'), `${JSON.stringify(report, null, 2)}\n`)
save()
const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((candidate) => candidate && existsSync(candidate))
if (!executablePath) {
  if (process.env.CI) throw new Error('Semantic layout evidence requires Chrome in CI')
  console.log('[semantic-layout] no browser; set CHROME_PATH to run locally')
  process.exit(0)
}

const names = [
  'Main',
  'Header',
  'Footer',
  'Aside',
  'Search',
  'Section',
  'Article',
  'Nav',
  'Figure',
  'Figcaption',
  'Time',
  'Address',
  'Fieldset',
  'Legend',
  'Details',
  'Summary',
  'List',
  'ListItem',
  'TermList',
  'Term',
  'Description',
  'Skeleton',
]
const wrappers = {
  Figcaption: 'figure',
  Legend: 'fieldset',
  Summary: 'details',
  ListItem: 'ul',
  Term: 'dl',
  Description: 'dl',
}
const boxes = new Set([
  'Main',
  'Header',
  'Footer',
  'Aside',
  'Search',
  'Section',
  'Article',
  'Nav',
  'Figure',
  'Address',
  'Fieldset',
  'List',
  'ListItem',
  'TermList',
  'Description',
  'Skeleton',
])
function fixture(mode) {
  const props =
    mode === 'utility'
      ? 'className="flex flex-row gap-6 p-2"'
      : mode === 'flex-only'
        ? 'className="flex"'
        : mode === 'override'
          ? 'className="flex-row shrink static min-w-8 box-content m-2 p-2 border-2"'
          : mode === 'inline'
            ? 'style={{display:"flex", flexDirection:"row", flexShrink:0, position:"relative", minWidth:0, boxSizing:"border-box"}}'
            : ''
  const nodes = names
    .map((name) => {
      const node = `<${name} testID="${name}" ${name === 'Details' ? 'open' : ''} ${props}><span>A</span><span>B</span></${name}>`
      return wrappers[name] ? `<${wrappers[name]}>${node}</${wrappers[name]}>` : node
    })
    .join('\n')
  return `import {${names.join(',')}, View, List as OrderedList, ListItem as Item} from '@hozo/core'
export function Fixture({ordered}) { return <div>
  <View testID="view-base" />${nodes}
  <OrderedList ordered={ordered} testID="dynamic-list"><Item>first</Item><Item>second</Item></OrderedList>
</div> }`
}
async function load(code) {
  const result = await build({
    stdin: { contents: code, loader: 'tsx', resolveDir: path.dirname(file), sourcefile: file },
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    write: false,
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    require,
    module,
    module.exports,
  )
  return module.exports
}
async function css(preflight) {
  const imports = ['theme.css', ...(preflight ? ['preflight.css'] : []), 'utilities.css']
    .map(
      (name) =>
        `@import "${name}" layer(${name === 'theme.css' ? 'theme' : name === 'preflight.css' ? 'base' : 'utilities'});`,
    )
    .join('\n')
  const compiler = await tailwind.compile(
    `@layer theme, base, components, utilities;\n${imports}`,
    {
      base: tailwindRoot,
      loadStylesheet: async (id) => ({
        path: path.join(tailwindRoot, id),
        base: tailwindRoot,
        content: readFileSync(path.join(tailwindRoot, id), 'utf8'),
      }),
    },
  )
  return compiler.build([
    'flex',
    'flex-row',
    'gap-6',
    'p-2',
    'items-center',
    'shrink',
    'static',
    'min-w-8',
    'box-content',
    'm-2',
    'border-2',
  ])
}
let browser
try {
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-gpu'] })
  report.browser = browser.version()
  // This checks the Native lowering contract, not rendered Yoga geometry.
  // Bare and `flex` boxes leave the RN defaults in force; explicit row/shrink
  // must reach Native too, not just override the browser stylesheet.
  report.nativeLowering = []
  for (const name of boxes) {
    for (const classes of ['', 'flex', 'flex-row shrink']) {
      const [native] = compileNative(
        `import {${name}} from '@hozo/core'; const el = <${name} className="${classes}">x</${name}>`,
      )
      assert.ok(native)
      assert.match(native.jsx, /^<View[ >]/, `${name}: Native stays View-backed`)
      if (classes === 'flex-row shrink') {
        assert.match(native.styles, /flexDirection: 'row'/)
        assert.match(native.styles, /flexShrink: 1/)
      } else {
        assert.doesNotMatch(
          native.styles,
          /flexDirection:|flexShrink:/,
          'RN box defaults are not overwritten',
        )
      }
      report.nativeLowering.push({
        name,
        classes,
        jsx: native.jsx,
        styles: native.styles,
        passed: true,
      })
    }
  }
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } })
  for (const preflight of [false, true]) {
    const oracleCss = await css(preflight)
    for (const mode of ['bare', 'flex-only', 'utility', 'override', 'inline']) {
      const source = fixture(mode)
      const lowered = lowerModule(
        source,
        file,
        file,
        createCompiler({ colors: [], preflight }),
        root,
      )
      assert.ok(lowered, 'comparison must actually lower the fixture')
      writeFileSync(path.join(output, `${mode}-${preflight}-compiled.tsx`), lowered.code)
      const variants = { fallback: await load(source), compiled: await load(lowered.code) }
      for (const ordered of [false, true]) {
        const measures = {}
        for (const [kind, variant] of Object.entries(variants)) {
          const markup = renderToStaticMarkup(createElement(variant.Fixture, { ordered }))
          if (kind === 'fallback') {
            assert.equal(
              (markup.match(/data-href="hozo-view-base"/g) ?? []).length,
              1,
              'one SSR resource for every fallback box',
            )
          }
          await page.setContent(
            `<!doctype html><style>${oracleCss}\n${kind === 'compiled' ? lowered.css : ''}</style>${markup}`,
          )
          measures[kind] = await page.evaluate(() => {
            const properties = [
              'display',
              'flexDirection',
              'flexShrink',
              'position',
              'minWidth',
              'boxSizing',
              'marginTop',
              'marginRight',
              'marginBottom',
              'marginLeft',
              'paddingLeft',
              'gap',
              'listStyleType',
            ]
            return Object.fromEntries(
              [...document.querySelectorAll('[data-testid]')].map((node) => {
                const style = getComputedStyle(node),
                  rect = node.getBoundingClientRect()
                return [
                  node.dataset.testid,
                  {
                    tag: node.tagName,
                    styles: Object.fromEntries(properties.map((key) => [key, style[key]])),
                    rect: [rect.x, rect.y, rect.width, rect.height],
                    children: [...node.children].map((child) => {
                      const r = child.getBoundingClientRect()
                      return [r.x, r.y, r.width, r.height]
                    }),
                  },
                ]
              }),
            )
          })
          for (const name of ['view-base', ...boxes, 'dynamic-list']) {
            const box = measures[kind][name].styles
            const boxMode = name === 'view-base' || name === 'dynamic-list' ? 'bare' : mode
            assert.equal(box.display, 'flex', `${kind} ${mode} ${name}: a box stays flex`)
            assert.equal(
              box.flexDirection,
              ['utility', 'inline', 'override'].includes(boxMode) ? 'row' : 'column',
              `${kind} ${mode} ${name}: shared direction`,
            )
            assert.equal(
              box.flexShrink,
              boxMode === 'override' ? '1' : '0',
              `${kind} ${mode} ${name}: shared shrink`,
            )
            if (mode === 'override' && name !== 'view-base' && name !== 'dynamic-list') {
              assert.equal(box.position, 'static')
              assert.equal(box.minWidth, '32px')
              assert.equal(box.boxSizing, 'content-box')
              assert.equal(box.marginTop, '8px')
              assert.equal(box.paddingLeft, '8px')
            }
          }
          {
            const view = await page.locator('[data-testid="view-base"]').evaluate((node) => ({
              column: getComputedStyle(node).flexDirection,
              display: getComputedStyle(node).display,
              shrink: getComputedStyle(node).flexShrink,
            }))
            assert.deepEqual(
              view,
              { column: 'column', display: 'flex', shrink: '0' },
              'canonical View must keep its base',
            )
          }
        }
        // View is part of the comparison too, not an intentional exception.
        const evidence = {
          mode,
          preflight,
          ordered,
          nodes: names.length + 2,
          measures,
          passed: false,
        }
        report.cases.push(evidence)
        assert.deepEqual(
          measures.compiled,
          measures.fallback,
          `${mode}, preflight=${preflight}, ordered=${ordered}`,
        )
        evidence.passed = true
      }
    }
    // Isolate Nav as a flex item in the issue's narrow header, not merely
    // a block elsewhere on the page. Compare a stressed fixture, without
    // assuming that all authored spacing can fit on every device/font.
    for (const shrink of [false, true]) {
      const source = `import {Nav} from '@hozo/core'
      export function Fixture() { return <div style={{display:"flex",width:320,paddingInline:24,boxSizing:"border-box",justifyContent:"space-between"}}>
        <a href="/">Envarly</a><Nav className="flex flex-row items-center gap-6${shrink ? ' shrink' : ''}"><select style={{width:116}} aria-label="Language"><option>日本語</option></select><a href="/download" style={{fontSize:16,paddingInline:16}}>ダウンロード</a></Nav>
      </div> }`
      const lowered = lowerModule(
        source,
        file,
        file,
        createCompiler({ colors: [], preflight }),
        root,
      )
      assert.ok(lowered)
      const variants = { fallback: await load(source), compiled: await load(lowered.code) }
      const measures = {}
      for (const [kind, variant] of Object.entries(variants)) {
        await page.setContent(
          `<!doctype html><style>body {margin:0}${oracleCss}\n${kind === 'compiled' ? lowered.css : ''}</style>${renderToStaticMarkup(createElement(variant.Fixture))}`,
        )
        measures[kind] = await page.locator('nav').evaluate((node) => ({
          shrink: getComputedStyle(node).flexShrink,
          right: node.querySelector('a').getBoundingClientRect().right,
          width: node.getBoundingClientRect().width,
        }))
      }
      const evidence = { mode: 'narrow-header', preflight, shrink, measures, passed: false }
      report.cases.push(evidence)
      assert.deepEqual(measures.compiled, measures.fallback, `header: preflight=${preflight}`)
      assert.equal(measures.compiled.shrink, shrink ? '1' : '0')
      evidence.passed = true
      console.log(
        `[semantic-layout] preflight=${preflight}, shrink=${shrink}: 22 primitives, View and dynamic lists match; narrow Nav right=${measures.compiled.right}`,
      )
    }
  }
  assert.equal(report.cases.length, 24)

  // Uncompiled client rendering and hydration must not require a compiler
  // stylesheet, inject a rule per render, or flash a different box layout.
  const source = fixture('utility')
  const fallback = await load(source)
  const client = await build({
    stdin: {
      contents: `${source}
        import {createElement as h} from 'react'
        import {createRoot, hydrateRoot} from 'react-dom/client'
        const mount = document.getElementById('mount')
        const content = () => h(Fixture, {ordered:false})
        const root = window.__hydrate ? hydrateRoot(mount, content()) : createRoot(mount)
        if (!window.__hydrate) root.render(content())
        window.rerender = () => root.render(content())`,
      loader: 'tsx',
      resolveDir: path.dirname(file),
      sourcefile: file,
    },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    write: false,
  })
  report.client = []
  for (const hydration of [false, true]) {
    const errors = []
    const consoleError = (message) => {
      if (message.type() === 'error') errors.push(message.text())
    }
    page.on('console', consoleError)
    const html = renderToStaticMarkup(
      createElement(
        'html',
        null,
        createElement('head', null, createElement('style', null, await css(true))),
        createElement(
          'body',
          null,
          createElement(
            'div',
            { id: 'mount' },
            hydration ? createElement(fallback.Fixture, { ordered: false }) : null,
          ),
        ),
      ),
    )
    await page.setContent(`<!doctype html>${html}`)
    await page.evaluate((value) => {
      window.__hydrate = value
    }, hydration)
    await page.addScriptTag({ content: client.outputFiles[0].text })
    await page.waitForFunction(
      () =>
        typeof window.rerender === 'function' &&
        document.querySelector('[data-testid="Nav"]') &&
        getComputedStyle(document.querySelector('[data-testid="Nav"]')).display === 'flex',
    )
    await page.evaluate(() => window.rerender())
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
    const measurement = await page.locator('[data-testid="Nav"]').evaluate((node) => ({
      resources: document.querySelectorAll('style[data-href="hozo-view-base"]').length,
      direction: getComputedStyle(node).flexDirection,
      shrink: getComputedStyle(node).flexShrink,
    }))
    assert.deepEqual(measurement, { resources: 1, direction: 'row', shrink: '0' })
    assert.deepEqual(errors, [], 'client render/hydration must not report errors')
    page.off('console', consoleError)
    report.client.push({ hydration, measurement, passed: true })
  }

  // Negative controls: both the old fallback omission and the rejected
  // compiled-base removal must be visible to these measurements.
  report.mutations = []
  const before = await page
    .locator('[data-testid="Nav"]')
    .evaluate((node) => getComputedStyle(node).flexShrink)
  await page.locator('[data-testid="Nav"]').evaluate((node) => node.classList.remove('hozo-view'))
  const noClass = await page
    .locator('[data-testid="Nav"]')
    .evaluate((node) => getComputedStyle(node).flexShrink)
  assert.equal(before, '0')
  assert.equal(noClass, '1')
  report.mutations.push({ omission: 'base class', before, after: noClass, detected: true })
  await page.locator('[data-testid="Nav"]').evaluate((node) => node.classList.add('hozo-view'))
  await page.locator('style[data-href="hozo-view-base"]').evaluate((node) => node.remove())
  const noCss = await page
    .locator('[data-testid="Nav"]')
    .evaluate((node) => getComputedStyle(node).flexShrink)
  assert.equal(noCss, '1')
  report.mutations.push({ omission: 'base stylesheet', before, after: noCss, detected: true })
  report.passed = true
} catch (error) {
  report.error = error.stack ?? String(error)
  throw error
} finally {
  stop()
  save()
  await browser?.close()
}
