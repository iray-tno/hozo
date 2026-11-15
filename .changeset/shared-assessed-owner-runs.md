---
'@hozo/compiler': patch
---

Keep the shared Tailwind order inside adjacent assessed state runs, even
when another state write in the same class input has no rank. The unknown
write retains its position and the existing selector-specificity fallback.
