// Measures what every other check here is blind to: how big a control is, and
// whether anything happens when it takes focus.
//
// The three checks beside this one read three things that are not the page as
// drawn. `check-a11y.mjs` runs axe over the accessibility tree.
// `check-utterances.mjs` reads what a screen reader says. `tokens.test.ts` in
// `@hozo/ui` reads class lists out of the source. A pseudo-element is in none
// of those by design, and neither is a bounding box.
//
// So appearance has been unchecked, and it has cost three bugs in one week --
// all three found by hand, one of them shipped twice:
//
//   * `Switch`'s knob was a flex child after the label, 96px from the track it
//     belonged in (#677).
//   * `Accordion`'s chevron pointed right when closed and opened to the left,
//     while the comment above it said down and up (#674).
//   * Every `data-[x=y]` rule in the project emitted no CSS at all, so three
//     components' states were absent from the output (#676, #679).
//
// Each was found by opening a browser and reading `getComputedStyle` or a
// rectangle. That is thirty lines of harness, so here it is as a check.
//
// ## What it asks
//
// **Target size, WCAG 2.5.8.** Every pointer target is at least 24 by 24 CSS
// pixels. The exceptions are real and two of them are implemented: a target
// whose size is set by the line it sits in (*Inline*), and one the user agent
// draws (*User agent control*). The other three -- *Spacing*, *Equivalent* and
// *Essential* -- are judgements rather than measurements, so they are entries
// in `KNOWN` with a reason instead of a rule here.
//
// **An explicit focus indicator**, which is this repository's rule and not
// WCAG's. Every focusable element is matched by a `:focus`, `:focus-visible` or
// ancestor `:focus-within` rule in the built stylesheets that changes an
// outline, a ring or a shadow.
//
// The distinction is worth being exact about, because the first version of this
// check was labelled 2.4.7 and that was wrong. Chrome's own stylesheet draws a
// ring for `:focus-visible`, and nothing here removes it globally -- so an
// element with no rule of its own is AA-conformant. What it is not is
// *designed*: the browser's ring is whatever the browser has, over whatever
// background the page put under it. `@hozo/ui` holds itself to the stricter rule
// already (`tokens.test.ts`: a class list that styles hover carries the ring),
// and this asks the catalogue the same question.
//
// The genuine 2.4.7 failure is narrower -- removing the user-agent ring and
// replacing it with nothing. `focus:outline-none` beside a `box-shadow` is a
// replacement and passes, which is why plain `:focus` counts and why a shadow
// counts as drawing.
//
// Read out of `document.styleSheets` and tested with `element.matches`, rather
// than by focusing the element and diffing its computed style: `.focus()` sets
// `:focus-visible` on a text input and not on a button, and `{ focusVisible:
// true }` did not change that in a headless frame -- both measured. A check
// resting on that heuristic would be measuring Chrome rather than the page.
//
// Both questions are asked of the page a visitor gets, which is the half the
// source-level rules in `@hozo/ui` cannot reach: a class list can carry
// `focus-visible:outline-hozo-focus` and still emit nothing, which is exactly
// what #679 was.

import { execFile } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'

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

