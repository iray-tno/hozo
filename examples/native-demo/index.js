import { setAccessibilityFocusMover } from '@hozo/behaviors/native'
import { moveAccessibilityFocus } from '@hozo/native'
import { AppRegistry } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import App from './App.tsx'

// The capability `@hozo/native` adds, handed to the library that needs it.
//
// Two lines in a real application, and that shape is the point rather than an
// inconvenience: Metro resolves `require` at bundle time, so a library that
// reached for an optional package itself would fail to bundle for every app that
// had not installed it. Registration puts `@hozo/native` in this app's module
// graph and in nobody else's.
//
// What it buys: `Dialog` returning TalkBack's focus to the control that opened
// it even when TalkBack drops the first request because the windows had not
// settled (#484). The module watches where focus lands and asks once more.
//
// Wrapped here, and only here, to log what each request came to. The harness
// reads `[hozo-dialog-focus]` lines from logcat; `Dialog` and the package
// itself print nothing. `moveAccessibilityFocus` is `undefined` on iOS and when
// the module is not in the binary, and the setter keeps its default then.
setAccessibilityFocusMover(
  moveAccessibilityFocus &&
    ((view) => {
      moveAccessibilityFocus(view).then((outcome) => {
        console.info(`[hozo-dialog-focus] native ${outcome}`)
      })
    }),
)

// The provider the insets come from.
//
// `App.tsx` writes `pt-[env(safe-area-inset-top)]`, which compiles to a
// hook read on this platform (#352), and the hook is
// `react-native-safe-area-context`'s -- Hozo ships no native code, and the
// real inset is `UIView.safeAreaInsets` on iOS and `WindowInsets` on
// Android. Without this provider the hook returns zeros, which is the
// warning `@hozo/engine` prints rather than a crash: content under a
// notch is recoverable, a blank app is not.
//
// Here rather than inside `App` so the census screen gets it too --
// `Gallery.tsx` is rendered by `App` and would otherwise be outside it.
function Root() {
  return (
    <SafeAreaProvider>
      <App />
    </SafeAreaProvider>
  )
}

AppRegistry.registerComponent('HozoNativeDemo', () => Root)
