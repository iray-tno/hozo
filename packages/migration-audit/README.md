# @hozo/migration-audit

Read-only migration analysis for real React Native applications. It runs Hozo's Web and Native
lowerers over a checkout without installing or modifying that application, respects platform file
suffixes, and reports parse failures, diagnostics, React Native JSX left in Web output, and
structural wrong-output invariants.

```sh
npx @hozo/migration-audit --root ../my-react-native-app --output hozo-audit.md
```

Use `--source` when application source is not under `src`, and `--expected-commit` to make a corpus
measurement reproducible. The report deliberately treats its wrong-output count as a lower bound:
absence of a diagnostic is not proof that rendered behavior is correct.

The package does not clone repositories. A caller that owns a corpus should acquire and pin it,
then pass the checkout to this CLI. Hozo's own `pnpm measure:bluesky` command is one such runner.
