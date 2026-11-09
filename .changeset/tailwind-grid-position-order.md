---
"@hozo/compiler": patch
---

Grid utilities (`grid`, `grid-cols-*`, `grid-rows-*`, `col-*`, `row-*`), the remaining display keywords (`inline-block`, `table`, ...) and `fixed`/`sticky` now settle in Tailwind's order, and no longer keep the rest of their class list in authored order. `flex grid` used to be `display: flex`, and `p-4 p-2 grid` took the 8px padding. The ordering policy is now `scalar-order-v37`.
