---
"@hozo/compiler": patch
---

`aria-pressed:`, `aria-hidden:`, `aria-readonly:` and `aria-required:` (and their `not-` forms) now settle in Tailwind's order, and no longer keep the rest of their class list in authored order. `p-4 p-2 aria-pressed:p-2` used to take the 8px padding. The ordering policy is now `scalar-order-v38`.
