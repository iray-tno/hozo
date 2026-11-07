---
'@hozo/patterns': patch
---

`Dialog` takes `closeOnBackdropPress`, off by default, which calls `onClose` when the backdrop around the panel is pressed. On the Web a press on the panel's own padding, or a drag that starts in the panel and ends outside, does not count. On React Native a press layer under the panel, hidden from screen readers, calls `onClose`.
