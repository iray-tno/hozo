# @hozo/primitives

Canonical universal UI components for Hozo: `View`, `Text`, `Pressable`, `Button`, `Link`, `Image`,
`TextInput`, `ScrollView`, `FlatList` and `RefreshControl` -- the components whose meaning is the
same on every platform.

Applications usually import these from `@hozo/core`, which re-exports this package. The compiler
lowers them to semantic DOM and CSS on the Web and to React Native components and a `StyleSheet`
on device. Where it cannot -- Hozo is not in the build, or a usage it does not model -- they still
render: the browser entry supplies the DOM behavior, and the Native entry is React Native's own
implementation.

```tsx
import { FlatList, Pressable, Text } from '@hozo/core'

export function Inbox({ messages, onOpen }) {
  return (
    <FlatList
      data={messages}
      keyExtractor={(message) => message.id}
      renderItem={({ item }) => (
        <Pressable className="p-4" accessibilityRole="button" onPress={() => onOpen(item)}>
          <Text className="font-semibold">{item.subject}</Text>
        </Pressable>
      )}
    />
  )
}
```

The browser `FlatList` windows its rows itself, so compiled and uncompiled paths behave the same,
and it reports the list's full length to assistive technology -- `aria-setsize`/`aria-posinset` on
the Web, Android's collection info on device.

What each primitive compiles to on both platforms is generated into
[docs/primitives.md](https://github.com/iray-tno/hozo/blob/main/docs/primitives.md).

## Compiler runtime

`@hozo/primitives/generated/*` is the generated-code ABI, not an authoring API: one module per
leaf (`flat-list`, `view`, `grid`, ...), because Metro does not tree-shake and a compiled screen
carries whatever module it imports. Compiled output reaches these through `@hozo/core/generated/*`,
which the application already depends on. On Native the leaves include the component boundaries
needed to emulate browser layout and presentation features that React Native does not provide:
grid tracks, container queries, child spacing, relative text sizes, transitions, and configured
backdrop blur. Those have no Web implementation to speak of, because they lower to CSS there.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
