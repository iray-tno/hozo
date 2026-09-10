// The page `check-list.mjs` drives. Runs in a browser, not in Node.
//
// Everything about windowing that matters needs layout: a mounted-node
// count is only bounded if rows have heights, a scroll position only jumps
// if something was measured, and `inverted` is a claim about what the
// reader sees. jsdom has no layout at all -- every box is zero by zero --
// so a test written against it would agree with any implementation,
// including the one that mounts all ten thousand rows.
//
// The page runs the scenarios itself and writes the answers into
// `#results`; the script outside reads them from a DOM dump. That is the
// same arrangement `apps/landing/scripts/check-repl.mjs` uses, and for the
// same reason: driving a browser from outside needs a protocol client, and
// driving it from inside needs a `<script>`.

import { createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { HozoFlatList, type HozoFlatListHandle } from '../src/list.ts'

interface Row {
  id: string
  height: number
}

/** Heights that vary the way a feed's do, and deterministically. */
function rows(count: number, from = 0): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${from + index}`,
    height: 40 + ((from + index) % 5) * 30,
  }))
}

const results: Record<string, unknown> = {}
let handle: HozoFlatListHandle | null = null
let prepend: (() => void) | null = null

function List({ inverted }: { inverted?: boolean }) {
  const [data, setData] = useState(() => rows(10_000))
  prepend = () => setData((current) => [...rows(10, 100_000), ...current])
  return createElement(HozoFlatList<Row>, {
    data,
    keyExtractor: (item: Row) => item.id,
    renderItem: ({ item }: { item: Row }) =>
      createElement('div', { style: { height: item.height } }, item.id),
    estimatedItemSize: 100,
    inverted,
    maintainVisibleContentPosition: { minIndexForVisible: 0 },
    style: { height: 600 },
    ref: (element: HozoFlatListHandle | null) => {
      handle = element
    },
  })
}

/** One turn of the event loop, which is where a scroll event is delivered. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 16))

/**
 * Waits for the page to actually be in the state the step is about.
 *
 * Fixed delays were flaky here and not slightly: a programmatic
 * `scrollTop` assignment delivers its `scroll` event asynchronously, and
 * under a virtual time budget the timers a delay is made of run *sooner*
 * than the event does. The same run reported the window following the
 * scroll and, on the next attempt, not following it at all.
 */
async function waitFor(what: string, ready: () => boolean, turns = 200) {
  for (let turn = 0; turn < turns; turn++) {
    if (ready()) return
    await tick()
  }
  throw new Error(`timed out waiting for ${what}`)
}

/** A few more turns after a condition holds, for whatever it settles into. */
async function settle(turns = 6) {
  for (let turn = 0; turn < turns; turn++) await tick()
}

function scroller(): HTMLElement {
  const element = document.querySelector<HTMLElement>('#app > div')
  if (!element) throw new Error('no scroller')
  return element
}

/** Rows currently in the document, which is the number #385 is about. */
function mountedRows(): number {
  return document.querySelectorAll('[data-hozo-list-row]').length
}

/** The row index drawn at the top edge of the viewport. */
function rowAtViewportTop(): number | undefined {
  const root = scroller()
  const box = root.getBoundingClientRect()
  for (const element of document.querySelectorAll<HTMLElement>('[data-hozo-list-row]')) {
    const rect = element.getBoundingClientRect()
    if (rect.bottom > box.top + 1) return Number(element.dataset.hozoListRow)
  }
  return undefined
}

/** The first mounted row index, which is where the window currently is. */
function firstMountedRow(): number {
  const element = document.querySelector<HTMLElement>('[data-hozo-list-row]')
  return element ? Number(element.dataset.hozoListRow) : -1
}

async function run() {
  const container = document.getElementById('app') as HTMLElement
  const root = createRoot(container)
  root.render(createElement(List, {}))
  await waitFor('the first rows to mount', () => mountedRows() > 0)
  await settle()

  results.mountedAtRest = mountedRows()
  results.total = 10_000

  // Scrolled a long way in: the window has to be bounded there too, and the
  // content under the viewport has to be the content that belongs there.
  scroller().scrollTop = 200_000
  await waitFor('the window to follow the scroll', () => firstMountedRow() > 100)
  await settle()
  results.mountedScrolled = mountedRows()
  results.topRowScrolled = rowAtViewportTop()
  results.scrollTopAfterSettle = scroller().scrollTop
  results.scrollHeight = scroller().scrollHeight

  // The rows around the viewport are measured by now, so their heights are
  // the real ones rather than the estimate. A window that had kept the
  // estimate would put the wrong rows on screen.
  const top = rowAtViewportTop()
  results.topRowVisible =
    top !== undefined &&
    (document.querySelector(`[data-hozo-list-row="${top}"]`)?.getBoundingClientRect().height ?? 0) >
      0

  // `scrollToIndex` to a row nothing has measured: the estimate puts the
  // scroller near it, the rows that land there report their sizes, and the
  // correction settles. React Native throws here instead.
  handle?.scrollToIndex({ index: 5000 })
  await waitFor(
    'scrollToIndex to reach its row',
    () => document.querySelector('[data-hozo-list-index="5000"]') !== null,
    200,
  )
  await settle(20)
  const target = document.querySelector<HTMLElement>('[data-hozo-list-index="5000"]')
  const viewport = scroller().getBoundingClientRect()
  results.scrollToIndexMounted = Boolean(target)
  results.scrollToIndexOffset = target
    ? Math.round(target.getBoundingClientRect().top - viewport.top)
    : undefined

  // `maintainVisibleContentPosition`: ten rows inserted above the reader,
  // and the row they were reading has to stay where it was on screen.
  const before = rowAtViewportTop() ?? 0
  const beforeTop =
    (document
      .querySelector<HTMLElement>(`[data-hozo-list-row="${before}"]`)
      ?.getBoundingClientRect().top ?? 0) - viewport.top
  prepend?.()
  await waitFor(
    'the prepended rows to be accounted for',
    () => document.querySelector(`[data-hozo-list-row="${before + 10}"]`) !== null,
  )
  await settle(20)
  const after = document.querySelector<HTMLElement>(`[data-hozo-list-row="${before + 10}"]`)
  results.anchorDriftPx = after
    ? Math.round(after.getBoundingClientRect().top - viewport.top - beforeTop)
    : undefined

  // `inverted`, in a second root: row 0 is drawn at the *bottom* of the
  // viewport, which is the whole of what the prop means.
  root.unmount()
  const invertedRoot = createRoot(container)
  invertedRoot.render(createElement(List, { inverted: true }))
  await waitFor('the inverted list to mount', () => mountedRows() > 0)
  await settle()
  const invertedViewport = scroller().getBoundingClientRect()
  const firstBox = document
    .querySelector<HTMLElement>('[data-hozo-list-index="0"]')
    ?.getBoundingClientRect()
  results.invertedFirstRowFromBottom = firstBox
    ? Math.round(invertedViewport.bottom - firstBox.bottom)
    : undefined
  results.invertedMounted = mountedRows()
}

declare global {
  interface Window {
    __hozoRunListProbe?: () => Promise<Record<string, unknown>>
  }
}

// Exposed rather than invoked: the harness outside drives this over the
// DevTools protocol and reads the answer as a value. It used to run itself
// and write into the page for a DOM dump, which needed
// `--virtual-time-budget` to hold the dump back -- and virtual time runs a
// timer sooner than it delivers a scroll event, so a programmatic scroll
// was routinely still pending when the step that depended on it ran.
window.__hozoRunListProbe = async () => {
  await run()
  return results
}
