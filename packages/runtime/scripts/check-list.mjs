// Whether the Web `FlatList` actually windows, asked of a browser.
//
// `src/windowing.test.ts` checks the arithmetic and `src/list.test.ts`
// checks what the first render puts on the page. Neither can answer the
// question #385 is about, because both run in Node: jsdom has no layout,
// every box is zero by zero, and a windowing implementation that mounted
// all ten thousand rows would pass them both.
//
// So this builds a page, serves it, and asks a real browser. Ten thousand
// rows of varying height, scrolled, jumped to, prepended to and inverted --
// and the answers come back as a count of mounted rows and a handful of
// pixel offsets, which are the things nothing else here can see.
//
//     node scripts/check-list.mjs
//
// No browser is installed for this. Missing one skips, unless `CI` is set:
// a check that quietly does nothing where it matters is not a check, and
// `apps/landing/scripts/check-repl.mjs` draws the same line.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** Where a browser might be, per platform. Nothing is installed for this. */
const BROWSERS = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean)

const browser = BROWSERS.find((candidate) => existsSync(candidate))
if (!browser) {
  if (process.env.CI) {
    console.error('list: no browser found, and CI is set. Install one or unset CI.')
    process.exit(1)
  }
  console.log('list: no browser found -- skipped.')
  process.exit(0)
}

