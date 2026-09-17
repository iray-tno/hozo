// The parts of a screen reader run both specs need: which reader is driving,
// where its output goes, how it gets into the page, and how it walks one.
//
// Split out of `stories.spec.ts` when `tree-shape.spec.ts` arrived. The entry
// sequence and the end-of-page rule below were each found by watching a
// recording of a run that went wrong, and neither is worth finding twice.

import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { type IScreenReader, WindowsKeyCodes, WindowsModifiers } from '@guidepup/guidepup'
import { macOSRecord, windowsRecord } from '@guidepup/record'
import type { Page } from '@playwright/test'

export const here = path.dirname(fileURLToPath(import.meta.url))
export const reader = process.platform === 'darwin' ? 'voiceover' : 'nvda'
export const onWindows = process.platform === 'win32'
export const phrasesDir = path.join(here, 'test-results', 'phrases', reader)
export const recordingsDir = path.join(here, 'test-results', 'recordings', reader)

/** How many `next` commands one page may take before it is cut off. */
export const MAX_STEPS = 60

/** Fewer non-empty phrases than this means the reader never read the page. */
export const MIN_SPOKEN = 3

// NVDA stays in browse mode when focus moves.
//
// Guidepup enters the page by tabbing to its first focusable element. In five
// of the six patterns that element is a widget -- a combobox, a menu button, a
// tab, a toolbar, a tree -- and NVDA's default is to switch to focus mode
// there, where its `next` command is handed to the widget and says nothing.
// The first run read only the Dialog story, whose first focusable element is a
// plain button; the rest logged "", "expanded", "list".
//
// Written into `nvda.ini` by Guidepup (`[virtualBuffers]`). Windows only: the
// same options reach VoiceOver through this fixture, where they would be read
// as its preferences.
export const startOptions = onWindows
  ? {
      capture: 'initial' as const,
      settings: {
        virtualBuffers: {
          autoPassThroughOnFocusChange: false,
          autoFocusFocusableElements: false,
        },
      },
    }
  : { capture: 'initial' as const }

/** Starts a recording of one page's reading, and returns the stop function. */
export function startRecording(id: string): () => void {
  mkdirSync(phrasesDir, { recursive: true })
  mkdirSync(recordingsDir, { recursive: true })
  return reader === 'voiceover'
    ? macOSRecord(path.join(recordingsDir, `${id}.mov`))
    : windowsRecord(path.join(recordingsDir, `${id}.mp4`))
}

/**
 * Puts the reader at the top of the page's content, ready to be stepped.
 *
 * On Windows, Guidepup enters the page by clicking the middle of the body and
 * pressing Tab. In Combobox, Menu and Tree the middle of the page is the
 * listbox or the tree -- the last focusable thing there -- so that Tab left the
 * document for Chrome's toolbar, and NVDA read Chrome's tab search ("Tab
 * Search, document", "list, Open Tabs"). The recording shows focus on the
 * tab-search button three seconds in.
 *
 * So the click needs somewhere inert to land: a transparent button over the
 * whole viewport, first in the document, so the Tab after it stays in the page.
 * It is removed before anything is read, the log is cleared, and NVDA goes back
 * to the top of the page.
 */
export async function enterPage(page: Page, screenReader: IScreenReader): Promise<void> {
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
}

/**
 * Steps to the end of the page and returns everything the reader said.
 *
 * A reader that has nowhere left to go says the same thing again, and three of
 * those in a row is the end.
 *
 * Empty phrases do not count either way. The first run showed VoiceOver at a
 * listbox or toolbar it would not step past answering "Alignment toolbar", "",
 * "Alignment toolbar", "" -- comparing each phrase with the one before never
 * saw a repeat, and every such story ran to the step limit.
 *
 * Nothing at all is the end too. After the last radio button VoiceOver went
 * silent and every further `next` said "", so Menu ran to the step limit -- and
 * Tabs, which ends the same way, ran long enough for VoiceOver itself to quit
 * and the test to time out.
 */
export async function walk(screenReader: IScreenReader, maxSteps = MAX_STEPS): Promise<string[]> {
  let last = ''
  let repeats = 0
  let silent = 0
  for (let step = 0; step < maxSteps && repeats < 3 && silent < 5; step++) {
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
  return await screenReader.spokenPhraseLog()
}
