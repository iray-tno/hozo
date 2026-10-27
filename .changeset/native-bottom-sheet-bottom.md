---
'@hozo/patterns': patch
'@hozo/ui': patch
---

The Native `BottomSheet` comes up from the bottom edge over a scrim. Before, it was drawn at the top of the screen with no visible scrim. React Native drops `fixed`, so the pattern's root now fills its `Modal`. `@hozo/ui`'s root class also names `flex-row`, because `items-end` means the bottom edge only in a row.
