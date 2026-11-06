---
'@hozo/patterns': patch
---

`Dialog` on the Web stays shown while it animates out. When `open` turns false it sets `data-state="closed"`, waits for the transition or animation that starts, then calls `close()` and restores focus. With no exit in the stylesheet it closes at once, as before. A Dialog unmounted while open now gives focus back too.
