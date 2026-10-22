---
title: "React Native Compatibility (@hozo/rn-compat)"
description: "Compatibility components and platform APIs for migrating existing React Native applications off react-native-web."
sidebar:
  order: 7
---

`@hozo/rn-compat` provides compatibility components and non-JSX APIs for migrating existing React Native applications to Hozo without keeping `react-native-web` for the supported surface.

```tsx
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useColorScheme,
  useWindowDimensions,
} from '@hozo/rn-compat'
```

## How it works across platforms

- **On React Native:** the package's `react-native` export condition resolves directly to React Native's own implementations. Importing `Platform` or `StyleSheet` from `@hozo/rn-compat` on iOS or Android hands back React Native's exact object.
- **On the Web:** `@hozo/rn-compat` provides focused, accessible DOM implementations without pulling in `react-native-web`.

Canonical UI primitives (`View`, `Text`, `Pressable`, `Image`, `TextInput`, `ScrollView`, `FlatList`, `RefreshControl`) live in `@hozo/primitives` (and `@hozo/core`), not in `@hozo/rn-compat`.

## Supported surface

- **Components:** `Modal`, `ActivityIndicator`, `TouchableOpacity`, and `TouchableWithoutFeedback` (each also recognized and lowered by the Hozo compiler; see the [Primitives reference](../primitives/)).
- **Narrow animation adapter:** `Animated.View` (for style-driven view wrappers; full `Animated` graphs, drivers, and interpolation remain outside this package).
- **Platform & layout APIs:** `Platform`, `Dimensions`, `Keyboard`, `AccessibilityInfo`, `StyleSheet`, `PanResponder`, `useColorScheme`, and `useWindowDimensions`.

## Automatic import rewriting

You can import from `@hozo/rn-compat` directly, or let Hozo rewrite existing `react-native` imports during migration:

1. **At build time (Web only):** when `unloweredReactNativeJsx` is set to `'warn'` or `'error'` in your bundler configuration, the Web compiler automatically rewrites supported API imports from `react-native` to `@hozo/rn-compat` (and warns with `RN_COMPAT_NOT_INSTALLED` if the package is not in `package.json`).
2. **In source (`@hozo/migration-audit --fix`):** running `npx @hozo/migration-audit . --fix --write` writes those exact import moves into your shared source files so the dependency boundary is explicit in Git. See the [Migration Audit guide](../../migration/migration-audit/).
