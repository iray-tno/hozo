---
"@hozo/compiler": patch
---

On Web, filter and backdrop filter functions written under different conditions now compose as Tailwind's registers do. `md:blur-sm grayscale` used to drop `grayscale` at md.
