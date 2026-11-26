---
'@hozo/compiler': patch
---

Emit actionable Native diagnostics when a parent-relative `%`-mixed `calc()` expression cannot measure its parent from the same component (component root, custom component boundary, `ScrollView`/`FlatList`, `HozoGrid` cell, or `display: contents`), pointing to `@container` (`cqw`/`cqh`), same-component parent layout, or flex/viewport sizing per Decision 015.
