---
"@hozo/compiler": patch
---

Lower Tailwind percentage line heights such as leading-[150%] against a known
Native Text font size, while preserving their CSS percentage semantics on Web.
