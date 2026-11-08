---
"@hozo/compiler": patch
---

In a captured Tailwind project, border widths (`border`, `border-2`, `border-t-*`, `border-x-*`, `border-s-*` and the rest) now settle in Tailwind's order whichever is written first. `md:border-4 border-2` used to keep 2px at every width. An input with a border style utility (`border-dashed`) keeps its authored order. The ordering policy is now `scalar-order-v17`.
