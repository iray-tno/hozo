---
'@hozo/compiler': patch
'@hozo/ui': patch
---

On React Native, a `calc()` of viewport and fixed lengths, such as `w-[calc(100vw-2rem)]`, is drawn as a runtime size from the window, as `w-[50vw]` already was. A `calc()` with a percentage or anything else still reports that Native cannot draw it. `@hozo/ui`'s `Dialog` uses it to keep a 1rem gutter on a phone on both platforms, where it ran edge to edge.
