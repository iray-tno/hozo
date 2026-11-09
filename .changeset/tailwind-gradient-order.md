---
"@hozo/compiler": patch
---

In a captured Tailwind project, gradient constructors (`bg-linear-*`, `bg-radial`), `bg-none` and the `from-*`/`via-*`/`to-*` colours and positions now settle in Tailwind's order whichever is written first. `bg-linear-to-r from-red-500 from-blue-500` used to start blue. The ordering policy is now `scalar-order-v30`.
