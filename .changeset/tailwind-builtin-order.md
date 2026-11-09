---
"@hozo/compiler": patch
---

Hozo now carries Tailwind's per-utility and per-variant ordering facts (generated from tailwindcss 4.3.3) and can build rule descriptors from them without a project's CSS, through the internal `prepareBuiltinTailwindContext`. Nothing uses it by default yet.
