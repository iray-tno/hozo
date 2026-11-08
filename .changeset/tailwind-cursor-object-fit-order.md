---
"@hozo/compiler": patch
---

In a captured Tailwind project, `cursor-*` and `object-*` fit utilities now settle in Tailwind's order whichever is written first. `md:object-contain object-cover` used to keep `cover` at every width. The ordering policy is now `scalar-order-v20`.
