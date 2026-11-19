---
"@hozo/compiler": minor
"@hozo/form": minor
"@hozo/metro": minor
---

Migrate `@hozo/form`'s `Calendar` (all 5 slots: `className`, `headerClassName`, `gridClassName`, `monthButtonClassName`, `dayClassName`) to audited owner contracts and route their literal class props through the prepared Web/Native path by default (supporting stateless split-text `View` hosts, `table`/`td` web hosts, and `data-hozo-*` calendar cell owner facts; also adding missing `data-hozo-disabled` on Web `Calendar` month buttons).
