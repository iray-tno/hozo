---
'@hozo/compiler': patch
---

Preserve tailwind-merge's right-to-left conflict decisions and nested merge boundaries, including predicate side effects and errors when classes disappear. Avoid Unicode arbitrary-value panics and classify integer shadow coordinates correctly. Keep opaque caller class lists at runtime rather than approximating their conflicts with prefix regexes, and preserve twJoin's array flattening for opaque arguments.
