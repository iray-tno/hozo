---
'@hozo/behaviors': patch
'@hozo/patterns': patch
---

A mouse press on a `Splitter` or `ResizablePane` handle, a `BottomSheet` drag handle or a `Slider` no longer leaves it `:focus-visible` in Chromium. It is still focused, so the arrow keys work straight after a drag, but a keyboard focus ring no longer stays lit after every mouse drag.
