---
"@hozo/compiler": patch
"@hozo/tailwind": patch
---

`shadow-<name>` now draws the theme's `--shadow-<name>` when the theme defines one, before a colour of the same name, as Tailwind does. `@hozo/ui`'s `shadow-hozo-surface` -- on Card, BottomSheet, Calendar and CodeBlock -- used to compile to a shadow colour with no shadow, drawing nothing on Web or Native. The ordering policy is now `scalar-order-v36`.
