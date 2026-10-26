---
'@hozo/behaviors': patch
'@hozo/patterns': patch
---

On React Native, a string given to `Dialog`, `Drawer`, `BottomSheet` or `Popover` as children, to `Tooltip` as `content`, to `Avatar` as `fallback` or to `Combobox` as `emptyMessage` is drawn inside a `Text`, with the box's text classes. It sat bare in a `View`, which React Native rejects. `hozoTextChildren` takes an optional text style for this.
