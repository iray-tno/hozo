---
"@hozo/compiler": minor
"@hozo/patterns": minor
"@hozo/form": minor
"@hozo/ui": minor
---

`@hozo/patterns`, `@hozo/form` and `@hozo/ui` now ship version 2 of `hozo.manifest.json`. It carries the package's exports, with the compiler primitive each one is where it is one, the owner contracts per class prop, `textPublish` (the pattern components that render a string child inside a `View`), the classes the package's own code requests, its class joiners, and whether its sources are compiled by the consumer. `@hozo/form` ships a manifest for the first time.

The compiler reads `textForwarding` from version 1 and version 2 alike, and still reads the version 1 files that `hozo manifest` writes. A compiler from before this release reads nothing from a version 2 manifest, so upgrade `@hozo/compiler` together with these packages, or text styles handed to a nested Text from `@hozo/ui`'s components are lost on React Native.
