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
// ## Why the keys come from Playwright and not from the reader
//
// `page.keyboard.press` reaches the browser over CDP. It is not an OS
// keystroke, so NVDA's browse mode -- which owns the arrow keys and would eat
// every one of them -- never sees it, and no mode has to be toggled on one
// platform and not the other. The page moves focus itself, and both readers
// announce a focus change whoever caused it. The alternative was
// `toggleBetweenBrowseAndFocusMode` on Windows and nothing on macOS, which is
// two different things being tested under one name.
//
// This is also the honest limit of these scenarios, and it is worth saying
// rather than leaving to be inferred: **they measure what is announced, not
// that the key reached the app through the reader.** A browse-mode arrow that
// NVDA swallows before the grid sees it would not show up here. That is a real
// gap and a different test; `android-talkback.sh` has the device equivalent.
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
  enterPage,
  here,
  missingInOrder,
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
    name: 'calendar-arrives-on-the-selected-day',
    story: MONTH_GRID,
    claim: 'the grid is entered on the chosen day, and it says it is chosen',
    steps: [],
  },
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
    claim: "today is announced as today, from `aria-current` rather than from the day's name",
    steps: [
      { press: 'ArrowDown', note: 'the 17th' },
      { press: 'ArrowDown', note: 'the 24th, which the story pins as today' },
    ],
  },
  {
    name: 'calendar-says-which-end-of-a-range',
    story: RANGE_GRID,
    claim: 'a range end says which end it is, because selected is one bit and cannot',
    steps: [],
  },
]

test.use({ screenReaderStartOptions: startOptions })

/**
 * Whether the way this file drives the grid is known to work.
 *
 * It is not, yet. Run 36357458553 drove all eight scenarios on both readers
 * and every one of them heard nothing at all -- focusing a cell said nothing,
 * and an arrow key over CDP said nothing. The guard below fired with its own
 * message each time, which is what it is for; what it cannot say is which of
 * four things went wrong, and guessing at this suite has a track record
 * (#580, #592, #598).
 *
 * So the scenarios are declared and skipped while `probe.spec.ts` measures
 * which way of driving a grid a real reader announces. Skipped rather than
 * deleted: they are the thing being built, and a run that carries them past
 * three retries each costs twenty-five minutes on VoiceOver to say the same
 * sentence eight times.
 *
 * Flipped to true in the commit that fixes the delivery, which is the commit
 * that deletes `probe.spec.ts`.
 */
const MECHANISM_MEASURED = false

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

      // The grid's one tab stop, which is the day the component opens on.
      //
      // `tabIndex` roves: exactly one cell carries 0 and the rest carry -1, so
      // this locator is the component's own answer to "where does a keyboard
      // user arrive", rather than a date written down twice. Focusing it is
      // itself the first thing measured -- a reader that says nothing here
      // would have no scenario below it worth reading.
      const entry = page.locator('[role="gridcell"][tabindex="0"]')
      await entry.waitFor()
      heard.push({
        note: 'arriving on the grid',
        said: await spokenAfter(screenReader, () => entry.focus()),
      })

      for (const step of scenario.steps) {
        const said = await spokenAfter(screenReader, () => page.keyboard.press(step.press))
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

    // Arriving must say something, whatever the scenario goes on to check.
    //
    // This is the one assertion that is not approved from a file, and it is
    // here because every scenario rests on it: the keys reach the page over
    // CDP, the page moves focus, and the reader announces that. A run where
    // focusing the grid said nothing is a run where the mechanism is not
    // working, and without this it would look like a calendar defect instead.
    if (heard[0] !== undefined && heard[0].said.length === 0) {
      throw new Error(
        `${reader} said nothing when focus arrived on the grid, so no key after it was measured: ${JSON.stringify(heard)}`,
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
