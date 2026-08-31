// Runs axe over every built story, in a real browser, and fails on a
// violation.
//
// The catalogue is what `apps/landing` links to, and it is an
// accessibility-first project's shop window. It had never been checked:
// `packages/tailwind-conformance` compares Hozo's ARIA against
// `aria-query`'s tables and renders to static markup, so it can say which
// role an element should carry and cannot say whether the page a person
// lands on passes. The first run found five violations across four
// stories, including a scroll container no keyboard could reach (#99).
//
// A browser rather than jsdom, because three of the five were about
// computed colour and one was about focusability -- none of which a DOM
// without a CSS engine has an opinion on.
//
// Skipped rather than failed when no browser is present. That is a
// deliberate hole and a narrow one: CI installs one, and the alternative
// is a check nobody can run locally on a machine without Chrome.

import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const STATIC = path.resolve('storybook-static')

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
  // Skipped on a machine without one, and *not* skipped in CI. A check
  // that quietly does nothing where it matters is the failure this
  // repository keeps finding in its own measurements, and it would be a
  // poor thing to build one on purpose.
  if (process.env.CI) {
    console.error('[a11y] no browser found, and CI must run this. Set CHROME_PATH.')
    process.exit(1)
  }
  console.log('[a11y] no browser found; skipping. Set CHROME_PATH to run this locally.')
  process.exit(0)
}

const axe = path.join(
  path.dirname(fileURLToPath(import.meta.resolve('axe-core/package.json'))),
  'axe.min.js',
)

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

/**
 * Violations that are open bugs rather than regressions, by rule.
 *
 * Each entry is a suppression, and a suppression that outlives its reason
 * is worse than no check at all -- so this list is checked in both
 * directions. A rule here that stops firing fails the run and asks to be
 * deleted, the same way the conformance snapshot refuses to accept a
 * silent improvement.
 *
 * Not per story or per selector on purpose: those move when a story is
 * edited, and a suppression that needs updating whenever the catalogue
 * changes is one nobody will keep honest.
 */
const KNOWN = {}

const index = JSON.parse(readFileSync(path.join(STATIC, 'index.json'), 'utf8'))
const ids = Object.values(index.entries)
  .filter((entry) => entry.type === 'story')
  .map((entry) => entry.id)

// Written into the static build rather than served from memory so the page
// and the stories share an origin -- axe has to be injected *into* each
// story's frame, because an element belongs to its own document and
// `axe.run` refuses one from another.
const runner = path.join(STATIC, '__a11y.html')
writeFileSync(
  runner,
  `<!doctype html><body><pre id="out"></pre><iframe id="f" style="width:1200px;height:900px;border:0"></iframe>
<script>
const IDS = ${JSON.stringify(ids)}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
function injectAxe(frame) {
  return new Promise((resolve, reject) => {
    const doc = frame.contentDocument
    const script = doc.createElement('script')
    script.src = '/__axe.js'
    script.onload = resolve
    script.onerror = () => reject(new Error('axe failed to load'))
    doc.head.appendChild(script)
  })
}
async function run() {
  const frame = document.getElementById('f')
  const found = []
  for (const id of IDS) {
    frame.src = '/iframe.html?id=' + id + '&viewMode=story'
    // Raced against a timeout: a frame that never fires its load event
    // would otherwise wait for ever, and with no timer pending Chrome's
    // virtual clock does not advance either -- so the whole run hangs
    // rather than reporting the one story that stalled. No backticks in
    // here: this whole script is inside a template literal.
    await Promise.race([new Promise((r) => (frame.onload = r)), wait(5000)])
    await wait(500)
    try {
      await injectAxe(frame)
      const doc = frame.contentDocument
      const result = await frame.contentWindow.axe.run(
        doc.getElementById('storybook-root') || doc.body,
        { resultTypes: ['violations'] },
      )
      for (const v of result.violations) {
        for (const node of v.nodes) {
          found.push({ id, impact: v.impact, rule: v.id, target: node.target.join(' '), help: v.help })
        }
      }
    } catch (error) {
      found.push({ id, impact: 'error', rule: 'axe', target: '', help: error.message })
    }
  }
  document.getElementById('out').textContent = 'HOZO_A11Y ' + JSON.stringify({ stories: IDS.length, found })
}
run()
</script></body>`,
)
writeFileSync(path.join(STATIC, '__axe.js'), readFileSync(axe))

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost')
  const file = path.join(STATIC, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname))
  try {
    const body = readFileSync(file)
    response.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
    response.end(body)
  } catch {
    response.writeHead(404)
    response.end('not found')
  }
})

