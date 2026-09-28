// Which way of driving a grid a real reader actually announces.
//
// A measurement, not a test. It drives one grid several ways in a single pass
// and prints what each produced beside the page's own `document.activeElement`,
// because that pairing is what separates "focus did not move" from "focus moved
// and nothing was said". Delete it once `scenarios.spec.ts` is driving the grid
// the way this says to.
//
// Three wrong diagnoses were shipped for one symptom in this suite already
// (#580, #592, then the measurement in #598 that found `navigateToWebContent`
// sending an Escape), which is why a question here costs a run rather than a
// guess.
//
// ## What it has established so far
//
// **Run 36359016412.** A focus change is not announced whoever caused it.
// Focusing a cell over CDP moved focus and said nothing; an arrow key over CDP
// moved focus and said nothing; the same arrow as a real keystroke was
// announced by VoiceOver, and by NVDA was answered with "1" -- browse mode
// reading the next character of "11" -- with focus not moving at all. So the
// keys have to be real, and NVDA needs focus mode.
//
// **Run 36359768038.** Tab is not the way in. On NVDA it announced
// "form-date-and-time--month-grid - Google Chrome for Testing, region" and then
// "list, Open Tabs": focus left the document for Chrome's tab search, which is
// the failure `enterPage` documents for `navigateToWebContent` and the reason
// that function is not used here. On VoiceOver it said nothing at all, which is
// what Safari does when "press Tab to highlight each item" is off.
//
// ## What it is asking now
//
// Whether a CDP focus (silent, but it does move focus) followed by real arrow
// keys announces the cell it lands on, or the one it came from. One reading
// from the first run is consistent with both: after an arrow, VoiceOver said
// "Friday, September 11, 2026" while focus had already reached the 12th. That
// is either a cursor catching up with a move it had missed, or an announcement
// that lags by one -- and the difference decides whether every approved phrase
// in `scenarios.spec.ts` would be off by one.
//
// Four arrows in a row answer it: if what is said tracks where focus is, the
// first reading was a stale cursor catching up; if it trails by one the whole
// way, the design has to change.
//
// PageDown is in the sequence for a smaller reason: `press` resolves a key by
// name through Guidepup's table, and whether that table has this one is worth
// knowing before a scenario depends on it.

import { screenReaderTest as test } from '@guidepup/playwright'
import type { Page } from '@playwright/test'

import {
  enterFocusMode,
  enterPage,
  meaningful,
  onWindows,
  reader,
  spokenAfter,
  startOptions,
} from './reader.ts'

const STORY = 'form-date-and-time--month-grid'

/** The focused element, named the way the reader would name it. */
async function focusedNow(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const node = document.activeElement
    if (node === null) return '(none)'
    const name = node.getAttribute('aria-label') ?? node.textContent?.trim().slice(0, 40) ?? ''
    return `${node.tagName.toLowerCase()}[role=${node.getAttribute('role') ?? '-'}] "${name}"`
  })
}

test.use({ screenReaderStartOptions: startOptions })

test('what a grid announces, and to which way of driving it', async ({ page, screenReader }) => {
  await page.goto(`/iframe.html?id=${STORY}&viewMode=story`, { waitUntil: 'load' })
  await page.locator('#storybook-root > *').first().waitFor()
  await enterPage(page, screenReader)

  const entry = page.locator('[role="gridcell"][tabindex="0"]')
  await entry.waitFor()

  const report: string[] = []
  const probe = async (what: string, act: () => Promise<void>) => {
    let said: string[] = []
    let failed = ''
    try {
      said = await spokenAfter(screenReader, act)
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error)
    }
    report.push(
      `  ${what}\n    said:  ${said.length > 0 ? JSON.stringify(said) : '(nothing)'}\n    focus: ${await focusedNow(page)}${failed === '' ? '' : `\n    threw: ${failed}`}`,
    )
  }

  // Silent, and known to be. It is here to put focus somewhere known, which is
  // the one thing CDP is good for: the September grid opens on the 10th.
  await probe('A  entry.focus() over CDP', () => entry.focus())

  // NVDA's arrows belong to the virtual buffer until this is sent.
  if (onWindows) await probe('B  NVDA-Space, into focus mode', () => enterFocusMode(screenReader))

  // The question. Four moves, each printed against where focus actually is.
  await probe('C1 press ArrowRight  (expect the 11th)', () => screenReader.press('ArrowRight'))
  await probe('C2 press ArrowRight  (expect the 12th)', () => screenReader.press('ArrowRight'))
  await probe('C3 press ArrowDown   (expect the 19th)', () => screenReader.press('ArrowDown'))
  await probe('C4 press ArrowLeft   (expect the 18th)', () => screenReader.press('ArrowLeft'))

  // Does Guidepup's key table have this name, and does the grid page on it?
  await probe('D  press PageDown    (expect October)', () => screenReader.press('PageDown'))

  // The control: the reader's own command, which every other spec uses. A run
  // where this says nothing is a broken run and nothing above it means anything.
  await probe('E  screenReader.next()', () => screenReader.next())

  console.log(`[probe] ${reader} on ${STORY}\n${report.join('\n')}`)

  const control = meaningful(await screenReader.spokenPhraseLog())
  if (control.length === 0) {
    throw new Error(
      `${reader} said nothing to any way of driving the page, its own next() included, so this run read nothing at all`,
    )
  }
})
