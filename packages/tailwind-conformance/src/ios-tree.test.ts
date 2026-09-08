// The same question as `native-tree.test.ts`, asked of the other platform.
//
// That file compares what the compiler emitted against what Android's
// `uiautomator` reports. This one compares it against what XCUITest
// reports, through the second adapter onto the same vocabulary -- the shape
// #297 called for and #178, #184 and #218 arrived at before it: each
// platform's measurement is its own, the rule is shared.
//
// The trees in `fixtures/` are real. They came off the simulator in the
// first run of the `native` workflow that read one, which is the first time
// anything in this repository had asked iOS what it announces. Checked in
// so the comparison runs offline and always, rather than weekly and only
// when a simulator is up; `native-tree-check.ts` runs the same functions
// against a fresh tree inside the job.
//
// The interesting output is not that the two sides agree. It is the one
// place they do not, which is a fact about iOS rather than a defect.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  announcedByCompiler,
  divergences,
  IOS_ROLE_TYPES,
  missingOnDevice,
  parseIosTree,
  ROLE_NOT_ON_PLATFORM,
  unexplainedAbsences,
  unexplainedDivergences,
} from './native-tree.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (name: string) => readFileSync(path.join(here, 'fixtures', name), 'utf8')
const acceptance = read('ios-acceptance-screen.json')
const gallery = read('ios-gallery-screen.json')
const appSource = readFileSync(
  path.join(here, '..', '..', '..', 'examples', 'native-demo', 'App.tsx'),
  'utf8',
)

const device = parseIosTree(acceptance)
const compiled = announcedByCompiler(appSource)

test('the tree yields the elements the source named, and none of iOS’s own', () => {
  // The window, the status bar and UIKit's scaffolding carry no
  // identifier, so they never reach this side. Android's furniture *is*
  // named -- `android:id/content` -- and has to be filtered; iOS's is
  // simply nameless, which is the one place this adapter is simpler.
  assert.deepEqual([...device.keys()].sort(), [
    'smoke-gallery',
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

test('a role the compiler asked for is a type the platform chose', () => {
  // React Native does not carry `accessibilityRole` through as data on
  // iOS either: it sets a type and traits on the view, and `elementType`
  // is what XCUITest reports back.
  assert.equal(device.get('smoke-interaction')?.role, 'button')
  assert.equal(device.get('smoke-gallery')?.role, 'button')
  assert.equal(device.get('smoke-image')?.role, 'image')
})

test('an accessible name reaches the tree, and the placeholder is not it', () => {
  // The same line of `VALIDATION.md` the Android fixture answers: "the
  // input is announced as Email address ... the placeholder is not used as
  // its name". On iOS the name is `label` and the placeholder stays in
  // `value`, where a screen reader does not read it as one.
  assert.equal(device.get('smoke-input')?.name, 'Email address')
  assert.equal(device.get('smoke-image')?.name, 'React Native logo')
  assert.match(acceptance, /"you@example\.com"/)
  assert.doesNotMatch(JSON.stringify(device.get('smoke-input')), /you@example/)
})

test('the list role does not survive, and that is the platform rather than a bug', () => {
  // The one divergence, and the reason this file is worth having. The
  // compiler emits `accessibilityRole="list"`, Android renders an
  // `AbsListView` and announces it, and iOS renders a plain view that
  // XCUITest reports as `other`. There is no element type in between, so
  // there is nothing for Hozo to emit instead.
  //
  // Recorded as data in `ROLE_NOT_ON_PLATFORM` so the device job forgives
  // exactly this and nothing else.
  assert.deepEqual(divergences(compiled, device), [
    { testID: 'smoke-list', field: 'role', compiled: 'list', device: undefined },
  ])
  assert.deepEqual(Object.keys(ROLE_NOT_ON_PLATFORM.ios as object), ['list'])
  assert.deepEqual(unexplainedDivergences(compiled, device, 'ios'), [])
})

test('and Android loses nothing the acceptance screen asks for', () => {
  // The asymmetry runs both ways, and stating it here keeps the two
  // adapters from being read as one platform's failings. `android-roles`
  // has the other direction: Android drops every landmark, and iOS was
  // measured doing the same.
  assert.deepEqual(ROLE_NOT_ON_PLATFORM.android, {})
})

test('the resting screen shows everything except the thing that is closed', () => {
  assert.deepEqual(missingOnDevice(compiled, device), ['smoke-dialog'])
  assert.deepEqual(unexplainedAbsences(compiled, device), [])
})

test('the comparison is actually comparing something', () => {
  // Every assertion above passes trivially if one side is empty, which is
  // how a differential test rots -- three times in this package so far.
  assert.ok(compiled.size >= 5, `the compiler named ${compiled.size} elements`)
  assert.ok(device.size >= 5, `the tree named ${device.size} elements`)
  const joined = [...compiled.keys()].filter((testID) => device.has(testID))
  assert.ok(joined.length >= 4, `only ${joined.length} elements are in both`)
})

test('the type table is measured rather than guessed', () => {
  // The rule `ANDROID_ROLE_CLASSES` grows by, applied to this side: a row
  // for a type nothing has rendered would look exactly like a fact.
  const rendered = new Set(
    (JSON.parse(acceptance) as { type: string }[])
      .concat(JSON.parse(gallery))
      .map((element) => element.type),
  )
  for (const type of Object.keys(IOS_ROLE_TYPES)) {
    assert.ok(rendered.has(type), `${type} is in the table and in neither fixture`)
  }
})

test('the census reaches every primitive the gallery renders', () => {
  // The screen `gallery.test.ts` guards against a primitive being added
  // and never rendered, seen from the device end.
  const census = parseIosTree(gallery)
  assert.ok(census.size >= 40, `the gallery tree named ${census.size} elements`)
  assert.equal(census.get('gallery-Link')?.role, 'link')
  assert.equal(census.get('gallery-Button')?.name, 'A button')
})

test('the two fixes a device found are still fixed', () => {
  // `Separator` drew nothing and `Progress` had no box, and both were
  // found by putting them on a screen (#309, #311, #314). The frames say
  // they are still there, which is a claim no compiled string can make:
  // the compiler emitting `height: 1` and the platform drawing one pixel
  // are different facts.
  const elements = JSON.parse(gallery) as { identifier: string; frame: number[] }[]
  const frameOf = (id: string) => elements.find((element) => element.identifier === id)?.frame
  assert.equal(frameOf('gallery-Separator')?.[3], 1, 'the separator is not one pixel tall')
  assert.deepEqual(
    frameOf('gallery-Progress')?.slice(2),
    [160, 16],
    'the progress bar lost its box',
  )
})
