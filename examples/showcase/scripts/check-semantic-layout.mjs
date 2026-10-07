// A compiled semantic tag must retain the same browser layout as the
// published component. Comparing CSS text cannot catch a default supplied
// only by hozo-view (#781), or a list marker lost to display:flex.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCompiler } from '@hozo/compiler'
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
  scope: 'Chromium compiled/fallback Web layout; not Native parity',
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
function fixture(mode) {
  const props =
    mode === 'utility'
      ? 'className="flex flex-row gap-6 p-2"'
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
    .map((name) => `@import "${name}";`)
    .join('\n')
  const compiler = await tailwind.compile(imports, {
    base: tailwindRoot,
    loadStylesheet: async (id) => ({
      path: path.join(tailwindRoot, id),
      base: tailwindRoot,
      content: readFileSync(path.join(tailwindRoot, id), 'utf8'),
    }),
  })
  return compiler.build(['flex', 'flex-row', 'gap-6', 'p-2', 'items-center'])
}
let browser
try {
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-gpu'] })
  report.browser = browser.version()
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } })
  for (const preflight of [false, true]) {
    const oracleCss = await css(preflight)
    for (const mode of ['bare', 'utility', 'inline']) {
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
              [...document.querySelectorAll('[data-testid]')]
                .filter((node) => node.dataset.testid !== 'view-base')
                .map((node) => {
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
          if (kind === 'compiled') {
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
        // The control View differs intentionally. It has no children and is
        // zero-height here, so it cannot hide a semantic geometry difference.
        const evidence = {
          mode,
          preflight,
          ordered,
          nodes: names.length + 1,
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
    const source = `import {Nav} from '@hozo/core'
      export function Fixture() { return <div style={{display:"flex",width:320,paddingInline:24,boxSizing:"border-box",justifyContent:"space-between"}}>
        <a href="/">Envarly</a><Nav className="flex flex-row items-center gap-6"><select style={{width:116}} aria-label="Language"><option>日本語</option></select><a href="/download" style={{fontSize:16,paddingInline:16}}>ダウンロード</a></Nav>
      </div> }`
    const lowered = lowerModule(source, file, file, createCompiler({ colors: [], preflight }), root)
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
    const evidence = { mode: 'narrow-header', preflight, measures, passed: false }
    report.cases.push(evidence)
    assert.deepEqual(measures.compiled, measures.fallback, `header: preflight=${preflight}`)
    assert.equal(measures.compiled.shrink, '1')
    evidence.passed = true
    console.log(
      `[semantic-layout] preflight=${preflight}: 22 primitives and dynamic lists match; narrow Nav right=${measures.compiled.right}`,
    )
  }
  assert.equal(report.cases.length, 14)
  report.passed = true
} catch (error) {
  report.error = error.stack ?? String(error)
  throw error
} finally {
  stop()
  save()
  await browser?.close()
}
