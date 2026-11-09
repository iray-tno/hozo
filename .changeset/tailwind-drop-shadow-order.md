---
"@hozo/compiler": patch
---

`drop-shadow-*` and its colours now settle in Tailwind's order, and no longer keep the rest of their class list in authored order. `drop-shadow-none` still does. The ordering policy is now `scalar-order-v47`.
