---
"@hozo/compiler": patch
---

On Web, gradient constructors, stop colours and stop positions written under different conditions now compose as Tailwind's registers do. `md:bg-linear-to-b bg-linear-to-r from-red-500` used to keep `to right` at md, and `md:from-red-500 bg-linear-to-r from-blue-500` kept blue.
