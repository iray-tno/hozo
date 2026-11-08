---
"@hozo/compiler": patch
---

In a captured Tailwind project, `skew-*` and the 3D `rotate-x/y/z-*` utilities now settle in Tailwind's order whichever is written first. `skew-x-12 skew-x-6` used to take 6deg. The ordering policy is now `scalar-order-v27`.
