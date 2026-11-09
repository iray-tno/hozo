---
"@hozo/compiler": patch
---

`caret-*` and `accent-*` now settle in Tailwind's order, and no longer keep the rest of their class list in authored order. On Native, `cursorColor` now takes the winning caret colour rather than the first one written, follows `dark:caret-*` in dark mode, and reports a `focus:caret-*` (or any other condition) as not wired instead of applying it in every state. The ordering policy is now `scalar-order-v41`.
