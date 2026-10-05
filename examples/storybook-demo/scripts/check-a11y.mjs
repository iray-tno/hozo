// Runs axe over every built story, in a real browser, and fails on a violation.
//
// The catalogue is what `apps/landing` links to, and it is an accessibility-first
// project's shop window. `tailwind-conformance` compares ARIA against aria-query
// and static markup; it cannot say whether the page a person lands on passes.
// The first browser run found five violations across four stories, including
// a scroll container no keyboard could reach (#99).
//
// A browser rather than jsdom: computed colour and focusability require CSS.
// Skipped locally when no browser is present, never in CI. CI installs one.
//
// Twice, once per colour scheme. Before #666 this audited only dark mode without
// knowing it. Paired UI tokens make that two different renders, either of which
// can fail. Emulate each scheme explicitly, then check what the page received.
//
// The old dump-dom driver advanced a virtual 500ms before each audit, while CSS
// entrance transitions could still be running on the compositor's clock. Main
// runs 37292962904/37293214307 failed on different open panels; the local repeat
// measured intermediate blended colours rather than the theme's final colours.
// Use real time and bounded render/font/finite-animation readiness, not a bigger
// guessed delay. All rules and both schemes remain enabled; no retries.

import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { auditPage } from './a11y-audit.mjs'

const STATIC = path.resolve(process.argv[2] ?? 'storybook-static')
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
const executablePath = BROWSERS.find((candidate) => existsSync(candidate))
if (!executablePath) {
  if (process.env.CI) {
    console.error('[a11y] no browser found, and CI must run this. Set CHROME_PATH.')
    process.exit(1)
  }
  console.log('[a11y] no browser found; skipping. Set CHROME_PATH to run this locally.')
  process.exit(0)
}
const axeSource = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.resolve('axe-core/package.json'))),
    'axe.min.js',
  ),
  'utf8',
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
 * A suppression that outlives its reason is worse than no check, so this is
 * checked in both directions: a rule that stops firing must leave the list.
 * Not per story or selector: those move as the catalogue changes.
 */
const KNOWN = {}
const index = JSON.parse(readFileSync(path.join(STATIC, 'index.json'), 'utf8'))
const ids = Object.values(index.entries)
  .filter((entry) => entry.type === 'story')
  .map((entry) => entry.id)
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
let browser
async function cleanup() {
  await browser?.close()
  server.close()
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, async () => {
    await cleanup()
    process.exit(1)
  })
}
const found = []
const schemes = ['light', 'dark']
// Port 0 avoids stale-run/parallel-run collisions. Never block this event loop
// with a synchronous browser child: the same process serves its requests.
await new Promise((resolve) => server.listen(0, resolve))
let watchdog
try {
  watchdog = setTimeout(
    async () => {
      console.error('[a11y] browser audit exceeded its four-minute wall-clock bound')
      await cleanup()
      process.exit(1)
    },
    4 * 60 * 1000,
  )
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  })
  for (const scheme of schemes) {
    const page = await browser.newPage({
      colorScheme: scheme,
      viewport: { width: 1200, height: 900 },
    })
    page.setDefaultTimeout(10000)
    for (const id of ids) {
      const errors = []
      const onError = (error) => errors.push(error.message)
      page.on('pageerror', onError)
      try {
        await page.goto(
          `http://localhost:${server.address().port}/iframe.html?id=${id}&viewMode=story`,
        )
        const result = await auditPage(page, axeSource)
        if (result.dark !== (scheme === 'dark'))
          throw new Error(`asked for ${scheme}, page reports the opposite scheme`)
        if (errors.length) throw new Error(errors.join('\n'))
        found.push(...result.found.map((violation) => ({ ...violation, id, scheme })))
      } catch (error) {
        // Retain failures with their exact story and scheme, not a silent
        // empty result or a retry that can turn a missing render green.
        found.push({ id, scheme, impact: 'error', rule: 'axe', target: '', help: error.message })
      } finally {
        page.off('pageerror', onError)
      }
    }
    await page.close()
  }
} finally {
  clearTimeout(watchdog)
  await cleanup()
}
const fresh = found.filter((violation) => !(violation.rule in KNOWN))
const seen = new Set(found.map((violation) => violation.rule))
const stale = Object.entries(KNOWN).filter(([rule]) => !seen.has(rule))
if (stale.length) {
  console.error('[a11y] these are no longer violated and should leave KNOWN:\n')
  for (const [rule, issue] of stale) console.error(`  ${rule}  (#${issue})`)
  process.exit(1)
}
if (!fresh.length) {
  console.log(
    `[a11y] ${ids.length} stories in ${schemes.join(' and ')}, no new violations` +
      (found.length
        ? ` (${found.length} held against ${Object.values(KNOWN)
            .map((n) => `#${n}`)
            .join(', ')})`
        : ''),
  )
} else {
  console.error(
    `[a11y] ${fresh.length} violation(s) across ${ids.length} stories in ${schemes.join(' and ')}:\n`,
  )
  for (const violation of fresh) {
    console.error(
      `  ${violation.id} (${violation.scheme})\n` +
        `    ${violation.impact} ${violation.rule} on ${violation.target}\n` +
        `    ${violation.help}\n    ${violation.details ?? ''}`,
    )
  }
  process.exit(1)
}
