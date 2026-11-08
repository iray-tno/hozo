---
"@hozo/compiler": patch
---

In a captured Tailwind project, `flex-1`, `flex-auto`, `flex-initial` and `flex-none` now settle in Tailwind's order whichever is written first. `md:flex-none flex-1` used to keep `flex-1` at every width, and `grow-0 flex-auto` used to grow. The ordering policy is now `scalar-order-v18`.
