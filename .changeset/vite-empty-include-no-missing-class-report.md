---
'@hozo/vite': patch
---

`CLASS_NOT_IN_RUNTIME_MAP` no longer fires on every class in a project that sets `content: { include: [] }`. An empty `include` says that Hozo styles none of the project's plain `className`s, for example while Tailwind's own Vite plugin still generates their CSS during a migration. Hozo cannot see those rules, so it no longer reports the classes as missing. With a non-empty `include`, a file outside it is still checked as before.
