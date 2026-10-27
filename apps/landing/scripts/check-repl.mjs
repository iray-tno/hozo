// Exercise the actual WASM binding and output updates: static HTML cannot
// distinguish a named empty figure from a compiler that never loaded.
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
if (!existsSync(path.join(dist, 'wasm/hozo_wasm_bg.wasm'))) {
  console.log(
    'repl: no browser binding in dist/wasm -- skipped.\n  node scripts/build-wasm.mjs, then build again.',
  )
  process.exit(0)
}
const executablePath = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((candidate) => candidate && existsSync(candidate))
if (!executablePath) {
  if (process.env.CI) throw new Error('repl: browser required in CI')
  console.log('repl: no browser found -- skipped.')
  process.exit(0)
}
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}
const requested = []
const server = createServer((req, res) => {
  const relative = new URL(req.url, 'http://localhost').pathname.replace(/^\/hozo\/?/, '')
  const file = path.resolve(dist, relative.endsWith('/') ? `${relative}index.html` : relative)
  requested.push(req.url)
  if (!file.startsWith(`${dist}${path.sep}`) || !existsSync(file)) return res.writeHead(404).end()
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const overall = setTimeout(() => {
  console.error('repl: timed out after 3 minutes')
  process.exit(1)
}, 180_000)
let browser
try {
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  for (const width of [320, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/*', (route) =>
      route.request().url().startsWith(origin) ? route.continue() : route.abort(),
    )
    await page.goto(`${origin}/hozo/repl/`)
    await page.waitForFunction(
      () => /^\d+ components?$/.test(document.getElementById('repl-status')?.textContent ?? ''),
      undefined,
      { timeout: 60_000 },
    )
    const editor = page.getByRole('textbox', { name: 'TSX to compile' })
    assert.equal(await editor.evaluate((node) => node.isContentEditable), true)
    const output = async (id) =>
      (await page.locator(`#${id} pre code > span`).allTextContents()).join('\n')
    assert.ok((await output('repl-web-jsx')).includes('<div'))
    assert.ok((await output('repl-web-css')).includes('padding'))
    assert.ok((await output('repl-native-jsx')).includes('<View'))
    assert.ok((await output('repl-native-styles')).includes('StyleSheet.create'))
    const colors = await page.evaluate(() =>
      ['stone-400', 'hinoki', 'hinoki-light', 'tatami-code', 'shikkui-muted'].map((name) => [
        name,
        getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim(),
      ]),
    )
    assert.ok(
      colors.every(([, value]) => value),
      `REPL token palette missing: ${JSON.stringify(colors)}`,
    )
    assert.ok(
      (await page.locator('#repl-diagnostics').innerText()).includes(
        'A11Y_INTERACTIVE_WITHOUT_ROLE',
      ),
    )
    for (const name of ['Web JSX', 'Web CSS', 'React Native JSX', 'React Native StyleSheet'])
      assert.equal(await page.getByRole('figure', { name, exact: true }).count(), 1)

    const literal = `<script>window.__replInjected = 1</script>&日😀${'x'.repeat(240)}`
    await editor.fill(
      `import { View, Text } from '@hozo/core'; export function Literal() { return <View className="p-2"><Text>{${JSON.stringify(literal)}}</Text></View> }`,
    )
    // CodeJar 4 notifies from keyup/paste, not a bare synthetic input event.
    await editor.press('End')
    await page
      .waitForFunction(() =>
        document.querySelector('#repl-web-jsx code')?.textContent?.includes('__replInjected'),
      )
      .catch(async (error) => {
        console.error(
          JSON.stringify(
            {
              width,
              status: await page.locator('#repl-status').textContent(),
              source: await editor.textContent(),
              diagnostics: await page.locator('#repl-diagnostics').textContent(),
              web: await output('repl-web-jsx'),
              errors,
            },
            null,
            2,
          ),
        )
        throw error
      })
    assert.equal(await page.evaluate(() => window.__replInjected), undefined)
    assert.equal(await page.locator('#repl-results script').count(), 0)
    assert.ok((await output('repl-web-jsx')).includes('日😀'))
    assert.equal(await editor.evaluate((node) => document.activeElement === node), true)
    const scroller = page
      .getByRole('figure', { name: 'Web JSX', exact: true })
      .getByRole('region', { name: 'Code contents: Web JSX' })
    await page.waitForFunction(
      () =>
        document
          .querySelector('[aria-label="Code contents: Web JSX"]')
          ?.getAttribute('tabindex') === '0',
    )
    await scroller.focus()
    await scroller.press('ArrowRight')
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Code contents: Web JSX"]')?.scrollLeft > 0,
    )
    const identity = await scroller.elementHandle()
    await editor.fill('')
    await editor.press('Backspace')
    await page.waitForFunction(() =>
      document.getElementById('repl-status')?.textContent?.startsWith('Nothing to compile:'),
    )
    assert.equal(await output('repl-web-jsx'), '')
    assert.equal(await output('repl-web-css'), '')
    assert.equal(await output('repl-native-jsx'), '')
    assert.equal(await output('repl-native-styles'), '')
    assert.equal(await identity.evaluate((node) => node.isConnected), true)
    await page.waitForFunction(
      () =>
        document
          .querySelector('[aria-label="Code contents: Web JSX"]')
          ?.getAttribute('tabindex') === null,
    )
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.deepEqual(errors, [])
    await page.close()
  }
  assert.ok(requested.some((url) => url.endsWith('/hozo_wasm_bg.wasm')))
  const built = readFileSync(path.join(dist, 'repl/index.html'), 'utf8')
  assert.doesNotMatch(built, /<div[^>]*id="repl-source"[^>]*role="textbox"/)
  console.log(
    'repl: real WASM compile, four named CodeBlock outputs, edits/literal escaping/clearing, editor focus and keyboard scrolling pass at 320/1280px',
  )
} finally {
  clearTimeout(overall)
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
