---
"@hozo/compiler": patch
"@hozo/primitives": patch
---

Lower Tailwind `required:`, `optional:`, `invalid:`, `valid:`, `user-invalid:`, and `user-valid:` variants on `<TextInput>` on React Native, modelling `required` on `TextInput` (stripped on Native, emitted on Web) and tracking `touched` interaction state on `HozoTextInput`.
