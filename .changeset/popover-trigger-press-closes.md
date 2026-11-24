---
'@hozo/patterns': patch
---

Pressing the trigger of an open `Popover` now closes it. The press used to close the panel on `pointerdown` and reopen it on the `click` that followed, so the trigger could open the panel but never close it. This also fixes `@hozo/ui`'s `Popover`, which is built on this one.
