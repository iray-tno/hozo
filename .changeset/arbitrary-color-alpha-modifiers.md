---
"@hozo/compiler": minor
---

Support trailing opacity modifiers (`/50`, `/[0.35]`, `/[50%]`) on arbitrary colour utilities (`bg-[#ff0000]/50`, `bg-[#ff0000]/[0.35]`, `bg-[rgb(0_0_0)]/50`, `fill-[#ff0000]/50`, `stroke-[#00ff00]/25`, etc.) across Web, Native, and Canvas, fixing bracket-splitting corruption on `prefix-[...]/[...]` and supporting arbitrary font-size line-height modifiers (`text-[14px]/6`, `text-[14px]/tight`).
