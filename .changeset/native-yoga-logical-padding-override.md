---
"@hozo/compiler": patch
"@hozo/engine": patch
---

On React Native, an element whose classes write an inline edge both logically and physically (`px-8 pl-1`, `ps-8 pl-1`, and the margin, inset and border width and colour counterparts) now lays out as Tailwind does in both directions. The physical writes are emitted as `start`/`end` for the current direction, so the order Tailwind settled decides. Before, Yoga let `paddingStart` beat `paddingLeft` whatever the order, and React Native's default RTL left/right swap moved the physical write to the other side. Both the static compiler and the generated candidate map do this; an element that writes a family only physically or only logically is unchanged.
