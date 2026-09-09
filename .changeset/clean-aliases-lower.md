---
'@hozo/compiler': patch
---

Lower aliased primitives from trusted modules by their canonical exported name while preserving the local binding for source and import bookkeeping. Aliases from untrusted modules and React Native's incompatible Button remain untouched.
