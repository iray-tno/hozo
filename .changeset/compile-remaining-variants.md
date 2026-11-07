---
'@hozo/compiler': patch
---

Compile `pointer-*`, `any-pointer-*`, `inert:`, `in-*` and `details-content:` on Web, so each one beats a compiled base that sets the same property instead of losing to it from Tailwind's layer. `details-content:` off a `Details` is reported as unable to match, and `open:` on a `Details` is no longer reported.
