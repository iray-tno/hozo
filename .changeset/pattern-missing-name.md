---
"@hozo/compiler": patch
---

Warn (`A11Y_MISSING_ACCESSIBLE_NAME`) when an `OtpInput` or a `ColorPicker` has no accessible name. Neither has a default name to fall back on, and a build that strips types without checking them never reported the missing `accessibilityLabel`.
