// Everything `@hozo/core` publishes is on the census screen, or excused.
//
// `examples/native-demo/Gallery.tsx` exists so a device can be asked about
// every primitive rather than the eight that happened to be arranged into
// an acceptance screen. That is only true while it stays complete, and a
// hand-written screen does not stay complete on its own -- which is the
// failure this repository keeps finding, in `WEB_ONLY`, in the fallback
// list, in the two `Dialog` copies.
//
// So the screen is hand-written and this is what keeps it honest. A
// component added to `@hozo/core` later has to be rendered there or
// written down here with the reason, and nothing gets to be neither.
//
// It also renders the screen, because a census nothing has ever run is a
// list rather than a census.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react') as {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
}
const renderer = require('react-test-renderer') as {
  create: (element: unknown) => { toJSON: () => unknown }
  act: (callback: () => void) => void
}
const core = require('../../core/src/index.native.ts') as Record<string, unknown>

const here = path.dirname(fileURLToPath(import.meta.url))
const gallerySource = readFileSync(
  path.join(here, '..', '..', '..', 'examples', 'native-demo', 'Gallery.tsx'),
  'utf8',
)

/**
 * Components the census screen does not render, with the reason.
 *
 * Kept as a list so adding to it is a decision someone writes down.
 */
const NOT_ON_THE_SCREEN = new Map([
  [
    'Combobox',
    'An ARIA pattern driven by `options` rather than children, with its own ' +
      'tests in `@hozo/core`. It also takes no `testID`, so a device could not ' +
      'find it on the screen even if it were there -- which is a finding of ' +
      'its own rather than a reason to widen this change.',
  ],
  ['Listbox', 'As `Combobox`.'],
  ['Menu', 'As `Combobox`, driven by `items`.'],
  ['RadioGroup', 'As `Combobox`.'],
  ['Tabs', 'As `Combobox`, driven by `tabs`.'],
  ['Toolbar', 'As `Combobox`, driven by `items`.'],
  ['Tree', 'As `Combobox`, driven by `nodes`.'],
  ['HozoCombobox', 'The same component under its other published name.'],
  ['HozoListbox', 'The same component under its other published name.'],
  ['HozoMenu', 'The same component under its other published name.'],
  ['HozoRadioGroup', 'The same component under its other published name.'],
  ['HozoTabs', 'The same component under its other published name.'],
  ['HozoToolbar', 'The same component under its other published name.'],
  ['HozoTree', 'The same component under its other published name.'],
  [
    'Dialog',
    'On the acceptance screen instead, where the round trip that opens and ' +
      'dismisses it lives. A modal on a census screen would cover the census.',
  ],
])

/** Every `testID` the screen assigns, which is how the tree is joined to it. */
const rendered = new Set(
  [...gallerySource.matchAll(/testID="gallery-(\w+)"/g)].map((match) => match[1] as string),
)

test('the screen renders something for every component core publishes', () => {
  const missing = Object.entries(core)
    .filter(([name, value]) => /^[A-Z]/.test(name) && typeof value === 'function')
    .map(([name]) => name)
    .filter((name) => !rendered.has(name) && !NOT_ON_THE_SCREEN.has(name))
    .sort()
  assert.deepEqual(
    missing,
    [],
    `not on Gallery.tsx and not excused: ${missing.join(', ')}. Render it there, or add it to NOT_ON_THE_SCREEN with the reason.`,
  )
})

test('nothing is excused that the screen actually renders', () => {
  // A stale exception reads as a rule. If one of these is added to the
  // screen later, the note above it stops being true.
  const contradictory = [...NOT_ON_THE_SCREEN.keys()].filter((name) => rendered.has(name)).sort()
  assert.deepEqual(contradictory, [])
})

test('the census is a census rather than a list', () => {
  // Guards the two above. Both pass trivially if the regular expression
  // stops matching -- a rename of the `testID` convention, say -- and a
  // guard that silently matches nothing is the failure this file exists
  // to prevent one level up.
  assert.ok(rendered.size >= 35, `only ${rendered.size} testIDs found in Gallery.tsx`)
})

test('and it renders', () => {
  // A screen nothing has run is a list of imports. This is the cheapest
  // thing that says the tree assembles: the same stub the rest of this
  // package renders against, so it does not prove React Native accepts it
  // -- the device job does that -- only that nothing throws on the way.
  const Gallery = require('../../../examples/native-demo/Gallery.tsx') as {
    default: unknown
  }
  // `toJSON` after the callback, not inside it: within `act` the commit
  // has not happened and the answer is still null, which reads exactly
  // like a component that rendered nothing. `native-render.ts` documents
  // the same trap and I walked into it anyway.
  let root: { toJSON: () => unknown } | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(Gallery.default))
  })
  const tree = (root as { toJSON: () => unknown }).toJSON()
  assert.ok(tree, 'the gallery rendered nothing')

  // Walked rather than stringified. `JSON.stringify` on a rendered tree
  // throws the moment any prop holds a React element -- a
  // `ListHeaderComponent` is one -- because an element carries a fiber
  // that points back at the tree. The error then names a circular
  // structure rather than the screen, which is a poor way to find out
  // that somebody added a list.
  const ids = new Set<string>()
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const element = node as { props?: { testID?: unknown }; children?: unknown[] }
    if (typeof element.props?.testID === 'string') ids.add(element.props.testID)
    for (const child of element.children ?? []) walk(child)
  }
  walk(tree)

  for (const name of ['gallery-Heading', 'gallery-Ruby', 'gallery-Summary', 'gallery-Progress']) {
    assert.ok(ids.has(name), `${name} is not in the rendered tree`)
  }
})
