// Which dialog does NVDA refuse to read into? (#617)
//
// `fixtures/aria-modal.html` says what the question is, what the three
// dialogs on it differ by, and how to read the answer off the log. This drives
// a reader across them and writes down what was said.
//
// So it asserts almost nothing, for the reason `tree-shape.spec.ts` gives: the
// thing being measured is which of three markups goes unread, and a test
// cannot be written for that until it is known. A run that produced no phrases
// at all failed for a reason that has nothing to do with the question, and that
// one is worth failing on.
//
// Both readers, though the question is NVDA's. VoiceOver reads the real
// story's panel and is expected to read all three here; if it does not, the
// difference between the two readers is smaller than #617 assumes and that is
// worth knowing in the same run rather than a week later.
//
// This file goes away when #617 closes.

import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { type IScreenReader, WindowsKeyCodes } from '@guidepup/guidepup'
import { screenReaderTest as test } from '@guidepup/playwright'

import {
  enterPage,
  MIN_SPOKEN,
  onWindows,
  phrasesDir,
  reader,
  startOptions,
  startRecording,
  walk,
} from './reader.ts'

const id = 'aria-modal'

/** Four headings, three dialogs of four items, and their prose, with room to spare. */
const STEPS = 60

/**
 * What each section is called in the log.
 *
 * Every phrase inside a dialog carries its section's word, so counting the
 * phrases that contain it says whether that dialog was entered -- without
 * knowing in advance how NVDA words a heading or a button.
 */
const SECTIONS = ['Bare', 'Modal', 'Floating'] as const

/** How many headings to ask for. Four `h2`s, three `h3`s, and room to overrun. */
const HEADINGS = 10

/**
 * Everything the reader said while an action ran, with its silences dropped.
 *
 * `walk` keeps `lastSpokenPhrase` per step, which is one phrase per keystroke
 * and is the wrong instrument for the two probes below: NVDA-B answers with a
 * whole window in one press, and a heading jump that says two things is
 * exactly what would be interesting about it.
 */
async function everythingSaid(
  screenReader: IScreenReader,
  act: () => Promise<void>,
): Promise<string[]> {
  await screenReader.clearSpokenPhraseLog()
  await act()
  const said = await screenReader.spokenPhraseLog()
  return said.map((phrase) => phrase.trim()).filter((phrase) => phrase !== '')
}

test.use({ screenReaderStartOptions: startOptions })

test(id, async ({ page, screenReader }) => {
  const stopRecording = startRecording(id)
  let log: string[] = []
  const probes: { note: string; said: string[] }[] = []
  try {
    await page.goto('/fixtures/aria-modal.html', { waitUntil: 'load' })
    await page.locator('[role="dialog"]').first().waitFor()
    await enterPage(page, screenReader)
    const read = await walk(screenReader, STEPS)
    log = read.phrases

    // Two more questions, asked only where the answer above was "nothing".
    //
    // Run 36386318431 had NVDA say two phrases for each of the three sections
    // -- the `h2` and the dialog's own name -- and nothing from inside any of
    // them. Not the bare one either, so `aria-modal` is not the cause and
    // neither is `FloatingPositioner`. What is left is the traversal: `walk`
    // steps with `next()`, which for NVDA is a plain Down Arrow, and a Down
    // Arrow that goes from one `h2` to the next has a buffer with no lines
    // between them.
    //
    // Which leaves two possibilities that these separate. `nextHeading` is H,
    // the same browse-mode buffer by a different route: if it stops on the
    // `h3` inside a dialog then the content *is* in the buffer and the Down
    // Arrow is skipping it, and if it jumps `h2` to `h2` the content is not
    // there at all and this is about how Chrome exposes the subtree.
    //
    // NVDA-B is the other end of the same question, and it is in the key table
    // described as "Reads all the controls in the currently active window
    // (useful for dialogs)" -- which is this problem, named by NVDA itself. If
    // it reads the dialogs out, the harness has a command to reach them with
    // and #617 becomes a change to `walk` rather than to a component.
    //
    // Windows only. VoiceOver reads these dialogs' contents already -- 8 and
    // 12 phrases for Bare and Modal in the same run -- so it has nothing to
    // answer here, and asking it anyway would add minutes to the slower of the
    // two jobs for a log nobody would read.
    if (onWindows) {
      for (let heading = 1; heading <= HEADINGS; heading++) {
        probes.push({
          note: `nextHeading ${heading}`,
          said: await everythingSaid(screenReader, () => screenReader.nextHeading()),
        })
      }
      probes.push({
        note: 'NVDA-B, read all controls in the active window',
        said: await everythingSaid(screenReader, () =>
          screenReader.perform({
            keyCode: [WindowsKeyCodes.Insert, WindowsKeyCodes.B],
            modifiers: [],
          }),
        ),
      })
    }
  } finally {
    stopRecording()
    writeFileSync(
      path.join(phrasesDir, `${id}.json`),
      `${JSON.stringify({ walk: log, probes }, null, 2)}\n`,
    )
  }

  // Into the run's own log as well as the artifact: this is the whole output of
  // the experiment, and reading it should not require downloading a zip.
  console.log(`${reader} on ${id}:\n${log.map((phrase) => `  ${phrase}`).join('\n')}`)

  // And the count that is the answer, so nobody has to tally it by eye. The
  // heading above each dialog carries the same word, so one phrase means the
  // section was reached and the dialog was not entered; more than one means it
  // was.
  console.log(
    `${reader} on ${id}, phrases per section:\n${SECTIONS.map((section) => {
      const said = log.filter((phrase) => phrase.includes(section))
      return `  ${section}: ${said.length}`
    }).join('\n')}`,
  )

  if (probes.length > 0) {
    console.log(
      `${reader} on ${id}, probes:\n${probes
        .map(
          ({ note, said }) =>
            `  ${note}\n${
              said.length === 0
                ? '    (nothing said)'
                : said.map((phrase) => `    "${phrase}"`).join('\n')
            }`,
        )
        .join('\n')}`,
    )
  }

  const spoken = log.filter((phrase) => phrase.trim() !== '')
  if (spoken.length < MIN_SPOKEN) {
    throw new Error(
      `${reader} said ${spoken.length} phrase(s) for ${id}, so it did not read the page:\n${JSON.stringify(log)}`,
    )
  }
})
