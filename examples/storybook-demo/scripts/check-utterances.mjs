// What a screen reader would say for every story, compared against
// checked-in reading order.
//
//   node scripts/check-utterances.mjs [static-dir]           # check
//   node scripts/check-utterances.mjs [static-dir] --update  # rewrite the goldens
//
// The verification matrices in `docs/rfcs/` assumed a person listens to
// every component on every screen reader on every run, which does not scale
// and so was not done -- two of them claimed "Tested in CI" for behavior
// nothing tested. This makes the listening a one-time approval: the reading
// order of each story's initial state is written to `utterances/<story>.txt`,
// reviewed once as a diff, and from then on CI fails when it changes.
//
// The reader is `@guidepup/virtual-screen-reader`, which computes what is
// announced from the accessible-name, HTML-AAM and ARIA specifications over
// the real DOM. It is not NVDA or VoiceOver, and a golden here is not a
// claim about either: it catches a lost label, a changed role or a reordered
// page in the pull request that caused it, and leaves real screen readers to
// the matrices.
//
// In a real browser, by the same means and for the same reason as
// `check-a11y.mjs`: visibility and `display: none` decide what is read, and
// a DOM without a CSS engine has no opinion on either.

import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const update = args.includes('--update')
const STATIC = path.resolve(args.find((arg) => !arg.startsWith('--')) ?? 'storybook-static')
const GOLDENS = path.resolve(here, '..', 'utterances')

/**
 * How many steps one story may take. A reader that never reaches the end
 * of a story is a finding, not something to wait out.
 */
const MAX_STEPS = Number(
  args.find((arg) => arg.startsWith('--max-steps='))?.slice('--max-steps='.length) ?? 400,
)

/** `--only=<story-id>`: one story, for looking at what the reader does. */
const only = args.find((arg) => arg.startsWith('--only='))?.slice('--only='.length)

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
    console.error('[utterances] no browser found, and CI must run this. Set CHROME_PATH.')
    process.exit(1)
  }
  console.log('[utterances] no browser found; skipping. Set CHROME_PATH to run this locally.')
  process.exit(0)
}

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

const index = JSON.parse(readFileSync(path.join(STATIC, 'index.json'), 'utf8'))
const ids = Object.values(index.entries)
  .filter((entry) => entry.type === 'story')
  .map((entry) => entry.id)
  .filter((id) => only === undefined || id === only)
  .sort()

// The reader as one classic script, so it can be injected into each story's
// own frame: an element belongs to its document, and a reader started from
// another realm would walk nothing.
const bundle = await build({
  stdin: {
    // The walk goes in with the reader, so the rule that decides when a story
    // has ended lives in a file Node can import and test rather than inside
    // the template literal below. Both land on the frame's own window,
    // because that is where the script is injected.
    contents: [
      "import { virtual } from '@guidepup/virtual-screen-reader/browser.js'",
      "import { walk } from './utterance-walk.mjs'",
      'window.__hozoVirtual = virtual',
      'window.__hozoWalk = walk',
      '',
    ].join('\n'),
    resolveDir: here,
    sourcefile: 'virtual-screen-reader-entry.mjs',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  write: false,
  logLevel: 'silent',
})

const runner = path.join(STATIC, '__utterances.html')
const readerScript = path.join(STATIC, '__virtual-screen-reader.js')
writeFileSync(readerScript, bundle.outputFiles[0].contents)
writeFileSync(
  runner,
  `<!doctype html><body><pre id="out"></pre><iframe id="f" style="width:1200px;height:900px;border:0"></iframe>
<script>
const IDS = ${JSON.stringify(ids)}
const MAX_STEPS = ${MAX_STEPS}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
function inject(frame) {
  return new Promise((resolve, reject) => {
    const doc = frame.contentDocument
    const script = doc.createElement('script')
    script.src = '/__virtual-screen-reader.js'
    script.onload = resolve
    script.onerror = () => reject(new Error('the virtual screen reader failed to load'))
    doc.head.appendChild(script)
  })
}
async function read(frame) {
  const reader = frame.contentWindow.__hozoVirtual
  const doc = frame.contentDocument
  // The frame's own window, so names and visibility are computed in the
  // realm the story rendered in.
  await reader.start({
    container: doc.getElementById('storybook-root') || doc.body,
    window: frame.contentWindow,
  })
  // The rule for when a story has ended is in \`utterance-walk.mjs\`, tested
  // there against a fake reader. In short: stop when a node says the same
  // thing twice, because there is no closing "end of document" and the cycle
  // does not have to close where it opened -- an open \`aria-modal\` dialog
  // confines the cursor and it never returns to the start at all.
  const result = await frame.contentWindow.__hozoWalk(reader, MAX_STEPS)
  await reader.stop()
  return result
}
async function run() {
  const frame = document.getElementById('f')
  const results = {}
  for (const id of IDS) {
    frame.src = '/iframe.html?id=' + id + '&viewMode=story'
    // No backticks in here: this whole script is inside a template literal.
    await Promise.race([new Promise((r) => (frame.onload = r)), wait(5000)])
    await wait(500)
    try {
      await inject(frame)
      results[id] = await read(frame)
    } catch (error) {
      results[id] = { error: String(error && error.message || error) }
    }
  }
  return results
}
window.__hozoUtterances = run()
</script></body>`,
)

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost')
  const file = path.join(
    STATIC,
    url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname),
  )
  try {
    const body = readFileSync(file)
    response.writeHead(200, {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    })
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
  rmSync(readerScript, { force: true })
}
process.on('exit', cleanup)
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    cleanup()
    process.exit(1)
  })
}

