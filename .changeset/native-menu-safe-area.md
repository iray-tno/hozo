---
'@hozo/patterns': patch
'@hozo/engine': patch
---

The Native `Menu` sheet clears the home indicator and the Android gesture handle: it adds the bottom inset an app's `<SafeAreaProvider>` reports below its own padding, and nothing in an app without one. `@hozo/engine` gains `useHozoProvidedSafeArea()` for that, which reads zeros instead of throwing when the provider or `react-native-safe-area-context` is missing, and the missing-package warning for a safe-area class now fires when such a class first renders rather than whenever the Native entry loads.
