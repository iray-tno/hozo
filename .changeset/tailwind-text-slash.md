---
"@hozo/compiler": patch
---

`text-lg/7`, `text-lg/tight` and `text-lg/[3rem]` are now a text size with its line height, as in Tailwind 4. They were parsed as a colour named `lg` at 7% opacity and set no size. The ordering policy is now `scalar-order-v32`.
