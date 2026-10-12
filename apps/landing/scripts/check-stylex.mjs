// The /stylex/ page, in a real browser: the samples switch by pointer and
// keyboard, each shows the compiler's current output and diagnostics, and
// the numbers are the snapshot's.
//
// The page this replaced wrote its sample as `style={[...]}`, which Hozo does
// not read, and promised things nothing measured. The samples are now
// compiled when the site is built; this checks they say what the compiler
// says.

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
  if (process.env.CI) throw new Error('StyleX: browser required in CI')
  console.log('StyleX: no browser found; skipped')
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
const url = `http://127.0.0.1:${server.address().port}/hozo/stylex/`

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
    await page.route('**/*', (route) =>
      route
        .request()
        .url()
        .startsWith(url.slice(0, url.indexOf('/hozo/')))
        ? route.continue()
        : route.abort(),
    )
    await page.goto(url)

    const tabs = page.getByRole('tablist', { name: 'StyleX samples' })
    await tabs.scrollIntoViewIfNeeded()
    // Astro drops `ssr` from the island once it has hydrated.
    await page
      .locator('astro-island[component-export="StylexSamples"]:not([ssr])')
      .waitFor({ state: 'attached' })
    assert.equal(await tabs.getByRole('tab').count(), 6)
    const listing = (title) =>
      page
        .getByRole('tabpanel')
        .getByRole('heading', { name: title, exact: true, level: 3 })
        .locator('xpath=../..')
        .locator('pre')
        .innerText()

    // First tab: StyleX beside Tailwind, one class, the guard kept.
    assert.equal(
      await tabs.getByRole('tab', { name: 'Beside Tailwind' }).getAttribute('aria-selected'),
      'true',
    )
    assert.match(await listing('Source'), /stylex\.props\(styles\.root, active && styles\.active\)/)
    const web = await listing('Web')
    assert.doesNotMatch(web, /stylex/)
    assert.match(web, /border-radius: 12px/)
    assert.match(web, /background-color: #2563eb/)
    assert.match(web, /data-hozo-cond-/)
    assert.match(await listing('iOS and Android'), /\(active\) && hozoStyles\.hozo0_cond_/)
    await page.getByText('No diagnostics.').waitFor()

    // Pointer: the Web-only property is named on Native.
    await tabs.getByRole('tab', { name: 'Web-only property' }).click()
    assert.match(await listing('Web'), /scroll-snap-type: x mandatory/)
    assert.doesNotMatch(await listing('iOS and Android'), /scrollSnap/)
    await page.getByText('Native · error · WEB_ONLY_PROPERTY_ON_NATIVE').waitFor()

    // Keyboard: arrows move focus along the strip, Enter selects.
    await tabs.getByRole('tab', { name: 'Web-only property' }).focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    assert.equal(
      await tabs.getByRole('tab', { name: 'Left to StyleX' }).getAttribute('aria-selected'),
      'true',
    )
    await page.getByText('Web and Native · warning · STYLEX_NOT_LOWERED').waitFor()
    assert.match(await listing('iOS and Android'), /stylex\.props\(styles\.bar\(width\)\)/)

    // firstThatWorks: Native takes the first candidate it can represent.
    await tabs.getByRole('tab', { name: 'firstThatWorks' }).click()
    assert.match(await listing('Web'), /position: relative;\s*position: sticky;/)
    assert.match(await listing('iOS and Android'), /position: 'relative'/)

    // The numbers are the snapshot's.
    const measured = await page
      .getByRole('heading', { name: 'Measured against StyleX' })
      .locator('xpath=../..')
      .innerText()
    for (const [covered, of] of [
      [snapshot.stylex.mapped, snapshot.stylex.properties],
      [snapshot.stylex.mappedCompilerRelevant, snapshot.stylex.compilerRelevantProperties],
      [snapshot.stylex.mappedNative, snapshot.stylex.nativeProperties],
      [snapshot.stylex.mappedWebOnly, snapshot.stylex.webOnlyProperties],
      [snapshot.stylexValues.covered, snapshot.stylexValues.cases],
      [snapshot.stylexCorpus.covered, snapshot.stylexCorpus.cases],
    ]) {
      assert.ok(measured.includes(`${covered} / ${of}`), `${covered} / ${of} missing`)
    }
    assert.doesNotMatch(measured, /100%/)

    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `/stylex/ overflows at ${width}px`,
    )
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log(
    'StyleX: 6 compiled samples switch by pointer and keyboard, outputs and diagnostics current, numbers from the snapshot, no overflow at 320/1280px',
  )
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