let cleaned = false
function cleanup() {
  if (cleaned) return
  cleaned = true
  server.close()
  rmSync(runner, { force: true })
  rmSync(path.join(STATIC, '__axe.js'), { force: true })
}

// Also on the way out, however that happens. Calling it only on the paths
// this script expects left a listening server and two files behind every
// time an outer `timeout` killed a slow run -- which is exactly when a
// browser is misbehaving and someone is most likely to run it again.
process.on('exit', cleanup)
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    cleanup()
    process.exit(1)
  })
}

// Port 0: the OS picks a free one. A fixed port collides with a stale
// run on a developer's machine and with a parallel job in CI, and the
// failure reads as EADDRINUSE rather than as anything about the page.
server.listen(0, () => {
  const port = server.address().port
  // `execFile` and not `execFileSync`: the server is in this process, and
  // a synchronous child blocks the event loop -- so nothing answers the
  // browser's request, the page never loads, and the run times out with
  // no clue as to why. It looked like a browser problem for a while.
  execFile(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--virtual-time-budget=120000',
      '--dump-dom',
      `http://localhost:${port}/__a11y.html`,
    ],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      // Its own bound, rather than relying on whatever runs it to have
      // one. Without this a browser that never exits hangs the job until
      // something outside kills the whole process -- which takes the
      // cleanup with it and leaves a listening server behind.
      timeout: 4 * 60 * 1000,
      killSignal: 'SIGKILL',
    },
    (error, dom) => {
      cleanup()
      if (error) {
        console.error(`[a11y] the browser failed to run: ${error.message}`)
        process.exit(1)
      }

      const match = /HOZO_A11Y (\{[\s\S]*?\})<\/pre>/.exec(dom)
      if (!match) {
        // Silence here means the run did not finish, and reporting "no
        // violations" would be the worst possible reading of that.
        console.error('[a11y] the run produced no result; the page did not finish')
        process.exit(1)
      }
      const { stories, found } = JSON.parse(match[1])
      const fresh = found.filter((violation) => !(violation.rule in KNOWN))
      const seen = new Set(found.map((violation) => violation.rule))

      // A rule nobody breaks any more is a line to delete, and saying so is
      // the only thing that stops this list growing forever.
      const stale = Object.entries(KNOWN).filter(([rule]) => !seen.has(rule))
      if (stale.length > 0) {
        console.error('[a11y] these are no longer violated and should leave KNOWN:\n')
        for (const [rule, issue] of stale) console.error(`  ${rule}  (#${issue})`)
        process.exit(1)
      }

      if (fresh.length === 0) {
        const held = found.length
        console.log(
          `[a11y] ${stories} stories, no new violations` +
            (held > 0 ? ` (${held} held against ${Object.values(KNOWN).map((n) => '#' + n).join(', ')})` : ''),
        )
        return
      }
      console.error(`[a11y] ${fresh.length} violation(s) across ${stories} stories:\n`)
      for (const violation of fresh) {
        console.error(
          `  ${violation.id}\n    ${violation.impact} ${violation.rule} on ${violation.target}` +
            `\n    ${violation.help}`,
        )
      }
      process.exit(1)
    },
  )
})
