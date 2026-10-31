import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import test from 'node:test'
import { chromium } from 'playwright-core'
import { auditComponentPage } from './component-audit.mjs'

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((value) => value && existsSync(value))
if (process.env.CI) assert.ok(executablePath, 'CI must exercise audit failure diagnostics')

test('component audit retains network failures and the original failed verdict before cleanup', {
  skip: !executablePath,
}, async () => {
  const server = createServer((request, response) => {
    if (request.url === '/slow') return
    if (request.url === '/bad-status') return response.writeHead(503).end('unavailable')
    response.writeHead(200, { 'content-type': 'text/html' }).end(`
      <astro-island><div>Ready</div><button onclick="this.textContent='Done'">Run</button></astro-island>
      ${request.url === '/broken' ? '<script src="/aborted.js"></script><img src="/bad-status">' : ''}`)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  try {
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
          throw sentinel
        },
      }),
      (error) => {
        assert.equal(error, sentinel)
        assert.equal(error.diagnostics.requests.pending[0].url, `${base}/slow`)
        assert.ok(error.diagnostics.requests.pending[0].elapsedMs >= 0)
        return true
      },
    )
    await healthy.close()
  } finally {
    await browser.close()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
})
