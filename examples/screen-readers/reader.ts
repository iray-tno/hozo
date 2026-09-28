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

/** How many times entering the page may be attempted before giving up. */
const ENTRY_ATTEMPTS = 3

/**
 * What the page's expandable controls and dialogs say right now.
 *
 * A diagnostic, printed at each step of entry, and it exists because two
 * guesses about `form-date-and-time--date-and-time-open` were wrong in a row --
 * a stale virtual buffer, then the entry click, and swallowing the press
 * changed nothing at all.
 *
 * It answered in one run:
 *
 *   [enter] before        expanded[Departure=true] dialogs=1
 *   [enter] after click   expanded[Departure=false] dialogs=0
 *
 * Entry closes the overlay. All three stories that open one at load lose it,
 * `patterns-dialog--open` included -- and that one is a native `<dialog>`,
 * which no `pointerdown` closes and Escape does. So what
 * `navigateToWebContent` sends is an Escape, `DismissableLayer`'s `keydown`
 * handler and the browser's own dialog behaviour both act on it, and the
 * pointer was never the mechanism.
 *
 * Which also rewrites #580. NVDA does not fail to enter a modal dialog; the
 * dialog is shut before NVDA looks, and the identical logs for the open and
 * closed Dialog stories were identical because by reading time the two pages
 * were the same page.
 *
 * Kept rather than removed. It would have said all of this on the first run,
 * and the next surprise in this suite is as likely to be about what the page
 * was as about what the reader said.
 *
 * Each dialog is now described rather than counted, because counting one was
 * as far as it could take #617: NVDA announces
 * `form-date-and-time--date-and-time-open`'s panel and reads nothing inside
 * it, and a count of 1 is true both when the panel is laid out and when
 * `FloatingPositioner` still has it at `left: -9999px; visibility: hidden`
 * waiting for its measuring effect. So the box, the two properties that can
 * take a subtree out of the tree, and how many children it has.
 *
 * And where focus is, which is the other half of the same question. The
 * harness enters by focusing a button it prepends to `<body>` and then
 * removes, so by reading time focus is on `<body>` -- outside a dialog that
 * calls itself modal. Whether that is why NVDA will not read into it is not
 * known; that it is the case is worth having written down in every log rather
 * than re-derived from `enterPage` each time someone asks.
 */
