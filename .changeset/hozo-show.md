---
"@hozo/cli": minor
---

Add `hozo show <file>`: it prints what one file compiles to, the way the REPL does, but with the project's theme.

- The output: the Web JSX and CSS, the React Native JSX and StyleSheet, and each diagnostic with its line, column and the backends that raised it.
- The theme comes from the stylesheet the project's bundler config names, else the usual names. `--css` names one directly.
- `--web` or `--native` shows one platform. `--format json` and `--fail-on none|warning|error` are as on the other commands.
