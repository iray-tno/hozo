import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import test from 'node:test'
import { chromium } from 'playwright-core'
import { waitForAppearanceStory, withAppearanceStory } from './appearance-readiness.mjs'

function harness() {
  let time = 0
  const body = new Set(['sb-show-main'])
  const root = { childElementCount: 1 }
  const link = { sheet: {}, disabled: false }
  const doc = {
    URL: 'http://localhost/iframe.html?id=requested',
    readyState: 'complete',
    body: { classList: { contains: (name) => body.has(name) } },
    fonts: { status: 'loaded' },
    getElementById: () => root,
    querySelectorAll: () => [link],
    styleSheets: [],
  }
  const frame = { contentDocument: doc }
  const options = {
    timeout: 100,
    now: () => time,
    wait: async (ms) => {
      time += ms
    },
  }
  return { doc, frame, options, root, link, body, time: () => time }
}

test('appearance waits for the requested document, render, stylesheet and fonts', async () => {
  for (const property of ['document', 'loading', 'render', 'body', 'stylesheet', 'fonts']) {
    const h = harness()
    if (property === 'document') h.doc.URL = 'http://localhost/iframe.html?id=previous'
    if (property === 'loading') h.doc.readyState = 'loading'
    if (property === 'render') h.root.childElementCount = 0
    if (property === 'body') h.body.delete('sb-show-main')
    if (property === 'stylesheet') h.link.sheet = null
    if (property === 'fonts') h.doc.fonts.status = 'loading'
    const tick = h.options.wait
    h.options.wait = async (ms) => {
      await tick(ms)
      h.doc.URL = 'http://localhost/iframe.html?id=requested'
      h.doc.readyState = 'complete'
      h.root.childElementCount = 1
      h.body.add('sb-show-main')
      h.link.sheet = {}
      h.doc.fonts.status = 'loaded'
    }
    assert.equal(await waitForAppearanceStory(h.frame, 'requested', h.options), h.doc)
    assert.equal(h.time(), 25, property)
  }
})

test('appearance fails a missing stylesheet, stale page, empty render or Storybook error', async () => {
  for (const property of ['stylesheet', 'stale', 'empty', 'error']) {
    const h = harness()
    if (property === 'stylesheet') h.link.sheet = null
    if (property === 'stale') h.doc.URL = 'http://localhost/iframe.html?id=previous'
    if (property === 'empty') h.root.childElementCount = 0
    if (property === 'error') h.body.add('sb-show-errordisplay')
    await assert.rejects(waitForAppearanceStory(h.frame, 'requested', h.options), /Story/)
  }
})

test('appearance cannot accept readiness after its deadline', async () => {
  const h = harness()
  h.link.sheet = null
  const tick = h.options.wait
  h.options.wait = async (ms) => {
    await tick(ms)
    if (h.time() === 100) h.link.sheet = {}
  }
  await assert.rejects(waitForAppearanceStory(h.frame, 'requested', h.options), /did not finish/)
})

test('appearance readiness does not wait for focus rules or hide a real missing-rule defect', async () => {
  const h = harness()
  assert.equal(await waitForAppearanceStory(h.frame, 'requested', h.options), h.doc)
  assert.deepEqual(h.doc.styleSheets, [])
  assert.equal(h.time(), 0)
})

test('a failed readiness or audit disposes its browsing context', async () => {
  for (const failure of ['readiness', 'audit']) {
    const h = harness()
    const active = new Set()
    h.frame.style = {}
    h.frame.remove = () => active.delete(h.frame)
    const container = {
      ownerDocument: { createElement: () => h.frame },
      append: (frame) => active.add(frame),
    }
    if (failure === 'readiness') h.root.childElementCount = 0
    let audited = false
    await assert.rejects(
      withAppearanceStory(
        container,
        'requested',
        () => {
          audited = true
          throw new Error('real appearance defect')
        },
        h.options,
      ),
      failure === 'readiness' ? /did not finish/ : /real appearance defect/,
    )
    assert.equal(audited, failure === 'audit')
    assert.equal(active.size, 0)
  }
})

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

