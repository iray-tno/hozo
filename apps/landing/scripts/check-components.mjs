// The /docs/components/ pages, in a real browser: each @hozo/ui preview
// hydrates and does what its page says when pressed or typed into.
//
// check-build only sees the server-rendered HTML, which looks the same
// whether the island works or not. The Input page is why this exists: its
// field rendered, and typing into it did nothing, because the compiler
// dropped the `onChangeText` inside @hozo/ui's prop spread (#1118).

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
  if (process.env.CI) throw new Error('Components: browser required in CI')
  console.log('Components: no browser found; skipped')
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
const base = `http://127.0.0.1:${server.address().port}/hozo/docs/components`

const pages = {
  async button(page) {
    await page.getByRole('button', { name: 'Danger' }).click()
    await page.getByText('Last pressed: Danger').waitFor()
    assert.equal(
      await page.getByRole('button', { name: 'Disabled' }).isDisabled(),
      true,
      'button: the disabled one is not disabled',
    )
  },
  async input(page) {
    const field = page.getByRole('textbox', { name: 'Email' })
    await field.fill('not-an-email')
    assert.equal(await field.inputValue(), 'not-an-email', 'input: typing did not stick')
    assert.equal(await field.getAttribute('aria-invalid'), 'true', 'input: not marked invalid')
    await page.getByRole('alert').filter({ hasText: 'does not look like an email' }).waitFor()
    await field.fill('a@b.co')
    assert.notEqual(await field.getAttribute('aria-invalid'), 'true', 'input: still invalid')
  },
  async card(page) {
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor()
  },
  async dialog(page) {
    const opener = page.getByRole('button', { name: 'Delete project', exact: true })
    await opener.click()
    const dialog = page.getByRole('dialog', { name: 'Delete the project' })
    await dialog.waitFor()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(
      await opener.evaluate((element) => element === document.activeElement),
      true,
      'dialog: focus did not return to the button that opened it',
    )
  },
}

let browser
try {
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  for (const [name, exercise] of Object.entries(pages)) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
    await page.goto(`${base}/${name}/`, { waitUntil: 'networkidle' })
    await page.locator('astro-island').scrollIntoViewIfNeeded()
    await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'))
    await exercise(page)
    assert.deepEqual(errors, [], `${name}: the page logged errors`)
    await page.close()
  }
  console.log(`Components: ${Object.keys(pages).join(', ')} hydrate and respond in a browser`)
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
