import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import { evidenceSource } from '../../../scripts/style-slots/evidence-source.mjs'
import { handleRoot } from '../../../scripts/style-slots/handle-publication.mjs'
import { prepareWebHandle } from '../../../scripts/style-slots/handle-web.mjs'
import {
  expectedTabRows,
  prepareTabsProbe,
  tabLabelClasses,
  tabPhases,
} from '../../../scripts/style-slots/tabs-probe.mjs'
import {
  buildViteOwnerPublication,
  viteOwnerSource,
} from '../../../scripts/style-slots/vite-owner-publication.mjs'

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI requires real Vite owner browser evidence')

async function appBundle(source) {
  return build({
    stdin: {
      contents: `${source}
import {useState as __fixtureState} from 'react';import {createRoot as __fixtureRoot} from 'react-dom/client';import {flushSync as __fixtureFlush} from 'react-dom';
function App({kind,interactive}){const [index,setIndex]=__fixtureState(0);const [author,setAuthor]=__fixtureState();window.author=value=>__fixtureFlush(()=>setAuthor(value));return <><OrdinaryControl/>{kind==='tabs'?<TabsFixture index={index} onIndexChange={setIndex} tabStyle={author} tabs={[{label:'A',content:'one'},{label:'B',content:'two'},{label:'C',content:'three',disabled:true}]}/>:<HandleFixture interactive={interactive} handleStyle={author}/>}</>}
window.mount=(kind,interactive)=>__fixtureFlush(()=>__fixtureRoot(document.querySelector('#root')).render(<App kind={kind} interactive={interactive}/>));`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    minify: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    metafile: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  })
}

test('source-observed Vite fixture bundles actual widgets without compiler tooling', async () => {
  const fixture = await buildViteOwnerPublication()
  assert.equal(
    fixture.owners.reduce((count, owner) => count + owner.findings.length, 0),
    3,
  )
  const app = await appBundle(fixture.code)
  assert.equal(app.outputFiles.length, 1)
  assert.ok(
    !Object.keys(app.metafile.inputs).some((file) =>
      /packages\/(compiler|tailwind|vite)\//.test(file.replaceAll('\\', '/')),
    ),
  )
})

test('fallback and ordinary Vite widget fixtures retain source-scanned classes without prepared namespaces', async () => {
  for (const route of ['fallback', 'ordinary']) {
    const fixture = await buildViteOwnerPublication(route)
    assert.deepEqual(fixture.owners, [])
    assert.equal(fixture.capture, undefined)
    assert.deepEqual(fixture.configuredPackages, ['owner-consumer'])
    assert.match(fixture.entrySha256, /^[a-f0-9]{64}$/)
    const app = await appBundle(fixture.code)
    assert.equal(app.outputFiles.length, 1)
    assert.ok(
      !Object.keys(app.metafile.inputs).some((file) =>
        /packages\/(compiler|tailwind|vite)\//.test(file.replaceAll('\\', '/')),
      ),
    )
  }
})

test('actual source-observed Vite Tabs and handle output matches independent Tailwind in a browser', {
  skip: !executablePath,
  timeout: 90_000,
}, async () => {
  await runOwnerBrowser(false)
})

test('ordinary owner fallback preserves actual widget behavior against ordinary Vite and Tailwind', {
  skip: !executablePath,
  timeout: 90_000,
}, async () => {
  await runOwnerBrowser(true)
})

async function runOwnerBrowser(fallback) {
  const evidence = {
    schema: 1,
    ...evidenceSource(),
    scope: fallback
      ? 'vite-ordinary-fallback-real-owner-browser'
      : 'vite-source-observed-real-owner-browser',
    passed: false,
    observations: [],
    controls: [],
    owners: [],
  }
  const destination = path.join(
    handleRoot,
    `artifacts/style-fact-model/${fallback ? 'vite-owner-fallback-browser' : 'vite-owner-browser'}.json`,
  )
  let browser
  try {
    const fixture = await buildViteOwnerPublication(fallback ? 'fallback' : 'captured')
    const ordinary = fallback ? await buildViteOwnerPublication('ordinary') : undefined
    evidence.owners = fixture.owners
    evidence.capture = fixture.capture
    evidence.modules = fixture.modules
    evidence.sourceSha256 = fixture.sourceSha256
    if (ordinary) {
      assert.equal(fixture.sourceSha256, ordinary.sourceSha256)
      assert.equal(fixture.entrySha256, ordinary.entrySha256)
      assert.deepEqual(fixture.configuredPackages, ordinary.configuredPackages)
      const describe = (built) => ({
        admission: built.admission ?? null,
        owners: built.owners,
        configuredPackages: built.configuredPackages,
        sourceSha256: built.sourceSha256,
        entrySha256: built.entrySha256,
        modules: built.modules,
        preparedNamespacesAbsent: !(
          /hozo-owner-[a-f0-9]{16}-r/.test(built.code) || /\.hozo-owner-/.test(built.css)
        ),
      })
      evidence.fallbackBuild = describe(fixture)
      evidence.ordinaryBuild = describe(ordinary)
    }
    const tabs = await prepareTabsProbe([], `${tabLabelClasses} p-1`)
    const handle = await prepareWebHandle()
    const compiled = await appBundle(fixture.code)
    const oracle = await appBundle(viteOwnerSource)
    const normal = ordinary ? await appBundle(ordinary.code) : undefined
    const routes = fallback ? ['fallback', 'ordinary', 'tailwind'] : ['vite', 'tailwind']
    browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-gpu'] })
    const errors = []
    for (const kind of ['tabs', 'decoration', 'resizable'])
      for (const route of routes) {
        const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
        page.on('pageerror', (error) => errors.push(error.message))
        try {
          const css =
            route === 'tailwind'
              ? `${tabs.oracleCss}\n${handle.oracleCss}`
              : route === 'ordinary'
                ? ordinary.css
                : fixture.css
          await page.setContent(
            `<style>@layer base{button{border:0 solid;box-sizing:border-box;font:16px/20px sans-serif}}.vite-panel{width:300px;height:400px}.vite-panel>:first-child{border:0;box-sizing:border-box}</style><style data-owner-css>${css}</style><div id="root"></div>`,
          )
          await page.addScriptTag({
            content: (route === 'tailwind' ? oracle : route === 'ordinary' ? normal : compiled)
              .outputFiles[0].text,
          })
          await page.evaluate(
            ({ kind }) => window.mount(kind === 'tabs' ? 'tabs' : 'handle', kind === 'resizable'),
            { kind },
          )
          assert.equal(
            await page
              .getByTestId('ordinary-control')
              .evaluate((node) => getComputedStyle(node).paddingTop),
            '4px',
          )
          const target =
            kind === 'tabs' ? page.getByRole('tab') : page.locator('.vite-panel>:first-child')
          await target.first().waitFor()
          await target.first().evaluate((node) => {
            window.actualOwner = node
          })
          const record = async (phase) => {
            const rows = await target.evaluateAll((nodes) =>
              nodes.map((node) => {
                const style = getComputedStyle(node)
                return {
                  padding: Number.parseFloat(style.paddingTop),
                  opacity: Number(style.opacity),
                  background: style.backgroundColor,
                  selected: node.getAttribute('aria-selected'),
                  disabled: node.disabled ?? false,
                  rowGap: style.rowGap,
                  columnGap: style.columnGap,
                }
              }),
            )
            evidence.observations.push({ kind, route, phase, rows })
            return rows
          }
          if (kind === 'tabs') {
            const rows = await record('initial')
            assert.deepEqual(
              rows.map((row) => ({
                padding: row.padding,
                opacity: row.opacity,
                selected: row.selected,
                disabled: row.disabled,
              })),
              expectedTabRows(tabPhases[0]).map((row) => ({
                padding: row.padding,
                opacity: row.opacity,
                selected: String(row.selected),
                disabled: row.disabled,
              })),
            )
            await target.nth(1).click()
            await page.waitForFunction(
              () =>
                document.querySelectorAll('[role=tab]')[1].getAttribute('aria-selected') === 'true',
            )
            await record('selected')
            await page.evaluate(() =>
              window.author({ rowGap: 5, columnGap: 7, backgroundColor: '#abcdef', opacity: 0.8 }),
            )
            const author = await record('author')
            for (const row of author) {
              assert.equal(row.rowGap, '5px')
              assert.equal(row.columnGap, '7px')
              assert.equal(row.opacity, 0.8)
              assert.equal(row.background, 'rgb(171, 205, 239)')
            }
            await page.evaluate(() => window.author(undefined))
            const removed = await record('removed')
            for (const row of removed) {
              assert.equal(row.rowGap, '3px')
              assert.equal(row.columnGap, '2px')
            }
            assert.equal(removed[2].disabled, true)
            await target.nth(2).evaluate((node) => node.click())
            assert.equal(await target.nth(1).getAttribute('aria-selected'), 'true')
          } else {
            await page.mouse.move(800, 650)
            await page.getByRole('button', { name: 'Content', exact: true }).focus()
            const rest = await record('rest')
            assert.equal(rest[0].padding, 16)
            assert.equal(rest[0].opacity, 1)
            assert.equal(
              await target.evaluate((node) => node.tagName),
              kind === 'resizable' ? 'BUTTON' : 'DIV',
            )
            if (kind === 'resizable') {
              await target.hover()
              assert.equal((await record('hover'))[0].opacity, 0.5)
              await target.focus()
              assert.equal((await record('focus'))[0].padding, 12)
            }
            await page.evaluate(() =>
              window.author({ paddingTop: 20, opacity: 0.8, backgroundColor: '#abcdef' }),
            )
            const author = await record('author')
            assert.equal(author[0].padding, 20)
            assert.equal(author[0].opacity, 0.8)
            await page.mouse.move(800, 650)
            await page.getByRole('button', { name: 'Content', exact: true }).focus()
            await page.evaluate(() => window.author(undefined))
            assert.deepEqual(await record('removed'), rest)
          }
          assert.equal(await target.first().evaluate((node) => node === window.actualOwner), true)
          const before = await record('before-sheet-removal')
          await page.locator('style[data-owner-css]').evaluate((node) => node.remove())
          assert.notDeepEqual(await record('sheet-removed'), before)
          evidence.controls.push({ kind, route, sameOwner: true, absentStylesheetDetected: true })
        } finally {
          await page.close()
        }
      }
    for (const kind of ['tabs', 'decoration', 'resizable'])
      for (const route of routes.filter((route) => route !== 'tailwind'))
        assert.deepEqual(
          evidence.observations
            .filter(
              (row) => row.kind === kind && row.route === route && row.phase !== 'sheet-removed',
            )
            .map(({ route, ...row }) => row),
          evidence.observations
            .filter(
              (row) =>
                row.kind === kind && row.route === 'tailwind' && row.phase !== 'sheet-removed',
            )
            .map(({ route, ...row }) => row),
        )
    assert.deepEqual(errors, [])
    assert.equal(evidence.controls.length, routes.length * 3)
    assert.equal(evidence.observations.length, routes.length * 18)
    evidence.passed = true
  } catch (error) {
    evidence.error = String(error)
    throw error
  } finally {
    await browser?.close()
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, `${JSON.stringify(evidence, null, 2)}\n`)
  }
}
