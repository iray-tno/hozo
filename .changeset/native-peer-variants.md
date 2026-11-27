---
'@hozo/compiler': patch
'@hozo/primitives': patch
'@hozo/core': patch
---

Lower same-component `peer-*` sibling variants (`peer-aria-*`, `peer-disabled`/`peer-enabled`, `peer-data-*`, `peer-rtl`/`peer-ltr`, `peer-first`/`last`/`odd`/`even`/`only`/`nth-*`, `peer-read-only`/`peer-placeholder-shown`, interactive `peer-hover`/`peer-focus`/`peer-focus-visible`/`peer-pressed`, and negated `not-peer-*`/`peer-not-*`) on React Native via zero-host-View opt-in `HozoPeerScope` and `HozoPeerQuery`.
