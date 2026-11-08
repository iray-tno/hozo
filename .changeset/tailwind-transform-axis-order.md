---
"@hozo/compiler": patch
---

In a captured Tailwind project, `rotate-*` and the `translate-*` and `scale-*` axes now settle in Tailwind's order whichever is written first. `rotate-90 rotate-45` used to take 45deg, and `translate-x-8 translate-4` lost the 32px x axis. The ordering policy is now `scalar-order-v26`.
