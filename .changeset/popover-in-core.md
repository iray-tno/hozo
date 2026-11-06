---
'@hozo/core': patch
'@hozo/patterns': patch
---

`Popover` is exported from `@hozo/core`, as `Dialog` and `Menu` are. Its trigger takes `triggerAccessibilityLabel`, `triggerAccessibilityHint` and `triggerTestID`, so an icon-only trigger has a name of its own and a test id, on the Web and on React Native.
