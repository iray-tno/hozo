---
"@hozo/cli": patch
---

`hozo add theme` copies `@hozo/ui`'s `theme.css` into the project, for a project that wants to own every token's default rather than redefine some in its own `@theme`. With `--imports`, it also changes the stylesheet Hozo reads to import the copy instead of `@hozo/ui/theme.css`, under the write contract. When it cannot tell which line to change, it prints the change and exits 2. Once nothing in the project imports `@hozo/ui`, it says the package can be removed; it does not remove it. `hozo square` accepts a stylesheet that imports a copied theme.
