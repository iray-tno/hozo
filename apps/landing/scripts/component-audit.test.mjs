import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import test from 'node:test'
import { chromium } from 'playwright-core'
import { observePageRequests } from '../../../scripts/browser-audit-diagnostics.mjs'
import { auditComponentPage } from './component-audit.mjs'

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((value) => value && existsSync(value))
if (process.env.CI) assert.ok(executablePath, 'CI must exercise audit failure diagnostics')

// What Analytics.astro adds to a production page: a third-party script, and
// the beacon it sends. Neither host resolves, so a request that left the
// browser would fail the audit.
const TRACKING = `<script async src="https://analytics.invalid/gtag/js"></script>
  <script>fetch('https://analytics.invalid/g/collect', { method: 'POST', body: 'v=2' })</script>`

test('component audit retains network failures and the original failed verdict before cleanup', {
  skip: !executablePath,
}, async () => {
  const server = createServer((request, response) => {
    if (request.url === '/slow') return
    if (request.url === '/bad-status') return response.writeHead(503).end('unavailable')
    response.writeHead(200, { 'content-type': 'text/html' }).end(`
      <astro-island><div>Ready</div><button onclick="this.textContent='Done'">Run</button></astro-island>
      ${request.url === '/broken' ? '<script src="/aborted.js"></script><img src="/bad-status">' : ''}
      ${request.url === '/tracked' ? TRACKING : ''}`)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  let browser
  try {
    browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
    const page = await browser.newPage()
    await page.route('**/aborted.js', (route) => route.abort('failed'))
    let failure
    try {
      await auditComponentPage(page, {
        name: 'broken',
        url: `${base}/broken`,
        exercise: async () => {},
      })
      assert.fail('resource console errors must still fail the audit')
    } catch (error) {
      failure = error
    }
    assert.equal(failure.code, 'ERR_ASSERTION')
    assert.match(failure.message, /broken: the page logged errors/)
    assert.ok(failure.diagnostics.consoleErrors.length >= 2)
    assert.deepEqual(
      failure.diagnostics.requests.failed.map(({ url, method, resourceType, error }) => ({
        url,
        method,
        resourceType,
        error,
      })),
      [
        {
          url: `${base}/aborted.js`,
          method: 'GET',
          resourceType: 'script',
          error: 'net::ERR_FAILED',
        },
      ],
    )
    assert.deepEqual(failure.diagnostics.requests.httpErrors, [
      { url: `${base}/bad-status`, method: 'GET', resourceType: 'image', status: 503 },
    ])
    const receipt = JSON.stringify(failure.diagnostics)
    await page.close()
    assert.equal(
      JSON.stringify(failure.diagnostics),
      receipt,
      'cleanup must not rewrite the failure',
    )

    const healthy = await browser.newPage()
    const result = await auditComponentPage(healthy, {
      name: 'healthy',
      url: base,
      exercise: async (page) => {
        await page.getByRole('button', { name: 'Run' }).click()
        await page.getByRole('button', { name: 'Done' }).waitFor()
      },
    })
    assert.equal(result.status, 'passed')
    // Third-party requests are answered empty instead of sent (#1872).
    const sent = []
    healthy.on('requestfailed', (request) => sent.push(request.url()))
    const tracked = await auditComponentPage(healthy, {
      name: 'tracked',
      url: `${base}/tracked`,
      exercise: async (page) => {
        await page.getByRole('button', { name: 'Run' }).click()
      },
    })
    assert.equal(tracked.status, 'passed')
    assert.deepEqual(sent, [])
    const sentinel = new Error('the interaction failed')
    await assert.rejects(
      auditComponentPage(healthy, {
        name: 'pending',
        url: base,
        exercise: async (page) => {
          await Promise.all([
            page.waitForRequest(`${base}/slow`),
            page.evaluate(() => {
              fetch('/slow').catch(() => {})
            }),
          ])
          // What the exercise saw when it gave up survives beside the
          // page's own diagnostics (#1603).
          sentinel.diagnostics = { state: { chosen: ['Chosen: #ef4444'] } }
          throw sentinel
        },
      }),
      (error) => {
        assert.equal(error, sentinel)
        assert.deepEqual(error.diagnostics.state, { chosen: ['Chosen: #ef4444'] })
        assert.equal(error.diagnostics.requests.pending[0].url, `${base}/slow`)
        assert.ok(error.diagnostics.requests.pending[0].elapsedMs >= 0)
        return true
      },
    )
    await healthy.close()
  } finally {
    try {
      await browser?.close()
    } finally {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  }
})

test('a reused page does not attribute an earlier request cancellation to the next audit', {
  skip: !executablePath,
}, async () => {
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.route('http://audit.test/', (route) => route.fulfill({ body: '<p>Ready</p>' }))
    let releaseOld
    const oldRoute = new Promise((resolve) => {
      releaseOld = resolve
    })
    await page.route('**/old', (route) => releaseOld(route))
    await page.route('**/current', (route) => route.fulfill({ status: 503, body: 'unavailable' }))
    await page.goto('http://audit.test/')
    await page.evaluate(() => {
      fetch('/old').catch(() => {})
    })
    const route = await oldRoute
    const observer = observePageRequests(page)
    try {
      await Promise.all([page.waitForEvent('requestfailed'), route.abort('failed')])
      await page.evaluate(() => fetch('/current').then((response) => response.text()))
      const snapshot = observer.snapshot()
      assert.deepEqual(snapshot.failed, [], 'the old request did not start in this audit')
      assert.deepEqual(snapshot.httpErrors, [
        {
          url: 'http://audit.test/current',
          method: 'GET',
          resourceType: 'fetch',
          status: 503,
        },
      ])
    } finally {
      observer.stop()
    }
  } finally {
    await browser.close()
  }
})
