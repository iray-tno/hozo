---
"@hozo/compiler": patch
---

Reject unresolvable or invalid CSS arbitrary values on Native (`var()`, `calc()`, `nonsense`, non-colour literals, malformed filter/shadow/gradient strings, and invalid `auto`/`%` divider/transform/max-size values) at build time instead of emitting inert strings, and fold statically known `rem`/physical lengths inside `blur-[...]` and `origin-[...]` to `px`.
