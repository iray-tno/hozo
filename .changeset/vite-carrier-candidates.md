---
'@hozo/vite': minor
---

Vite reads class candidates from the manifests of installed packages (`hozo.manifest` in their `package.json`), captured at `buildStart`: the app's declared packages, and everything a package with a manifest declares. A package that ships compiled output with a manifest now contributes its candidates, and a Hozo package the app reaches only through another one (such as `@hozo/form` through `@hozo/ui`) is included. If a capture is incomplete, the build scans sources as before. A module loaded from a package with a manifest that the capture did not include now fails the build and names that package; declare it in the app's `package.json` and restart. An explicit `content.packages` keeps the previous scan.
