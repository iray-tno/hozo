// #2255, #2256, #2257: three overlay behaviours Envarly met on 0.5.0. Asked
// of a real browser, because each is a sequence of real events -- pointerdown
// before click, focus moving on Tab, a hover that opened something -- that
// static markup cannot show.
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
if (process.env.CI) assert.ok(executablePath, 'CI requires Popover and Tooltip browser coverage')

let browser
let script
before(async () => {
  if (!executablePath) return
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {Popover} from './packages/patterns/src/popover.tsx';
      import {Tooltip} from './packages/patterns/src/tooltip.tsx';
      const h = React.createElement;
      const fixture = createRoot(document.querySelector('#root'));
      window.render = ({tooltipDisabled = false} = {}) => fixture.render(h(React.Fragment, null,
        h(Popover, {trigger: 'Options', accessibilityLabel: 'Options'},
          h('button', {id: 'first'}, 'First'), h('button', {id: 'last'}, 'Last')),
        h('button', {id: 'after'}, 'After'),
        h(Tooltip, {content: 'Hint', disabled: tooltipDisabled, openDelay: 0, closeDelay: 0},
          h('button', {id: 'tip'}, 'Tip'))));`,
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
  await page.setContent('<!doctype html><div id="root"></div>')
  await page.addScriptTag({ content: script })
  await page.evaluate(() => window.render())
  await page.waitForSelector('[aria-haspopup="dialog"]')
  assert.deepEqual(errors, [])
  return page
}

const trigger = '[aria-haspopup="dialog"]'

const popover = (page) =>
  page.evaluate(() => {
    const panel = document.querySelector('[role="dialog"]')
    return {
      expanded: document.querySelector('[aria-haspopup="dialog"]').getAttribute('aria-expanded'),
      panel: panel?.getAttribute('data-state') ?? null,
      focus: document.activeElement?.id || document.activeElement?.getAttribute('aria-haspopup'),
    }
  })

test('a press on the trigger of an open popover closes it (#2255)', {
  skip: !executablePath,
}, async () => {
  const page = await open()
  try {
    await page.click(trigger)
    await page.waitForFunction(() => document.activeElement?.id === 'first')
    assert.equal((await popover(page)).expanded, 'true')
    // pointerdown, then click: the press that used to close and reopen it.
    await page.click(trigger)
    await page.waitForTimeout(50)
    const closed = await popover(page)
    assert.equal(closed.expanded, 'false', 'the trigger reopened the panel it had just closed')
    assert.notEqual(closed.panel, 'open')
    // And it still opens, so the press was not simply swallowed.
    await page.click(trigger)
    await page.waitForFunction(() => document.activeElement?.id === 'first')
    assert.equal((await popover(page)).expanded, 'true')
  } finally {
    await page.close()
  }
})

test('Tab out of a non-modal popover moves on, and Escape still returns to the trigger (#2257)', {
  skip: !executablePath,
}, async () => {
  const page = await open()
  try {
    await page.focus(trigger)
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.activeElement?.id === 'first')
    await page.keyboard.press('Tab')
    assert.equal((await popover(page)).focus, 'last')
    await page.keyboard.press('Tab')
    await page.waitForTimeout(50)
    const left = await popover(page)
    assert.equal(left.expanded, 'false', 'focus left the panel and it stayed open')
    assert.equal(left.focus, 'after', 'focus did not go on to the next control')

    // Escape leaves focus in the panel, so the restore is still wanted there.
    await page.focus(trigger)
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.activeElement?.id === 'first')
    await page.keyboard.press('Escape')
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('aria-haspopup') === 'dialog',
      null,
      { timeout: 1000 },
    )
    assert.equal((await popover(page)).expanded, 'false')
  } finally {
    await page.close()
  }
})

test('disabling an open tooltip closes it, and enabling it again does not reopen it (#2256)', {
  skip: !executablePath,
}, async () => {
  const page = await open()
  const shown = () => page.evaluate(() => document.querySelector('[role="tooltip"]') !== null)
  try {
    await page.hover('#tip')
    await page.waitForSelector('[role="tooltip"]', { timeout: 1000 })
    await page.evaluate(() => window.render({ tooltipDisabled: true }))
    await page.waitForFunction(() => document.querySelector('[role="tooltip"]') === null, null, {
      timeout: 1000,
    })
    assert.equal(
      await page.evaluate(() => document.querySelector('#tip').getAttribute('aria-describedby')),
      null,
      'a closed tooltip still describes its trigger',
    )
    await page.evaluate(() => window.render({ tooltipDisabled: false }))
    await page.waitForTimeout(100)
    assert.equal(await shown(), false, 'enabling it brought the old tooltip back')
  } finally {
    await page.close()
  }
})
