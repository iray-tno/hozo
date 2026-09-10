# @hozo/runtime

The small amount that genuinely has to happen at runtime.

Hozo compiles away everything it can. What is left is here: styles the compiler could not resolve statically, the interaction states CSS pseudo-classes give you for free on Web and nothing gives you on Native, and the accessibility behaviour that is behaviour rather than markup.

Generated components import what they need. The exception is explicit setup for an optional
platform adapter, because Hozo does not add a native module to every application automatically.

## What lives here

**Dynamic class resolution.** A `className` the compiler could not read — `<View className={getVariant()} />` — is resolved on device against a project-wide map that `@hozo/metro` generates at config time. React Native has no CSS engine, so this is the one place a class name becomes a style object at runtime.

**Contextual variants.** `dark:`, `sm:`/`md:`/`lg:`, and viewport-relative sizes are media queries on Web and subscriptions on Native. `useHozoDark`, `useHozoBreakpoint` and `useHozoViewport` are separate stores on purpose: a component using only `md:` must not re-render on every resize that does not cross a breakpoint.

**Interaction state.** `HozoPressable` tracks pressed, hovered, focused and focus-visible, and provides them to descendants — which is how a `Text` inside a pressed button changes colour without the button knowing what is inside it. Focus-visible follows the input modality, so a tap does not draw a focus ring and a Tab key does.

**Transitions.** `transition-*` utilities compile to `Animated` timings, including colour interpolation, with the blend point preserved when an interrupted transition restarts.

**Layout that CSS does for free.** The `HozoGrid` and `HozoSpaced` helpers reproduce the parts of grid and gap that React Native's layout engine does not have.

**Optional backdrop blur.** Static StyleX `backdropFilter: 'blur(Npx)'` on an ordinary `View`
uses a configured Native component. Expo users can keep `expo-blur` in the application rather
than making it a Hozo dependency:

```ts
import { BlurView } from 'expo-blur'
import {
  configureHozoBackdropFilter,
  createExpoBlurAdapter,
} from '@hozo/runtime'

configureHozoBackdropFilter(
  createExpoBlurAdapter(BlurView, {
    props: { tint: 'default' },
    // Optional: Expo intensity and a CSS pixel radius are different scales.
    intensityForRadius: (radius) => Math.min(100, radius * 4),
  }),
)
```

On Android, Expo's real background blur additionally needs a `BlurTargetView` around the content
and its ref passed as `blurTarget`; pass that and the selected `blurMethod` through `props`. The
adapter cannot infer the target across the React tree. Hozo supports one static non-negative
`blur(px)` (plus the no-op `none`); filter chains, conditional blur, and non-View contexts remain
explicit diagnostics or official StyleX residuals.

## Platform split

`index.ts` is the Web build and `index.native.ts` the React Native one, selected by the `react-native` export condition. The logic worth testing lives in platform-free modules — `ambient.ts`, `grid.ts`, `color-transition.ts` — so it can be tested without a device or a native module registry.

## The Web `FlatList` is windowed

`HozoFlatList` mounts the rows around the viewport and nothing else. Ten thousand rows are about seventy mounted subtrees at rest and a hundred and twenty while scrolling; the rest is padding on the row container, so a grid, a `gap` and a `contentContainerStyle` all keep working.

The arithmetic is React Native's, ported from `@react-native/virtualized-lists`: `windowSize` is `(windowSize - 1)` viewports of overscan split half each way, and its default is React Native's own 21. `react-native-web` ships that same implementation, so a project moving off it gets the prop it already had rather than a narrower one wearing the same name.

Sizes are measured rather than declared. `estimatedItemSize` covers the first paint and the mean of the measured rows takes over immediately after; `getItemLayout` skips measurement entirely for a caller who already knows. That ordering follows the frameworks that do this best — SwiftUI's `LazyVStack` and Compose's `LazyColumn` expose no sizing knobs at all, and the React libraries that measure automatically are the ones that handle variable heights — so React Native's knobs are treated as bounds rather than as requirements.

| prop | behaviour |
|---|---|
| `initialNumToRender` | rows mounted before a viewport has been measured, which is every server render |
| `windowSize`, `maxToRenderPerBatch` | as React Native, on rows |
| `getItemLayout` | exact geometry, believed rather than measured; with `numColumns > 1` it describes items and only its `length` is used |
| `scrollToIndex` | scrolls to the estimate and pins the row until the rows there report their sizes. React Native throws for an unmeasured row; this settles instead |
| `maintainVisibleContentPosition` | holds the reader's row still, anchored by key so a prepend cannot renumber it out from under them |
| `inverted` | a mirror transform on the scroller and each row, as `react-native-web` does it: row 0 at the bottom, `scrollToOffset(0)` with it |
| `removeClippedSubviews` | accepted and unused — rows outside the window are not mounted at all |

`numColumns` windows by **row**, not by item.

The claims above are about layout, and jsdom has none, so `scripts/check-list.mjs` asks a real browser: ten thousand rows of varying height, scrolled, jumped to, prepended to and inverted. Run it with `pnpm test:browser`. It is where the defects were actually found — rows leaving the window kept reporting their size to a `ResizeObserver` after React removed them, and a removed element measures zero, which took ten thousand rows down to a scrollable length of 7,138px.
