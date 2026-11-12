# @hozo/cli

`hozo`, one command for Hozo's command-line tools ([RFC 011](../../docs/rfcs/011-hozo-cli.md)).

```sh
npx @hozo/cli dry-fit .                          # what Hozo would do with this React Native checkout
npx @hozo/cli dry-fit . --fail-on error --output hozo-audit.json
npx @hozo/cli dry-fit --help                     # every option
```

| Command | Alias | Does |
| --- | --- | --- |
| `hozo dry-fit` | `migration-audit` | Before adoption: lowers a checkout without installing anything and reports what Hozo would do. Options and report as [`@hozo/migration-audit`](../migration-audit/README.md) |
| `hozo manifest` | | Builds a component package's `hozo.manifest.json`, or `--check`s it. See [`@hozo/compiler`](../compiler/README.md#a-component-packages-manifest) |
| `hozo links` | | Generates or `--check`s the Universal Links and App Links verification files from `hozo-links.json`. Needs `@hozo/navigation` installed. See [`@hozo/navigation`](../navigation/README.md) |

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
