// The /docs component previews, captured on a device (#1159).
//
// Opens each `UI/Docs` story by its id, waits for its marker -- or for the
// marker its error boundary shows -- and takes a screenshot. A demo that
// fails, or never appears, is recorded and the walk goes on: the docs show
// what Native makes of each component, a broken one included, and one bad
// demo must not cost the other thirty-eight their pictures.
//
// The manifest says what each image is of: the page, how it went, and the
// commit and time it was taken, which the docs print beside it so a picture
// up to a week old is not mistaken for the current Web preview.

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { UI_DOC_PAGES } from './ui-docs-pages.mjs'

export const uiDocStoryId = (page) => `ui-docs--${page}`

/** What Storybook's own boundary shows when a story throws past ours. */
export const STORYBOOK_FAILURE = 'Something went wrong rendering your story'

/**
 * @param {{
 *   open: (storyId: string) => void,
 *   waitForEither: (labels: string[], timeout: number) => Promise<string>,
 *     -- once any of `labels` is on screen, the first of them, in the
 *     order given, that is on screen anywhere. A demo that throws inside
 *     its surface shows its failure and the surface's marker together, so
 *     which one a device happens to find first must not decide.
 *   settle: () => Promise<void>,
 *   capture: (name: string) => void,
 *   logs?: () => string,
 * }} device
 */
export async function exerciseUiDocs(
  device,
  output,
  {
    pages = UI_DOC_PAGES,
    timeout = 30_000,
    now = () => new Date(),
    platform = 'android',
    logFile = 'logcat.txt',
  } = {},
) {
  const manifest = {
    platform,
    commit: process.env.GITHUB_SHA ?? null,
    takenAt: now().toISOString(),
    pages: {},
  }
  for (const page of pages) {
    const ready = `UI docs ${page}`
    const failed = `UI docs ${page} failed`
    try {
      device.open(uiDocStoryId(page))
      // A failure is either ours, named, or Storybook's, which says only that
      // something went wrong; both are failures, not a 30-second wait.
      const seen = await device.waitForEither([failed, STORYBOOK_FAILURE, ready], timeout)
      await device.settle()
      device.capture(page)
      manifest.pages[page] = { status: seen === ready ? 'ok' : 'failed', image: `${page}.png` }
    } catch (error) {
      manifest.pages[page] = { status: 'unreached', reason: String(error?.message ?? error) }
      try {
        device.capture(page)
        manifest.pages[page].image = `${page}.png`
      } catch {
        /* Nothing to show; the reason stands. */
      }
    }
  }
  writeFileSync(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  // What each failure threw, which the screenshot shows only in part.
  try {
    if (device.logs) writeFileSync(resolve(output, logFile), device.logs())
  } catch {
    /* The manifest stands without it. */
  }
  const reached = Object.values(manifest.pages).filter((entry) => entry.status !== 'unreached')
  // Only a walk that showed nothing at all is a failure of the walk itself.
  if (reached.length === 0) throw new Error('No UI docs story could be opened')
  return manifest
}
