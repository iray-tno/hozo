---
'@hozo/engine': minor
'@hozo/primitives': minor
---

`HozoAnimated` and `PresenceContext` move from `@hozo/primitives` to `@hozo/engine` (`@hozo/engine/generated/animated`), so `@hozo/patterns` can run them. `@hozo/primitives/generated/animated` is gone; compiled output imports them through `@hozo/core/generated/animated` as before.
