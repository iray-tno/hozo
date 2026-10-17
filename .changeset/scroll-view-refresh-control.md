---
"@hozo/compiler": patch
---

A `ScrollView` given React Native's `refreshControl={<RefreshControl … />}` now pulls to refresh on the Web. It compiled to a plain `div` that took the control as an unknown attribute, so the indicator never appeared and a pull did nothing.
