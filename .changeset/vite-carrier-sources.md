---
'@hozo/vite': minor
'@hozo/compiler': minor
---

Vite compiles the source that an installed package with a manifest ships for its consumer (`compiledByConsumer` in its `hozo.manifest`), wherever it comes from. Until now a file under `node_modules` was compiled only if it belonged to an `@hozo/*` dependency of the app, so the same kind of package from anyone else rendered its classes without styles. That source also seeds Tailwind's class ordering at startup, as `@hozo/*` sources already did.
