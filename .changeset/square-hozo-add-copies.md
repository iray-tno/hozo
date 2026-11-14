---
"@hozo/cli": patch
---

`hozo square` checks that every theme token an `@hozo/ui` component names (`bg-hozo-accent` names `hozo-accent`) is defined by the theme the project's stylesheet resolves. It checks both components copied by `hozo add` and installed ones the project imports. An undefined token is an error: its classes compile to nothing, though no file in the project changed. This happens when upstream renames a token a copy still uses, or when a copied theme is older than a component. It also reports each copy that `@hozo/ui` has moved on from, with the `hozo add --diff` and `--update` to run, as a new `info` severity that never fails.
