---
"@hozo/compiler": patch
"@hozo/primitives": patch
"@hozo/core": patch
---

A `View`, `Text`, `Image` or document primitive whose props reach it through a spread (`function Box(props) { return <View {...props} /> }`) keeps them on the Web. The spread reached the element raw, so `accessibilityLabel`, `accessibilityHint`, `testID`, `nativeID`, `pointerEvents`, `accessibilityState`, `accessibilityValue` and `accessibilityLiveRegion` became unknown attributes, and the element lost its accessible name. The spread now goes through the same translation as the uncompiled primitive. On an `Image` it also resolves an object or list `src` and uses the accessibility label as `alt`.
