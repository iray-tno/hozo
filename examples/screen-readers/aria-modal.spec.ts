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

import { screenReaderTest as test } from '@guidepup/playwright'

import {
  enterPage,
  MIN_SPOKEN,
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

test.use({ screenReaderStartOptions: startOptions })

test(id, async ({ page, screenReader }) => {
  const stopRecording = startRecording(id)
  let log: string[] = []
  try {
    await page.goto('/fixtures/aria-modal.html', { waitUntil: 'load' })
    await page.locator('[role="dialog"]').first().waitFor()
    await enterPage(page, screenReader)
    const read = await walk(screenReader, STEPS)
    log = read.phrases
  } finally {
    stopRecording()
    writeFileSync(path.join(phrasesDir, `${id}.json`), `${JSON.stringify(log, null, 2)}\n`)
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

  const spoken = log.filter((phrase) => phrase.trim() !== '')
  if (spoken.length < MIN_SPOKEN) {
    throw new Error(
      `${reader} said ${spoken.length} phrase(s) for ${id}, so it did not read the page:\n${JSON.stringify(log)}`,
    )
  }
})
