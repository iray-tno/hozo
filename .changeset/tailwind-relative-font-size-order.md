---
"@hozo/compiler": patch
---

In a captured Tailwind project, relative text sizes such as `text-[2em]` now settle in Tailwind's order whichever is written first. `text-[2em] text-sm` used to draw 14px. The ordering policy is now `scalar-order-v33`.
