// Is VoiceOver's "table" the tree's markup, or WebKit's mapping? (#458)
//
// `fixtures/tree-shape.html` says what the question is and why it is asked
// here rather than as a Storybook story. This drives a reader across it and
// writes down what was said; the answer is read off the log, by a person.
//
// So it asserts almost nothing. A run that produced no phrases failed for a
// reason that has nothing to do with the question, and that is worth failing
// on -- but which of the two trees is called a tree is exactly what is not yet
// known, and a test cannot be written for it until it is.
//
// This file goes away when #458 closes.

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

const id = 'tree-shape'

/** Two trees of twelve rows, plus their headings, with room to spare. */
const STEPS = 80

test.use({ screenReaderStartOptions: startOptions })

test(id, async ({ page, screenReader }) => {
  const stopRecording = startRecording(id)
  let log: string[] = []
  try {
    await page.goto('/fixtures/tree-shape.html', { waitUntil: 'load' })
    await page.locator('[role="tree"]').first().waitFor()
    await enterPage(page, screenReader)
    log = await walk(screenReader, STEPS)
  } finally {
    stopRecording()
    writeFileSync(path.join(phrasesDir, `${id}.json`), `${JSON.stringify(log, null, 2)}\n`)
  }

  // Into the run's own log as well as the artifact: this is the whole output
  // of the experiment, and reading it should not require downloading a zip.
  console.log(`${reader} on ${id}:\n${log.map((phrase) => `  ${phrase}`).join('\n')}`)

  const spoken = log.filter((phrase) => phrase.trim() !== '')
  if (spoken.length < MIN_SPOKEN) {
    throw new Error(
      `${reader} said ${spoken.length} phrase(s) for ${id}, so it did not read the page:\n${JSON.stringify(log)}`,
    )
  }
})
