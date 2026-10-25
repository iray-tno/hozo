import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { CODE_SNIPPETS } from '../src/lib/code-snippets.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.resolve(root, process.argv[2] ?? 'dist')
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
  if (process.env.CI) throw new Error('Landing: browser required in CI')
  console.log('Landing: no browser found; skipped')
  process.exit(0)
}
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}
const server = createServer((req, res) => {
  const relative = new URL(req.url, 'http://localhost').pathname.replace(/^\/hozo\/?/, '')
  const file = path.resolve(dist, relative || 'index.html')
  if (!file.startsWith(`${dist}${path.sep}`) || !existsSync(file)) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
let browser
try {
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  for (const width of [320, 390, 640, 768, 1280]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
    })
    // Layout/keyboard checks need neither tracking nor a third-party font service.
    await page.route('**/*', (route) =>
      route.request().url().startsWith(origin) ? route.continue() : route.abort(),
    )
    await page.goto(`${origin}/hozo/`)
    await page.evaluate(() => document.fonts.ready)
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content', exact: true })
    await skip.waitFor({ state: 'visible' })
    assert.equal(await skip.evaluate((link) => link === document.activeElement), true)
    assert.ok(await skip.evaluate((link) => link.getBoundingClientRect().top >= 0))
    await page.keyboard.press('Enter')
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'main-content')
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
      'auto',
    )

    const install = page.locator('#quick-install')
    assert.equal(
      await install.locator('code').innerText(),
      'pnpm add @hozo/core\npnpm add -D @hozo/vite @hozo/compiler',
    )
    assert.equal(
      await install.evaluate((element) => element.scrollWidth <= element.clientWidth),
      true,
      `install overflow at ${width}px`,
    )
    const comparison = page.locator('#code-showcase')
    for (const title of [
      'Universal Source: NotificationCard.tsx',
      'Web Lowering (DOM + CSS + W3C ARIA)',
      'Native Lowering (Fabric / StyleSheet)',
    ]) {
      const figure = comparison.getByRole('figure', { name: title, exact: true })
      assert.equal(await figure.count(), 1)
      assert.equal(
        await figure.locator('pre').evaluate((pre) => getComputedStyle(pre).whiteSpace),
        'pre-wrap',
      )
      assert.ok(
        await figure.evaluate((element) => element.scrollWidth <= element.clientWidth),
        `${title} overflow at ${width}px`,
      )
      assert.ok((await figure.locator('pre code > span').count()) >= 8)
    }
    assert.equal(await comparison.locator('button, [tabindex]').count(), 0)
    const source = (
      await comparison.locator('pre code').first().locator(':scope > span').allTextContents()
    ).join('\n')
    assert.ok(
      source.includes('className="p-6 rounded-2xl bg-yakisugi-800 border border-hinoki/20"'),
    )
    assert.ok(source.includes('<Button onPress={onDismiss}'))
    const trigger = page.getByRole('link', { name: 'Try the showcase', exact: true })
    await trigger.click()
    const section = page.locator('#try-hozo')
    await section.waitFor()
    assert.ok(
      await section.evaluate(
        (element) =>
          element.getBoundingClientRect().top >=
          document.querySelector('[role="banner"]').getBoundingClientRect().bottom - 1,
      ),
      'anchor is covered by fixed header',
    )
    const web = section.getByRole('link', { name: 'Open Web Storybook', exact: true })
    assert.equal(await web.getAttribute('href'), '/hozo/storybook/')
    await web.focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    assert.equal(await web.evaluate((element) => element === document.activeElement), true)
    assert.equal(await web.evaluate((element) => getComputedStyle(element).outlineStyle), 'solid')
    assert.equal(await web.evaluate((element) => getComputedStyle(element).outlineWidth), '2px')
    assert.equal(
      await section.getByRole('heading', { name: 'iOS Simulator', exact: true }).count(),
      1,
    )
    assert.ok((await section.innerText()).includes('not an iPhone app or TestFlight build'))
    assert.equal(await section.locator('.showcase-action').count(), 3)
    for (const action of await section.locator('.showcase-action').all()) {
      const box = await action.boundingBox()
      assert.ok(
        box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width,
        `action clipped/small at ${width}px`,
      )
      assert.equal(
        await action.evaluate((element) => element.scrollWidth <= element.clientWidth),
        true,
      )
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `page overflow at ${width}px`,
    )
    if (process.env.LANDING_SCREENSHOT_DIR) {
      mkdirSync(process.env.LANDING_SCREENSHOT_DIR, { recursive: true })
      await comparison.screenshot({
        path: path.join(process.env.LANDING_SCREENSHOT_DIR, `code-showcase-${width}.png`),
      })
      await section.screenshot({
        path: path.join(process.env.LANDING_SCREENSHOT_DIR, `try-hozo-${width}.png`),
      })
      await page.goto(`${origin}/hozo/`)
      await page.screenshot({
        path: path.join(process.env.LANDING_SCREENSHOT_DIR, `hero-${width}.png`),
      })
    }
    await page.close()
  }
  // These examples promise build-time rendering: exercise the pages with
  // scripting disabled, so a successful hydration cannot hide missing text.
  for (const [name, snippet] of Object.entries(CODE_SNIPPETS)) {
    for (const width of [320, 768, 1280]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        javaScriptEnabled: false,
        reducedMotion: 'reduce',
      })
      await page.route('**/*', (route) =>
        route.request().url().startsWith(origin) ? route.continue() : route.abort(),
      )
      const route = name === 'philosophy' ? '' : `${name}/`
      await page.goto(`${origin}/hozo/${route}index.html`)
      const figure = page.getByRole('figure', { name: snippet.title, exact: true })
      assert.equal(await figure.count(), 1)
      assert.equal(
        (await figure.locator('pre code > span').allTextContents()).join('\n'),
        snippet.code,
        `${name}: code text changed with scripting disabled`,
      )
      assert.equal(await figure.locator('button, [tabindex]').count(), 0)
      assert.equal(
        await figure.locator('pre').evaluate((pre) => getComputedStyle(pre).whiteSpace),
        'pre-wrap',
      )
      assert.ok(
        await figure.evaluate((element) => element.scrollWidth <= element.clientWidth),
        `${name} code overflow at ${width}px`,
      )
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${name} page overflow at ${width}px`,
      )
      if (process.env.LANDING_SCREENSHOT_DIR) {
        await figure.screenshot({
          path: path.join(process.env.LANDING_SCREENSHOT_DIR, `${name}-code-${width}.png`),
        })
      }
      await page.close()
    }
  }
  console.log(
    'Landing: wrapped code figures, install, showcase actions, anchors, keyboard focus and reduced motion pass at 320/390/640/768/1280px',
  )
  console.log(
    'Landing: Philosophy/Canvas/SVG/Three code figures retain source text and wrap without JavaScript at 320/768/1280px',
  )
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
