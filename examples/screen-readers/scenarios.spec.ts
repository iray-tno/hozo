// What a real reader says when someone actually uses the Calendar.
//
// `stories.spec.ts` walks a story from top to bottom and approves the reading
// order. That shape works for a toolbar and does not work for a month grid,
// which is why the two `Calendar` stories are the only ones this suite has
// never read (#584):
//
// - a month is 42 cells and about 150 phrases; `MAX_STEPS` is 60;
// - VoiceOver exposes an ARIA grid as a table, enters it, reads `INSIDE_STEPS`
//   of 20 and leaves;
// - and a 150-line approved file is not something a person reviews and means.
//
// Raising both budgets would make every other story pay for it and would still
// bury the four facts that matter in phrase 90. **Nothing important is in
// phrase 90.** What matters about a calendar is a short list -- a cell says its
// whole date, moving by a day says the next one, an arrow that leaves the month
// says the month it landed in, paging says the new month, a bound refuses, a
// selected day says it is selected -- and each of those is one action and one
// sentence a person can approve.
//
// So a scenario here is: open a story, put focus on the grid's one tab stop,
// send a few keys, and collect what was said in response to each. The approved
// file is the same shape as `stories.spec.ts`'s -- phrases that must be said,
// in order, with `#` lines saying why -- so one reviewer habit covers both.
//
// ## How the grid is driven, and how that was decided
//
// Focus is put on the grid's one roving tab stop over CDP, NVDA is switched to
// focus mode, and every movement after that is a real keystroke through the
// reader. Three runs settled each part of that, and each one killed something
// that looked obviously right:
//
// **36357458553 -- CDP keys.** All eight scenarios, both readers, nothing said
// at all. A focus change is *not* announced whoever caused it.
//
// **36359016412 -- the probe.** `activeElement` said the page had moved focus
// both times and neither reader spoke, so it was the announcing and not the
// moving. The same arrow as a real keystroke was announced by VoiceOver; NVDA
// answered "1", which is browse mode reading the next character of "11", with
// focus not moving at all. So: real keys, and focus mode on Windows.
//
// **36359768038 -- Tab as the way in.** NVDA's Tab announced the region and
// then "list, Open Tabs": focus had left the document for Chrome's tab search,
// which is the failure `enterPage` documents for `navigateToWebContent`.
// VoiceOver's Tab said nothing, which is Safari with "press Tab to highlight
// each item" off.
//
// **36361066736 -- the arrows, four in a row.** Every one tracked focus
// exactly: "Friday, September 11, 2026, not selected, row 2, column 5" with
// focus on the 11th, and so on to the 18th. So the one stale reading in the
// first probe was a cursor catching up, not an announcement that lags -- which
// is what these approvals would have been off by one for.
//
// So a programmatic focus is silent and that is fine: nothing is approved from
// it. **Every claim below is made by moving onto the cell that carries it** --
// the selected day, today, a range end are each reached with an arrow key, and
// what the reader says on arrival is the phrase. That is a better test than
// asking what a page says when it loads, and it is the only one available.
//
// ## Approval
//
// A scenario with no approved file is reported, never failed, exactly as a
// story with none is. The phrases are printed into the run log and written to
// `test-results/phrases/<reader>/`, which is what a person approves from.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { screenReaderTest as test } from '@guidepup/playwright'

import {
  approvedPhrases,
  enterFocusMode,
  enterPage,
  here,
  missingInOrder,
  onWindows,
  phrasesDir,
  reader,
  spokenAfter,
  startOptions,
  startRecording,
} from './reader.ts'

const expectedDir = path.join(here, 'expected', reader, 'scenarios')

/** One user action, and why anyone would care what it says. */
interface Step {
  /** A key, sent to the page rather than to the reader. */
  press: string
  /** What this step is for, in the run log beside what it produced. */
  note: string
  /**
   * This step must produce nothing at all.
   *
   * The one claim an approved file cannot make. A list of phrases says what
   * must be said and has no way to say "and then nothing", which is exactly
   * what a key refused at the edge of a range should do -- so it is checked
   * here instead, and `spokenAfter` returns an empty list rather than throwing
   * for that reason.
   *
   * It waits the full settle time before concluding silence, which is why a
   * scenario using it is the slowest of the set. Worth it: the alternative is
   * asserting that the reader repeated the previous date, which passes just as
   * well if focus moved somewhere that happens to be named the same.
   */
  silent?: true
}

