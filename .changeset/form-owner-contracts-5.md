---
"@hozo/compiler": minor
"@hozo/form": minor
"@hozo/metro": minor
---

Migrate `@hozo/form`'s `DatePicker` (8 slots), `DateRangePicker` (8 slots), and `DateTimePicker` (9 slots) to audited owner contracts and route their literal class props through the prepared Web/Native path by default (supporting `aria-expanded` owner facts, forwarding prepared `Calendar` carriers, and adding missing `data-hozo-disabled` on Web picker triggers).
