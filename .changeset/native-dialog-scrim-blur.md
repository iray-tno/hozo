---
'@hozo/compiler': patch
'@hozo/patterns': patch
'@hozo/ui': patch
---

`backdrop:backdrop-blur-*` on a `Dialog` compiles for React Native and blurs behind the panel through the app's backdrop-filter adapter (`configureHozoBackdropFilter`). With no adapter the blur is left out and the scrim keeps its colour. `@hozo/ui`'s Dialog now blurs the page a little (`backdrop-blur-xs`) on both platforms.
