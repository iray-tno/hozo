---
'@hozo/svg': minor
'@hozo/compiler': minor
'@hozo/core': minor
'@hozo/engine': minor
'@hozo/metro': minor
---

Move the universal SVG namespace, navigation group, and Native
`react-native-svg` adapter into the optional `@hozo/svg` domain package.
Compiler integrations now recognize the package as an authoring source and
emit Native SVG imports from its physical owner.
