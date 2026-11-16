---
'@hozo/compiler': patch
---

Keep Tailwind's order for fully assessed hover, active and focus styles
when a resting class has no captured rank. Unknown owner-state styles
and separate author inputs still retain their fallback semantics.
