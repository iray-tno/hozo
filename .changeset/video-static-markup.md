---
'@hozo/media': patch
---

`Video` works on a page that is rendered to static markup and never hydrated (#1674). On Web, `autoPlay`, `muted`, `loop` and `poster` are now also the `<video>`'s own attributes. The poster overlay joins only once mounted. New props: `width` and `height` (intrinsic size: the box takes their aspect ratio instead of the fixed 180 height), `className` for the box, `preload`, and `nativeID`. Given a `className`, the Web box no longer applies its inline 100% × 180 default, so the classes size it. On Native the classes resolve at runtime on top of the default, which is why `@hozo/media` now depends on `@hozo/engine`.
