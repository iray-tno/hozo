// Which way of driving a grid a real reader actually announces.
//
// `scenarios.spec.ts` was written on the assumption that a focus change is
// announced whoever caused it, so the keys could be delivered over CDP and
// neither reader would need its mode changed. Run 36357458553 says no: on both
// readers, focusing a cell said nothing and an arrow key said nothing, eight
// scenarios in a row on each platform.
//
// That failure is legible -- the guard in `scenarios.spec.ts` fires with its
// own message rather than looking like a calendar defect -- and it is all it
// is. It does not say *why*, and there are at least four candidates:
//
//   1. the page never moved focus, so there was nothing to announce;
//   2. the page moved focus and the reader does not announce a focus change it
//      did not cause;
//   3. NVDA's browse mode swallowed the key before the page saw it -- which CDP
//      was supposed to make impossible, since it is not an OS keystroke;
//   4. the reader was not reading this page at all.
//
// Three wrong diagnoses were shipped for one symptom in this suite already
// (#580, #592, then the measurement in #598 that found `navigateToWebContent`
// sending an Escape). So this file measures instead of choosing. It drives the
// same grid five ways in one pass, prints what each produced next to what the
// page's `document.activeElement` was afterwards, and asserts almost nothing.
//
// `document.activeElement` is what separates candidates 1 and 2, and it is the
// question the last run could not answer. If focus moved and nothing was said,
// the mechanism is wrong. If focus did not move, the delivery is wrong.
//
// `next` at the end is the control. It is how every other spec in this suite
// makes a reader speak, so if that says nothing either, the run is broken and
// nothing above it means anything.
//
// Delete this file once `scenarios.spec.ts` is driving the grid the way this
// says to. It is a measurement, not a test.

import { screenReaderTest as test } from '@guidepup/playwright'
import type { Page } from '@playwright/test'

import { enterPage, meaningful, reader, spokenAfter, startOptions } from './reader.ts'

const STORY = 'form-date-and-time--month-grid'

/** The focused element, named the way the reader would name it. */
async function focusedNow(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const node = document.activeElement
    if (node === null) return '(none)'
    const name = node.getAttribute('aria-label') ?? node.textContent?.trim().slice(0, 40) ?? ''
    return `${node.tagName.toLowerCase()}[role=${node.getAttribute('role') ?? '-'}, tabindex=${node.getAttribute('tabindex') ?? '-'}] "${name}"`
  })
}

test.use({ screenReaderStartOptions: startOptions })

test('what a grid announces, and to which way of driving it', async ({ page, screenReader }) => {
  await page.goto(`/iframe.html?id=${STORY}&viewMode=story`, { waitUntil: 'load' })
  await page.locator('#storybook-root > *').first().waitFor()
  await enterPage(page, screenReader)

  const entry = page.locator('[role="gridcell"][tabindex="0"]')
  await entry.waitFor()

  const report: string[] = []
  const probe = async (what: string, act: () => Promise<void>) => {
    let said: string[] = []
    let failed = ''
    try {
      said = await spokenAfter(screenReader, act)
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error)
    }
    report.push(
      `  ${what}\n    said: ${said.length > 0 ? JSON.stringify(said) : '(nothing)'}\n    focus: ${await focusedNow(page)}${failed === '' ? '' : `\n    threw: ${failed}`}`,
    )
  }

  // 1. Focus over CDP. What `scenarios.spec.ts` does to arrive on the grid.
  await probe('A  entry.focus() over CDP', () => entry.focus())

  // 2. A key over CDP. What it does for every step after that.
  await probe('B  page.keyboard ArrowRight over CDP', () => page.keyboard.press('ArrowRight'))

  // 3. The same key as a real OS keystroke, through the reader. This is what
  //    browse mode can intercept, and on VoiceOver it is simply a key press.
  await probe('C  screenReader.press ArrowRight', () => screenReader.press('ArrowRight'))

  // 4. NVDA only: focus mode first, which is what hands the arrow keys to the
  //    widget instead of to the virtual buffer. `startOptions` deliberately
  //    turns off the automatic switch, so if C is silent this is the reason
  //    and this is the fix.
  const commands = (screenReader as { keyboardCommands?: Record<string, unknown> }).keyboardCommands
  const toFocusMode = commands?.['toggleBetweenBrowseAndFocusMode']
  if (toFocusMode !== undefined) {
    await probe('D1 toggleBetweenBrowseAndFocusMode', () =>
      (screenReader as unknown as { perform: (c: unknown) => Promise<void> }).perform(toFocusMode),
    )
    await probe('D2 screenReader.press ArrowRight, in focus mode', () =>
      screenReader.press('ArrowRight'),
    )
  } else {
    report.push('  D  no toggleBetweenBrowseAndFocusMode on this reader (expected on VoiceOver)')
  }

  // 5. The control: the reader's own command, which every other spec uses.
  await probe('E  screenReader.next()', () => screenReader.next())

  console.log(`[probe] ${reader} on ${STORY}\n${report.join('\n')}`)

  // The only assertion. A run where even `next` says nothing is a broken run,
  // and reading anything into the four probes above it would be reading noise.
  const control = meaningful(await screenReader.spokenPhraseLog())
  if (control.length === 0) {
    throw new Error(
      `${reader} said nothing to any of five ways of driving the page, its own next() included, so this run read nothing at all`,
    )
  }
})
