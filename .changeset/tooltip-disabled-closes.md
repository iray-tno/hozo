---
'@hozo/behaviors': patch
---

Setting `disabled` on an open `Tooltip` (through `useHoverTrigger`) now closes it and keeps it closed, including a controlled `open`, and `onOpenChange(false)` is called. Before, `disabled` froze an open tooltip on screen, for example over the popup its trigger had just opened. Enabling it again does not bring the old tooltip back.
