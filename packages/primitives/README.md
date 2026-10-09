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
and it reports the list's full length to assistive technology with `aria-setsize`/`aria-posinset`.

On Android each cell still reports where it sits, but the list no longer reports how long it is.
Android's collection info is set through an undocumented prop whose reader crashes the app on a
child that does not carry the matching per-item tag — which `VirtualizedList`'s own windowing
spacers do not. See [#512](https://github.com/iray-tno/hozo/issues/512); it comes back when React
Native stops casting that tag with `as` instead of `as?`.

### Responsive images

`Image` does what [#155](https://github.com/iray-tno/hozo/issues/155) asked for with what each platform already has, rather than with a second image component:

| | Web | React Native |
|---|---|---|
| A box before the image loads | `aspect-video`, `aspect-[4/3]`: CSS `aspect-ratio` | the same classes: `aspectRatio` |
| Several resolutions | `srcSet` and `sizes`, passed to `<img>` | `srcSet`, which React Native reads itself, by **density only** (`1x`, `2x`, `3x`) |
| A picture to show instead | `defaultSource`, shown if the image **fails** | `defaultSource`, shown **while it loads** on iOS |
| `loading="lazy"` | the browser's | ignored |

Width descriptors (`800w`) are skipped on device with a runtime warning, and `sizes` is not read there, so the compiler warns about a `srcSet` written with them.

Not provided:
- **BlurHash:** decoding one needs a library, which is a dependency for the application to choose (`expo-image` on Native).
- **A `<Picture>` with format negotiation:** that is the server's or the CDN's job, done with `Accept`.

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
