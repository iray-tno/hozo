# @hozo/primitives

Canonical universal UI primitives for Hozo applications.

This package owns components whose meaning is stable across platforms. The browser entry supplies
DOM behavior when compilation cannot erase the component; the Native entry uses React Native's
platform implementation. `@hozo/core` re-exports these components as the convenient application
facade.

The first extracted family is collection scrolling: `ScrollView`, `FlatList`, and
`RefreshControl`. Its browser `FlatList` owns windowing privately so compiled and uncompiled paths
have the same complexity and behavior.

## Compiler runtime

`@hozo/primitives/generated/*` is the generated-code ABI, not an authoring API: one module per
leaf (`flat-list`, `view`, `grid`, ...), because Metro does not tree-shake and a compiled screen
carries whatever module it imports. Compiled output reaches these through `@hozo/core/generated/*`,
which the application already depends on. On Native the leaves include the component boundaries
needed to emulate browser layout and presentation features that React Native does not provide:
grid tracks, container queries, child spacing, relative text sizes, transitions, and configured
backdrop blur. Those have no Web implementation to speak of, because they lower to CSS there.
