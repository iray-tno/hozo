---
'@hozo/rn-compat': minor
'@hozo/compiler': minor
'@hozo/engine': minor
'@hozo/core': minor
'@hozo/metro': patch
'@hozo/vite': patch
'@hozo/next': patch
---

Extract React Native migration APIs and compatibility components into the optional
`@hozo/rn-compat` package, and make compiler-generated Web imports target their
new owner while Native builds continue to select React Native implementations.
