# @hozo/rn-compat

Optional compatibility APIs for migrating existing React Native applications without retaining
React Native Web for the supported surface.

```tsx
import { Dimensions, Modal, Platform, StyleSheet } from '@hozo/rn-compat'
```

On React Native, package conditions select the platform APIs. On the Web, Hozo supplies focused
DOM implementations. This is not a complete React Native namespace: canonical components such as
`View`, `Text`, `Pressable`, `Image`, `TextInput`, `ScrollView`, and `FlatList` belong to
`@hozo/primitives` (or the `@hozo/core` facade).

The `Animated` surface intentionally contains only `Animated.View`. Animation graphs, drivers,
timing, interpolation, and events remain outside this compatibility package.

## Supported surface

- `Modal`, `ActivityIndicator`, `TouchableOpacity`, and `TouchableWithoutFeedback`
- the narrow `Animated.View` adapter
- `Platform`, `Dimensions`, `Keyboard`, `AccessibilityInfo`, and `StyleSheet`
- `PanResponder`, `useColorScheme`, and `useWindowDimensions`

Importing from `@hozo/rn-compat` works under any configuration. The compiler moves these imports
out of existing `react-native` source for you only when the build sets `unloweredReactNativeJsx`
to `'warn'` or `'error'`; the rewritten imports then land in your source, so the application needs
`@hozo/rn-compat` in its own dependencies, and Hozo warns (`RN_COMPAT_NOT_INSTALLED`) when it cannot
resolve it. On Native, the package's `react-native` export condition reaches React Native's
implementations directly.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
