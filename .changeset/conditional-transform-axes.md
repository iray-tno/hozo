---
"@hozo/compiler": patch
---

Translate and scale axes written under different conditions now compose as Tailwind's registers do. `md:translate-x-8 translate-y-2` used to drop the base `translate-y-2` at md on Web and on Native, and `md:rotate-45 translate-x-2` dropped the translate on Native.
