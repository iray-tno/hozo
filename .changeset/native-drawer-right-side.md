---
'@hozo/ui': patch
---

A right-hand `Drawer` on React Native opens at the right edge. It opened on the left, because a Native flex box is a column and `justify-end` moved the panel down instead of across.
