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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { WindowsKeyCodes, WindowsModifiers } from '@guidepup/guidepup'
import { screenReaderTest as test } from '@guidepup/playwright'
import { macOSRecord, windowsRecord } from '@guidepup/record'

const here = path.dirname(fileURLToPath(import.meta.url))
const storybook = path.resolve(here, '..', 'storybook-demo', 'storybook-static-check')
const reader = process.platform === 'darwin' ? 'voiceover' : 'nvda'
const expectedDir = path.join(here, 'expected', reader)
const phrasesDir = path.join(here, 'test-results', 'phrases', reader)
const recordingsDir = path.join(here, 'test-results', 'recordings', reader)

/** How many `next` commands one story may take before it is cut off. */
const MAX_STEPS = 60

/** Fewer non-empty phrases than this means the reader never read the page. */
const MIN_SPOKEN = 3

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

// NVDA stays in browse mode when focus moves.
//
// Guidepup enters the page by tabbing to its first focusable element. In
// five of the six patterns that element is a widget -- a combobox, a menu
// button, a tab, a toolbar, a tree -- and NVDA's default is to switch to
// focus mode there, where its `next` command is handed to the widget and says
// nothing. The first run read only the Dialog story, whose first focusable
// element is a plain button; the rest logged "", "expanded", "list".
//
// Written into `nvda.ini` by Guidepup (`[virtualBuffers]`). Windows only:
// the same options reach VoiceOver through this fixture, where they would be
// read as its preferences.
test.use({
  screenReaderStartOptions:
    process.platform === 'win32'
      ? {
          capture: 'initial',
          settings: {
            virtualBuffers: {
              autoPassThroughOnFocusChange: false,
              autoFocusFocusableElements: false,
            },
          },
        }
      : { capture: 'initial' },
})

for (const id of stories) {
  test(id, async ({ page, screenReader }, testInfo) => {
    mkdirSync(phrasesDir, { recursive: true })
    mkdirSync(recordingsDir, { recursive: true })
    const stopRecording =
      reader === 'voiceover'
        ? macOSRecord(path.join(recordingsDir, `${id}.mov`))
        : windowsRecord(path.join(recordingsDir, `${id}.mp4`))

    let log: string[] = []
    try {
      await page.goto(`/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'load' })
      await page.locator('#storybook-root > *').first().waitFor()

      // On Windows, Guidepup enters the page by clicking the middle of the
      // body and pressing Tab. In Combobox, Menu and Tree the middle of the
      // page is the listbox or the tree -- the last focusable thing in the
      // story -- so that Tab left the document for Chrome's toolbar, and NVDA
      // read Chrome's tab search ("Tab Search, document", "list, Open Tabs").
      // The recording shows focus on the tab-search button three seconds in.
      //
      // So the click needs somewhere inert to land: a transparent button over
      // the whole viewport, first in the document, so the Tab after it stays
      // in the page. It is removed before anything is read, the log is
      // cleared, and NVDA goes back to the top of the page.
      const onWindows = process.platform === 'win32'
      if (onWindows) {
        await page.evaluate(() => {
          const start = document.createElement('button')
          start.id = 'hozo-screen-reader-start'
          start.type = 'button'
          start.textContent = 'Start'
          start.style.cssText = 'position:fixed;inset:0;opacity:0;z-index:2147483647'
          document.body.prepend(start)
        })
      }
      await screenReader.navigateToWebContent()
      if (onWindows) {
        await page.evaluate(() => document.getElementById('hozo-screen-reader-start')?.remove())
        await screenReader.clearSpokenPhraseLog()
        await screenReader.perform(
          { keyCode: [WindowsKeyCodes.Home], modifiers: [WindowsModifiers.Control] },
          { capture: 'initial' },
        )
      }

      // To the end of the story: a reader that has nowhere left to go says
      // the same thing again, and three of those in a row is the end.
      //
      // Empty phrases do not count either way. The first run showed
      // VoiceOver at a listbox or toolbar it would not step past answering
      // "Alignment toolbar", "", "Alignment toolbar", "" -- comparing each
      // phrase with the one before never saw a repeat, and every such story
      // ran to the step limit.
      //
      // Nothing at all is the end too. After the last radio button VoiceOver
      // went silent and every further `next` said "", so Menu ran to the
      // step limit -- and Tabs, which ends the same way, ran long enough for
      // VoiceOver itself to quit and the test to time out.
      let last = ''
      let repeats = 0
      let silent = 0
      for (let step = 0; step < MAX_STEPS && repeats < 3 && silent < 5; step++) {
        await screenReader.next()
        const said = (await screenReader.lastSpokenPhrase()).trim()
        if (said === '') {
          silent += 1
          continue
        }
        silent = 0
        repeats = said === last ? repeats + 1 : 0
        last = said
      }
      log = await screenReader.spokenPhraseLog()
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
