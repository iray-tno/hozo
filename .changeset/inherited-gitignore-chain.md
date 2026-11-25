---
"@hozo/compiler": patch
---

Read only the `.gitignore` files that can apply to a package when inheriting its repository's ignores, instead of every `.gitignore` in the repository. In a monorepo, project discovery no longer walks every other package and build directory, which made the example Vite build about 40% faster. The discovered files are unchanged.
