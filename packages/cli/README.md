# @hozo/cli

`hozo`, one command for Hozo's command-line tools ([RFC 011](../../docs/rfcs/011-hozo-cli.md)).

```sh
npx @hozo/cli dry-fit .                          # what Hozo would do with this React Native checkout
npx @hozo/cli dry-fit . --fail-on error --output hozo-audit.json
npx @hozo/cli dry-fit --help                     # every option
npx @hozo/cli square                             # once Hozo is installed: is the setup right, and the code?
npx @hozo/cli square --format json > hozo-square.json        # a baseline, then in CI:
npx @hozo/cli square --compare hozo-square.json --fail-on new-errors
```

| Command | Alias | Does |
| --- | --- | --- |
| `hozo dry-fit` | `migration-audit` | Before adoption: lowers a checkout without installing anything and reports what Hozo would do. Options and report as [`@hozo/migration-audit`](../migration-audit/README.md) |
| `hozo square [project]` | `doctor` | After adoption: checks that every `@hozo/*` package is at one version, nested copies included, and that what each one needs beside it (`react-native`, `react`, Expo's modules) is installed within the range it declares; that each bundler config (Vite, Astro, Next.js, Metro, Storybook) uses its Hozo adapter, with `hozo()` before React's plugin; that the stylesheet Hozo reads imports Tailwind, and `@hozo/ui`'s theme when it is installed; that Metro's saved state is newer than its config; and that every file importing `@hozo/*` was in the last candidate scan. These setup checks read files and load nothing, so they print even when the install is what is broken. Then the code: the `dry-fit` audit on the project, against the stylesheet the setup found, its report embedded in the JSON as `code.report`. A fatal setup finding (no adapter) skips the code and says so. The code compiles with the compiler the CLI brings; when the project builds with another version, a warning names both and the `npx @hozo/cli@<version>` that matches. `--setup` (setup only), `--compare <report>` (a `square` or `dry-fit` JSON report), `--fail-on none|warning|error|new-errors` (default `error`), `--format json` |
| `hozo manifest` | | Builds a component package's `hozo.manifest.json`, or `--check`s it. See [`@hozo/compiler`](../compiler/README.md#a-component-packages-manifest) |
| `hozo links` | | Generates or `--check`s the Universal Links and App Links verification files from `hozo-links.json`. Needs `@hozo/navigation` installed. See [`@hozo/navigation`](../navigation/README.md) |
| `hozo show <file>` | | Prints what one file compiles to: the Web JSX and CSS, the React Native JSX and StyleSheet, each class list with its route (compiled, conditional, or resolved at runtime) and every class that did not compile on a platform, with why (no Tailwind rule in this theme, refused or not wired on Native, not a Tailwind class), and each diagnostic with its line, column and backend. The REPL's output, with the project's theme: read from the stylesheet its bundler config names, or `--css`. `--web` / `--native`, `--fail-on none\|warning\|error` (default `none`), `--format json` |
| `hozo explain [CODE]` | | Explains a diagnostic code: what it means, a source that raises it, and the compiler's message for that source. Without a code, lists every code. Reads the catalog `@hozo/compiler` ships; no compile, no network |

`hozo-migration-audit`, `hozo-manifest` and `hozo-links` still work for one minor release, with the
same stdout; each adds one deprecation line on stderr.

## Exit codes

The same on every command:

| Code | Means |
| --- | --- |
| `0` | Passed |
| `1` | Findings at or above `--fail-on`: fix the code |
| `2` | The command could not run: fix the invocation or the install |

A `2` names its reason as a string code at the end of the stderr line (`[unknown-option]`), and with
`--format json` also as `{"error": {"code", "message"}}` on stdout.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a universal UI framework for React Native, compiled by Rust, with native semantics on every platform, first-class accessibility, and diagnostics for humans and AI agents alike. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://iray-tno.github.io/hozo/docs/getting-started/). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
