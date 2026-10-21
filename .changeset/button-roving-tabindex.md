---
"@hozo/primitives": patch
---

On the Web a `Button` forwards `tabIndex`, so a `Button` in a `Toolbar` takes the roving tab stop the toolbar hands it, and the toolbar is one tab stop. Before this, every item stayed in the tab order. On a link that is disabled, the tab stop is still `-1`.