test('a previous renderer cannot replace the next story while its navigation is pending', {
  skip: !executablePath && !process.env.CI,
  timeout: 20_000,
}, async (t) => {
  assert.ok(executablePath, 'appearance regression requires a browser in CI')
  let pending
  let requested
  let stale = 0
  const fixture = (first) => `<!doctype html><link rel="stylesheet" href="/style.css">
    <body class="sb-show-main"><div id="storybook-root"><button>Ready</button></div>
    ${first ? '<script>parent.lateCompletion = () => window.location.replace("/stale.html")</script>' : ''}`
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname === '/host') return res.end('<div id="stories"></div>')
    if (url.pathname === '/style.css') {
      res.setHeader('content-type', 'text/css')
      return res.end(
        'button {width:28px;height:28px} button:focus-visible {outline:2px solid black}',
      )
    }
    res.setHeader('content-type', 'text/html')
    if (url.pathname === '/stale.html') {
      stale++
      return res.end(fixture(false))
    }
    if (url.searchParams.get('id') === 'second') {
      // Hold the response so the previous renderer's late callback runs
      // before the next document commits, without a guessed timer delay.
      pending = res
      requested()
      return
    }
    res.end(fixture(true))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  let browser
  t.after(async () => {
    await browser?.close()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-gpu'] })
  for (const isolate of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1024 } })
    try {
      const nextRequest = new Promise((resolve) => {
        requested = resolve
      })
      await page.goto(`http://127.0.0.1:${server.address().port}/host`)
      await page.addScriptTag({
        content: `
          const waitForAppearanceStory = ${waitForAppearanceStory.toString()};
          const withAppearanceStory = ${withAppearanceStory.toString()};
        `,
      })
      await page.evaluate(async (isolate) => {
        const container = document.getElementById('stories')
        window.visit = isolate
          ? (id, audit) => withAppearanceStory(container, id, audit)
          : async (id, audit) => {
              const frame = container.firstElementChild || document.createElement('iframe')
              frame.style.cssText = 'width:1200px;height:900px;border:0'
              if (!frame.isConnected) container.append(frame)
              frame.src = `/iframe.html?id=${id}`
              const doc = await waitForAppearanceStory(frame, id)
              return audit(doc, frame.contentWindow)
            }
        await window.visit('first', (doc) => {
          window.previousFrame = doc.defaultView.frameElement
        })
        window.outcome = null
        window
          .visit('second', (doc) => ({
            url: doc.URL,
            width: doc.querySelector('button').getBoundingClientRect().width,
            viewport: [doc.defaultView.innerWidth, doc.defaultView.innerHeight],
          }))
          .then(
            (value) => {
              window.outcome = { value }
            },
            (error) => {
              window.outcome = { error: error.message }
            },
          )
      }, isolate)
      await nextRequest
      await page.evaluate(() => {
        // Retained by the old story, as asynchronous Storybook completion
        // work can be. A detached context may reject this operation.
        try {
          window.lateCompletion()
        } catch {}
      })
      if (!isolate) {
        await page.waitForFunction(() =>
          document.querySelector('iframe')?.contentDocument?.URL.endsWith('/stale.html'),
        )
      }
      if (!pending.destroyed) pending.end(fixture(false))
      await page.waitForFunction(() => window.outcome !== null, null, { timeout: 10_000 })
      const result = await page.evaluate(() => ({
        ...window.outcome,
        previousConnected: window.previousFrame.isConnected,
        remainingFrames: document.querySelectorAll('iframe').length,
      }))
      if (isolate) {
        assert.equal(result.error, undefined)
        assert.match(result.value.url, /id=second/)
        assert.equal(result.value.width, 28)
        assert.deepEqual(result.value.viewport, [1200, 900])
        assert.equal(result.previousConnected, false)
        assert.equal(result.remainingFrames, 0)
        assert.equal(stale, 1, 'retired renderer never navigated the replacement frame')
      } else {
        assert.match(result.error, /did not finish.*stale\.html/)
        assert.equal(result.previousConnected, true)
        assert.equal(stale, 1)
      }
      t.diagnostic(`${isolate ? 'isolated' : 'reused'} frame: ${JSON.stringify(result)}`)
    } finally {
      await page.close()
    }
  }
})
