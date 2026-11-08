---
"@hozo/compiler": patch
---

In a captured Tailwind project, `text-start`, `text-end` and `text-justify` now settle in Tailwind's order with the other alignments, whichever is written first. `text-left text-justify` used to take `justify`. The ordering policy is now `scalar-order-v24`.
