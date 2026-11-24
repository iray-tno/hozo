---
'@hozo/behaviors': patch
---

`FocusScope` no longer pulls focus back to the opener when focus has already left for another element. Tab out of a non-modal `Popover` now goes on to the next control instead of landing back on the trigger. Escape, and an outside press that leaves focus on nothing, still return focus to the opener.
