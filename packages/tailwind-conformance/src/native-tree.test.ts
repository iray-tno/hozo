// The accessibility contract, asked of a device rather than of a string.
//
// `a11y-contextual.ts` checks that the compiler *emitted*
// `accessibilityRole="list"`. This checks that Android did something with
// it -- which is a different claim, and the one a screen reader answers to.
// #260 could only ask the first; #297 is where the second becomes possible.
//
// The dump in `fixtures/` is real. It came off the emulator in the first
// run of the `native` workflow that went green, which is the first time
// anything in this repository had executed Hozo's Native output on React
// Native at all. Checked in so the comparison runs offline and always,
// rather than weekly and only when a device is up.
//
// That makes this two tests wearing one coat, and the split is deliberate:
// the fixture keeps the adapter honest at every commit, and the same
// functions run against a fresh dump in the device job. Neither can drift
// from the other, because there is only one of them.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  ANDROID_ROLE_CLASSES,
  announcedByCompiler,
  divergences,
  missingOnDevice,
  parseAndroidDump,
} from './native-tree.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const dump = readFileSync(path.join(here, 'fixtures', 'android-acceptance-screen.xml'), 'utf8')
const appSource = readFileSync(
  path.join(here, '..', '..', '..', 'examples', 'native-demo', 'App.tsx'),
  'utf8',
)

const device = parseAndroidDump(dump)
const compiled = announcedByCompiler(appSource)

test('the dump yields the elements the source named, and no Android furniture', () => {
  // `android:id/content` and `…:id/action_bar_root` are in every dump and
  // belong to the platform rather than to any source.
  assert.deepEqual([...device.keys()].sort(), [
    'smoke-grid',
    'smoke-horizontal-scroll',
    'smoke-image',
    'smoke-input',
    'smoke-interaction',
    'smoke-list',
    'smoke-pan-responder',
    'smoke-row-one',
    'smoke-row-three',
    'smoke-row-two',
  ])
})

test('a role the compiler asked for is a widget the platform chose', () => {
  // The whole point. React Native does not carry `accessibilityRole`
  // through as data -- it picks an Android class, and the class is where
  // TalkBack reads the role from. So this is the only place the question
  // can actually be answered.
  assert.equal(device.get('smoke-list')?.role, 'list')
  assert.equal(device.get('smoke-interaction')?.role, 'button')
})

test('an accessible name reaches the tree, and the placeholder is not it', () => {
  // `VALIDATION.md` asks for exactly this and had no way to check it:
  // "the input is announced as Email address ... the placeholder is not
  // used as its name". `content-desc` is the name; the placeholder stays
  // in `text`, where a screen reader will not read it as one.
  assert.equal(device.get('smoke-input')?.name, 'Email address')
  assert.match(dump, /text="you@example\.com"/)
  assert.equal(device.get('smoke-image')?.name, 'React Native logo')
})

test('each virtual row appears once', () => {
  // The other half of the same checklist line. A virtualized list that
  // announced a row twice would read twice.
  for (const row of ['smoke-row-one', 'smoke-row-two', 'smoke-row-three']) {
    assert.equal((dump.match(new RegExp(`resource-id="${row}"`, 'g')) ?? []).length, 1, row)
  }
})

test('what the compiler emitted is what the device exposes', () => {
  // The differential, and the reason no expectation is written down here.
  // One side is the compiler's own output for `App.tsx`, the other is the
  // emulator's tree, joined on `testID`.
  assert.deepEqual(divergences(compiled, device), [])
})

test('the compiler named these, so the screen has to have rendered them', () => {
  // A `testID` in the output and not in the tree is a screen that did not
  // draw it -- a different failure from a mismatched role, and worth its
  // own message.
  assert.deepEqual(missingOnDevice(compiled, device), [])
})

test('the comparison is actually comparing something', () => {
  // Every assertion above passes trivially if one side is empty, which is
  // the way a differential test rots. Both sides have to be populated and
  // the join has to hit.
  assert.ok(compiled.size >= 5, `the compiler named ${compiled.size} elements`)
  assert.ok(device.size >= 5, `the dump named ${device.size} elements`)
  const joined = [...compiled.keys()].filter((id) => device.has(id))
  assert.ok(joined.length >= 4, `only ${joined.length} elements are in both`)
  // And at least one of them has to be carrying a role, or the role
  // mapping is never exercised.
  assert.ok(
    joined.some((id) => compiled.get(id)?.role !== undefined),
    'no element in both sides carries a role',
  )
})

test('every testID written in the source survives into the comparison', () => {
  // The guard both of this file's own bugs got past.
  //
  // Reading the compiled JSX with a pattern that stopped at the first `>`
  // stopped inside an arrow function and lost `smoke-interaction`; a
  // scanner that skipped past an element's `>` lost every element nested
  // in a prop and kept one. Each time the differential above still
  // passed, because comparing an empty side to a full one finds no
  // disagreement and says so.
  //
  // So: the source names these literally, and the compiled side has to
  // account for every one of them. There is no exception list, and if one
  // is ever needed it should carry the reason -- a `testID` the compiler
  // drops is a finding rather than a fact about this test.
  const written = new Set(
    [...appSource.matchAll(/testID="([^"]+)"/g)].map((match) => match[1] as string),
  )
  assert.ok(written.size >= 7, `only ${written.size} literal testIDs found in App.tsx`)
  const lost = [...written].filter((id) => !compiled.has(id)).sort()
  assert.deepEqual(lost, [], `named in App.tsx and absent from the compiled output: ${lost}`)
})

test('a role that disappeared is reported', () => {
  // Mutation, in the test rather than in the source: the fixture is
  // evidence and editing it would be editing the evidence. A device that
  // stopped choosing `Button` has to show up as a divergence.
  const flattened = dump.replace('android.widget.Button', 'android.view.ViewGroup')
  const found = divergences(compiled, parseAndroidDump(flattened))
  assert.deepEqual(found, [
    { testID: 'smoke-interaction', field: 'role', compiled: 'button', device: undefined },
  ])
})

test('a name that changed is reported', () => {
  const renamed = dump.replace('content-desc="Email address"', 'content-desc="Email"')
  const found = divergences(compiled, parseAndroidDump(renamed))
  assert.deepEqual(found, [
    { testID: 'smoke-input', field: 'name', compiled: 'Email address', device: 'Email' },
  ])
})

test('the role table is measured rather than guessed', () => {
  // It grows one row at a time, from dumps that exist. A row for a widget
  // nothing has rendered would read as a fact and be an assumption, so
  // every entry has to be exercised by a fixture.
  const exercised = new Set([...device.values()].map((node) => node.role).filter(Boolean))
  assert.deepEqual(
    Object.keys(ANDROID_ROLE_CLASSES).filter((role) => !exercised.has(role)),
    [],
    'a role is mapped that no checked-in dump demonstrates',
  )
})
