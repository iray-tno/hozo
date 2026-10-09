---
"@hozo/patterns": minor
"@hozo/ui": minor
---

`Drawer`'s `side` now also takes `'start'` and `'end'`, which follow the reading direction. The direction comes from `HozoI18nProvider`'s `dir`, or else from the document's direction on the Web and `I18nManager.isRTL` on React Native. A navigation drawer written `side="start"` therefore opens from the right in Arabic or Hebrew. `useHozoDrawerSide` is exported for a look that needs the resolved edge. The default is still `'left'`.