/** One phrase per line: the form a reviewer reads, and the form a diff shows. */
const goldenPath = (id) => path.join(GOLDENS, `${id}.txt`)
const toText = (log) => `${log.join('\n')}\n`

/** Lined up under a problem, which the reporter already indents by two. */
const quoted = (text) =>
  text
    .trimEnd()
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n')

function compare(results) {
  const problems = []
  for (const id of ids) {
    const result = results[id]
    if (!result || result.error) {
      problems.push(`${id}: the reader did not run -- ${result?.error ?? 'no result'}`)
      continue
    }
    if (!result.finished) {
      const tail = result.log.slice(-12).map((phrase) => `\n      ${JSON.stringify(phrase)}`)
      problems.push(
        `${id}: did not reach the end in ${MAX_STEPS} steps; last phrases:${tail.join('')}`,
      )
      continue
    }
    const actual = toText(result.log)
    const file = goldenPath(id)
    if (update) {
      mkdirSync(GOLDENS, { recursive: true })
      writeFileSync(file, actual)
      continue
    }
    if (!existsSync(file)) {
      // The reading order itself, not just the fact that it is unapproved.
      // A golden is an approval, so the thing being approved belongs in
      // front of whoever reads the failure -- and `--update` cannot be run
      // where the failure happens, which is every CI run.
      problems.push(
        `${id}: no golden -- review this and save it as utterances/${id}.txt\n${quoted(actual)}`,
      )
      continue
    }
    const expected = readFileSync(file, 'utf8')
    if (expected !== actual) {
      const want = expected.trimEnd().split('\n')
      const got = actual.trimEnd().split('\n')
      let at = 0
      while (at < want.length && at < got.length && want[at] === got[at]) at++
      problems.push(
        `${id}: reading order changed at phrase ${at + 1}\n      expected: ${JSON.stringify(want[at])}\n      actual:   ${JSON.stringify(got[at])}`,
      )
    }
  }
  // A golden for a story that no longer exists is approval for nothing.
  // Not asked with `--only`, where every other story is simply not in the run.
  const known = new Set(ids.map((id) => `${id}.txt`))
  const stale =
    only === undefined && existsSync(GOLDENS)
      ? readdirSync(GOLDENS).filter((name) => name.endsWith('.txt') && !known.has(name))
      : []
  for (const name of stale) {
    if (update) rmSync(path.join(GOLDENS, name))
    else
      problems.push(`utterances/${name}: no story by that id -- delete it or rerun with --update`)
  }
  return problems
}

// Driven over the DevTools protocol, awaiting the page's own promise, rather
// than `--dump-dom` under a virtual time budget as `check-a11y.mjs` does.
// The reader waits on real timers between steps, and a virtual clock that
// advances only when nothing else is pending ended the page before the
// first story finished.
const profile = mkdtempSync(path.join(tmpdir(), 'hozo-utterances-'))
let chrome
function finish(code) {
  cleanup()
  chrome?.kill()
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {}
  process.exit(code)
}

server.listen(0, async () => {
  const port = server.address().port
  const pageUrl = `http://localhost:${port}/__utterances.html`
  chrome = spawn(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      pageUrl,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  const overall = setTimeout(
    () => {
      console.error('[utterances] timed out after 6 minutes')
      finish(1)
    },
    6 * 60 * 1000,
  )

  try {
    const host = await new Promise((resolve, reject) => {
      let stderr = ''
      chrome.stderr.on('data', (chunk) => {
        stderr += String(chunk)
        const match = /ws:\/\/([^/]+)\/devtools\/browser\//.exec(stderr)
        if (match) resolve(match[1])
      })
      chrome.on('exit', (code) => reject(new Error(`the browser exited: ${code}`)))
    })

    let target
    for (const deadline = Date.now() + 15_000; Date.now() < deadline && !target; ) {
      const listed = await fetch(`http://${host}/json/list`).then((response) => response.json())
      target = listed.find(
        (entry) => entry.type === 'page' && entry.url === pageUrl && entry.webSocketDebuggerUrl,
      )
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

    let evaluated
    for (const deadline = Date.now() + 30_000; Date.now() < deadline; ) {
      evaluated = await send('Runtime.evaluate', {
        expression: 'window.__hozoUtterances',
        awaitPromise: true,
        returnByValue: true,
      }).catch((error) => ({ error }))
      if (!evaluated.error && evaluated.result?.type === 'object') break
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    socket.close()
    clearTimeout(overall)
    if (evaluated?.error || evaluated?.exceptionDetails || evaluated?.result?.type !== 'object') {
      console.error(
        `[utterances] the run produced no result: ${evaluated?.error?.message ?? evaluated?.exceptionDetails?.text ?? 'the page did not finish'}`,
      )
      finish(1)
    }

    const problems = compare(evaluated.result.value)
    if (problems.length > 0) {
      console.error(`[utterances] ${problems.length} problem(s) across ${ids.length} stories:\n`)
      for (const problem of problems) console.error(`  ${problem}`)
      console.error(
        '\nIf the new reading order is right, rerun with --update and review the diff under utterances/.',
      )
      finish(1)
    }
    console.log(`[utterances] ${ids.length} stories ${update ? 'written to' : 'match'} utterances/`)
    finish(0)
  } catch (error) {
    clearTimeout(overall)
    console.error(`[utterances] the browser failed to run: ${error.message}`)
    finish(1)
  }
})
