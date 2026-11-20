---
'@hozo/core': patch
---

`@hozo/core` ships an empty Hozo manifest, so an app that installs only `@hozo/core` builds again. The bundler's startup capture follows only packages with a manifest, so it stopped at core, never captured `@hozo/patterns` behind it, and the load guard failed the build with "`@hozo/patterns` declares a Hozo manifest, but the candidates captured at startup do not include it".
