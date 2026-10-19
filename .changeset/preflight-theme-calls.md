---
'@hozo/tailwind': patch
---

The injected base layer no longer ships Tailwind's `--theme()` calls, which browsers drop. `html` gets its sans-serif stack and `code`/`pre` their monospace stack again, instead of the browser's default serif.
