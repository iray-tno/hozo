import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { screenReaderTest as test } from '@guidepup/playwright'
import { expect, type TestInfo } from '@playwright/test'
import {
  approvedPhrases,
  enterFocusMode,
  enterPage,
  here,
  MAX_STEPS,
  MIN_SPOKEN,
  missingInOrder,
  onWindows,
  phrasesDir,
  reader,
  spokenAfter,
  startOptions,
  startRecording,
  walk,
} from './reader.ts'

interface Observation {
  action: string
  said: string[]
  facts: Record<string, unknown>
}

// New captures are evidence to review, not phrases an agent can approve for
// a person. Follow the existing calendar/story approval protocol.
function finish(
  name: string,
  story: string,
  observed: Observation[],
  testInfo: TestInfo,
  warmedUp: Observation[] = [],
) {
  const expectedFile = path.join(here, 'expected', reader, 'scenarios', `${name}.txt`)
  const approved = existsSync(expectedFile)
  writeFileSync(
    path.join(phrasesDir, `${name}.json`),
    `${JSON.stringify({ reader, story, approved, warmedUp, observed }, null, 2)}\n`,
  )
  console.log(`[scenario] ${name}\n${JSON.stringify({ approved, warmedUp, observed }, null, 2)}`)
  return () => {
    for (const step of observed)
      assert.ok(step.said.length > 0, `${reader} said nothing after ${step.action}`)
    if (!approved) {
      testInfo.annotations.push({
        type: 'unapproved-speech',
        description: `Review ${reader}/${name}.json and its recording before adding expected/${reader}/scenarios/${name}.txt. Speech correctness is not approved.`,
      })
      console.log(`[unapproved] ${reader}/${name}: captured, awaiting human phrase approval`)
      return
    }
    const missing = missingInOrder(
      observed.flatMap((step) => step.said),
      approvedPhrases(readFileSync(expectedFile, 'utf8')),
    )
    assert.deepEqual(missing, [], `${reader}: approved phrases missing from ${name}`)
  }
}

test.use({ screenReaderStartOptions: startOptions })

test('splitter announces resize, bounds, collapse and restoration', async ({
  page,
  screenReader,
}, testInfo) => {
  const name = 'splitter-resize-collapse-restore'
  const story = 'patterns-resizablepane--default'
  const stop = startRecording(name)
  const observed: Observation[] = []
  const warmedUp: Observation[] = []
  let verify: (() => void) | undefined
  try {
    await page.goto(`/iframe.html?id=${story}&viewMode=story`, { waitUntil: 'load' })
    await page.locator('#storybook-root > *').first().waitFor()
    await enterPage(page, screenReader)
    const handle = page.getByRole('separator', { name: 'Resize Files', exact: true })
    await handle.focus()
    if (onWindows) await enterFocusMode(screenReader)
    // Spend the reader's entry announcement before making claims about a key.
    for (const key of ['ArrowRight', 'ArrowLeft']) {
      const said = await spokenAfter(screenReader, () => screenReader.press(key))
      warmedUp.push({
        action: key,
        said,
        facts: { size: await handle.getAttribute('aria-valuenow') },
      })
    }
    assert.equal(await handle.getAttribute('aria-valuenow'), '144')
    for (const [key, size, collapsed] of [
      ['ArrowRight', 152, false],
      ['Home', 96, false],
      ['End', 240, false],
      ['Enter', 0, true],
      ['Enter', 240, false],
    ] as const) {
      const said = await spokenAfter(screenReader, () => screenReader.press(key))
      const facts = await handle.evaluate((node) => {
        const pane = document.getElementById(node.getAttribute('aria-controls') ?? '')
        return {
          size: node.getAttribute('aria-valuenow'),
          valueText: node.getAttribute('aria-valuetext'),
          paneExists: Boolean(pane),
          inert: pane?.hasAttribute('inert'),
          focused: node === document.activeElement,
        }
      })
      observed.push({ action: `${key}: size ${size}, collapsed ${collapsed}`, said, facts })
      assert.equal(facts.size, String(size))
      assert.equal(facts.inert, collapsed)
      assert.equal(facts.paneExists, true)
      assert.equal(facts.focused, true)
      assert.equal(
        await page.getByRole('region', { name: 'Files', exact: true }).count(),
        collapsed ? 0 : 1,
      )
    }
  } finally {
    stop()
    verify = finish(name, story, observed, testInfo, warmedUp)
  }
  assert.ok(verify)
  verify()
})

