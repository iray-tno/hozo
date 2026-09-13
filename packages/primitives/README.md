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

`@hozo/primitives/runtime` is an internal generated-code ABI, not an authoring API. On Native it
owns the component boundaries needed to emulate browser layout and presentation features that
React Native does not provide: grid tracks, container queries, child spacing, relative text sizes,
transitions, and configured backdrop blur. Its Web entry is empty because those features lower to
CSS there.
