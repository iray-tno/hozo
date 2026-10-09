---
"@hozo/compiler": patch
---

On Native, the compiler warns when an `Image`'s `srcSet` uses width descriptors (`800w`). React Native reads `srcSet` by density only and skips those on device with a runtime warning, so such an image could draw nothing.
