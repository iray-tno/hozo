---
"@hozo/compiler": patch
---

On Native, a conditional `filter` or `boxShadow` now keeps the unconditional functions and layers it does not override. `md:blur-sm grayscale` used to lose the grayscale at md, and `focus:ring-2 shadow-sm` lost the shadow while focused.
