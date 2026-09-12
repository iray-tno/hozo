# @hozo/runtime

The small amount that genuinely has to happen at runtime.

Hozo compiles away everything it can. What is left is here: styles the compiler could not resolve statically, the interaction states CSS pseudo-classes give you for free on Web and nothing gives you on Native, and the accessibility behaviour that is behaviour rather than markup.

Generated components import what they need. The exception is explicit setup for an optional
platform adapter, because Hozo does not add a native module to every application automatically.

## What lives here

**Dynamic class resolution.** A `className` the compiler could not read — `<View className={getVariant()} />` — is resolved on device against a project-wide map that `@hozo/metro` generates at config time. React Native has no CSS engine, so this is the one place a class name becomes a style object at runtime.

**Contextual variants.** `dark:`, `sm:`/`md:`/`lg:`, and viewport-relative sizes are media queries on Web and subscriptions on Native. `useHozoDark`, `useHozoBreakpoint` and `useHozoViewport` are separate stores on purpose: a component using only `md:` must not re-render on every resize that does not cross a breakpoint.

**Interaction state.** `HozoPressable` tracks pressed, hovered, focused and focus-visible, and provides them to descendants — which is how a `Text` inside a pressed button changes colour without the button knowing what is inside it. Focus-visible follows the input modality, so a tap does not draw a focus ring and a Tab key does.

**Web responder negotiation.** `View`, `Pressable`, `TouchableOpacity`,
`TouchableWithoutFeedback`, and `ScrollView` use one responder state machine. Pointer capture and
bubble negotiation map to React Native's grant, start, move, end, release, rejection, and
termination callbacks; one winning surface retains all active pointers until the final release.
`ScrollView` installs these handlers only when the author supplied a responder contract, so an
ordinary scroll container keeps the browser's unmediated scrolling path.

This is a lifecycle compatibility layer, not an attempt to make browser input delivery identical
to React Native. Pointer/touch coalescing, native dispatch timing, gesture recognition, and the
platform's choice of synthesized mouse events remain platform behavior. Hozo normalizes ownership
and callback order where an application explicitly asks for the responder API; it does not replace
Pointer Events or the native input system.

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

### Accessibility, and what virtualisation costs

Windowing takes rows out of the document, and the accessibility tree is the document. Three of the four things that breaks are fixable and are fixed here; the fourth is not, and is worth knowing about.

- **How long the list is.** Each row carries `aria-setsize` and `aria-posinset`, so a screen reader is told "item 4,940 of 10,010" rather than the number of rows that happen to be mounted. It is the one thing about virtualisation the Web can answer completely.
- **Who owns the rows.** The measuring wrapper around each row is `role="presentation"`, so the `listitem`s inside it stay owned by the `list`. ARIA requires that relationship and a wrapper in the middle of it breaks it — axe calls it `aria-required-children`.
- **Focus.** The window is the union of the scroll window and a small window around whatever holds focus. Without it, scrolling away from a focused row unmounts it and focus falls back to `<body>`; and tabbing forward walks to the last mounted row and finds nothing after it.
- **Screen reader browse mode is still bounded.** VoiceOver and NVDA walk the accessibility tree rather than the viewport, and rows that are not mounted are not in it to walk to. `aria-setsize` tells the reader how many there are; it cannot make them reachable. Neither can find-in-page reach them. This is inherent to virtualisation rather than to this implementation.

The escape hatch for the last one is not more JavaScript: `content-visibility: auto` with `contain-intrinsic-size` leaves every row in the document and lets the browser skip its layout and paint, so the accessibility tree and Ctrl+F keep working while the cost of a long list mostly does not. It trades memory for that. Hozo does not choose it yet — measuring the trade properly, and against real browser support, is its own piece of work.

`scripts/check-list.mjs` asks a browser about the first three: it focuses a row, scrolls ten thousand rows away, checks focus is still on the same row with rows mounted after it, reads `aria-setsize` off the DOM, and runs axe over the result.

### The Native list is told how long it is too

A React Native `FlatList` has the same problem the Web one does: it mounts the rows near the viewport, so TalkBack counts those and announces them. A ten-thousand-row feed reports however many cells happen to exist.

Android has an answer and React Native does not document it. `accessibilityCollection` and `accessibilityCollectionItem` are registered as native props in `BaseViewConfig.android.js`, stored as tags by `BaseViewManager`, and read back into `AccessibilityNodeInfo.setCollectionInfo` by `ReactScrollViewAccessibilityDelegate` — which even works out which children are on screen. Neither appears in any `.d.ts` or in the documentation, so nothing that is not looking for them will find them.

So `HozoFlatList` sets them, and the compiler emits `HozoFlatList` rather than React Native's list for exactly that reason. React Native's list is still what renders; the per-item position goes on the view the list already wraps each cell in, through its own `CellRendererComponent`, so nothing is nested more deeply than before.

**iOS gets nothing, and that is not an oversight.** `BaseViewConfig.ios.js` registers neither prop and `React/Views` implements neither, so there is nowhere to send them. VoiceOver is told how long a React Native list is by nothing at all. Closing that needs a `UIAccessibilityContainer` shim in native code — see #353 — or React Native to grow the prop.
