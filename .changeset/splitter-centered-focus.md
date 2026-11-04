---
'@hozo/patterns': patch
'@hozo/ui': patch
---

The `@hozo/ui` Splitter and ResizablePane handle is now the 1px dividing line itself, and its focus ring, hover colour and drag colour are drawn on that line. Before, they filled an 8px box beside the line, which made the focus ring look off-centre. On Web the handle can be grabbed 4px either side of the line, including over a positioned surface next to the pane. The pattern now positions the handle and the ResizablePane wrapper with an inline `zIndex: 1`, which an explicit `style`/`handleStyle` can override.
