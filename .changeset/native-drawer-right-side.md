---
'@hozo/ui': patch
'@hozo/patterns': patch
---

A right-hand `Drawer` on React Native opens at the right edge and fills the height of the screen. It opened on the left, because a Native flex box is a column and `justify-end` moved the panel down instead of across. The Native `Drawer` root now fills its `Modal`, as the Web's `fixed inset-0` layer does.
