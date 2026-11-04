// Can this runner drive the reader at all? Asked once, before the suite (#631).
//
// A macOS runner sometimes will not let `osascript` send Apple events to the
// browser or to VoiceOver ("-1743", "VoiceOver cannot be started"). When that
// happens, it happens to every test: run 41756439909 spent its whole job
// failing 41 tests three times each, about 50 seconds a try, and judged no
// reading. This asks the same things the suite needs -- start the reader,
// bring the page to the front, read one phrase -- so the workflow can retry
// the environment, or stop with the runner named, before any reading is
// judged.
//
// It runs only when `READER_PREFLIGHT` is set (`playwright.config.ts`), and is
// never part of the suite's verdict. It asserts that something was said, not
// what.

import { screenReaderTest as test } from '@guidepup/playwright'

import { enterPage, meaningful, startOptions } from './reader.ts'

test.use({ screenReaderStartOptions: startOptions })

test('the reader can be driven on this runner', async ({ page, screenReader }) => {
  await page.goto('/fixtures/tree-shape.html', { waitUntil: 'load' })
  await enterPage(page, screenReader)
  await screenReader.next()
  const said = meaningful(await screenReader.spokenPhraseLog())
  if (said.length === 0) throw new Error('the reader started and said nothing')
  console.log(`[preflight] ${said[0]}`)
})
