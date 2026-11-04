---
'@hozo/primitives': patch
'@hozo/engine': patch
---

`Image` declares `width`, `height`, `loading`, `decoding` and `fetchPriority`. The uncompiled Web `Image` now forwards them to the `<img>`, as compiled output already did, so a server-rendered page reserves the image's box and lazy-loads it with or without the compiler (#1674). On React Native, `width` and `height` are React Native's own props, and the three loading hints type-check but are ignored.
