---
"@hozo/compiler": patch
"@hozo/engine": patch
---

Project already-ranked Native logical and physical inline edges (such as `px-8 pl-1` or `ps-8 pl-1` across padding, margin, inset, and border widths/colors) so CSS cascade precedence survives Yoga's logical-edge priority in both static compilation and the generated Native candidate map, while preserving RTL mirroring, stronger logical variants, authored `style` overrides, and unassessed passthrough.