const browser = BROWSERS.find((candidate) => existsSync(candidate))
if (!browser) {
  // Skipped without one, and never in CI -- the same bargain `check-a11y.mjs`
  // makes, for the same reason: a check that quietly does nothing where it
  // matters is the failure this repository keeps finding in its own
  // measurements.
  if (process.env.CI) {
    console.error('[appearance] no browser found, and CI must run this. Set CHROME_PATH.')
    process.exit(1)
  }
  console.log('[appearance] no browser found; skipping. Set CHROME_PATH to run this locally.')
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

/**
 * Findings that are open decisions rather than regressions, by `story/rule`.
 *
 * Checked in both directions like `check-a11y.mjs`'s list: an entry that stops
 * firing fails the run and asks to be deleted. Each one says which WCAG
 * exception it is claiming, because "it looks fine" is not one of them.
 *
 * Empty, and it has been empty since the day it was needed. The first run held
 * 130 (#685), the catalogue's own class lists fixed 129 of them (#692), and the
 * last one was a control `@hozo/three` clipped to nothing with no prop to reach
 * it -- which is now revealed when focus arrives (#689).
 */
const KNOWN = {}

const index = JSON.parse(readFileSync(path.join(STATIC, 'index.json'), 'utf8'))
const ids = Object.values(index.entries)
  .filter((entry) => entry.type === 'story')
  .map((entry) => entry.id)

const runner = path.join(STATIC, '__appearance.html')
writeFileSync(
  runner,
  `<!doctype html><body><pre id="out"></pre><iframe id="f" style="width:1200px;height:900px;border:0"></iframe>
<script>
const IDS = ${JSON.stringify(ids)}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// Roles a pointer activates. A container that merely holds them -- a tablist,
// a toolbar, a group -- is not a target, and neither is text.
const TARGETS = 'a[href], button, input, select, textarea, summary, [role=button],'
  + ' [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab],'
  + ' [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=option],'
  + ' [role=treeitem], [role=gridcell], [role=slider], [role=spinbutton]'

/** Every :focus-visible selector in the page, with what it changes. */
function focusRules(doc) {
  const found = []
  for (const sheet of doc.styleSheets) {
    let rules
    try { rules = sheet.cssRules } catch { continue }
    for (const rule of rules) collect(rule, found)
  }
  return found
}

// A style rule can have children *and* a selector: Chrome supports CSS
// nesting, so \`CSSStyleRule.cssRules\` exists and is empty for a plain rule.
// Treating anything with \`cssRules\` as a container walked past every rule in
// the page -- 13 counted out of 613 -- and reported 151 elements with no focus
// ring, in a build whose CSS was fine. Selector first, then descend.
function collect(rule, found) {
  if (rule.cssRules && rule.cssRules.length > 0) {
    for (const inner of rule.cssRules) collect(inner, found)
  }
  // \`:focus-within\` counts, and on an ancestor. WCAG 2.4.7 asks for a visible
  // indicator when a component has focus, not for it to be painted on the
  // focused node -- \`@hozo/form\`'s spinbutton takes no class of its own, so
  // \`@hozo/ui\` rings the field around it, and a check that refused that would
  // be demanding the wrong fix.
  const within = rule.selectorText?.includes(':focus-within')
  // Plain \`:focus\` counts too. A story that writes \`focus:outline-none\` with a
  // box-shadow beside it has *replaced* the browser's ring rather than removed
  // it, and the first version of this check called that a missing indicator --
  // for three text inputs whose ring was right there in the stylesheet.
  if (!rule.selectorText?.includes(':focus')) return
  const style = rule.style
  // A rule that matches and changes nothing is not an indicator. Outline,
  // box-shadow and ring are the three ways this project draws one.
  const draws = ['outline', 'outline-width', 'outline-color', 'outline-style', 'box-shadow']
    .some((property) => style.getPropertyValue(property) !== '')
  if (!draws) return
  // The subject, with the pseudo-class removed so \`matches\` can be asked
  // about an element that is not focused right now. A \`:focus-within\` rule is
  // recorded as matching an ancestor rather than the element itself.
  // The long spellings first, or \`:focus-visible\` loses its \`:focus\` and leaves
  // \`-visible\` behind -- a selector that matches nothing, which read as "these
  // elements have no ring" while the rule drawing theirs was in the same sheet.
  found.push({
    selector: rule.selectorText
      .replaceAll(':focus-visible', '')
      .replaceAll(':focus-within', '')
      .replaceAll(':focus', ''),
    ancestor: Boolean(within),
  })
}

/** Whether the element's size is decided by the line of text it sits in. */
function inline(el, view) {
  const display = view.getComputedStyle(el).display
  if (display !== 'inline') return false
  // An inline element inside a block of text is the WCAG *Inline* exception.
  // One that is the only thing in its container is not in a sentence, it just
  // has no display set.
  const parent = el.parentElement
  if (!parent) return false
  return parent.textContent.trim().length > el.textContent.trim().length
}

async function run() {
  const frame = document.getElementById('f')
  const found = []
  for (const id of IDS) {
    frame.src = '/iframe.html?id=' + id + '&viewMode=story'
    await Promise.race([new Promise((r) => (frame.onload = r)), wait(5000)])
    await wait(500)
    try {
      const doc = frame.contentDocument
      const view = frame.contentWindow
      const root = doc.getElementById('storybook-root') || doc.body
      const rings = focusRules(doc)
      // The check's own premise, asserted per story. A page with no
      // \`:focus-visible\` rule at all is a check that has stopped reading the
      // stylesheets -- which is how the first version of this failed, silently
      // and in the direction of reporting 151 problems that were not there.
      if (rings.length === 0) {
        found.push({ id, rule: 'no-rules-read', where: '', name: '',
          detail: 'the page has no :focus-visible rule; the check cannot be trusted here' })
        continue
      }
      for (const el of root.querySelectorAll(TARGETS)) {
        const box = el.getBoundingClientRect()
        // Hidden is not undersized: a closed dialog's buttons are 0x0 and are
        // nobody's target until it opens.
        if (box.width === 0 && box.height === 0) continue
        const name = (el.getAttribute('aria-label') || el.textContent || el.tagName)
          .trim().slice(0, 40)
        const where = el.tagName.toLowerCase() + (el.getAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : '')
        if ((box.width < 24 || box.height < 24) && !inline(el, view)) {
          found.push({ id, rule: 'target-size', where, name,
            detail: Math.round(box.width) + 'x' + Math.round(box.height) })
        }
        // Focus: only elements that can take it.
        const focusable = el.tabIndex >= 0 && !el.disabled
        const ringed = rings.some((ring) => {
          try {
            if (el.matches(ring.selector)) return true
            return ring.ancestor && el.closest(ring.selector) !== null
          } catch { return false }
        })
        if (focusable && !ringed) {
          found.push({ id, rule: 'focus-visible', where, name, detail: 'no rule draws one' })
        }
      }
    } catch (error) {
      found.push({ id, rule: 'error', where: '', name: '', detail: error.message })
    }
  }
  document.getElementById('out').textContent = 'HOZO_APPEARANCE ' + JSON.stringify({ stories: IDS.length, found })
}
run()
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
}
process.on('exit', cleanup)
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    cleanup()
    process.exit(1)
  })
}

server.listen(0, () => {
  const port = server.address().port
  execFile(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      // Light, because geometry does not change with the scheme and a focus
      // *rule* exists in both. `check-a11y.mjs` is the one that has to ask
      // twice, because contrast does change.
      '--blink-settings=preferredColorScheme=1',
      '--virtual-time-budget=120000',
      '--dump-dom',
      `http://localhost:${port}/__appearance.html`,
    ],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 4 * 60 * 1000,
      killSignal: 'SIGKILL',
    },
    (error, dom) => {
      cleanup()
      if (error) {
        console.error(`[appearance] the browser failed to run: ${error.message}`)
        process.exit(1)
      }
      const match = /HOZO_APPEARANCE (\{[\s\S]*?\})<\/pre>/.exec(dom)
      if (!match) {
        console.error('[appearance] the run produced no result; the page did not finish')
        process.exit(1)
      }
      const { stories, found } = JSON.parse(match[1])
      const key = (finding) => `${finding.id}/${finding.rule}`
      const fresh = found.filter((finding) => !(key(finding) in KNOWN))
      const seen = new Set(found.map(key))

      const stale = Object.entries(KNOWN).filter(([entry]) => !seen.has(entry))
      if (stale.length > 0) {
        console.error('[appearance] these no longer fire and should leave KNOWN:\n')
        for (const [entry, why] of stale) console.error(`  ${entry}  (${why})`)
        process.exit(1)
      }

      if (fresh.length === 0) {
        const held = found.length
        console.log(
          `[appearance] ${stories} stories, every target 24px and every focusable element has a ring` +
            (held > 0 ? ` (${held} held in KNOWN)` : ''),
        )
        return
      }
      console.error(`[appearance] ${fresh.length} finding(s) across ${stories} stories:\n`)
      for (const finding of fresh) {
        console.error(
          `  ${finding.id}\n    ${finding.rule} on ${finding.where} "${finding.name}"` +
            `\n    ${finding.detail}`,
        )
      }
      process.exit(1)
    },
  )
})
