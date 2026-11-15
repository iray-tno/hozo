---
'@hozo/compiler': patch
'@hozo/engine': patch
---

Keep Tailwind's order for assessed RTL/LTR styles when an independent
resting background would otherwise send the class string through fallback.
Unknown writes still pin their position.
