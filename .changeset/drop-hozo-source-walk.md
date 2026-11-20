---
'@hozo/compiler': minor
'@hozo/metro': minor
'@hozo/vite': minor
'@hozo/next': minor
---

The source of `@hozo/*` dependencies is no longer walked for class candidates. Every package with a manifest (`hozo.manifest` in its `package.json`) contributes its candidates from that manifest instead, captured at startup by Metro, `generateCandidateModule`, Vite and Next. On this repository's apps, the walk's extra candidates were all strings that are not class names: event names, type unions, style values and test fixtures.

If the capture is incomplete, the build now fails at startup and names the package, instead of falling back to the walk. That covers a missing or unreadable manifest, and an `@hozo/*` package from an older release whose manifest has no candidates. Every `@hozo/*` package has to be on the same version. A v1 manifest from any other package, which is what `hozo manifest` writes, contributes no candidates and is not an error.

`content.packages` now names the only package sources that are walked. Unset, none are. Naming any package still turns the manifest capture off, as before.
