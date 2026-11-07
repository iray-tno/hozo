---
'@hozo/compiler': patch
---

Compile `checked:`, `indeterminate:` and `default:`. `peer-checked:` and `has-checked:` now beat a compiled base that sets the same property, where before they were left to Tailwind and always lost to it. Written on a primitive itself, they are reported as `TAILWIND_VARIANT_CANNOT_MATCH`, except `indeterminate:` on a `Progress`. A variant Hozo still carries to Tailwind now names the compiled token it loses to.