async function layerState(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const expandable = [...document.querySelectorAll('[aria-expanded]')].map(
      (node) =>
        `${node.getAttribute('aria-label') ?? node.textContent?.slice(0, 20)}=${node.getAttribute('aria-expanded')}`,
    )
    /** Enough of an element to recognise it in a log, and no more. */
    const name = (node: Element) =>
      `${node.localName}${node.id ? `#${node.id}` : ''}${
        node.getAttribute('aria-label') ? `[${node.getAttribute('aria-label')}]` : ''
      }`
    const active = document.activeElement
    const dialogs = [...document.querySelectorAll('[role="dialog"], dialog[open]')].map((node) => {
      const box = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      // Asked of the dialog and of everything above it: `visibility` inherits
      // and `display: none` on an ancestor takes the subtree out of the tree
      // without touching the dialog's own computed value. `offsetParent` is
      // null for a `position: fixed` element whether or not it is displayed,
      // so it cannot be used for this; `getClientRects` can.
      const laidOut = node.getClientRects().length > 0
      return [
        name(node),
        `${Math.round(box.width)}x${Math.round(box.height)}@${Math.round(box.left)},${Math.round(box.top)}`,
        style.visibility,
        laidOut ? 'laid-out' : 'no-box',
        `kids=${node.children.length}`,
        active !== null && node.contains(active) ? 'focus-inside' : 'focus-outside',
      ].join(' ')
    })
    return `expanded[${expandable.join(' ')}] dialogs=${dialogs.length}${dialogs
      .map((dialog) => ` {${dialog}}`)
      .join('')} active=${active === null ? 'none' : name(active)}`
  })
}

/**
 * Puts the reader at the top of the page's content, ready to be stepped.
 *
 * On Windows this used to be Guidepup's `navigateToWebContent`, which clicks
 * the middle of the body and presses Tab. In Combobox, Menu and Tree the middle
 * of the page is the listbox or the tree -- the last focusable thing there --
 * so that Tab left the document for Chrome's toolbar, and NVDA read Chrome's
 * tab search ("Tab Search, document", "list, Open Tabs"). The recording shows
 * focus on the tab-search button three seconds in.
 *
 * So the click needed somewhere inert to land: a transparent button over the
 * whole viewport, first in the document, so the Tab after it stayed in the page.
 * It is removed before anything is read, the log is cleared, and NVDA goes back
 * to the top of the page.
 *
 * The button is now *focused* rather than clicked, and `navigateToWebContent`
 * is not called here at all, because it sends an Escape and that Escape closed
 * every overlay a story had open -- see `layerState`. Playwright can put input
 * focus in the page without sending anything to it, and input focus inside the
 * page is the part of `navigateToWebContent` this harness was using. The
 * browse-mode half is handled by `startOptions` writing
 * `autoPassThroughOnFocusChange: false` into `nvda.ini`.
 *
 * The button swallows the press rather than letting it bubble. That is hygiene
 * and not a fix for anything measured: `DismissableLayer` does close on a
 * press outside itself, so a harness element the page can hear is a harness
 * element that can change the page -- but stopping it did not change what NVDA
 * read for the one story where that would have shown. `layerState` above is
 * how the actual cause gets found instead of guessed at again.
 *
 * Entry can also miss the browser window altogether. One run entered the
 * *desktop*: NVDA read "blank", "Pinned, list", "Windows Power Shell, 7 of 8"
 * -- the taskbar -- and the test then failed on the approved phrases, which is
 * a confusing way to be told the window was not in front (#460). So the window
 * is raised first, and the page is then asked whether it really has focus; if
 * it does not, entry is tried again rather than the story being read from
 * wherever the reader happened to land.
 *
 * Asked only on Windows, where entry *is* input focus -- a click and a Tab.
 * VoiceOver moves its own cursor, which can be in the content while the
 * document holds no DOM focus, so the same question there would answer a
 * different one.
 *
 * Anything a failed attempt produced is dropped. Those phrases came from
 * outside the page, and the comparison must not see them.
 */
export async function enterPage(page: Page, screenReader: IScreenReader): Promise<void> {
  console.log(`[enter] before        ${await layerState(page)}`)
  for (let attempt = 1; attempt <= ENTRY_ATTEMPTS; attempt++) {
    await page.bringToFront()
    if (!onWindows) {
      await screenReader.navigateToWebContent()
      console.log(`[enter] voiceover     ${await layerState(page)}`)
      return
    }
    await page.evaluate(() => {
      const start = document.createElement('button')
      start.id = 'hozo-screen-reader-start'
      start.type = 'button'
      start.textContent = 'Start'
      start.style.cssText = 'position:fixed;inset:0;opacity:0;z-index:2147483647'
      // The press stops here rather than reaching the page.
      //
      // Guidepup enters by clicking the middle of the body, which this button
      // is covering, and `DismissableLayer` closes on a `pointerdown` on
      // `document` whose target it does not contain. A harness element the page
      // can hear is a harness element that can change the page, so this one is
      // made not to be heard: capture phase, before the event reaches the
      // `document` listener, and `click` and `mousedown` as well as
      // `pointerdown` because a layer dismissing on either of those would be
      // perturbed the same way.
      //
      // Hygiene rather than a fix, and now known to be hygiene. It was expected
      // to be why `form-date-and-time--date-and-time-open` read as "button,
      // collapsed, opens dialog, Departure" with no panel; the story read
      // exactly the same afterwards, and `layerState` then showed entry closing
      // the panel with an Escape rather than with the press. Worth keeping
      // anyway: an element the page can hear is an element that can change it.
      for (const kind of ['pointerdown', 'mousedown', 'click']) {
        start.addEventListener(kind, (event) => event.stopPropagation(), { capture: true })
      }
      document.body.prepend(start)
    })
    // Focused rather than navigated to, so nothing is sent to the page.
    //
    // `navigateToWebContent` is what sends the Escape that `layerState` caught
    // closing every overlay opened at load. What it is for is getting NVDA out
    // of wherever it was and into the document, and the part of that this
    // harness needs is input focus inside the page -- which Playwright can set
    // without a keystroke.
    //
    // The browse-mode half of the problem `navigateToWebContent` also helps
    // with is already handled elsewhere: `startOptions` writes
    // `autoPassThroughOnFocusChange: false` into `nvda.ini`, which is why
    // focusing a widget no longer hands `next` to it. The transparent button
    // stays because it is what gives focus somewhere inert to land.
    //
    // If this turns out not to put NVDA in the document, the log says so
    // loudly: `MIN_SPOKEN` fails the run rather than passing a silent one.
    await page.locator('#hozo-screen-reader-start').focus()
    console.log(`[enter] after focus   ${await layerState(page)}`)
    await page.evaluate(() => document.getElementById('hozo-screen-reader-start')?.remove())
    // Before the keystroke rather than after it: a Ctrl+Home sent while another
    // window has focus is typed into that window.
    if (!(await page.evaluate(() => document.hasFocus()))) {
      await screenReader.clearSpokenPhraseLog()
      continue
    }
    await screenReader.clearSpokenPhraseLog()
    await screenReader.perform(
      { keyCode: [WindowsKeyCodes.Home], modifiers: [WindowsModifiers.Control] },
      { capture: 'initial' },
    )
    console.log(`[enter] after home    ${await layerState(page)}`)
    return
  }
  throw new Error(
    `the page still did not have focus after ${ENTRY_ATTEMPTS} attempts to enter it, so the reader was reading something other than the document`,
  )
}

/**
 * A container VoiceOver announces and then steps straight past.
 *
 * Its `next` reads "Text formatting toolbar" and moves to the next thing on
 * the page; the buttons inside are never read, so the approved phrases for
 * Toolbar and Combobox covered only the group names while NVDA read every
 * item, disabled states included (#459). Getting in needs its interact
 * command, which is what `screenReader.interact()` sends.
 *
 * Matched on what it actually said, from the phrases already approved:
 * "Text formatting toolbar", "Bundler options listbox list box", and
 * "Repository table Row 4 of 12 selected" -- the last being an ARIA tree,
 * which WebKit exposes as a table (#475) and which VoiceOver does not enter
 * either.
 *
 * And "Confirm Deployment web dialog with 4 items", added after a run on the
 * story that opens one at load: VoiceOver started inside the dialog and then
 * said that same line for every remaining step. The walk stalled there, so
 * the story yielded nothing to approve -- the same shape as the three above
 * and the same fix.
 *
 * `web ?dialog` rather than `dialog`, deliberately. The closed story's button
 * is announced "Open Confirmation Dialog button", and a bare `\bdialog\b`
 * matches it -- which would send an interact command to a button and break a
 * walk that works today. VoiceOver appends the role, so the role is what to
 * match on.
 */
const CONTAINER = /\b(toolbar|list ?box|table|web ?dialog)\b/i

/** How many steps one container may take before the walk moves on. */
const INSIDE_STEPS = 20

/**
 * NVDA's word for an empty line, which is silence with a name on it.
 *
 * Counting it as a phrase made every story end for the wrong reason. NVDA says
 * "blank" for the empty space after the last control, `walk` counted those as
 * ordinary phrases, three in a row was a repeat, and seven of the eight
 * stories were reported as ending on a repeat when they had simply run out of
 * page. They now end on silence, which is what happened.
 *
 * It did **not** reach the Dialog story's dialog, and that was the hope. With
 * the blanks counted as silence the walk goes one step further and stops on
 * the fifth of them: there is nothing past them. So a modal dialog's subtree is
 * not reachable by `next` from the top of the page at all, which is a different
 * problem from a tolerance and needs a different entry -- NVDA's focus mode, or
 * navigating to the focused element -- rather than a larger budget. Left alone
 * here; see #560.
 *
 * Matched whole rather than as a substring, so a control actually labelled
 * "Blank" would still be read. VoiceOver says `""` for the same thing and is
 * unaffected.
 */
const BLANK = /^blank$/i

/**
 * NVDA's browse mode holds the arrow keys; this hands them to the widget.
 *
 * NVDA-Space, copied from Guidepup's own `toggleBetweenBrowseAndFocusMode`
 * rather than called through it: the command table is on the NVDA class and
 * the `screenReader` fixture does not expose it -- probe run 36359016412
 * found `keyboardCommands` undefined on both readers. The definition is two
 * key codes, so it is written out here with the reason next to it.
 *
 * Nothing on macOS. VoiceOver has no browse mode: an arrow key reaches the
 * page as it is, which the same probe measured -- `press("ArrowRight")` moved
 * the grid and was announced, while on NVDA the identical call moved nothing
 * and said "1", which is browse mode reading the next character of "11".
 */
export async function enterFocusMode(screenReader: IScreenReader): Promise<void> {
  if (!onWindows) return
  await screenReader.perform({
    keyCode: [WindowsKeyCodes.Insert, WindowsKeyCodes.Spacebar],
    modifiers: [],
  })
}

/** How long to wait for speech to begin before calling the action silent. */
const SETTLE_MS = 3000
/** How long the log must stop growing before speech counts as finished. */
const QUIET_MS = 1200
/** A ceiling on one announcement, so a reader that never stops cannot hang a run. */
const SPEECH_MS = 15_000
const POLL_MS = 200

/** Everything the reader actually said, with its silences dropped. */
export function meaningful(log: readonly string[]): string[] {
  return log.map((phrase) => phrase.trim()).filter((phrase) => phrase !== '' && !BLANK.test(phrase))
}

/**
 * What the reader says in response to one action.
 *
 * The other half of this file walks a page and takes everything; this takes
 * one action's worth, which is what a scenario is. The log is cleared first so
 * the phrases returned are caused by `act` and not left over from arriving.
 *
 * Two waits rather than one. The first is for speech to begin, because a key
 * press reaches the page over CDP and the reader speaks a moment later; the
 * second is for it to *finish*, because an announcement is often several
 * phrases ("Thursday, September 11, 2026", "selected") and returning after the
 * first would approve half a sentence.
 *
 * The second wait used to be a flat 700ms after the first phrase, which is not
 * a wait for the end of anything, and that cost run 36364764129 a red job and
 * two approvals their meaning. In that run VoiceOver never announced the 24th:
 *
 *   ArrowDown -- the 17th   "Thursday, September 17, 2026 17"
 *   ArrowDown -- the 24th   (nothing said)
 *   ArrowDown -- October    "October 2026"
 *
 * The third key spoke, so the machine was not lagging and the announcement was
 * not merely late -- a late one would have leaked into the next step's log,
 * which was clean. What happened is that the second key was pressed while the
 * first phrase was still being spoken, and VoiceOver dropped the announcement
 * it interrupted. The third key then went out into silence and was fine. The
 * green run on the identical commit had finished speaking inside the 700ms,
 * which is why this was a machine's speed rather than a calendar's behaviour.
 *
 * The same shape explains every other silence this suite has attributed to
 * VoiceOver: the warm-up's second key, which follows the longest phrase on the
 * page ("... table 7 columns, 6 rows"), and the step back onto the selected day
 * in `calendar-says-the-selected-day`. Both notes in `expected/voiceover/` say
 * VoiceOver does not re-announce the cell it entered the table on. That may
 * still be true and it is no longer evidenced, because the key that was
 * supposed to show it was pressed into an ongoing utterance.
 *
 * So the log is now watched until it stops growing for `QUIET_MS`, with
 * `SPEECH_MS` as a ceiling. Growth is measured on the raw log rather than on
 * `meaningful`, because a trailing empty phrase is still the reader being
 * busy. Generous on purpose: a scenario runs a handful of steps, so seconds
 * here cost a run nothing, and an approval that means something else costs it
 * a week.
 *
 * Growth is a proxy for speech and not the thing itself, and there is one case
 * where it is known to be a poor one. Run 36391397389, the first under this
 * wait, had every scenario's second key speak -- the 24th, the selected 10th,
 * the range's start, all three of which had been silent before -- and left the
 * warm-up's second key silent exactly as it was. The phrase before that one is
 * the longest on the page ("... September 2026 table 7 columns, 6 rows"), and
 * VoiceOver logs it as a single entry, so the log stops growing at once while
 * the speech runs on for seconds. A one-phrase announcement is therefore still
 * escapable, and the warm-up's silence is as likely to be that as anything
 * about the reader. It costs nothing there, because the warm-up is not
 * compared; it would cost something in a scenario whose step follows a very
 * long phrase, and there is none today.
 *
 * Returning nothing is a result rather than a failure. "Nothing was said" is
 * exactly what a key at the edge of a range should produce, and a scenario
 * that wants to assert it needs it to come back empty rather than to throw.
 */
export async function spokenAfter(
  screenReader: IScreenReader,
  act: () => Promise<void>,
): Promise<string[]> {
  await screenReader.clearSpokenPhraseLog()
  await act()
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const started = Date.now() + SETTLE_MS
  while (Date.now() < started) {
    if (meaningful(await screenReader.spokenPhraseLog()).length > 0) break
    await sleep(POLL_MS)
  }

  // Never the first phrase and out: the announcement is finished when the log
  // has been the same length for `QUIET_MS`.
  const ceiling = Date.now() + SPEECH_MS
  let seen = -1
  let unchangedSince = Date.now()
  while (Date.now() < ceiling) {
    const length = (await screenReader.spokenPhraseLog()).length
    if (length !== seen) {
      seen = length
      unchangedSince = Date.now()
    } else if (Date.now() - unchangedSince >= QUIET_MS) {
      break
    }
    await sleep(POLL_MS)
  }
  return meaningful(await screenReader.spokenPhraseLog())
}

/** Phrases compared the way this suite compares them: case and spacing do not count. */
export const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * The expected phrases not found in `log`, each searched for after the last
 * one found.
 *
 * A subset in order rather than an equality, for the reason the top of
 * `stories.spec.ts` gives: phrase boundaries move with timing and a reader
 * update rewords things, so what a person approves is the phrases that must be
 * said and not the transcript around them.
 */
export function missingInOrder(log: readonly string[], expected: readonly string[]): string[] {
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

/** The phrases an approved file requires, with its comment lines dropped. */
export function approvedPhrases(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
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
 *
 * On VoiceOver a container is entered, read and left again. Only there: NVDA
 * reads the same content without being asked, and `interact` means something
 * else to it, so sending one would disturb a walk that already works.
 */
/** What one walk of a story produced, and how much of the story that was. */
export interface Walk {
  phrases: string[]
  /** Which limit ended it: a repeated phrase, silence, or the step budget. */
  ended: string
  steps: number
  /**
   * Containers the walk left before running out of items in them.
   *
   * The one kind of partial coverage this harness can *detect*. A story whose
   * approved file does not admit to it is a story whose approval quietly covers
   * a fifth of a grid, and a story that admits to a container it no longer
   * truncates has a ceiling that has lifted since someone approved it. Both are
   * changes to review; neither is visible in a list of phrases (#585).
   */
  truncated: string[]
}

export async function walk(screenReader: IScreenReader, maxSteps = MAX_STEPS): Promise<Walk> {
  const entered = new Set<string>()
  const truncated: string[] = []
  let steps = 0
  let last = ''
  let repeats = 0
  let silent = 0

  /** One `next`, and what it made the reader say. Counts against the budget. */
  const step = async (): Promise<string> => {
    steps += 1
    await screenReader.next()
    return (await screenReader.lastSpokenPhrase()).trim()
  }

  while (steps < maxSteps && repeats < 3 && silent < 5) {
    const said = await step()
    if (said === '' || BLANK.test(said)) {
      silent += 1
      continue
    }
    silent = 0
    repeats = said === last ? repeats + 1 : 0
    last = said

    // Each container once. Re-entering one is how a walk stops going
    // anywhere while still saying something every time.
    if (reader !== 'voiceover' || !CONTAINER.test(said) || entered.has(said)) continue
    entered.add(said)
    await screenReader.interact()
    let quiet = 0
    let previous = ''
    // Whether the loop below stopped because the container ran out or because
    // the budget did. `INSIDE_STEPS` reached is the second, and it is the
    // difference between "that is all the container says" and "that is all we
    // listened to" -- which a phrase log cannot express and an approved file
    // has to declare.
    let spent = true
    for (let inside = 0; inside < INSIDE_STEPS && steps < maxSteps; inside++) {
      const item = await step()
      if (item === '') {
        quiet += 1
        if (quiet >= 3) {
          spent = false
          break
        }
        continue
      }
      quiet = 0
      if (item === previous) {
        spent = false
        break
      }
      previous = item
    }
    if (spent) truncated.push(said)
    await screenReader.stopInteracting()
    // Leaving one often re-announces it, which is a repeat of the phrase this
    // step started on and would end the walk three containers early. The
    // counters start again from outside the container.
    last = ''
    repeats = 0
    silent = 0
  }

  // Which limit ended it, in the run log.
  //
  // The three are different findings and the phrase log cannot tell them
  // apart. Run 36285106553 made that concrete: NVDA said the same eight
  // phrases for the Dialog story closed and open, so it plainly never reached
  // the dialog -- and whether it gave up on silence, on a repeat, or on the
  // budget was left to be guessed at, which decides whether raising a
  // tolerance would reach further or whether the content is not in its buffer
  // at all. One line costs nothing and answers it next time.
  const ended =
    repeats >= 3 ? 'a repeated phrase' : silent >= 5 ? 'silence' : `the ${maxSteps}-step budget`
  const cut = truncated.length > 0 ? `, truncating ${truncated.length}` : ''
  console.log(`[walk] ${reader} ended on ${ended} after ${steps} steps${cut}`)

  return { ended, phrases: await screenReader.spokenPhraseLog(), steps, truncated }
}
