---
'@hozo/compiler': minor
'@hozo/primitives': minor
---

Support `%` and `%`-mixed `calc()` / `min()` / `max()` / `clamp()` grid row tracks on React Native when the grid container has a definite height (`h-*`, `h-screen`, `h-full`, `size-*`, `block-*`) by measuring its content-box height via `HozoMeasuredParent` and passing `containerHeight` into `HozoGrid`, while keeping auto-height `%` row tracks refused with an actionable diagnostic. Also supports plain `%` column tracks (`grid-cols-[30%_70%]`).