interface Scenario {
  name: string
  story: string
  /** One sentence: the fact this scenario exists to hold true. */
  claim: string
  steps: Step[]
}

const MONTH_GRID = 'form-date-and-time--month-grid'
const RANGE_GRID = 'form-date-and-time--range'

/**
 * The scenarios, and the grid they are pinned to.
 *
 * `MonthGrid` is September 2026 with the 10th selected, the 24th as today and
 * the 3rd as `min`; `Range` is the 10th to the 12th. Every date below is
 * arithmetic on those, so a scenario says what it expects rather than what it
 * found -- and the story pins `today` for the same reason, or half of these
 * would change meaning overnight.
 *
 * Six, as #584 listed them, plus the two facts a grid carries that no movement
 * does: today, and a range end saying which end it is.
 */
const scenarios: Scenario[] = [
  {
    name: 'calendar-moves-by-a-day',
    story: MONTH_GRID,
    claim: 'Right is the next day, named in full',
    steps: [{ press: 'ArrowRight', note: 'the 10th to the 11th' }],
  },
  {
    name: 'calendar-moves-by-a-week',
    story: MONTH_GRID,
    claim: 'Down is seven days, not the next row of whatever is drawn',
    steps: [{ press: 'ArrowDown', note: 'the 10th to the 17th' }],
  },
  {
    name: 'calendar-crosses-a-month',
    story: MONTH_GRID,
    claim: 'an arrow out of the month lands in the next one and says so',
    steps: [
      { press: 'ArrowDown', note: 'the 17th' },
      { press: 'ArrowDown', note: 'the 24th' },
      { press: 'ArrowDown', note: 'and out of September, to October the 1st' },
    ],
  },
  {
    name: 'calendar-pages-a-month',
    story: MONTH_GRID,
    claim: 'PageDown keeps the day and changes the month',
    steps: [{ press: 'PageDown', note: 'September the 10th to October the 10th' }],
  },
  {
    name: 'calendar-refuses-below-min',
    story: MONTH_GRID,
    claim: 'a bound is a wall: focus does not move and nothing new is said',
    steps: [
      { press: 'ArrowUp', note: 'the 10th to the 3rd, which is `min`' },
      { press: 'ArrowUp', note: 'and again, which must do nothing', silent: true },
    ],
  },
  {
    name: 'calendar-says-today',
    story: MONTH_GRID,
    claim: "today is announced as today, from `aria-current` and not from the day's name",
    steps: [
      { press: 'ArrowDown', note: 'the 17th' },
      { press: 'ArrowDown', note: 'the 24th, which the story pins as today' },
    ],
  },
  {
    name: 'calendar-says-the-selected-day',
    story: MONTH_GRID,
    claim: 'the chosen day says it is chosen, and its neighbour says it is not',
    steps: [
      { press: 'ArrowRight', note: 'off the 10th, onto the unselected 11th' },
      { press: 'ArrowLeft', note: 'and back onto the 10th, which is selected' },
    ],
  },
  {
    name: 'calendar-says-which-end-of-a-range',
    story: RANGE_GRID,
    claim: 'a range end says which end it is, because selected is one bit and cannot',
    steps: [
      { press: 'ArrowLeft', note: 'off the range, onto the 9th' },
      { press: 'ArrowRight', note: 'and back onto the 10th, which is its start' },
    ],
  },
]

test.use({ screenReaderStartOptions: startOptions })

/**
 * Whether the way this file drives the grid is known to work.
 *
 * It was false for one commit, and that was the point of the commit. Run
 * 36357458553 drove all eight scenarios over CDP and heard nothing at all on
 * either reader; rather than guess which of four things had gone wrong --
 * guessing at this suite has a record (#580, #592, #598) -- the scenarios
 * were skipped and `probe.spec.ts` measured it. See the header for what it
 * found.
 *
 * Kept as a named constant because the next change to the delivery will want
 * the same lever: skipping eight scenarios costs a run nothing, and letting
 * them fail three times each costs twenty-five minutes of VoiceOver.
 */
const MECHANISM_MEASURED = true

