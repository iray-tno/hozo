---
'@hozo/compiler': minor
'@hozo/vite': minor
'@hozo/next': minor
---

Add an opt-in `rnwFree` project setting that fails Web builds when emitted JSX
still uses a binding imported directly from React Native. The check is based on
parser binding metadata, so aliases and namespace JSX are exact while comments
and type-only mentions are ignored.
