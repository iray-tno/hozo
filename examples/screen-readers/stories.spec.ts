// What NVDA and VoiceOver actually say for the Storybook patterns.
//
// `examples/storybook-demo/utterances/` holds a virtual screen reader's
// reading order, checked on every pull request. It computes announcements
// from the specifications; it is not a screen reader. This is: Guidepup
// drives NVDA on Windows and VoiceOver on macOS against a headed browser,
// weekly and on demand, and records what they speak.
//
// Real output is not stable enough to compare whole. Phrase boundaries move
// with timing, and a screen reader update rewords things. So the approved
// form is a subset: `expected/<reader>/<story>.txt` lists the phrases a
// person has confirmed must be said, one per line, and the check is that
// they appear in that order. Everything the reader said is written to
// `test-results/phrases/<reader>/<story>.json` and a screen recording to
// `test-results/recordings/`, both uploaded as CI artifacts and never
// committed -- that is the material a person approves from.
//
// A story with no approved phrases yet is reported, not failed: approval is
// a human step, and a missing one should not turn the week red.
//
// ## What this suite does not cover, said here so it is not inferred
//
// **An overlay open at load is closed before NVDA reads it.** Entry sends an
// Escape -- `layerState` in `reader.ts` measured it -- so every story that opens
// a dialog or a popover at load is read in its closed state on Windows. The
// trigger reads `collapsed` and the panel is not there, which is NVDA reporting
// a page the story was knocked out of rather than failing to enter one (#580).
//
// So for those stories `expected/nvda/` can hold the trigger and nothing else,
// and its absence is a gap rather than a pass. VoiceOver takes `enterPage`'s
// early return -- it moves its own cursor, no click and no Escape -- so it
// reads the overlay and its approved file is much longer. **The two readers'
// approved files are not comparable in size, and the difference is the harness
// rather than the readers.**
//
// And an approved file cannot say how much of a story was read, which is the
// same gap one level up: a walk that stops a third of the way in is approved
// in the same shape as one that finished (#585).
//
// Patterns first: their expected announcements are defined by the WAI-ARIA
// Authoring Practices, which is what makes approving them possible.
//
// And three `@hozo/form` stories by name, which is the other half of the rule
// and the reason it is a list rather than a second prefix. See `EXTRA` below.
//
// How a reader is started, entered into a page and stepped across it lives in
// `reader.ts`, which `tree-shape.spec.ts` shares.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { screenReaderTest as test } from '@guidepup/playwright'

import {
  enterPage,
  here,
  MIN_SPOKEN,
  phrasesDir,
  reader,
  startOptions,
  startRecording,
  walk,
} from './reader.ts'

const storybook = path.resolve(here, '..', 'storybook-demo', 'storybook-static-check')
const expectedDir = path.join(here, 'expected', reader)

const index = JSON.parse(readFileSync(path.join(storybook, 'index.json'), 'utf8')) as {
  entries: Record<string, { id: string; type: string }>
}
/**
 * Stories outside `patterns-` that a real reader walks, named one at a time.
 *
 * `@hozo/form` is the newest thing in the repository and the least measured:
 * its Native `TimePicker` shipped with its value unreachable by a screen
 * reader and nothing automated caught it -- a device run did (#559). Its Web
 * half had no real-reader evidence at all. So the components with the least
 * proof were the ones this suite was not looking at, which is backwards.
 *
 * A list rather than a `form-` prefix, and the two `Calendar` stories are
 * deliberately not on it. A month grid is forty-two cells and about a hundred
 * and fifty phrases; `MAX_STEPS` is 60 and VoiceOver enters a grid as a table
 * and leaves after `INSIDE_STEPS` of 20. Both budgets stay as they are here,
 * so adding the grids would mean approving a walk that stopped in the middle
 * of it -- which reads as coverage and is not. Raising the budgets is not the
 * answer either; see #584 for what is.
 *
 * `clock` has no overlay at all. The two `-open` stories put their panel in a
 * `div` with `aria-modal`, not a native `<dialog>` behind `showModal()`, so
 * the page around them is never made inert -- which is why they are worth
 * trying on NVDA when `patterns-dialog--open` is not (#580).
 */
const EXTRA: ReadonlySet<string> = new Set([
  'form-date-and-time--clock',
  'form-date-and-time--date-and-time-open',
  'form-date-and-time--date-range-open',
])

const stories = Object.values(index.entries)
  .filter(
    (entry) => entry.type === 'story' && (entry.id.startsWith('patterns-') || EXTRA.has(entry.id)),
  )
  .map((entry) => entry.id)
  .sort()

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim()

/** The expected phrases not found in `log`, each searched for after the last one found. */
function missingInOrder(log: readonly string[], expected: readonly string[]): string[] {
  const said = log.map(normalize)
  const missing: string[] = []
  let from = 0
  for (const phrase of expected) {
    const at = said.findIndex((line, index) => index >= from && line.includes(normalize(phrase)))
    if (at === -1) missing.push(phrase)
    else from = at + 1
  }
  return missing
}

test.use({ screenReaderStartOptions: startOptions })

for (const id of stories) {
  test(id, async ({ page, screenReader }, testInfo) => {
    const stopRecording = startRecording(id)
    let log: string[] = []
    try {
      await page.goto(`/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'load' })
      await page.locator('#storybook-root > *').first().waitFor()
      await enterPage(page, screenReader)
      log = await walk(screenReader)
    } finally {
      stopRecording()
      writeFileSync(path.join(phrasesDir, `${id}.json`), `${JSON.stringify(log, null, 2)}\n`)
    }

    // A reader that said almost nothing did not read the story, and that is
    // a failure of the run rather than of the story. The first NVDA run
    // passed with logs of "", "expanded", "list": it had landed in focus
    // mode inside a widget and never read the page, and with no approved
    // phrases to compare, nothing noticed.
    const spoken = log.filter((phrase) => phrase.trim() !== '')
    if (spoken.length < MIN_SPOKEN) {
      throw new Error(
        `${reader} said ${spoken.length} phrase(s) for ${id}, so it did not read the story:\n${JSON.stringify(log)}`,
      )
    }

    const expectedFile = path.join(expectedDir, `${id}.txt`)
    if (!existsSync(expectedFile)) {
      testInfo.annotations.push({
        type: 'warning',
        description: `no approved ${reader} phrases for ${id}: review test-results/phrases/${reader}/${id}.json and add expected/${reader}/${id}.txt`,
      })
      return
    }
    const expected = readFileSync(expectedFile, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      // `#` lines say why a phrase is or is not approved, which is the part a
      // later reviewer needs and a list of phrases does not carry.
      .filter((line) => line !== '' && !line.startsWith('#'))
    const missing = missingInOrder(log, expected)
    if (missing.length > 0) {
      throw new Error(
        `${reader} did not say, in this order:\n- ${missing.join('\n- ')}\n\nWhat it said:\n${log.join('\n')}`,
      )
    }
  })
}
