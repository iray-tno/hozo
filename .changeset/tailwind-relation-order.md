---
"@hozo/compiler": patch
---

In a captured Tailwind project, `group-*`, `peer-*`, `in-*` and `has-*` around one state now settle in Tailwind's order whichever is written first. `hover:p-8 group-hover:p-4` used to let the group win where Tailwind's later `hover:` does. The ordering policy is now `scalar-order-v15`.
