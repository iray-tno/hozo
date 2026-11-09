---
"@hozo/compiler": patch
---

In a captured Tailwind project, `shadow-*`, `inset-shadow-*`, `ring-*`, `inset-ring-*`, `ring-offset-*`, their colours and `ring-inset` now settle in Tailwind's order whichever is written first. `shadow-sm shadow-lg` used to take the large shadow. The ordering policy is now `scalar-order-v29`.
