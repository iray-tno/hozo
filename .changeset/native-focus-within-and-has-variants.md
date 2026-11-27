---
'@hozo/compiler': patch
'@hozo/primitives': patch
'@hozo/core': patch
---

Lower `focus-within:`, `has-[:focus]:`, `has-[:focus-visible]:`, `has-[:hover]:`, `has-[:active]:`, `has-hover:`, `has-focus:`, `has-focus-visible:`, and `has-pressed:` (and their negations) on React Native via zero-host-View opt-in `HozoSubtreeScope` and `HozoSubtreeBoundary`.
