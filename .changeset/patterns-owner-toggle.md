---
"@hozo/compiler": patch
"@hozo/patterns": patch
---

Compile static `Checkbox` and `Switch` root `className` literals through audited owner contracts on Web and Native, including `data-hozo-state={checked,unchecked,mixed}` facts, instead of resolving them via `hozoClasses` at runtime.
