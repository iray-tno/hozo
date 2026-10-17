---
"@hozo/compiler": patch
---

Warn (`A11Y_NAME_NOT_FORWARDED`) when a `Modal` is given an accessible name. Neither React Native nor the Web runtime passes it on, so it was never announced; use a `Dialog`, or name a `View` inside the modal.
