---
"@hozo/compiler": patch
---

In a captured Tailwind project, `blur-*`, `brightness-*`, `grayscale`, the other filter functions and their `backdrop-*` forms now settle in Tailwind's order whichever is written first. `blur-sm blur-lg` used to take the large blur. The ordering policy is now `scalar-order-v28`.
