---
'@hozo/patterns': patch
'@hozo/ui': patch
---

`BottomSheet` takes a `handleBarClassName` (and `handleBarStyle` on Native) for the bar drawn inside its handle, and renders that bar only when the prop is given. `@hozo/ui` used to draw its grabber with `before:` on the handle, which React Native has no host for, so a Native sheet showed an empty 24px band. It now draws the grabber through this slot, and it shows on both platforms.
