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
// the dialog resolves the ref it was given and moves focus exactly on the
// closing edge; that the platform then puts focus on that view is the
// emulator's half, and `examples/native-demo/scripts/android-talkback.sh`
// reads it out loud.

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

test('closing the dialog moves accessibility focus to the opener', async () => {
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
  // The host instance, not a tag. The fallback sends `sendAccessibilityEvent`,
  // which takes the former; `setAccessibilityFocus`, which took the latter, is
  // deprecated in 0.87 and is gone from the Dialog.
  //
  // And it is the fallback that runs here: `@hozo/native` is reached through
  // `require` inside a `try`, which this harness has no `require` for, so the
  // seam resolves to the function that admits it cannot move focus. Whether
  // the native action lands is a question only a device answers, and
  // `examples/native-demo/scripts/android-talkback.sh` is what asks it.
  assert.deepEqual(stub.AccessibilityInfo.__hozoFocused, [continueButton.current])

  // And again when the window comes back, which is the Android half.
  //
  // On that platform the modal is its own window, and a restore aimed at the
  // view underneath does not stick while it is still the active accessibility
  // window. #493 measured that directly: ACTION_ACCESSIBILITY_FOCUS returned
  // true on the right view and focus stayed where it was, twice. So the attempt
  // is made a second time once AppState reports the window back.
  //
  // Driven here rather than waited for: the stub emits the event a device would,
  // which is only possible because the component has no Platform.OS branch
  // around the listener.
  renderer.act(() => {
    stub.AppState.__hozoWindowFocus()
  })
  assert.deepEqual(stub.AccessibilityInfo.__hozoFocused, [
    continueButton.current,
    continueButton.current,
  ])

  // And only for our own dismissal. A window coming back for any other reason
  // must not move focus, or it takes it from wherever the user actually was.
  renderer.act(() => {
    stub.AppState.__hozoWindowFocus()
  })
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
