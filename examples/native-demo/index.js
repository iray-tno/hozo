import { AppRegistry } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import App from './App.tsx'

// The provider the insets come from.
//
// `App.tsx` writes `pt-[env(safe-area-inset-top)]`, which compiles to a
// hook read on this platform (#352), and the hook is
// `react-native-safe-area-context`'s -- Hozo ships no native code, and the
// real inset is `UIView.safeAreaInsets` on iOS and `WindowInsets` on
// Android. Without this provider the hook returns zeros, which is the
// warning `@hozo/runtime` prints rather than a crash: content under a
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
