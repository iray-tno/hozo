---
'@hozo/patterns': patch
---

`Dialog` takes `accessibilityLabelledBy`, the id of an element inside that names it, so a dialog named by its heading does not repeat the heading in `accessibilityLabel`. It becomes `aria-labelledby` on the Web, where it wins over `accessibilityLabel`. On React Native it reaches Android, and `accessibilityLabel` is kept beside it, because iOS has no equivalent.
