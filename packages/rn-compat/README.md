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

The compiler automatically rehomes these value imports when it lowers existing
`react-native` source for the Web. On Native, the package's `react-native` export condition reaches
React Native's implementations directly.
