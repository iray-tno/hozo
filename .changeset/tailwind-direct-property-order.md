---
"@hozo/compiler": patch
---

In a captured Tailwind project, `block`, `top-*`/`right-*`/`bottom-*`/`left-*`, `aspect-*`, `order-*` and `rounded-*` now settle in Tailwind's order whichever is written first. `md:block hidden` used to hide the element at every width. The ordering policy is now `scalar-order-v11`.
