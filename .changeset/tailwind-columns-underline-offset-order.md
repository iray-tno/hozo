---
"@hozo/compiler": patch
---

In a captured Tailwind project, `columns-*` and `underline-offset-*` utilities now settle in Tailwind's order on Web whichever is written first. `columns-3 columns-2` used to take `2`. The ordering policy is now `scalar-order-v25`.
