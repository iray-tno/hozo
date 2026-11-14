---
"@hozo/cli": patch
---

`hozo add <component>` copies an `@hozo/ui` component into the project as source, to own and edit, with the relative files it imports ([RFC 012](https://github.com/iray-tno/hozo/blob/main/docs/rfcs/012-hozo-add.md)). Each copied file starts with a line recording the `@hozo/ui` version and hash it came from, and `hozo add --list` reports each copy as current, edited or behind the installed `@hozo/ui`. The destination is `"hozo": { "components" }` in `package.json` or `"components"` in `hozo.json`, defaulting to `src/components/ui`. Callers are left alone and listed, each with the import that would take the copy instead, and any package the copy imports that `package.json` does not declare is named with its install command. It is a dry run unless `--write`, and does not overwrite a file it did not create without `--force`. `add` was a reserved name before this release.
