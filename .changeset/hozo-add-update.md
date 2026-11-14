---
"@hozo/cli": patch
---

`hozo add --diff <component>` shows what changed in `@hozo/ui` since a copy was made and, separately, what the project changed in it, and notes any state class (`focus-visible:`, `disabled:`, `aria-*:`, `data-*:`) the copy no longer has. The release the copy came from is fetched from the registry once and kept in `node_modules/.hozo/upstream`; without it, the comparison is against the installed `@hozo/ui`, and says why. `hozo add --update <component> --write` replaces each copy the project has not edited with the installed `@hozo/ui`, under the same write contract as `--fix`. An edited copy is shown and never merged, and the command exits 2; `--force` replaces it.
