---
"@hozo/cli": minor
---

Add `hozo square` (alias `doctor`), the check a project runs once it uses Hozo. It checks that every installed `@hozo/*` package is at one version, including a copy another package brought in at an older version, and that each package's peers, such as `react-native`, `react` and Expo's modules, are installed within the range the package declares. The ranges are read from the installed packages, so the check stays in step with them. `square` reads `package.json` files only and loads no compiler, so a broken install still gets a report. It exits `1` on a finding at or above `--fail-on` (default `error`) and `2` on a project with no `@hozo/*` dependency, which it points to `hozo dry-fit`.
