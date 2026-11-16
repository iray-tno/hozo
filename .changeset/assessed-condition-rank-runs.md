---
'@hozo/compiler': patch
---

Keep shared Tailwind ranks for adjacent assessed writes of the same
condition, even when a different write in the input is unranked.
