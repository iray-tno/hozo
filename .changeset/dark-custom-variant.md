---
'@hozo/compiler': minor
'@hozo/tailwind': minor
---

`dark:` and paired `--dark` theme tokens now follow the project's own `@custom-variant dark (...)` on Web. Before, they always compiled to `@media (prefers-color-scheme: dark)`, so a site with a theme switch could not reach Hozo's output. Tailwind already honoured the variant for the classes it generates, which left one `dark:` following two rules on the same page. `loadTheme` reads the variant into the new `darkSelector` theme field, and the Web backend emits dark rules under that selector, or under that at-rule if the variant is one. Projects that do not declare the variant get the same output as before. React Native is unchanged.
