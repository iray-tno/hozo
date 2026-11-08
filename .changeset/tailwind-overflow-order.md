---
"@hozo/compiler": patch
---

In a captured Tailwind project, `overflow-auto`, `overflow-clip` and the `overflow-x-*`/`overflow-y-*` axes now settle in Tailwind's order on Web whichever is written first. `overflow-x-auto overflow-hidden` used to leave the x axis hidden. The ordering policy is now `scalar-order-v22`.
