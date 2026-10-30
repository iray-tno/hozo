---
'@hozo/ui': patch
---

ResizablePane and Splitter paint a 1px divider line instead of an 8px filled band, keeping the 8px area a pointer grabs; the band shows as a tint only on hover and while dragging. A pane rounds the two corners on the edge it is placed against with the surface radius, so a filled pane no longer pokes square corners out of a rounded container.
