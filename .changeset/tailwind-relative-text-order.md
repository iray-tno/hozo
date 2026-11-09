---
"@hozo/compiler": patch
---

In a captured Tailwind project, ratio leading (`leading-tight`, `leading-[1.5]`) and em tracking (`tracking-wide`) now settle in Tailwind's order whichever is written first. `leading-tight leading-loose` used to take the loose line. The ordering policy is now `scalar-order-v31`.
