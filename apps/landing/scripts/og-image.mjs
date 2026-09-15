// Renders the Open Graph card: scripts/og-image.html -> public/og-image.png.
//
//   node scripts/og-image.mjs
//
// A committed PNG rather than an image generated on every build. Link
// previews need a raster image -- no major platform renders SVG there -- and
// rasterizing at build time would mean a font pipeline and a renderer as
// build dependencies for a picture that changes when the hero copy does.
// The card is the hero drawn by the browser the site is designed in, with
// the site's own fonts, so it is rendered the same way: headless Chrome over
// the DevTools protocol, like `check-navbar.mjs`.
//
// Needs network access for Google Fonts, and checks that the font actually
// loaded before capturing -- a card silently rendered in a fallback face is
// the failure worth refusing.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WIDTH = 1200
const HEIGHT = 630

const here = path.dirname(fileURLToPath(import.meta.url))
const template = pathToFileURL(path.join(here, 'og-image.html')).href
const output = path.join(here, '..', 'public', 'og-image.png')

const browser = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((candidate) => candidate && existsSync(candidate))
if (!browser) {
  console.error('og-image: no Chrome found; set CHROME_PATH')
  process.exit(1)
}

const profile = mkdtempSync(path.join(tmpdir(), 'hozo-og-image-'))
const chrome = spawn(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
)

try {
  const host = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout waiting for Chrome')), 30_000)
    let stderr = ''
    chrome.stderr.on('data', (chunk) => {
      stderr += String(chunk)
      const match = /ws:\/\/([^/]+)\/devtools\/browser\//.exec(stderr)
      if (!match) return
      clearTimeout(timeout)
      resolve(match[1])
    })
    chrome.on('exit', (code) => reject(new Error(`Chrome exited: ${code}`)))
  })

  let target
  for (const deadline = Date.now() + 10_000; Date.now() < deadline && !target; ) {
    const listed = await fetch(`http://${host}/json/list`).then((response) => response.json())
    target = listed.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
    if (!target) await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (!target) throw new Error('no page target')

  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let nextId = 1
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      const onMessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.id !== id) return
        socket.removeEventListener('message', onMessage)
        if (message.error) reject(new Error(message.error.message))
        else resolve(message.result)
      }
      socket.addEventListener('message', onMessage)
      socket.send(JSON.stringify({ id, method, params }))
    })

  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Page.enable')
  await send('Page.navigate', { url: template })

  const { result } = await send('Runtime.evaluate', {
    expression: `(async () => {
      for (const start = Date.now(); document.readyState !== 'complete' && Date.now() - start < 15000; ) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      await document.fonts.ready
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const heading = document.querySelector('h1')
      return (
        document.fonts.check('800 66px "Plus Jakarta Sans"') &&
        // Each line of the headline on one line: a wrap reads as a broken card.
        heading.getClientRects().length > 0 &&
        heading.getBoundingClientRect().height < 66 * 1.12 * 2 + 4
      )
    })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.value !== true) {
    throw new Error(
      'Plus Jakarta Sans did not load, or the headline wrapped; refusing to capture a broken card',
    )
  }

  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
  })
  writeFileSync(output, Buffer.from(data, 'base64'))
  socket.close()
  console.log(`wrote ${path.relative(process.cwd(), output)} (${WIDTH}x${HEIGHT})`)
} finally {
  chrome.kill()
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {}
}
