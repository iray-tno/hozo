---
"@hozo/cli": patch
"@hozo/compiler": patch
---

`hozo init` adds Hozo to a Vite, TanStack Start or Astro project that already builds ([RFC 013](https://github.com/iray-tno/hozo/blob/main/docs/rfcs/013-hozo-init.md)). It installs `@hozo/core`, `@hozo/vite` and `@hozo/compiler` at the CLI's own version with the project's package manager, uses the stylesheet the build already imports Tailwind from (or `--css`, or a new `src/theme.css`), adds `hozo()` first in the config's plugins, with `preflight: false` beside Tailwind's own, and finishes with `hozo square --setup`. The config is edited by insertion at offsets the compiler's parser reports (`configShape` in `@hozo/compiler/analysis`), so the rest of the file stays as written; a config whose shape `init` does not recognise is left alone, with the lines to add printed and exit `2`. A dry run unless `--write`; `init` was a reserved name before this release.
