---
"@hozo/compiler": patch
---

On Web, shadow and ring utilities written under different conditions now compose as Tailwind's registers do. `focus:ring-2 shadow-sm` used to lose the shadow while focused, and `md:shadow-red-500 shadow-lg` lost the shadow at md.
