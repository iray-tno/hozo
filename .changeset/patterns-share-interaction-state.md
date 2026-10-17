---
"@hozo/behaviors": patch
"@hozo/primitives": patch
"@hozo/patterns": patch
"@hozo/compiler": patch
"@hozo/ui": patch
---

A Text nested in `@hozo/ui`'s `Checkbox` or `Switch` label now takes their `hover:`, `active:` and `focus-visible:` text classes on Native. `@hozo/patterns`' pressable provides its state through `HozoInteractionContext`, now in `@hozo/behaviors/pressable-interaction` and shared with `@hozo/primitives`, so the `HozoText` a caller's Text compiles to reads it.
