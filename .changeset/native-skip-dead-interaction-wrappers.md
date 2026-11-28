---
"@hozo/compiler": patch
---

Skip emitting unused `HozoPeerScope`, `hozoPeerId`, and `HozoPressable` interaction wrappers on React Native when a structural condition (`first:`, `last:`, `only:`, `odd:`, `even:`, `empty:`, `nth-*:`) already folds the declaration statically to `false`.
