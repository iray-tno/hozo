// #1715. A Dialog closing is the end of its exit, not the moment `open` turns
// false: `close()` takes the element out of the top layer and the UA hides it,
// so an exit has to run first. Asked of a real browser, because the top layer,
// `[open]` and transitionend are the browser's.
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
if (process.env.CI) assert.ok(executablePath, 'CI requires Dialog browser coverage')

let browser
let script
before(async () => {
  if (!executablePath) return
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {Dialog} from './packages/patterns/src/dialog.tsx';
      const fixture = createRoot(document.querySelector('#root'));
      window.render = (props) => fixture.render(props === null ? null : React.createElement(Dialog, {accessibilityLabel: 'Rename', ...props}, React.createElement('button', null, 'Inside')));`,
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

const EXIT = `dialog[data-state=closed]{opacity:0;transition:opacity 300ms}`

async function page(css = '') {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setContent(
    `<!doctype html><style>${css}</style><button id="opener">Open</button><div id="root"></div>`,
  )
  await page.addScriptTag({ content: script })
  await page.focus('#opener')
  await page.evaluate(() => window.render({ open: true }))
  await page.waitForFunction(() => document.querySelector('dialog')?.open === true)
  assert.deepEqual(errors, [])
  return page
}

const state = (page) =>
  page.evaluate(() => {
    const dialog = document.querySelector('dialog')
    return {
      present: dialog !== null,
      open: dialog?.open ?? false,
      state: dialog?.getAttribute('data-state') ?? null,
      focus: document.activeElement?.id || document.activeElement?.tagName,
    }
  })

test('an exit in the stylesheet runs with the dialog still shown, then it closes', {
  skip: !executablePath,
}, async () => {
  const p = await page(EXIT)
  try {
    assert.equal((await state(p)).state, 'open')
    await p.evaluate(() => window.render({ open: false }))
    await p.waitForTimeout(100)
    const leaving = await state(p)
    assert.equal(leaving.state, 'closed')
    assert.equal(leaving.open, true, 'closed before its exit ran')
    await p.waitForFunction(() => document.querySelector('dialog')?.open === false, null, {
      timeout: 2000,
    })
    assert.equal((await state(p)).focus, 'opener', 'focus was not restored after the exit')
  } finally {
    await p.close()
  }
})

test('with no exit, it closes at once and restores focus', { skip: !executablePath }, async () => {
  const p = await page()
  try {
    await p.evaluate(() => window.render({ open: false }))
    await p.waitForFunction(() => document.querySelector('dialog')?.open === false, null, {
      timeout: 500,
    })
    const closed = await state(p)
    assert.equal(closed.state, 'closed')
    assert.equal(closed.focus, 'opener')
  } finally {
    await p.close()
  }
})

test('opened again during its exit, it stays open', { skip: !executablePath }, async () => {
  const p = await page(EXIT)
  try {
    await p.evaluate(() => window.render({ open: false }))
    await p.waitForTimeout(100)
    await p.evaluate(() => window.render({ open: true }))
    await p.waitForTimeout(500)
    const again = await state(p)
    assert.equal(again.open, true)
    assert.equal(again.state, 'open')
  } finally {
    await p.close()
  }
})

test('unmounted while open, it gives focus back', { skip: !executablePath }, async () => {
  const p = await page()
  try {
    await p.evaluate(() => window.render(null))
    await p.waitForFunction(() => document.querySelector('dialog') === null)
    const gone = await state(p)
    assert.equal(gone.present, false)
    assert.equal(gone.focus, 'opener')
  } finally {
    await p.close()
  }
})

// #1715: a press on ::backdrop arrives as a click on the <dialog> itself.
test('closeOnBackdropPress closes on a backdrop press, and only on one', {
  skip: !executablePath,
}, async () => {
  const PANEL = `dialog{width:200px;height:120px;padding:24px;margin:auto}`
  for (const closeOnBackdropPress of [false, true]) {
    const p = await browser.newPage()
    try {
      await p.setContent(
        `<!doctype html><style>${PANEL}</style><button id="opener">Open</button><div id="root"></div>`,
      )
      await p.addScriptTag({ content: script })
      await p.evaluate((closeOnBackdropPress) => {
        window.dismissed = 0
        window.render({ open: true, closeOnBackdropPress, onClose: () => window.dismissed++ })
      }, closeOnBackdropPress)
      await p.waitForFunction(() => document.querySelector('dialog')?.open === true)
      const box = await p.locator('dialog').boundingBox()
      const closed = () => p.evaluate(() => window.dismissed)
      // The panel's own padding is the <dialog> too, and is not the backdrop.
      await p.mouse.click(box.x + 4, box.y + 4)
      assert.equal(await closed(), 0, 'a press on the panel padding closed it')
      // A press that starts in the panel and ends outside is a text selection.
      await p.mouse.move(box.x + 10, box.y + 10)
      await p.mouse.down()
      await p.mouse.move(5, 5)
      await p.mouse.up()
      assert.equal(await closed(), 0, 'a drag out of the panel closed it')
      await p.mouse.click(5, 5)
      assert.equal(await closed(), closeOnBackdropPress ? 1 : 0)
    } finally {
      await p.close()
    }
  }
})
