---
"@hozo/compiler": patch
---

In a captured Tailwind project, `px-*`, `mx-*`, `ps-*`/`pe-*`, `ms-*`/`me-*`, `inset-*`, `inset-x-*`, `inset-y-*` and `start-*`/`end-*` now settle in Tailwind's order whichever is written first. `md:px-4 px-2` used to keep `px-2` at every width, and `ps-2 px-4` let `px-4` overwrite the start edge. The ordering policy is now `scalar-order-v12`.
