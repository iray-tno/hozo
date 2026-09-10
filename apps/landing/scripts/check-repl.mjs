// Whether the REPL compiles anything, asked of a browser.
//
// Everything else about this page is checkable from the built HTML, and
// none of it is the thing that matters: the page ships an empty textarea
// and four empty panes, and every one of them is filled by a WebAssembly
// module that has to load, instantiate and answer. A check that reads the
// HTML would pass with the compiler missing entirely.
//
// So the page is served, driven with headless Chrome, and asked what is
// in the panes afterwards. The same arrangement `examples/storybook-demo`
// uses for axe, and for the same reason: a real browser is the only thing
// that can say whether a thing a browser has to do works.

import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The build to serve, named by the caller: `build` and `test` run
// concurrently and no longer share one directory (#322).
const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  process.argv[2] ?? 'dist',
)

if (!existsSync(path.join(dist, 'wasm', 'hozo_wasm_bg.wasm'))) {
  console.log(
    'repl: no browser binding in dist/wasm -- skipped.\n' +
      '  node scripts/build-wasm.mjs, then build again.',
  )
  process.exit(0)
}

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
  // Skipped without one and not skipped in CI, for the reason
  // `check-a11y.mjs` gives: a check that quietly does nothing where it
  // matters is not a check.
  if (process.env.CI) {
    console.error('repl: no browser found, and CI is set. Install one or unset CI.')
    process.exit(1)
  }
  console.log('repl: no browser found -- skipped.')
  process.exit(0)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  // The one that matters: `WebAssembly.instantiateStreaming` refuses
  // anything else, and the failure is a console message the page swallows.
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

const requested = []
const server = createServer((request, response) => {
  // The site is built with `base: /hozo`, so that prefix is what the page
  // asks for and what this has to answer to.
  const url = new URL(request.url ?? '/', 'http://localhost')
  const relative = url.pathname.replace(/^\/hozo/, '').replace(/^\//, '') || 'index.html'
  const file = path.join(dist, relative.endsWith('/') ? `${relative}index.html` : relative)
  requested.push(`${request.url} ${existsSync(file) ? 200 : 404}`)
  if (!existsSync(file) || !file.startsWith(dist)) {
    response.writeHead(404).end('not found')
    return
  }
  response.writeHead(200, {
    'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
  })
  response.end(readFileSync(file))
})

const cleanup = () => server.close()

server.listen(0, () => {
  const { port } = server.address()
  execFile(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      // Long enough for a 1.3MB module to be fetched and instantiated.
      '--virtual-time-budget=60000',
      '--dump-dom',
      `http://localhost:${port}/hozo/repl/`,
    ],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 3 * 60 * 1000,
      killSignal: 'SIGKILL',
    },
    (error, dom) => {
      cleanup()
      if (error && !dom) {
        console.error(`repl: the browser failed: ${error.message}`)
        process.exit(1)
      }

      const paneText = (id) => {
        const match = new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</pre>`).exec(dom)
        // Strip syntax highlighting spans so assertions check decoded text content
        return match ? match[1].replace(/<[^>]+>/g, '').trim() : ''
      }

      const failures = []

      // The example in the page is a `View` with a `Pressable` in it, so
      // each of these is something only the compiler could have written.
      const web = paneText('repl-web-jsx')
      if (!web.includes('&lt;div')) failures.push('the Web pane has no lowered element')
      const css = paneText('repl-web-css')
      if (!css.includes('padding')) failures.push('the CSS pane has no rule from a class')
      const native = paneText('repl-native-jsx')
      if (!native.includes('&lt;View')) failures.push('the Native pane has no lowered element')
      const styles = paneText('repl-native-styles')
      if (!styles.includes('StyleSheet.create')) failures.push('the StyleSheet pane is empty')

      // And the diagnostics, which are the reason to have this page at
      // all: the example presses without a role, which is a warning.
      const diagnostics = /id="repl-diagnostics"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/.exec(dom)
      if (!diagnostics?.[1].includes('A11Y_INTERACTIVE_WITHOUT_ROLE')) {
        failures.push('the diagnostic the example produces was not reported')
      }

      if (failures.length > 0) {
        console.error(`repl: ${failures.length} problem(s)`)
        for (const failure of failures) console.error(`  - ${failure}`)
        // What the page itself said, and what it asked for. Without these
        // a failure here is indistinguishable from a page that never ran.
        const said = /id="repl-status"[^>]*>([^<]*)</.exec(dom)
        console.error(`  page status: ${said ? said[1] : '(no status element)'}`)
        for (const line of requested) console.error(`  requested: ${line}`)
        process.exit(1)
      }
      console.log('repl: compiles in a browser, four panes and the diagnostic')
    },
  )
})
