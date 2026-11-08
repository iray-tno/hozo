---
"@hozo/compiler": patch
---

In a captured Tailwind project, `mix-blend-*` and `bg-blend-*` utilities now settle in Tailwind's order whichever is written first. `mix-blend-screen mix-blend-multiply` used to take `multiply`. The ordering policy is now `scalar-order-v23`.
