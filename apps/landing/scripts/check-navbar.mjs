// Whether the landing navbar fits within standard viewports without clipping trailing buttons.
//
// Issue #404: at 1280x900 (and 768-1440px), the navbar previously exceeded
// container width, pushing the GitHub and REPL buttons completely outside
// the viewport, clipped invisibly by overflow-x: hidden.
//
// This check runs headless Chrome, evaluates the geometry of the navbar
// and its content at phone and desktop responsive breakpoints, and asserts
// that the brand and trailing buttons remain visible without overlapping.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  process.argv[2] ?? 'dist',
)

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
    console.error('navbar: no browser found, and CI is set. Install one or unset CI.')
    process.exit(1)
  }
  console.log('navbar: no browser found -- skipped.')
  process.exit(0)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const relative = url.pathname.replace(/^\/hozo/, '').replace(/^\//, '') || 'index.html'
  const file = path.join(dist, relative.endsWith('/') ? `${relative}index.html` : relative)
  if (!existsSync(file) || !file.startsWith(dist)) {
    res.writeHead(404).end('not found')
    return
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})

const port = await new Promise((resolve) => {
  server.listen(0, () => resolve(server.address().port))
})

async function checkViewport(width, height) {
  const profile = mkdtempSync(path.join(tmpdir(), 'hozo-nav-check-'))
  const chrome = spawn(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      `http://localhost:${port}/hozo/`,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )

  const result = await new Promise((resolve, reject) => {
    const failed = setTimeout(() => reject(new Error('timeout waiting for browser')), 30_000)
    let stderr = ''
    chrome.stderr.on('data', async (chunk) => {
      stderr += String(chunk)
      const match = /ws:\/\/([^/]+)\/devtools\/browser\//.exec(stderr)
      if (!match) return
      chrome.stderr.removeAllListeners('data')
      clearTimeout(failed)
      try {
        const host = match[1]
        let target
        const deadline = Date.now() + 10000
        while (Date.now() < deadline) {
          const listed = await fetch(`http://${host}/json/list`).then((r) => r.json())
          target = listed.find((e) => e.type === 'page' && e.webSocketDebuggerUrl)
          if (target) break
          await new Promise((r) => setTimeout(r, 100))
        }
        if (!target) throw new Error('no page target')

        const socket = new WebSocket(target.webSocketDebuggerUrl)
        await new Promise((res, rej) => {
          socket.addEventListener('open', res, { once: true })
          socket.addEventListener('error', rej, { once: true })
        })

        let nextId = 1
        const send = (method, params) =>
          new Promise((res, rej) => {
            const id = nextId++
            const onMessage = (event) => {
              const msg = JSON.parse(event.data)
              if (msg.id !== id) return
              socket.removeEventListener('message', onMessage)
              if (msg.error) rej(new Error(msg.error.message))
              else res(msg.result)
            }
            socket.addEventListener('message', onMessage)
            socket.send(JSON.stringify({ id, method, params }))
          })

        // Desktop Chrome may clamp --window-size below its minimum window width.
        // Device metrics keep the CSS viewport exact for phone-size regressions.
        await send('Emulation.setDeviceMetricsOverride', {
          width,
          height,
          deviceScaleFactor: 1,
          // We test responsive CSS geometry, not mobile user-agent behaviour.
          // Enabling mobile mode after navigation can retain Chrome's wide
          // pre-emulation layout viewport until the document is reloaded.
          mobile: false,
        })

        // Give fonts and CSS layout a moment to settle
        await new Promise((r) => setTimeout(r, 600))

        const evalExpr = `(async () => {
          const start = Date.now();
          let header, container, trailing;
          while (Date.now() - start < 10000) {
            header = document.querySelector('header, [role="banner"]');
            container = header ? header.firstElementChild : null;
            trailing = container && container.children.length > 0 ? container.children[container.children.length - 1] : null;
            if (trailing) break;
            await new Promise((r) => setTimeout(r, 100));
          }
          if (!trailing) return { error: 'trailing container not found' };
          const brand = container.firstElementChild;
          const brandRect = brand.getBoundingClientRect();
          const rect = trailing.getBoundingClientRect();
          return {
            viewportWidth: window.innerWidth,
            brandLeft: Math.round(brandRect.left),
            brandRight: Math.round(brandRect.right),
            trailingRight: Math.round(rect.right),
            trailingWidth: Math.round(rect.width),
            visible:
              window.innerWidth === ${width} &&
              brandRect.left >= 0 &&
              rect.right <= window.innerWidth &&
              rect.width > 0 &&
              brandRect.right <= rect.left,
          };
        })()`

        let evalResult
        const evalDeadline = Date.now() + 15000
        while (Date.now() < evalDeadline) {
          try {
            const res = await send('Runtime.evaluate', {
              expression: evalExpr,
              awaitPromise: true,
              returnByValue: true,
            })
            evalResult = res.result
            if (evalResult) break
          } catch (err) {
            if (String(err).includes('Execution context was destroyed')) {
              await new Promise((r) => setTimeout(r, 200))
              continue
            }
            throw err
          }
        }
        socket.close()
        resolve(evalResult ? evalResult.value : { error: 'evaluate timed out' })
      } catch (err) {
        reject(err)
      }
    })
    chrome.on('exit', (code) => {
      clearTimeout(failed)
      reject(new Error(`browser exited: ${code}`))
    })
  }).finally(() => {
    chrome.kill()
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch {}
  })

  return result
}

const viewports = [320, 375, 390, 800, 1024, 1280, 1440]
const failures = []

for (const w of viewports) {
  const res = await checkViewport(w, 900)
  if (res.error) {
    failures.push(`at ${w}px: ${res.error}`)
  } else if (!res.visible) {
    failures.push(
      `at ${w}px: navbar content clipped or overlapping (brand: ${res.brandLeft}-${res.brandRight}px, trailing right: ${res.trailingRight}px, viewport: ${res.viewportWidth}px)`,
    )
  }
}

server.close()

if (failures.length > 0) {
  console.error(`navbar: ${failures.length} viewport layout failure(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log(`navbar: trailing buttons fully visible across viewports (${viewports.join(', ')}px)`)
