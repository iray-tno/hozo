---
'@hozo/compiler': minor
'@hozo/core': minor
'@hozo/primitives': minor
---

Evaluate parent-relative `%`-mixed `calc()`, `min()`, `max()`, and `clamp()` on React Native when the parent lives in the same component (`w`, `h`, `size`, `min/max-*`, `basis`, `m*`, `p*`, `top/right/bottom/left/inset*`, and `space-x`/`space-y`) via opt-in `HozoMeasuredParent` and `HozoParentSizeQuery`, subtracting resolved border and padding insets with zero wrapper Views and zero runtime cost when unused.