for (const activation of ['reader', 'browser'] as const) {
  test(`code block reads marked lines and announces ${activation} Enter copy`, async ({
    page,
    screenReader,
  }, testInfo) => {
    const name = activation === 'reader' ? 'code-block-lines-and-copy' : 'code-block-browser-copy'
    const story = 'patterns-codeblock--default'
    const stop = startRecording(name)
    const observed: Observation[] = []
    let verify: (() => void) | undefined
    try {
      await page.goto(`/iframe.html?id=${story}&viewMode=story`, { waitUntil: 'load' })
      // Chromium's automated context otherwise prompts for clipboard access.
      // Grant the actual browser permission; keep writeText and feedback real.
      if (onWindows)
        await page
          .context()
          .grantPermissions(['clipboard-write'], { origin: new URL(page.url()).origin })
      await page.locator('#storybook-root > *').first().waitFor()
      await enterPage(page, screenReader)
      const reading = await walk(screenReader, { page })
      const figure = page.getByRole('figure', { name: 'paths.ts', exact: true })
      const markup = {
        caption: await figure.locator('figcaption').textContent(),
        insertions: await figure.locator('ins').count(),
        deletions: await figure.locator('del').count(),
        highlights: await figure.locator('mark').count(),
        hiddenGutters: await figure.locator('code > span > [aria-hidden="true"]').count(),
      }
      observed.push({
        action: 'Read named figure, line marks and hidden gutter',
        said: reading.phrases,
        facts: {
          ...markup,
          ended: reading.ended,
          steps: reading.steps,
          truncated: reading.truncated,
        },
      })
      assert.ok(reading.phrases.length >= MIN_SPOKEN)
      assert.ok(
        reading.steps < MAX_STEPS,
        'the reader exhausted its budget before finishing the story',
      )
      assert.deepEqual(reading.truncated, [], 'the reader left code content unmeasured')
      assert.deepEqual(markup, {
        caption: 'paths.ts',
        insertions: 1,
        deletions: 1,
        highlights: 1,
        hiddenGutters: 5,
      })
      const copy = figure.getByRole('button', { name: 'Copy code', exact: true })
      await copy.focus()
      for (const copyNumber of [1, 2]) {
        // Initial command capture ends on the first event, even an empty phrase.
        // Require full speech from the reader's own key as well as from the
        // external-action capture; browser-only success must not hide a reader
        // activation failure. Never nest a reader command inside capture's queue.
        const said = await spokenAfter(screenReader, async () => {
          if (activation === 'reader') {
            await screenReader.press('Enter', { capture: true })
            await expect(copy).toHaveText('Copied', { timeout: 3000 })
          } else {
            await screenReader.capture(
              async () => {
                await page.keyboard.press('Enter')
                await expect(copy).toHaveText('Copied', { timeout: 3000 })
              },
              { capture: true },
            )
          }
        })
        const facts = {
          buttonText: await copy.textContent(),
          clipboardAvailable: await page.evaluate(() => Boolean(navigator.clipboard?.writeText)),
          clipboardWritePermissionGranted: onWindows,
          secureContext: await page.evaluate(() => isSecureContext),
          capture: activation === 'reader' ? 'full-reader-command' : 'full-through-copy-completion',
          rawSpeech: await screenReader.spokenPhraseLog(),
        }
        observed.push({
          action: `${activation} Enter: copy ${copyNumber} and completion announcement`,
          said,
          facts,
        })
        assert.equal(facts.buttonText, 'Copied')
      }
    } finally {
      stop()
      verify = finish(name, story, observed, testInfo)
    }
    assert.ok(verify)
    verify()
  })
}
