import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import { evidenceSource } from '../../../scripts/style-slots/evidence-source.mjs'
import {
  expectedTabRows,
  prepareTabsProbe,
  tabPhases,
  tabsProbeRoot,
} from '../../../scripts/style-slots/tabs-probe.mjs'

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI requires real Tabs browser evidence')

async function appBundle(classes) {
  return build({
    stdin: {
      contents: `import {useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {Tabs} from '@hozo/patterns';
window.changes=[];
function App(){const [index,setIndex]=useState(0);window.select=at=>flushSync(()=>setIndex(at));return <Tabs index={index} onIndexChange={at=>{changes.push(at);setIndex(at)}} tabClassName={${JSON.stringify(classes)}} tabs={[{label:'A',content:'one'},{label:'B',content:'two'},{label:'C',content:'three',disabled:true}]}/>}
flushSync(()=>createRoot(document.querySelector('#root')).render(<App/>));`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    metafile: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
}

test('Tabs evidence prepares independent CSS and bundles the actual Web owner', async () => {
  const fixture = await prepareTabsProbe()
  assert.ok(fixture.candidateCss.length && fixture.oracleCss.length && fixture.native.length)
  assert.ok(fixture.fingerprint)
  const bundle = await appBundle(fixture.classes)
  assert.ok(
    Object.keys(bundle.metafile.inputs).some((file) => file.endsWith('patterns/dist/tabs.js')),
  )
  assert.equal(bundle.outputFiles.length, 1)
})

test('real Web tabs isolate selection/disabled and real pointer/focus styling per repeated owner', {
  skip: !executablePath,
  timeout: 60_000,
}, async () => {
  const evidence = {
    schema: 1,
    ...evidenceSource(),
    passed: false,
    scope: 'web-tabs-real-pointer-focus',
    fingerprint: '',
    observations: [],
    controls: [],
  }
  const destination = path.join(tabsProbeRoot, 'artifacts/style-fact-model/tabs-browser.json')
  let browser
  try {
    const fixture = await prepareTabsProbe()
    evidence.fingerprint = fixture.fingerprint
    const bundle = await appBundle(fixture.classes)
    browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-gpu'] })
    const errors = []
    for (const [kind, css] of [
      ['candidate', fixture.candidateCss],
      ['tailwind', fixture.oracleCss],
    ]) {
      const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
      page.on('pageerror', (error) => errors.push(error.message))
      try {
        // Match preflight's layer as well as its solid-border baseline. An
        // unlayered border reset would outrank the candidate utilities' layer.
        // Keep width 3 as the expectation, rather than accepting zero.
        // Used width/height are not authored auto values.
        // Labels A/B/C have natural dimensions strictly below the test's 96/80.
        await page.setContent(
          `<style>@layer base{button{border:0 solid;box-sizing:border-box;font:16px/20px sans-serif}}</style><style>${css}</style><div id="root"></div>`,
        )
        await page.addScriptTag({ content: bundle.outputFiles[0].text })
        const tabs = page.getByRole('tab')
        assert.equal(await tabs.count(), 3)
        await page.evaluate(() => {
          window.originalTabs = [...document.querySelectorAll('[role=tab]')]
        })
        const record = async (phase) => {
          const selected = await tabs.evaluateAll((nodes) =>
            nodes.map((node, at) => {
              if (node !== window.originalTabs[at]) throw new Error('Tab owner identity changed')
              const style = getComputedStyle(node)
              const rgb = style.backgroundColor.match(/\d+/g).slice(0, 3)
              return {
                selected: node.getAttribute('aria-selected') === 'true',
                disabled: node.disabled,
                padding: Number.parseFloat(style.paddingTop),
                background: `#${rgb.map((value) => Number(value).toString(16).padStart(2, '0')).join('')}`,
                opacity: Number(style.opacity),
                border: Number.parseFloat(style.borderTopWidth),
                radius: Number.parseFloat(style.borderTopLeftRadius),
                width: style.width === '96px' ? 96 : null,
                height: style.height === '80px' ? 80 : null,
              }
            }),
          )
          evidence.observations.push({ kind, phase, selected })
          assert.deepEqual(selected, expectedTabRows(phase))
        }
        await page.mouse.move(800, 650)
        await record(tabPhases[0])
        await tabs.nth(1).hover()
        await record(tabPhases[1])
        await tabs.nth(1).focus()
        await record(tabPhases[2])
        await page.mouse.down()
        await record(tabPhases[3])
        await page.mouse.up()
        await page.waitForFunction(
          () => document.querySelectorAll('[role=tab]')[1].getAttribute('aria-selected') === 'true',
        )
        await record(tabPhases[4])
        assert.deepEqual(await page.evaluate(() => window.changes), [1])
        await page.evaluate(() => window.select(2))
        await record(tabPhases[5])
        await tabs.nth(2).evaluate((node) => {
          node.focus()
          node.click()
        })
        assert.equal(await tabs.nth(1).evaluate((node) => node === document.activeElement), true)
        assert.deepEqual(await page.evaluate(() => window.changes), [1])
        // Without actual unavailable hooks, ARIA alone must not certify the
        // disabled: contribution. Keep aria-disabled to distinguish the two.
        await tabs.nth(2).evaluate((node) => {
          node.disabled = false
          node.removeAttribute('data-hozo-disabled')
        })
        assert.equal(await tabs.nth(2).evaluate((node) => getComputedStyle(node).opacity), '1')
        evidence.controls.push({
          kind,
          blockedDisabledFocusAndClick: true,
          absentDisabledHooksDetected: true,
        })
      } finally {
        await page.close()
      }
    }
    assert.deepEqual(errors, [])
    assert.equal(evidence.observations.length, 12)
    assert.equal(evidence.controls.length, 2)
    assert.deepEqual(
      evidence.observations
        .filter((row) => row.kind === 'candidate')
        .map(({ phase, selected }) => ({ phase, selected })),
      evidence.observations
        .filter((row) => row.kind === 'tailwind')
        .map(({ phase, selected }) => ({ phase, selected })),
    )
    evidence.passed = true
  } catch (error) {
    evidence.error = String(error)
    throw error
  } finally {
    await browser?.close()
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, `${JSON.stringify(evidence, null, 2)}\n`)
  }
})
