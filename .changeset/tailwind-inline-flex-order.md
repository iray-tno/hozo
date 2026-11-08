---
"@hozo/compiler": patch
---

In a captured Tailwind project, `inline-flex` now settles in Tailwind's order against `flex`, `hidden`, `block` and their variants, whichever is written first. `md:hidden inline-flex` used to stay visible at `md`. The ordering policy is now `scalar-order-v21`.
