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

// The `UI/Shared state checks` stories (`src/UiStates.stories.tsx`): each
// control held in a known selected, expanded or disabled state, which #898
// asks to see on a device. Each screen's heading is its name.
export const UI_STATE_SCENES = [
  'Tabs',
  'Accordion',
  'Radio',
  'Listbox',
  'Menu',
  'Chip',
  'Pagination',
  'Tree',
  'Checkbox',
  'Switch',
]
export const uiStateStoryId = (scene) => `ui-shared-state-checks--${scene.toLowerCase()}`

// The `UI/Open overlays` stories (`src/UiOverlays.stories.tsx`): a dialog,
// a tooltip, a popover, a menu and a combobox held open, whose contents the
// docs demos and state screens never show. Each waits for text only the open
// overlay draws: a body the pattern has to put in a Text itself (#1306), or a
// menu item or option label.
export const UI_OVERLAY_SCENES = [
  { name: 'Dialog', ready: 'Dialog body, passed as a string' },
  { name: 'Tooltip', ready: 'Tooltip content, passed as a string' },
  { name: 'Popover', ready: 'Popover body, passed as a string' },
  { name: 'Menu', ready: 'Menu item, shown open' },
  { name: 'Combobox', ready: 'Combobox option, shown open' },
  { name: 'BottomSheet', ready: 'Bottom sheet body, shown open' },
  { name: 'Drawer', ready: 'Drawer body, shown open' },
  { name: 'RightDrawer', ready: 'Right drawer body, shown open' },
]
// The overlays pinned to an edge of the window, shot again in landscape, where
// a notch or a camera cut-out is on the left or the right.
export const UI_LANDSCAPE_OVERLAY_SCENES = UI_OVERLAY_SCENES.filter(({ name }) =>
  ['Menu', 'BottomSheet', 'Drawer', 'RightDrawer'].includes(name),
)
// Storybook splits an export name at its capitals: `BottomSheet` is
// `bottom-sheet`, and a story id that only lowercases it opens nothing.
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
export const uiOverlayStoryId = (name) => `ui-open-overlays--${kebab(name)}`

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
 *   rotate?: (landscape: boolean) => Promise<void>,
 *     -- without it, `landscape` scenes are skipped and say so.
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
    states = [],
    overlays = [],
    landscape = [],
  } = {},
) {
  const manifest = {
    platform,
    commit: process.env.GITHUB_SHA ?? null,
    takenAt: now().toISOString(),
    pages: {},
    states: {},
    overlays: {},
    landscape: {},
  }
  const visit = async (page) => {
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
  for (const page of pages) await visit(page)
  // Once more for a page that never appeared. The first deep link after a
  // cold launch can outlast the wait (iOS lost Accordion, the first page,
  // that way), and a later attempt costs one page, not a run.
  for (const page of pages) if (manifest.pages[page].status === 'unreached') await visit(page)
  // The state screens, after the pages and under their own key, so the docs,
  // which read `pages`, are unaffected. Images are `state-<name>.png`.
  const visitState = async (scene) => {
    const image = `state-${scene.toLowerCase()}`
    try {
      device.open(uiStateStoryId(scene))
      const seen = await device.waitForEither([STORYBOOK_FAILURE, scene], timeout)
      await device.settle()
      device.capture(image)
      manifest.states[scene] = { status: seen === scene ? 'ok' : 'failed', image: `${image}.png` }
    } catch (error) {
      manifest.states[scene] = { status: 'unreached', reason: String(error?.message ?? error) }
    }
  }
  for (const scene of states) await visitState(scene)
  // The open overlays, last and under their own key. Images are
  // `overlay-<name>.png`.
  const visitOverlay = async ({ name, ready }, key = 'overlays', prefix = 'overlay') => {
    const image = `${prefix}-${kebab(name)}`
    try {
      device.open(uiOverlayStoryId(name))
      const seen = await device.waitForEither([STORYBOOK_FAILURE, ready], timeout)
      await device.settle()
      device.capture(image)
      manifest[key][name] = { status: seen === ready ? 'ok' : 'failed', image: `${image}.png` }
    } catch (error) {
      manifest[key][name] = { status: 'unreached', reason: String(error?.message ?? error) }
      try {
        device.capture(image)
        manifest[key][name].image = `${image}.png`
      } catch {
        /* Nothing to show; the reason stands. */
      }
    }
  }
  for (const overlay of overlays) await visitOverlay(overlay)
  // The same overlays turned sideways, under their own key. Images are
  // `landscape-<name>.png`. Turned back afterwards whatever happened, so a
  // walk that goes on is upright.
  if (landscape.length > 0 && !device.rotate) {
    for (const { name } of landscape) {
      manifest.landscape[name] = { status: 'skipped', reason: 'this device cannot be rotated' }
    }
  } else if (landscape.length > 0) {
    try {
      await device.rotate(true)
      for (const overlay of landscape) await visitOverlay(overlay, 'landscape', 'landscape')
    } finally {
      await device.rotate(false)
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
