---
"@hozo/compiler": patch
---

In a captured Tailwind project, `gap-*`, `gap-x-*` and `gap-y-*` now settle in Tailwind's order whichever is written first. `md:gap-4 gap-2` used to keep `gap-2` at every width, and on Native `active:gap-4 gap-2` never showed the pressed gap. The ordering policy is now `scalar-order-v13`.
