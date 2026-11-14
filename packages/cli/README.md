# @hozo/cli

`hozo`, one command for Hozo's command-line tools ([RFC 011](../../docs/rfcs/011-hozo-cli.md)).

```sh
npx @hozo/cli dry-fit .                          # what Hozo would do with this React Native checkout
npx @hozo/cli dry-fit . --fail-on error --output hozo-audit.json
npx @hozo/cli dry-fit --help                     # every option
npx @hozo/cli square                             # once Hozo is installed: is the setup right, and the code?
npx @hozo/cli square --format json > hozo-square.json        # a baseline, then in CI:
npx @hozo/cli square --compare hozo-square.json --fail-on new-errors
npx @hozo/cli add button --write                # copy @hozo/ui's Button into the project, to own and edit
```

| Command | Alias | Does |
| --- | --- | --- |
| `hozo dry-fit` | `migration-audit` | Before adoption: lowers a checkout without installing anything and reports what Hozo would do. Options and report as [`@hozo/migration-audit`](../migration-audit/README.md) |
| `hozo square [project]` | `doctor` | After adoption: checks that every `@hozo/*` package is at one version, nested copies included, and that what each one needs beside it (`react-native`, `react`, Expo's modules) is installed within the range it declares; that each bundler config (Vite, Astro, Next.js, Metro, Storybook) uses its Hozo adapter, with `hozo()` before React's plugin; that the stylesheet Hozo reads imports Tailwind, and `@hozo/ui`'s theme when it is installed; that Metro's saved state is newer than its config and than each project component whose text classes it read; that every file importing `@hozo/*` was in the last candidate scan; and that every theme token an `@hozo/ui` component names, copied by `hozo add` or installed and imported, is defined by the theme the stylesheet resolves (an undefined one is an error: its classes compile to nothing), with each copy `@hozo/ui` has moved on from reported as `info`, which never fails. These setup checks read files and load nothing, so they print even when the install is what is broken. Then the code: the `dry-fit` audit on the project, against the stylesheet the setup found, its report embedded in the JSON as `code.report`. A fatal setup finding (no adapter) skips the code and says so. The code compiles with the compiler the CLI brings; when the project builds with another version, a warning names both and the `npx @hozo/cli@<version>` that matches. `--setup` (setup only), `--compare <report>` (a `square` or `dry-fit` JSON report), `--fail-on none|warning|error|new-errors` (default `error`), `--format json` |
| `hozo manifest` | | Builds a component package's `hozo.manifest.json`, or `--check`s it. See [`@hozo/compiler`](../compiler/README.md#a-component-packages-manifest) |
| `hozo links` | | Generates or `--check`s the Universal Links and App Links verification files from `hozo-links.json`. Needs `@hozo/navigation` installed. See [`@hozo/navigation`](../navigation/README.md) |
| `hozo show <file>` | | Prints what one file compiles to: the Web JSX and CSS, the React Native JSX and StyleSheet, each class list with its route (compiled, conditional, applied by its pattern owner with its state, handed to a component, or resolved at runtime, with state on Native by its pattern owner or by a Pressable, Link or TextInput itself) and every class that did not compile on a platform, with why (no Tailwind rule in this theme, refused or not wired on Native, not a Tailwind class), and each diagnostic with its line, column and backend. The REPL's output, with the project's theme: read from the stylesheet its bundler config names, or `--css`. `--web` / `--native`, `--fail-on none\|warning\|error` (default `none`), `--format json` |
| `hozo add <component>...` | | Copies an `@hozo/ui` component into the project as source ([RFC 012](../../docs/rfcs/012-hozo-add.md)), with the relative files it imports, each starting with a line naming its origin (`// hozo add: @hozo/ui@<version> src/<file> sha256:<hash>`). Names are file names (`button`, `date-picker`) or component names (`badge`, `checkbox`); `theme` copies `@hozo/ui`'s `theme.css` (its origin line a CSS comment), and with `--imports` changes the stylesheet Hozo reads to import the copy, under the write contract, or prints the line to change and exits `2` when it cannot tell which line; once nothing imports `@hozo/ui`, it says the package can be removed (it does not remove it). The destination is `"hozo": { "components" }` in `package.json` or `"components"` in `hozo.json`, never both; else `src/components/ui`, or `components/ui` without `src`. Callers are not changed unless `--imports`: it lists each file importing the component from `@hozo/ui`, with the import that takes it from the copy (`import { HozoButton as Button } from './components/ui/button'`), and `--imports` makes that change, keeping any other name the statement imports from `@hozo/ui`, under the write contract; and any package the copy imports that `package.json` does not declare, with the install command. A dry run unless `--write`; a file it did not create is not overwritten without `--force`, and an existing copy is left as it is. `--list` gives every component and each copy's state (`current`, `edited`, `upstream-newer`). `--diff <component>` shows what changed upstream since the copy was made and, separately, what the project changed, with a note for any state class (`focus-visible:`, `disabled:`, `aria-*:`, `data-*:`) the copy dropped; the release the copy came from is fetched from the registry once and kept in `node_modules/.hozo/upstream`, and without it the two-way comparison is shown with the reason. `--update <component> --write` replaces each copy the project has not edited with the installed `@hozo/ui` and creates any file its closure gained; an edited copy is shown, never merged, and exits `2` (`--force` replaces it). `--format json` |
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
