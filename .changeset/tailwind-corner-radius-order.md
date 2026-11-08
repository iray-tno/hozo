---
"@hozo/compiler": patch
---

In a captured Tailwind project, the per-corner and per-side radii (`rounded-t-*`, `rounded-tl-*`, `rounded-s-*`, `rounded-ss-*` and the rest) now settle in Tailwind's order whichever is written first. `md:rounded-t-lg rounded-t-sm` used to keep the small corners at every width. The ordering policy is now `scalar-order-v14`.
