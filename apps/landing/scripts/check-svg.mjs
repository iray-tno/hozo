// The /svg/ page, in a real browser: drawn with @hozo/svg, named, driven by
// Hozo controls, and reporting the filter coverage the snapshot measures.
//
// The page this replaced drew raw <svg> under an "@hozo/svg" label, showed
// hand-typed "lowered" output as if the compiler had produced it, and called
// a 10 / 26 filter coverage "100%". Each claim the page makes now is asserted.

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
  if (process.env.CI) throw new Error('Svg: browser required in CI')
  console.log('Svg: no browser found; skipped')
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
const url = `http://127.0.0.1:${server.address().port}/hozo/svg/`

const snapshot = JSON.parse(
  readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../packages/tailwind-conformance/snapshot.json',
    ),
    'utf8',
  ),
)

let browser
try {
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  for (const width of [320, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(url)
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `/svg/ overflows at ${width}px`,
    )

    // The studio's drawing is named, and the shape radio renames it. A group
    // rather than an image: its shapes are conditional, which the compiler
    // cannot see into, and `img` would make whatever is inside presentational.
    const drawing = page.getByRole('group', { name: 'A check mark in a ring', exact: true })
    await drawing.waitFor()
    // SSR makes the drawing visible before client:visible has bound its controls.
    await drawing.scrollIntoViewIfNeeded()
    await page.waitForFunction(
      () =>
        document
          .querySelector('astro-island[component-export="FilterStudio"]')
          ?.hasAttribute('ssr') === false,
    )
    assert.equal(await drawing.evaluate((node) => node.tagName.toLowerCase()), 'svg')
    await page.getByRole('radio', { name: 'Stamp', exact: true }).click()
    await page
      .getByRole('group', { name: 'A square seal with the character 組', exact: true })
      .waitFor()

    // A slider drives the real filter primitive, and the source shown follows.
    const shadow = page.locator('svg[role="group"] feDropShadow')
    assert.equal(await shadow.getAttribute('stdDeviation'), '6')
    const slider = page.getByRole('slider', { name: 'stdDeviation' }).first()
    await slider.focus()
    await slider.press('End')
    assert.equal(await shadow.getAttribute('stdDeviation'), '20')
    const source = page.getByRole('figure', { name: 'SVG filter source', exact: true })
    const sourceText = async () =>
      (await source.locator('pre code > span').allTextContents()).join('\n')
    assert.match(await sourceText(), /stdDeviation=\{20\}/)
    assert.match(await sourceText(), /the stamp/)
    await page.getByRole('radio', { name: 'Bengara', exact: true }).click()
    assert.equal(await shadow.getAttribute('flood-color'), '#9e3d31')
    assert.match(await sourceText(), /floodColor="#9e3d31"/)
    assert.equal(await source.locator('button').count(), 0)
    const scroll = source.getByRole('region', {
      name: 'Code contents: SVG filter source',
      exact: true,
    })
    if (width === 320) {
      await scroll.scrollIntoViewIfNeeded()
      await page.waitForFunction(
        (node) => node.getAttribute('tabindex') === '0',
        await scroll.elementHandle(),
      )
      await scroll.focus()
      await page.keyboard.press('ArrowRight')
      await page.waitForFunction((node) => node.scrollLeft > 0, await scroll.elementHandle())
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.waitForFunction(
        (node) => !node.hasAttribute('tabindex'),
        await scroll.elementHandle(),
      )
      await page.setViewportSize({ width, height: 900 })
      await page.waitForFunction(
        (node) => node.getAttribute('tabindex') === '0',
        await scroll.elementHandle(),
      )
    } else {
      assert.equal(await scroll.getAttribute('tabindex'), null)
    }

    // The specimens are compiled markup and decoration: hidden, and not images.
    const specimens = page.locator('section', {
      has: page.getByRole('heading', { name: 'Compiled, not hydrated', exact: true }),
    })
    assert.equal(await specimens.locator('svg[aria-hidden="true"]').count(), 3)
    assert.equal(await specimens.locator('svg:not([aria-hidden])').count(), 0)

    // The coverage is the snapshot's, not a rounded-up claim.
    const body = await page.locator('main').innerText()
    const web = snapshot.svgFilterWeb
    const native = snapshot.svgFilterNative
    assert.ok(body.includes(`${web.covered} / ${web.total}`), 'web coverage missing')
    assert.ok(body.includes(`${native.covered} / ${native.total}`), 'native coverage missing')
    assert.ok(!body.includes('100%'), 'a percentage claim came back')

    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log(
    'Svg: named studio drawing (group), radio and slider drive the filter, 3 hidden specimens, coverage from the snapshot, no overflow at 320/1280px',
  )
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
