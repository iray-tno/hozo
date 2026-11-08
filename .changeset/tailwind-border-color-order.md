---
"@hozo/compiler": patch
---

In a captured Tailwind project, border colours (`border-red-500`, `border-t-*`, `border-x-*`, `border-s-*` and the rest) now settle in Tailwind's order whichever is written first. `md:border-blue-500 border-red-500` used to keep red at every width. The ordering policy is now `scalar-order-v16`.
