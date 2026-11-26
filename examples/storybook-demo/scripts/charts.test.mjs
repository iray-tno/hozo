// RFC 015's interaction, in a real browser: keys, the pointer and what the
// live region says are sequences of real events that the charts package's
// server-rendered tests cannot show.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(import.meta.url)
const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI requires chart browser coverage')

let browser
let script
before(async () => {
  if (!executablePath) return
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {BarChart} from './packages/charts/src/index.tsx';
      const h = React.createElement;
      createRoot(document.querySelector('#root')).render(h('div', {style: {width: 480}},
        h('button', {id: 'before'}, 'Before'),
        h(BarChart, {
          accessibilityLabel: 'Revenue',
          data: [{m: 'Jan', a: 120, b: 80}, {m: 'Feb', a: 200, b: null}, {m: 'Mar', a: 90, b: 60}],
          x: {key: 'm'},
          y: {format: (v) => '$' + v},
          series: [{key: 'a', label: 'Online'}, {key: 'b', label: 'In store'}],
          height: 240,
        }),
        h('button', {id: 'after'}, 'After')));`,
      resolveDir: root,
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    alias: {
      react: path.dirname(require.resolve('react/package.json')),
      'react-dom': path.dirname(require.resolve('react-dom/package.json')),
    },
  })
  script = bundle.outputFiles[0].text
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
})
after(async () => {
  await browser?.close()
})

async function open() {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setContent('<!doctype html><body style="margin:0"><div id="root"></div></body>')
  await page.addScriptTag({ content: script })
  // The box measures before it draws, so the drawing arriving is the signal.
  await page.waitForSelector('svg rect')
  assert.deepEqual(errors, [])
  return page
}

const chart = '[aria-roledescription="chart"]'
const announced = (page) =>
  page.evaluate(() => document.querySelector('[aria-live="polite"]')?.textContent ?? '')
const tooltip = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('svg text')]
      .map((node) => node.textContent)
      .filter((text) => text.includes(': ')),
  )

test('the chart is one tab stop, and the arrow keys read every series there', {
  skip: !executablePath,
}, async () => {
  const page = await open()
  try {
    await page.focus('#before')
    await page.keyboard.press('Tab')
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
      'Revenue',
    )
    assert.equal(await announced(page), '', 'focus alone announces nothing yet')
    await page.keyboard.press('ArrowRight')
    assert.equal(await announced(page), 'Jan. Online: $120. In store: $80.')
    await page.keyboard.press('ArrowRight')
    assert.equal(await announced(page), 'Feb. Online: $200. In store: No value.')
    assert.deepEqual(await tooltip(page), ['Online: $200', 'In store: No value'])
    await page.keyboard.press('End')
    assert.match(await announced(page), /^Mar\./)
    await page.keyboard.press('Home')
    assert.match(await announced(page), /^Jan\./)
    // Arrow keys stay in the chart; Tab leaves it, and the tooltip goes.
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'after')
    assert.deepEqual(await tooltip(page), [])
  } finally {
    await page.close()
  }
})

test('the pointer moves the same datum, nearest in x, and leaving clears it', {
  skip: !executablePath,
}, async () => {
  const page = await open()
  try {
    const box = await page.locator(chart).boundingBox()
    assert.ok(box)
    await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2)
    assert.match(await announced(page), /^Mar\./)
    assert.deepEqual(await tooltip(page), ['Online: $90', 'In store: $60'])
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    assert.match(await announced(page), /^Feb\./)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height + 200)
    assert.deepEqual(await tooltip(page), [])
  } finally {
    await page.close()
  }
})
