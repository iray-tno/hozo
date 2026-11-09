---
"@hozo/compiler": patch
---

`placeholder:` colours and `resize-*` now settle in Tailwind's order, and no longer keep the rest of their class list in authored order. `p-4 p-2 placeholder:text-red-500` used to take the 8px padding. The ordering policy is now `scalar-order-v39`.
