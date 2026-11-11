---
"@hozo/cli": minor
"@hozo/compiler": minor
"@hozo/navigation": minor
---

Add `hozo manifest` and `hozo links` to `@hozo/cli`. They run the same commands as `hozo-manifest` and `hozo-links`. Both old binaries keep working for one minor release and print a deprecation line on stderr.

Both now use the `hozo` exit codes: `1` for a stale file under `--check`, and `2` for a command that could not run. A `2` ends its stderr line with a string code such as `[config-not-found]`. `hozo-links` used to exit `1` for configuration errors. `hozo-manifest` used to ignore unknown options and crash on a package it could not read.

`hozo-links` now also runs when npm links it into `node_modules/.bin` as a symlink. Before, the linked binary did nothing and exited `0`.

`@hozo/navigation` is an optional peer of `@hozo/cli`. Without it, `hozo links` exits `2` with `[missing-package]`.