const { build } = await import('esbuild')
const dist = mkdtempSync(path.join(tmpdir(), 'hozo-list-'))
try {
  await build({
    entryPoints: [path.join(here, 'list-probe.tsx')],
    bundle: true,
    format: 'esm',
    jsx: 'automatic',
    // The source, not `dist`: this checks the file that is edited, and a
    // check that ran against a stale build would be the wrong kind of
    // green.
    outfile: path.join(dist, 'probe.js'),
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  })

  writeFileSync(
    path.join(dist, 'index.html'),
    '<!doctype html><meta charset="utf-8">' +
      // A viewport-sized scroller and nothing else on the page, so every
      // number below is about the list.
      '<style>html,body{margin:0}#app{height:600px}</style>' +
      '<div id="app"></div><script type="module" src="/probe.js"></script>',
  )

  const server = createServer((request, response) => {
    const name = (request.url ?? '/').split('?')[0]
    const file = path.join(dist, name === '/' ? 'index.html' : name.replace(/^\//, ''))
    if (!file.startsWith(dist) || !existsSync(file)) {
      response.writeHead(404).end('not found')
      return
    }
    response.writeHead(200, {
      'content-type': file.endsWith('.js')
        ? 'text/javascript; charset=utf-8'
        : 'text/html; charset=utf-8',
    })
    response.end(readFileSync(file))
  })

  const port = await new Promise((resolve) => {
    server.listen(0, () => resolve(server.address().port))
  })

  // Driven over the DevTools protocol rather than with `--dump-dom`.
  //
  // A dump is one snapshot, and holding it back until the page has finished
  // needs `--virtual-time-budget` -- which delivers a `setTimeout` sooner
  // than it delivers the `scroll` event a programmatic `scrollTop` produces.
  // The result was a check that reported the window following a 200,000px
  // scroll on one run and never leaving row 0 on the next. Evaluating the
  // page's own function and awaiting its promise has neither problem, and
  // the answer comes back as a value rather than as parsed HTML.
  const profile = mkdtempSync(path.join(tmpdir(), 'hozo-list-profile-'))
  const chrome = spawn(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--window-size=800,600',
      `http://localhost:${port}/`,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )

  const results = await new Promise((resolve, reject) => {
    const failed = setTimeout(() => reject(new Error('the browser never became ready')), 60_000)
    let stderr = ''
    chrome.stderr.on('data', async (chunk) => {
      stderr += String(chunk)
      const match = /ws:\/\/([^/]+)\/devtools\/browser\//.exec(stderr)
      if (!match) return
      chrome.stderr.removeAllListeners('data')
      clearTimeout(failed)
      try {
        resolve(await evaluate(match[1]))
      } catch (error) {
        reject(error)
      }
    })
    chrome.on('exit', (code) => {
      clearTimeout(failed)
      reject(new Error(`the browser exited with ${code}\n${stderr}`))
    })
  }).finally(() => {
    chrome.kill()
    server.close()
    // Best effort: on Windows the browser still holds its profile for a
    // moment after `kill`, and failing to delete a temporary directory is
    // not a reason to fail a check about list rendering.
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch {}
  })

  /** Runs the page's own probe and returns what it measured. */
  async function evaluate(host) {
    // The page target, found through the HTTP endpoint rather than by
    // driving `Target.*`: one request, and it reports the socket to talk to.
    const deadline = Date.now() + 30_000
    let target
    while (Date.now() < deadline) {
      const listed = await fetch(`http://${host}/json/list`).then((response) => response.json())
      target = listed.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
      if (target) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (!target) throw new Error('the browser opened no page')

    const socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', () => reject(new Error('could not attach')), { once: true })
    })

    let nextId = 1
    const send = (method, params) =>
      new Promise((resolve, reject) => {
        const id = nextId++
        const onMessage = (event) => {
          const message = JSON.parse(event.data)
          if (message.id !== id) return
          socket.removeEventListener('message', onMessage)
          if (message.error) reject(new Error(`${method}: ${message.error.message}`))
          else resolve(message.result)
        }
        socket.addEventListener('message', onMessage)
        socket.send(JSON.stringify({ id, method, params }))
      })

    // The module may still be loading when the socket opens, so the probe
    // is waited for rather than assumed.
    const ready = Date.now() + 30_000
    for (;;) {
      const { result } = await send('Runtime.evaluate', {
        expression: 'typeof window.__hozoRunListProbe === "function"',
        returnByValue: true,
      })
      if (result.value === true) break
      if (Date.now() > ready) throw new Error('the probe never loaded')
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression: 'window.__hozoRunListProbe()',
      awaitPromise: true,
      returnByValue: true,
    })
    socket.close()
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
    }
    return result.value
  }

  // A 600px viewport and rows of 40-160px, so React Native's default
  // `windowSize` of 21 is twenty viewports of overscan: 12,000px, which is
  // at most 300 rows of the smallest size. The bound is generous on
  // purpose -- what is being asserted is that it is a bound at all, and
  // 10,000 mounted rows is what this replaces.
  const BOUND = 320
  const failures = []
  const check = (ok, message) => {
    if (!ok) failures.push(message)
  }

  check(
    results.mountedAtRest > 0 && results.mountedAtRest <= BOUND,
    `at rest, ${results.mountedAtRest} of ${results.total} rows are mounted`,
  )
  check(
    results.mountedScrolled > 0 && results.mountedScrolled <= BOUND,
    `scrolled in, ${results.mountedScrolled} of ${results.total} rows are mounted`,
  )
  // The scroller has to be as long as the data, not as long as the window:
  // 10,000 rows averaging 100px is about a million pixels, and a scrollbar
  // that only covers the mounted rows is a list nobody can scroll through.
  check(
    results.scrollHeight > 500_000,
    `the scrollable length is ${results.scrollHeight}px, which is too short for 10,000 rows`,
  )
  // Scrolled to 200,000px of roughly 1,000,000, so the row on screen is
  // somewhere near a fifth of the way in. Loose bounds: the exact row
  // depends on measured heights, and pinning it would be pinning the
  // fixture rather than the behaviour.
  check(
    typeof results.topRowScrolled === 'number' &&
      results.topRowScrolled > 500 &&
      results.topRowScrolled < 4000,
    `the row at the top of the viewport is ${results.topRowScrolled}, which is not near the scroll position`,
  )
  check(results.topRowVisible === true, 'the row at the top of the viewport has no height')
  // The scroller must not have been dragged somewhere else while rows were
  // measured. A window that corrected its padding without correcting the
  // offset is exactly the visible jump this has to not do.
  check(
    Math.abs(results.scrollTopAfterSettle - 200_000) < 2,
    `measuring rows moved the scroll position to ${results.scrollTopAfterSettle}`,
  )
  check(results.scrollToIndexMounted === true, 'scrollToIndex did not mount its target row')
  check(
    typeof results.scrollToIndexOffset === 'number' && Math.abs(results.scrollToIndexOffset) < 40,
    `scrollToIndex left its target ${results.scrollToIndexOffset}px from the top of the viewport`,
  )
  // `maintainVisibleContentPosition`: ten rows inserted above the reader,
  // and the row they were reading stays where it was. Without it the page
  // jumps by the height of what was inserted -- around 1,000px here.
  check(
    typeof results.anchorDriftPx === 'number' && Math.abs(results.anchorDriftPx) < 4,
    `prepending moved the reader's row by ${results.anchorDriftPx}px`,
  )
  // `inverted`: row 0 is drawn at the bottom of the viewport, which is the
  // whole of what the prop means.
  check(
    typeof results.invertedFirstRowFromBottom === 'number' &&
      Math.abs(results.invertedFirstRowFromBottom) < 4,
    `inverted put row 0 ${results.invertedFirstRowFromBottom}px from the bottom of the viewport`,
  )
  check(
    results.invertedMounted > 0 && results.invertedMounted <= BOUND,
    `inverted mounted ${results.invertedMounted} of ${results.total} rows`,
  )

  if (failures.length > 0) {
    console.error('list: the Web FlatList does not window as it should:\n')
    for (const failure of failures) console.error(`  - ${failure}`)
    console.error(`\n  measured: ${JSON.stringify(results)}`)
    process.exit(1)
  }
  console.log(
    `list: ${results.mountedAtRest} rows mounted of ${results.total} at rest, ` +
      `${results.mountedScrolled} scrolled in; scrollToIndex, prepend and inverted all land`,
  )
} finally {
  rmSync(dist, { recursive: true, force: true })
}
