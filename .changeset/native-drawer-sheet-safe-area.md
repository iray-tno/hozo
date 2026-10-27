---
'@hozo/patterns': patch
---

The Native `Drawer` and `BottomSheet` clear the safe area of the edges they reach. The Drawer clears the status bar and notch at the top and the home indicator at the bottom; the BottomSheet clears the bottom. The inset is added to the panel's own padding, and it is zero in an app without a `<SafeAreaProvider>`.
