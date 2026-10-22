---
title: "Migration Audit (@hozo/migration-audit)"
description: "Read-only compiler analysis, baseline comparison, CI failure gates, and automated import moves for migrating React Native apps."
sidebar:
  order: 1
---

`@hozo/migration-audit` analyzes an existing React Native codebase by running Hozo's Web and Native compiler lowerers over the checkout without installing anything into the target project or executing its code.

```sh
npx @hozo/migration-audit .
npx @hozo/migration-audit --root ../my-react-native-app --output hozo-audit.md
npx @hozo/migration-audit . --format json --output hozo-audit.json
npx @hozo/migration-audit . --compare previous-audit.json --fail-on new-errors
npx @hozo/migration-audit . --fix            # print import moves as a unified diff
npx @hozo/migration-audit . --fix --write    # apply import moves to tracked files
```

Interactive terminals receive a readable Markdown report that opens with **Next steps** in priority order (parse failures first, then unlowered React Native JSX on Web, compiler errors, missing `@hozo/rn-compat`, remaining `react-native` APIs, warnings grouped by diagnostic code, and optional `--fix` import moves). Piped stdout and `.json` output paths emit complete JSON schema v3 evidence.

## What the audit measures

For every `.tsx`, `.jsx`, `.ts`, `.js`, `.mts`, and `.mjs` file in the selected scope (respecting `.web`, `.ios`, `.android`, and `.native` platform suffixes), the audit records:

1. **Extension-aware syntax & lowering:** `.tsx` is compiled as TSX, `.ts`/`.mts` as non-JSX TypeScript, and `.js`/`.jsx`/`.mjs` as JavaScript with JSX. Parser errors are reported as `SOURCE_SYNTAX_ERROR` rather than retried with a looser grammar.
2. **Binding-aware React Native source inventory (`reactNativeUsage`):** tracks every ESM import from `react-native`, resolving local aliases and lexical shadowing, and separating type-only imports, unused bindings, JSX tag occurrences, and static/dynamic member accesses.
3. **Actual Web import rewrite journal (`reactNativeImportDecisions`):** records the compiler's exact import-specifier decisions (`moved-to-hozo-core`, `moved-to-rn-compat`, `retained-react-native`, `type-only`).
4. **Actual Web JSX tag journal (`reactNativeReferenceDecisions`):** records whether every React Native JSX tag was lowered to semantic HTML/Hozo helpers or left unlowered (`UNLOWERED_REACT_NATIVE_JSX`).
5. **Non-JSX runtime value & member-contract inventory (`reactNativeValueDecisions`):** tracks non-JSX runtime references (`Platform.OS`, `StyleSheet.create`, `Dimensions.get`, `Keyboard.dismiss`, and so on) across compiler edits and links each static member access to Hozo's reviewed member contracts (`reviewedAdapterReferences`, `retainedGuidanceReferences`, `unreviewedMemberReferences`).
6. **Static theme, StyleX graph, and font registration facts:** resolves entry/imported Tailwind CSS structurally (`--css`, `--preflight`), builds separate Web/iOS/Android cross-file StyleX graphs using static `tsconfig.json` `paths`, and optionally validates literal font declarations against `--font-availability <file.json>` (`createFontAvailability()` from [`@hozo/typography/fonts`](../../reference/typography-and-fonts/)).

## `--fix`: moving `react-native` API imports in source

When migrating a Web build off `react-native-web`, Hozo moves supported non-JSX APIs (`Platform`, `Dimensions`, `Keyboard`, `StyleSheet`, `PanResponder`, `AccessibilityInfo`, `useColorScheme`, `useWindowDimensions`) from `react-native` to [`@hozo/rn-compat`](../../reference/rn-compat/).

Running `npx @hozo/migration-audit . --fix` uses the compiler's own rewrite pass to print those exact import moves as a zero-context unified diff (`git apply --unidiff-zero`). Adding `--write` applies them to source under a strict safety contract:

- **Dry run by default:** without `--fix --write`, the audit never modifies any file inside the checkout.
- **Only `react-native` → `@hozo/rn-compat` import specifiers:** never rewrites Native-only files (`.native.*`, `.ios.*`, `.android.*`), never rewrites components (`Pressable` and `TextInput` stay untouched in shared source so Native behavior does not change), and never edits `package.json` or lockfiles.
- **Git-clean guard:** `--write` refuses to touch any file with uncommitted changes or untracked status unless `--force` is explicitly passed for that run.

## Baseline comparison (`--compare`) and CI gates (`--fail-on`)

Save a JSON report from `main` and pass it to `--compare baseline.json` on pull requests:

```sh
npx @hozo/migration-audit . --compare baseline.json --fail-on new-errors --output audit-diff.md
```

- **Line-movement resilience:** findings match by relative file, backend, diagnostic code, and compiler subject, so ordinary line shifts in an edited file are counted as `continued` rather than `added`.
- **Comparability verification:** two reports are `comparable` only when repository identity, source selection, effective reset/theme/alias settings, and context input hashes match. If inputs changed or a file failed analysis, the comparison is marked `partial` or `non-comparable` and `--fail-on new-errors` blocks rather than reporting a false zero.

| `--fail-on` policy | Exit code behavior |
| --- | --- |
| `none` (default) | Informational; exits `0` unless arguments are invalid or the analyzer itself fails (`ANALYSIS_FAILED`). |
| `error` | Exits `1` if any current finding has severity `error` across Source, Web, or Native. Warnings pass. |
| `new-errors` | Requires `--compare` with a `comparable` baseline; exits `1` only if a new `error` was added or an existing warning escalated to `error`. |
