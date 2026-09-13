# @hozo/primitives

Canonical universal UI primitives for Hozo applications.

This package owns components whose meaning is stable across platforms. The browser entry supplies
DOM behavior when compilation cannot erase the component; the Native entry uses React Native's
platform implementation. `@hozo/core` re-exports these components as the convenient application
facade.

The first extracted family is collection scrolling: `ScrollView`, `FlatList`, and
`RefreshControl`. Its browser `FlatList` owns windowing privately so compiled and uncompiled paths
have the same complexity and behavior.
