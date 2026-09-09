---
'@hozo/runtime': minor
'@hozo/compiler': patch
'@hozo/core': patch
'@hozo/migration-audit': patch
'@hozo/next': patch
'@hozo/vite': patch
---

Normalize React Native inline style arrays before they reach React DOM while keeping static class-only output runtime-free. Preserve native StyleProp semantics, convert compatible structured values, and explicitly report native-only values that Web cannot reproduce.
