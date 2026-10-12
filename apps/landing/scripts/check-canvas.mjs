// The /canvas/ demo, in a real browser: drawn by @hozo/canvas, reachable by
// pointer and keyboard, and read from a table built from the same rows.
//
// The page this replaced drew with the raw Canvas 2D API under an
// "@hozo/canvas" label, and its "sibling table" listed eight candlesticks
// whatever the canvas showed. Each claim the page makes now is asserted here,
// so it cannot drift back into decoration.

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  process.argv[2] ?? 'dist',
)
const executablePath = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((candidate) => candidate && existsSync(candidate))
if (!executablePath) {
  if (process.env.CI) throw new Error('Canvas: browser required in CI')
  console.log('Canvas: no browser found; skipped')
  process.exit(0)
}
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
}
const server = createServer((req, res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(
    /^\/hozo\/?/,
    '',
  )
  let file = path.resolve(dist, relative || 'index.html')
  if (existsSync(file) && !path.extname(file)) file = path.join(file, 'index.html')
  if (!file.startsWith(`${dist}${path.sep}`) || !existsSync(file)) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/hozo/canvas/`

let browser
try {
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  for (const width of [320, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/*', (route) =>
      route
        .request()
        .url()
        .startsWith(url.slice(0, url.indexOf('/hozo/')))
        ? route.continue()
        : route.abort(),
    )
    await page.goto(url)
    const canvas = page.locator('canvas')
    await canvas.scrollIntoViewIfNeeded()
    // Hydrated and drawn: the surface has pixels that are not the background.
    await page.waitForFunction(() => {
      const surface = document.querySelector('canvas')
      if (!surface || surface.width < 2) return false
      const data = surface.getContext('2d').getImageData(0, 0, surface.width, surface.height).data
      for (let i = 0; i < data.length; i += 4) if (data[i] > 60 || data[i + 1] > 60) return true
      return false
    })
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `/canvas/ overflows at ${width}px`,
    )

    // The fallback is in the page for assistive technology: a captioned table
    // with a row for every day the chart draws, and the pixels hidden.
    const fallback = page.locator('[data-hozo-canvas-fallback] table')
    assert.equal(await fallback.count(), 1)
    assert.match(await fallback.locator('caption').innerText(), /^Daily price, Sep 1 to Sep 26/)
    assert.equal(await fallback.locator('tbody tr').count(), 20)
    assert.equal(await fallback.locator('tbody th[scope="row"]').count(), 20)
    assert.equal(await canvas.getAttribute('aria-hidden'), 'true')

    // Every candle is a named control in drawing order, one per day even
    // though each is two shapes.
    const controls = page.locator('[data-hozo-canvas-controls] button')
    assert.equal(await controls.count(), 20)
    assert.match(await controls.first().innerText(), /^Sep 1: opened \$\d+, closed \$\d+/)

    // Keyboard: focusing a day's control indicates it, so the tooltip shows.
    // The tooltip, that is: the fallback table and the controls say "Sep 4" too.
    const tooltipShows = (pattern) =>
      page.waitForFunction(
        (source) =>
          [...document.querySelectorAll('span')].some(
            (span) =>
              new RegExp(source).test(span.textContent ?? '') && !span.closest('table, button'),
          ),
        pattern.source,
      )
    await controls.nth(3).focus()
    await tooltipShows(/^Sep 4$/)
    await controls.nth(3).blur()

    // Pointer: hovering the chart indicates whatever candle is under it.
    if (width === 1280) {
      const box = await canvas.boundingBox()
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4)
      await tooltipShows(/^Sep \d+$/)
      await page.mouse.move(0, 0)
    }

    // The visible copy is the same table, and stays out of the tree.
    await page.getByRole('button', { name: 'Show the screen-reader table', exact: true }).click()
    const visible = page.locator('[aria-hidden] table')
    await visible.waitFor()
    assert.equal(await visible.locator('tbody tr').count(), 20)
    assert.equal(
      await visible.locator('tbody tr').first().innerText(),
      await fallback.locator('tbody tr').first().innerText(),
    )

    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log(
    'Canvas: drawn by @hozo/canvas, fallback table of 20 days, 20 keyboard controls, tooltip by focus and pointer, no overflow at 320/1280px',
  )
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
