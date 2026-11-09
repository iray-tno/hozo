---
"@hozo/compiler": patch
---

`space-x-*` and `space-y-*` now settle in Tailwind's order among themselves, and no longer keep the rest of their class list in authored order. `space-y-4 space-y-2` used to take the 8px gap, and `p-4 p-2 space-y-2` the 8px padding. A state variant on a space utility (`hover:space-y-4`) still keeps authored order. The ordering policy is now `scalar-order-v40`.
