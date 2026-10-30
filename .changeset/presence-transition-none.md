---
'@hozo/behaviors': patch
---

`usePresence` on the Web ends an exit at once when the element's `transition-property` is `none`, as `motion-reduce:transition-none` makes it. It used to wait out the duration the other classes left behind, keeping a closed element mounted for that long under reduced motion.
