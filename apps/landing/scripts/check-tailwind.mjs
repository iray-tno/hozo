// The /tailwind/ page, in a real browser: the sample chips work, the compiler
// output beside them is the current compiler's, and the numbers are the
// snapshot's.
//
// The page this replaced described the lowering in prose that had drifted
// from the compiler (`box-border` as Native's no-op, `@theme` tokens as
// `var()` on Native, a sample Native refuses to build). The output and the
// variant table are now compiled when the site is built; this checks they
// say what the compiler says.

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
  if (process.env.CI) throw new Error('Tailwind: browser required in CI')
  console.log('Tailwind: no browser found; skipped')
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
const url = `http://127.0.0.1:${server.address().port}/hozo/tailwind/`

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

    // The chips are checkboxes, and pressing one by pointer or keyboard
    // flips it.
    const chip = (name) => page.getByRole('checkbox', { name, exact: true })
    assert.equal(await page.getByRole('checkbox').count(), 3)
    assert.equal(await chip('Web').getAttribute('aria-checked'), 'true')
    assert.equal(await chip('iOS').getAttribute('aria-checked'), 'false')
    await chip('iOS').scrollIntoViewIfNeeded()
    // Astro drops `ssr` from the island once it has hydrated.
    await page
      .locator('astro-island[component-export="ChipDemo"]:not([ssr])')
      .waitFor({ state: 'attached' })
    await chip('iOS').click()
    assert.equal(await chip('iOS').getAttribute('aria-checked'), 'true')
    await page.getByText('Web, iOS', { exact: true }).waitFor()
    await chip('Android').focus()
    await page.keyboard.press('Space')
    assert.equal(await chip('Android').getAttribute('aria-checked'), 'true')
    await page.getByText('Web, iOS, Android', { exact: true }).waitFor()

    // The ternary's two branches are two looks: the compiled CSS keys on the
    // condition attribute, so a checked chip is filled and an unchecked one
    // is not.
    await chip('Web').click()
    const background = (name) =>
      chip(name).evaluate((element) => getComputedStyle(element).backgroundColor)
    assert.notEqual(await background('Web'), await background('iOS'))
    assert.equal(await background('Web'), 'rgba(0, 0, 0, 0)')

    // The output shown is the compiler's, including the Native fix that gave
    // the two branches two style keys.
    const listing = (title) =>
      page
        .getByRole('heading', { name: title, exact: true, level: 3 })
        .locator('xpath=../..')
        .locator('pre')
        .innerText()
    const source = await listing('Chip.tsx')
    assert.match(source, /export function Chip/)
    const web = await listing('Web')
    assert.match(web, /role="checkbox"/)
    assert.match(web, /hozo-cond-\d+-\d+/)
    assert.match(web, /@media \(width >= 768px\)/)
    const native = await listing('iOS and Android')
    const keys = [...native.matchAll(/^\s*(hozo\w+): \{/gm)].map((match) => match[1])
    assert.equal(new Set(keys).size, keys.length, `duplicate Native style keys: ${keys}`)
    assert.match(native, /hozo1_cond_not_\d+_\d+/)
    assert.match(native, /useHozoBreakpoint\('md'\)/)

    // The variant table is compiled at build time, so its verdicts are the
    // compiler's: a sample of each kind.
    const row = (className) =>
      page.locator('table tbody tr').filter({
        has: page.getByRole('rowheader', { name: className, exact: true }),
      })
    assert.equal(await page.locator('table tbody tr').count(), 11)
    assert.match(await row('hover:bg-emerald-600').innerText(), /Compiled[\s\S]*Compiled/)
    assert.match(await row('dark:bg-stone-800').innerText(), /useHozoDark/)
    assert.match(await row('print:hidden').innerText(), /Compiled[\s\S]*Build error/)
    assert.match(await row('peer-checked:bg-emerald-700').innerText(), /not compiled yet/)

    // The numbers are the snapshot's.
    const measured = await page
      .getByRole('heading', { name: 'Measured against Tailwind itself' })
      .locator('xpath=../..')
      .innerText()
    const n = (value) => value.toLocaleString('en-US')
    for (const [match, of] of [
      [snapshot.catalogue.match, snapshot.catalogue.comparable],
      [snapshot.variants.match, snapshot.variants.total],
      [snapshot.arbitrary.match, snapshot.arbitrary.candidates],
      [snapshot.native.covered, snapshot.native.candidates],
      [snapshot.nativeVariants.covered, snapshot.nativeVariants.total],
    ]) {
      assert.ok(measured.includes(`${n(match)} / ${n(of)}`), `${match} / ${of} missing`)
    }

    // One row per curated class Native does not cover, as the snapshot counts.
    const gaps = page
      .getByRole('heading', { name: 'The common classes Native does not cover' })
      .locator('xpath=..')
    assert.equal(
      await gaps.getByText(/^(REFUSED|NO-OP)$/).count(),
      snapshot.native.refused + snapshot.native.noOp,
    )

    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `/tailwind/ overflows at ${width}px`,
    )
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log(
    'Tailwind: 3 sample chips toggle by pointer and keyboard, compiled output current (two Native style keys), 11 variants compiled at build, numbers from the snapshot, no overflow at 320/1280px',
  )
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
