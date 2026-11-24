// End-to-end Web browser verification of the compiled Hozo A2UI v1.0 spike
// (`@hozo/vite` production bundle rendered in headless Chromium).
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(root, 'dist')

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((file) => file && existsSync(file))

if (process.env.CI) assert.ok(executablePath, 'CI must run Web A2UI browser verification')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

let server
let baseUrl
let browser

before(async () => {
  assert.ok(existsSync(path.join(distDir, 'index.html')), 'run `vite build` before Web tests')
  server = createServer((req, res) => {
    const clean = (req.url || '/').split('?')[0]
    const target = path.join(distDir, clean === '/' ? 'index.html' : clean)
    if (!target.startsWith(distDir) || !existsSync(target)) {
      res.statusCode = 404
      res.end('Not found')
      return
    }
    const ext = path.extname(target)
    res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
    res.end(readFileSync(target))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  baseUrl = `http://127.0.0.1:${address.port}`
  if (executablePath) {
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu'],
    })
  }
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => server?.close(resolve))
})

test('Web bundle renders A2UI v1.0 surface with compiled Hozo DOM, live updates, actions, and zero custom elements', {
  skip: !executablePath,
}, async () => {
  const page = await browser.newPage()
  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => Boolean(window.__a2uiSpike))

    // No <a2ui-react-*> Custom Element wrappers exist anywhere in the DOM.
    const customElements = await page.evaluate(() =>
      Array.from(document.querySelectorAll('*'))
        .map((el) => el.tagName.toLowerCase())
        .filter((tag) => tag.includes('-')),
    )
    assert.deepEqual(customElements, [])

    const approveBtn = page.getByRole('button', {
      name: 'Approve release 0.5.2 for production',
    })
    const rollbackBtn = page.getByRole('button', { name: 'Rollback' })
    const alertEl = page.getByRole('status')

    assert.equal(await approveBtn.isDisabled(), true)
    assert.equal(await rollbackBtn.isDisabled(), false)
    assert.equal(await alertEl.textContent(), 'Approval is locked until all checks turn green.')

    // Initial template list has 2 items.
    await page.getByText('lint: passed').waitFor()
    await page.getByText('rust-tests: 1224 passed').waitFor()
    assert.equal(await page.getByText('browser-audit: passed').count(), 0)

    // Live updateDataModel enables the approve button, updates alert text, and adds item 3.
    const updateErrors = await page.evaluate(() => window.__a2uiSpike.applyUnblock())
    assert.deepEqual(updateErrors, [])
    assert.equal(await approveBtn.isDisabled(), false)
    assert.equal(await alertEl.textContent(), 'All checks passed. Release 0.5.2 can be approved.')
    await page.getByText('browser-audit: passed').waitFor()

    // Real clicks dispatch spec-compliant A2UI v1.0 action messages.
    await approveBtn.click()
    await rollbackBtn.click()
    const actions = await page.evaluate(() => window.__a2uiSpike.getActions())
    assert.deepEqual(actions, [
      {
        version: '1.0',
        action: {
          name: 'approve_release',
          surfaceId: 'release-gate',
          sourceComponentId: 'approve_btn',
          timestamp: '2026-11-25T00:00:00.000Z',
          userMessage: 'Release 0.5.2 Ready Check',
          context: {
            version: '0.5.2',
            environment: 'production',
          },
        },
      },
      {
        version: '1.0',
        action: {
          name: 'rollback_release',
          surfaceId: 'release-gate',
          sourceComponentId: 'rollback_btn',
          timestamp: '2026-11-25T00:00:00.000Z',
          context: {
            version: '0.5.2',
          },
        },
      },
    ])

    // Negative check: raw className injection is rejected and leaves DOM unchanged.
    const invalidErrors = await page.evaluate(() => window.__a2uiSpike.sendInvalidClassName())
    assert.equal(invalidErrors.length, 1)
    assert.equal(invalidErrors[0].error.code, 'VALIDATION_FAILED')
    assert.equal(await page.getByRole('button').count(), 2)

    // Loading v0.9.1 progressive messages produces the exact same initial UI.
    const v091Errors = await page.evaluate(() => window.__a2uiSpike.loadVersion('v0.9.1'))
    assert.deepEqual(v091Errors, [])
    assert.equal(await approveBtn.isDisabled(), true)
    assert.equal(await alertEl.textContent(), 'Approval is locked until all checks turn green.')
  } finally {
    await page.close()
  }
})
