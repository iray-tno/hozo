import { setAccessibilityFocusMover } from '@hozo/behaviors/native'
import { moveAccessibilityFocus } from '@hozo/native'
import { AppRegistry } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import App from './App.tsx'

// The capability `@hozo/native` adds, handed to the library that needs it.
//
// Two lines, in the application, and that shape is the point rather than an
// inconvenience: Metro resolves `require` at bundle time, so a library that
// reached for an optional package itself would fail to bundle for every app that
// had not installed it. Registration puts `@hozo/native` in this app's module
// graph and in nobody else's.
//
// No condition around it. `moveAccessibilityFocus` is `undefined` on iOS, where
// `setAccessibilityFocus` already performs the real action, and `undefined` when
// the module is not in the binary -- a JS bundle newer than the APK. The setter
// takes that and keeps the default, which is the `sendAccessibilityEvent` this
// library has always sent.
//
// What it buys: `Dialog` returning TalkBack's focus to the control that opened
// it, which was about half of dismissals (#484). The real action is
// `ACTION_ACCESSIBILITY_FOCUS`, and #491 traced why no JavaScript can reach it.
setAccessibilityFocusMover(moveAccessibilityFocus)

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
