---
"@hozo/compiler": patch
---

In a captured Tailwind project, transition utilities (`transition`, `transition-colors`, `duration-*`, `ease-*`, `delay-*`) and font families now settle in Tailwind's order, and no longer keep the rest of their class list in authored order. `p-4 p-2 transition-colors` used to take the 8px padding. The ordering policy is now `scalar-order-v34`.
