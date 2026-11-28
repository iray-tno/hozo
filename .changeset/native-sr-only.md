---
"@hozo/compiler": minor
---

Lower `sr-only` and `not-sr-only` on React Native to a 1px clipped visually-hidden box (`position: 'absolute'`, `width: 1`, `height: 1`, `overflow: 'hidden'`, `margin: -1`, zero padding/border) without rejecting their Web-only `clip-path` and `white-space: nowrap` companions, matching Hozo's cross-platform accessibility contract.