---
'@hozo/compiler': patch
---

Lower same-component `group-aria-*`, `group-disabled`/`group-enabled`, `group-rtl`/`group-ltr`, `group-first`/`last`/`odd`/`even`/`only`/`nth-*`, `group-read-only`/`group-placeholder-shown`, and negated `not-group-*` / `group-not-*` variants on React Native from the nearest enclosing `.group` ancestor's props and compile-time sibling position.
