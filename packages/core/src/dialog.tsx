// The dialog `@hozo/core` publishes in a browser, which is `@hozo/behaviors`'.
//
// This file was a copy of `@hozo/behaviors/src/dialog.tsx` -- the same
// `<dialog>`, the same `showModal`, the same focus restoration -- and its
// native half was a copy of the native one. One component, four files, and
// a `testID` missing from all of them: the bug was in every copy, so no two
// of them looked different from each other.
//
// The native half was consolidated when a device found the missing
// `testID` (#297). This is the other half of the same fix; leaving it would
// have been the same bet again.

export { HozoDialog as Dialog, type HozoDialogProps as DialogProps } from '@hozo/behaviors'
