---
"@hozo/cli": minor
---

`hozo square` now says when the compiler that measured the code is not the one the project builds with. The code half compiles with the compiler the CLI brings, which `npx` may fetch at a newer version than the project's. It then reports a warning, `compiler-version-mismatch`, naming both versions and the `npx @hozo/cli@<version> square` that matches. The JSON gains `code.compiler` (`measuredWith`, `project`) and `code.findings`.
