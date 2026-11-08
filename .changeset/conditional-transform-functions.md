---
"@hozo/compiler": patch
---

On Web, skews and 3D rotations written under different conditions now compose as Tailwind's registers do. `md:skew-x-12 skew-y-6` used to drop the base `skewY` at md.
