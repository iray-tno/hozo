// Where a screen reader is left looking when a dialog closes.
//
// TalkBack answered that question on an emulator before anything here did:
// after Back, it announced the email field above the button that had opened
// the dialog, not the button (#462). Nothing restored focus, because the
// Native `Dialog` had no way of knowing what to restore it to -- React Native
// has no `document.activeElement`, so `restoreFocusTo` is how it is told.
//
// A component test rather than a compiled fixture, for the reason
// `transition-restart.test.ts` gives: the behaviour is in the transition from
// open to closed, and `renderNative` builds one tree per call.
//
// The ref is a plain object rather than a mounted view. `react-test-renderer`
// gives host components no instances, so a real ref would be `null` here and
// the test would pass while asserting nothing. What this establishes is that
// the dialog resolves the ref it was given, requests focus on the closing edge,
// and retries after Android's window signal; whether TalkBack then announces
// that view is the emulator's half, which `android-talkback.sh` records.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

// Imported for its resolve hook: `react-native` has to be the stub before
// anything below pulls the patterns in.
import './native-render.ts'

const require = createRequire(import.meta.url)

const stub = require('./react-native-stub.js') as {
  AccessibilityInfo: { __hozoFocused: unknown[]; __hozoResetFocus: () => void }
  AppState: { __hozoWindowFocus: () => void }
  findNodeHandle: (node: unknown) => number | null
}
const react = require('react') as {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
}
const renderer = require('react-test-renderer') as {
  create: (element: unknown) => { update: (element: unknown) => void; unmount: () => void }
  act: (callback: () => void) => void
}
const { HozoDialog } = require('@hozo/patterns/generated/dialog') as {
  HozoDialog: unknown
}

/** A stand-in for the control that opened the dialog. */
const opener = () => ({ current: {} })

test('closing the dialog retries focus after the window settles', async () => {
  stub.AccessibilityInfo.__hozoResetFocus()
  const continueButton = opener()

  let root: { update: (element: unknown) => void; unmount: () => void } | undefined
  renderer.act(() => {
    root = renderer.create(
      react.createElement(HozoDialog, {
        open: true,
        restoreFocusTo: continueButton,
        accessibilityLabel: 'Confirm',
      }),
    )
  })
  assert.ok(root)
  // Nothing while it is open: the restore belongs to the closing edge.
  assert.deepEqual(stub.AccessibilityInfo.__hozoFocused, [])

  renderer.act(() => {
    root?.update(
      react.createElement(HozoDialog, {
        open: false,
        restoreFocusTo: continueButton,
        accessibilityLabel: 'Confirm',
      }),
    )
  })
  assert.deepEqual(stub.AccessibilityInfo.__hozoFocused, [continueButton.current])

  renderer.act(() => {
    stub.AppState.__hozoWindowFocus()
  })
  assert.deepEqual(stub.AccessibilityInfo.__hozoFocused, [continueButton.current])
  await new Promise((resolve) => setTimeout(resolve, 275))
  assert.deepEqual(stub.AccessibilityInfo.__hozoFocused, [
    continueButton.current,
    continueButton.current,
  ])
  root?.unmount()
})

test('reopening cancels a pending delayed restore', async () => {
  stub.AccessibilityInfo.__hozoResetFocus()
  const continueButton = opener()

  let root: { update: (element: unknown) => void; unmount: () => void } | undefined
  renderer.act(() => {
    root = renderer.create(
      react.createElement(HozoDialog, {
        open: true,
        restoreFocusTo: continueButton,
        accessibilityLabel: 'Confirm',
      }),
    )
  })
  renderer.act(() => {
    root?.update(
      react.createElement(HozoDialog, {
        open: false,
        restoreFocusTo: continueButton,
        accessibilityLabel: 'Confirm',
      }),
    )
  })
  renderer.act(() => {
    stub.AppState.__hozoWindowFocus()
  })
  renderer.act(() => {
    root?.update(
      react.createElement(HozoDialog, {
        open: true,
        restoreFocusTo: continueButton,
        accessibilityLabel: 'Confirm',
      }),
    )
  })

  await new Promise((resolve) => setTimeout(resolve, 275))
  assert.deepEqual(stub.AccessibilityInfo.__hozoFocused, [continueButton.current])
  root?.unmount()
})

test('a missing window signal uses the close-edge fallback', async () => {
  stub.AccessibilityInfo.__hozoResetFocus()
  const continueButton = opener()

  let root: { update: (element: unknown) => void; unmount: () => void } | undefined
  renderer.act(() => {
    root = renderer.create(
      react.createElement(HozoDialog, {
        open: true,
        restoreFocusTo: continueButton,
        accessibilityLabel: 'Confirm',
      }),
    )
  })
  renderer.act(() => {
    root?.update(
      react.createElement(HozoDialog, {
        open: false,
        restoreFocusTo: continueButton,
        accessibilityLabel: 'Confirm',
      }),
    )
  })

  assert.deepEqual(stub.AccessibilityInfo.__hozoFocused, [continueButton.current])
  await new Promise((resolve) => setTimeout(resolve, 525))
  assert.deepEqual(stub.AccessibilityInfo.__hozoFocused, [
    continueButton.current,
    continueButton.current,
  ])
  root?.unmount()
})

test('a dialog that was never open restores nothing', () => {
  stub.AccessibilityInfo.__hozoResetFocus()
  const continueButton = opener()

  let root: { unmount: () => void } | undefined
  renderer.act(() => {
    root = renderer.create(
      react.createElement(HozoDialog, {
        open: false,
        restoreFocusTo: continueButton,
        accessibilityLabel: 'Confirm',
      }),
    )
  })
  // The first render also sees `open === false`, and a restore there would
  // steal focus from whatever the screen actually had.
  assert.deepEqual(stub.AccessibilityInfo.__hozoFocused, [])
  root?.unmount()
})

test('without an opener, closing moves nothing', () => {
  stub.AccessibilityInfo.__hozoResetFocus()

  let root: { update: (element: unknown) => void; unmount: () => void } | undefined
  renderer.act(() => {
    root = renderer.create(
      react.createElement(HozoDialog, { open: true, accessibilityLabel: 'Confirm' }),
    )
  })
  renderer.act(() => {
    root?.update(react.createElement(HozoDialog, { open: false, accessibilityLabel: 'Confirm' }))
  })
  // The prop is optional, and a dialog without it is the behaviour every
  // caller had before it existed.
  assert.deepEqual(stub.AccessibilityInfo.__hozoFocused, [])
  root?.unmount()
})
