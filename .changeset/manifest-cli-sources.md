---
'@hozo/compiler': minor
---

`hozo manifest` can write a version 2 manifest, so a component package outside `@hozo/*` can ship the classes it uses. Pass `--sources <glob>` (repeatable) to name the published files those classes come from. Add `--compiled-by-consumer` when they are source that the app's build compiles. An app then gets those classes from the manifest on Metro, Vite and Next, with no `content.packages`. Without `--sources`, the command writes version 1 as before, and an app gets no classes from the package.
