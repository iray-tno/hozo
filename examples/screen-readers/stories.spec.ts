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
// Patterns first: their expected announcements are defined by the WAI-ARIA
// Authoring Practices, which is what makes approving them possible.
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
const stories = Object.values(index.entries)
  .filter((entry) => entry.type === 'story' && entry.id.startsWith('patterns-'))
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