for (const scenario of scenarios) {
  const declare = MECHANISM_MEASURED ? test : test.skip
  declare(scenario.name, async ({ page, screenReader }, testInfo) => {
    const stopRecording = startRecording(scenario.name)
    const heard: { note: string; said: string[] }[] = []
    // Collected rather than thrown on the spot, so the artifact and the run
    // log carry the step that broke the claim. A failure nobody can read the
    // evidence for costs another whole run to reproduce, and this suite's runs
    // are ten minutes each.
    const spoke: string[] = []
    try {
      await page.goto(`/iframe.html?id=${scenario.story}&viewMode=story`, { waitUntil: 'load' })
      await page.locator('#storybook-root > *').first().waitFor()
      await enterPage(page, screenReader)

      // Put on the grid's one roving tab stop, which is the day the component
      // opens on: exactly one cell carries `tabIndex` 0 and the rest carry -1,
      // so this is the component's own answer to where a keyboard user arrives
      // rather than a date written down twice.
      //
      // Silent, and nothing is approved from it. Run 36359016412 measured that
      // -- focus moved and neither reader said a word -- which is why every
      // scenario below starts with a key rather than with what was said here.
      const entry = page.locator('[role="gridcell"][tabindex="0"]')
      await entry.waitFor()
      await entry.focus()

      // And then the arrow keys have to reach the grid rather than NVDA's
      // virtual buffer. A no-op on VoiceOver, which has no browse mode.
      if (onWindows) await enterFocusMode(screenReader)

      for (const step of scenario.steps) {
        const said = await spokenAfter(screenReader, () => screenReader.press(step.press))
        heard.push({ note: `${step.press} -- ${step.note}`, said })
        if (step.silent === true && said.length > 0) {
          spoke.push(`${step.press} (${step.note}): ${JSON.stringify(said)}`)
        }
      }
    } finally {
      stopRecording()
      writeFileSync(
        path.join(phrasesDir, `${scenario.name}.json`),
        `${JSON.stringify({ claim: scenario.claim, heard }, null, 2)}\n`,
      )
    }

    // Step by step in the log, which is the difference between this suite and
    // the other one: there, a phrase's place in a long list is all the context
    // there is; here, every phrase has the key that caused it written beside
    // it, and that is what makes one line approvable on its own.
    console.log(
      `[scenario] ${scenario.name}: ${scenario.claim}\n${heard
        .map(
          ({ note, said }) =>
            `  ${note}\n${said.map((phrase) => `    ${JSON.stringify(phrase)}`).join('\n') || '    (nothing said)'}`,
        )
        .join('\n')}`,
    )

    const log = heard.flatMap(({ said }) => said)

    // A key that should have been refused and was not.
    //
    // Checked before the approved phrases, because it is the stronger finding:
    // the phrases below say the grid announced the right dates, and this says
    // it moved somewhere it was told it could not go.
    if (spoke.length > 0) {
      throw new Error(
        `a refused key made ${reader} speak, so focus moved past a bound:\n- ${spoke.join('\n- ')}`,
      )
    }

    // The first key must say something, whatever the scenario goes on to
    // check.
    //
    // The one assertion not approved from a file, and every scenario rests on
    // it: the keystroke reaches the browser, the grid moves focus, and the
    // reader announces where it landed. A run where the first arrow said
    // nothing is a run where that chain is broken somewhere, and without this
    // it would arrive looking like a calendar defect -- which is exactly what
    // the three runs before this design did look like until they were
    // measured.
    const first = heard[0]
    if (first !== undefined && first.said.length === 0) {
      throw new Error(
        `${reader} said nothing to the first key of ${scenario.name}, so nothing after it was measured: ${JSON.stringify(heard)}`,
      )
    }

    const expectedFile = path.join(expectedDir, `${scenario.name}.txt`)
    if (!existsSync(expectedFile)) {
      testInfo.annotations.push({
        type: 'warning',
        description: `no approved ${reader} phrases for ${scenario.name}: review test-results/phrases/${reader}/${scenario.name}.json and add expected/${reader}/scenarios/${scenario.name}.txt`,
      })
      return
    }
    const expected = approvedPhrases(readFileSync(expectedFile, 'utf8'))
    const missing = missingInOrder(log, expected)
    if (missing.length > 0) {
      throw new Error(
        `${reader} did not say, in this order:\n- ${missing.join('\n- ')}\n\nWhat it said:\n${log.join('\n')}`,
      )
    }
    console.log(`[approved] ${scenario.name}: ${expected.length} phrase(s)`)
  })
}
