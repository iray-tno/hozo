---
"@hozo/cli": minor
---

`hozo square` now checks how the project wires Hozo in, as well as its packages:

- **adapter**: each bundler config (Vite, Astro, Next.js, Metro, Storybook) uses its Hozo adapter, and that adapter is installed. On Vite, `hozo()` comes before React's plugin.
- **css**: the stylesheet Hozo reads exists and imports Tailwind. When `@hozo/ui` is installed, it also imports `@hozo/ui/theme.css`. With no stylesheet at all, a warning says the classes compile against Tailwind's default theme.
- **metro**: when `metro.config` changed after Metro last saved its state, a warning says to restart Metro with its cache cleared.
- **scan**: every file that imports a runtime `@hozo/*` package was read by the last candidate scan. A file the scan missed gets no CSS on the Web.

Config files are read as text, not run. A check that cannot see what it needs, such as a scan that has not run yet, says why and is skipped.
