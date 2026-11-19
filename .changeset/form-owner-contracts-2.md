---
"@hozo/compiler": minor
"@hozo/form": minor
"@hozo/metro": minor
---

Migrate `@hozo/form`'s `Field` (all 5 slots) and `TextArea` (all 3 slots) to audited owner contracts and route their literal class props through the prepared Web/Native path by default (supporting `Text` and `TextInput` leaf hosts, empty `authoredStyles`, and `readOnly`/`aria-invalid`/`aria-required` owner facts).
