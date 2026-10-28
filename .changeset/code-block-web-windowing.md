---
'@hozo/patterns': patch
'@hozo/typography': patch
'@hozo/primitives': patch
---

A windowed `CodeBlock` now windows on the Web too: only the lines near the visible ones are mounted, the rest are held as space, and an unwrapped block keeps its scrolling width with a hidden copy of the widest line. The lines stay one `<pre><code>`.
