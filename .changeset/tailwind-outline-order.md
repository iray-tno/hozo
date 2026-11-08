---
"@hozo/compiler": patch
---

In a captured Tailwind project, outline widths, colours and offsets (`outline-2`, `outline-red-500`, `outline-offset-2` and the rest) now settle in Tailwind's order whichever is written first. `focus:outline-4 outline-2` used to keep 2px when focused. An input with an outline style utility (`outline-dashed`, `outline-none`) keeps its authored order. The ordering policy is now `scalar-order-v19`.
