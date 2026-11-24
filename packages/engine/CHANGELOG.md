# @hozo/engine

## 0.5.1

## 0.5.0

### Minor Changes

- [#2072](https://github.com/iray-tno/hozo/pull/2072) [`5c823ee`](https://github.com/iray-tno/hozo/commit/5c823ee87f1996f7011290af68702ef7f19e5388) Thanks [@iray-tno](https://github.com/iray-tno)! - On React Native, a physical inline utility on its own (`pl-4`, `mr-2`, `left-3`, `border-l-2`) now keeps its side in RTL, as in Tailwind. Before, React Native's default left/right swap moved it to the other side. Where the swap would change the result, both the static compiler and the generated candidate map emit the edge as `start`/`end` for the current direction, so the result no longer depends on the swap setting. A utility that writes both sides alike (`p-4`) is unchanged.
  
  This changes behaviour for an RTL app that relied on the swap to mirror physical classes. To mirror, use the logical classes (`ps-*`, `pe-*`, `ms-*`, `me-*`, `start-*`, `end-*`).

- [#2074](https://github.com/iray-tno/hozo/pull/2074) [`b3cf38b`](https://github.com/iray-tno/hozo/commit/b3cf38b30f2fe748c4f73110d01de2566826355a) Thanks [@iray-tno](https://github.com/iray-tno)! - On React Native, a development build now warns once about each class it is handed at run time and cannot find in the project's class map, such as `` `bg-${color}-500` `` with a colour the build never saw. Before, such a class just did not apply, with no message. Release builds do not warn.
  
  Some names are meant to mark an element rather than style it, such as `js-row` or a name a test selects by. List those in the new `markerClasses` option, as exact names or as prefixes ending in `*`, and they are not warned about. Tailwind's own `group` and `peer` never need listing. The build-time `CLASS_NOT_IN_RUNTIME_MAP` check skips declared markers too.

### Patch Changes

- [#1996](https://github.com/iray-tno/hozo/pull/1996) [`cb4b456`](https://github.com/iray-tno/hozo/commit/cb4b4564ddb95d7ecb6f729433bf5c956788b53e) Thanks [@iray-tno](https://github.com/iray-tno)! - Preserve an absolute leading register supplementing a theme text colour in generated Web and Native runtime candidates.

- [#1996](https://github.com/iray-tno/hozo/pull/1996) [`ba5beaf`](https://github.com/iray-tno/hozo/commit/ba5beaf2fbaff50a5b6bb1595ee156cae9dd5a1c) Thanks [@iray-tno](https://github.com/iray-tno)! - Keep captured leading registers when a Text owner combines static and runtime classes, without overriding explicit authored styles.

- [#2014](https://github.com/iray-tno/hozo/pull/2014) [`0001fc4`](https://github.com/iray-tno/hozo/commit/0001fc442e38955770974fb5377002e4deb4b95f) Thanks [@iray-tno](https://github.com/iray-tno)! - Use the captured Tailwind order when the state styles in a Native class
  string are all ranked, even if another candidate in the project is
  unassessed. Generated Native maps no longer need a separate flag for
  fully ranked state styles.

- [#1996](https://github.com/iray-tno/hozo/pull/1996) [`ed04074`](https://github.com/iray-tno/hozo/commit/ed04074de82890b87590afb537a0bea99b2751a7) Thanks [@iray-tno](https://github.com/iray-tno)! - Use Tailwind's captured order for equal-specificity hover and press font sizes, without shipping the older Native variant tie in size-only conditional tables.

- [#1684](https://github.com/iray-tno/hozo/pull/1684) [`6cf46e3`](https://github.com/iray-tno/hozo/commit/6cf46e30640459d327305ffce8b38d26e27b3a9b) Thanks [@iray-tno](https://github.com/iray-tno)! - `Image` declares `width`, `height`, `loading`, `decoding` and `fetchPriority`. The uncompiled Web `Image` now forwards them to the `<img>`, as compiled output already did, so a server-rendered page reserves the image's box and lazy-loads it with or without the compiler ([#1674](https://github.com/iray-tno/hozo/issues/1674)). On React Native, `width` and `height` are React Native's own props, and the three loading hints type-check but are ignored.

- [#1977](https://github.com/iray-tno/hozo/pull/1977) [`052b447`](https://github.com/iray-tno/hozo/commit/052b447351a669a12c5b8ced61bef5d07dc8a604) Thanks [@iray-tno](https://github.com/iray-tno)! - Keep shared Tailwind order for dynamic Native text and physical padding when an independent background-colour candidate is unranked.

- [#1977](https://github.com/iray-tno/hozo/pull/1977) [`43680e3`](https://github.com/iray-tno/hozo/commit/43680e3643ba9f3f6e01f5c7aa885feb8e5c7b04) Thanks [@iray-tno](https://github.com/iray-tno)! - Keep explicit line height when a Native Text or TextInput mixes compiled font sizes with runtime classes.

- [#2075](https://github.com/iray-tno/hozo/pull/2075) [`35cc5c3`](https://github.com/iray-tno/hozo/commit/35cc5c31ce90497de9a6f345e884af2d20a6bc60) Thanks [@iray-tno](https://github.com/iray-tno)! - A `style` prop now wins over the classes on the inline edges it writes on React Native. `className="px-8" style={{ paddingRight: 99 }}` used to keep the class's 32, because Yoga prefers `paddingEnd` to `paddingRight` in any order. The authored edge keeps React Native's own meaning, RTL swap included.

- [#2078](https://github.com/iray-tno/hozo/pull/2078) [`70643e9`](https://github.com/iray-tno/hozo/commit/70643e959d229a75fcdbd1316f9a972efb4a2622) Thanks [@iray-tno](https://github.com/iray-tno)! - On React Native, a `style` passed through a spread now wins the inline edges it writes over the element's classes, as a named `style` does since the previous release. `<Button style={{ paddingRight: 24 }} />` used to keep the button's `px-*` padding on that side, because the wrapper hands `style` on with `{...rest}` and Yoga prefers the class's `paddingEnd` to `paddingRight`.

- [#2036](https://github.com/iray-tno/hozo/pull/2036) [`3a3a8d5`](https://github.com/iray-tno/hozo/commit/3a3a8d52d64d0d580d9afaa298977c5c33f295f2) Thanks [@iray-tno](https://github.com/iray-tno)! - On React Native, an element whose classes write an inline edge both logically and physically (`px-8 pl-1`, `ps-8 pl-1`, and the margin, inset and border width and colour counterparts) now lays out as Tailwind does in both directions. The physical writes are emitted as `start`/`end` for the current direction, so the order Tailwind settled decides. Before, Yoga let `paddingStart` beat `paddingLeft` whatever the order, and React Native's default RTL left/right swap moved the physical write to the other side. Both the static compiler and the generated candidate map do this; an element that writes a family only physically or only logically is unchanged.

- [#1996](https://github.com/iray-tno/hozo/pull/1996) [`45eda5b`](https://github.com/iray-tno/hozo/commit/45eda5b451bdf1449c7c16172c03b2a9e743aaa6) Thanks [@iray-tno](https://github.com/iray-tno)! - Keep Tailwind's font-size winner for adjacent conditional size utilities with the same guard in a mixed, dynamic Native class string.

- [#2059](https://github.com/iray-tno/hozo/pull/2059) [`cca1211`](https://github.com/iray-tno/hozo/commit/cca1211b176ec411112275399fc582a92a50efbe) Thanks [@iray-tno](https://github.com/iray-tno)! - RFC 006's whole-component Native text inheritance route is removed, now that [decision 013](https://github.com/iray-tno/hozo/blob/main/docs/decisions/013-text-inheritance-compiled-where-visible.md) is the default. The internal `textInheritance` and `textStatic` compile options are gone. So are the generated components that only that route emitted: `HozoInheritedText`, `HozoInheritedView`, `HozoInheritedRelativeText`, `HozoInheritedPressable` and `HozoInheritedLabel`, with their `@hozo/core/generated/*` and `@hozo/primitives/generated/*` entries. Compiled output never referred to them unless the internal option was set. Native Chip's internal `hozoInheritedLabel` and `hozoInheritedText` props are gone too, along with the colour-motion field of the inheritance protocol, which only RFC 006's pressable published.

- [#1996](https://github.com/iray-tno/hozo/pull/1996) [`4f62450`](https://github.com/iray-tno/hozo/commit/4f624503a4fb9f4af6f699f7d2deb55b69a72c36) Thanks [@iray-tno](https://github.com/iray-tno)! - Keep assessed Tailwind order between Native state styles even when a resting utility cannot be ranked, without shipping redundant owner variant ranks for those state maps.

- [#2014](https://github.com/iray-tno/hozo/pull/2014) [`ddd7c73`](https://github.com/iray-tno/hozo/commit/ddd7c73d09768ad8fbcf55c40859729b7271ea1a) Thanks [@iray-tno](https://github.com/iray-tno)! - Keep assessed Native state styles in the captured Tailwind order when an
  unranked resting style is present, without moving styles across unknown state
  writes or Native specificity boundaries.

- [#1996](https://github.com/iray-tno/hozo/pull/1996) [`2d28017`](https://github.com/iray-tno/hozo/commit/2d2801735d14c61193610e74bc6178f15b79d07e) Thanks [@iray-tno](https://github.com/iray-tno)! - Preserve assessed Native state order beside conditional colour-only writers proven independent of those styles.

- [#2014](https://github.com/iray-tno/hozo/pull/2014) [`cabc969`](https://github.com/iray-tno/hozo/commit/cabc9695ae805afa2c690aebcad5657f76f95eac) Thanks [@iray-tno](https://github.com/iray-tno)! - Keep Tailwind's order for assessed RTL/LTR styles when an independent
  resting background would otherwise send the class string through fallback.
  Unknown writes still pin their position.

- [#2014](https://github.com/iray-tno/hozo/pull/2014) [`3f1754a`](https://github.com/iray-tno/hozo/commit/3f1754a523e62dc44ccc3da7294e9510e5203302) Thanks [@iray-tno](https://github.com/iray-tno)! - Keep assessed Tailwind order in the resting part of a Native class string
  even when an unrelated unknown write prevents use of the complete order
  plan. Do not move a style across an unproven boundary.

## 0.4.0

### Minor Changes

- [#1462](https://github.com/iray-tno/hozo/pull/1462) [`add3e7b`](https://github.com/iray-tno/hozo/commit/add3e7b2c5a152c770eabee7d09d723e925958e1) Thanks [@iray-tno](https://github.com/iray-tno)! - `HozoAnimated` and `PresenceContext` move from `@hozo/primitives` to `@hozo/engine` (`@hozo/engine/generated/animated`), so `@hozo/patterns` can run them. `@hozo/primitives/generated/animated` is gone; compiled output imports them through `@hozo/core/generated/animated` as before.

- [#1597](https://github.com/iray-tno/hozo/pull/1597) [`b3df5b7`](https://github.com/iray-tno/hozo/commit/b3df5b73a8ec104fe407d89472e4339411de311d) Thanks [@iray-tno](https://github.com/iray-tno)! - React Native 0.87 is now the lowest supported version (`react-native: >=0.87`), and `@hozo/media`'s Expo peers move to SDK 58 (`expo-video`, `expo-audio` and `expo-asset` `>=58 <59`). Native gradients go under `backgroundImage` again: the `experimental_backgroundImage` spelling existed only for React Native 0.86, which read nothing else.

- [#1462](https://github.com/iray-tno/hozo/pull/1462) [`c9a3b4d`](https://github.com/iray-tno/hozo/commit/c9a3b4d61541024c66165c91a4b7e2a75c9a203c) Thanks [@iray-tno](https://github.com/iray-tno)! - The Native candidate module now emits a `hozoClassTransitions` table for transition utilities (`transition-*`, `duration-*`, `delay-*`, `ease-*`, also under `motion-reduce:` / `motion-safe:`) instead of reporting them as Web-only, and `@hozo/engine` adds `createClassTransitions` to read a runtime class string into a `HozoAnimated` transition spec.

### Patch Changes

- [#1473](https://github.com/iray-tno/hozo/pull/1473) [`fac2f53`](https://github.com/iray-tno/hozo/commit/fac2f53a7636c7373cf22c4d49fcf5a137bb08ec) Thanks [@iray-tno](https://github.com/iray-tno)! - An interrupted `HozoAnimated` transition now starts from where its numbers had got to (opacity, and the position and size keys its spec names), rather than jumping to the previous target first. A panel closed halfway through opening shrinks from its current height.

- [#1348](https://github.com/iray-tno/hozo/pull/1348) [`b59995e`](https://github.com/iray-tno/hozo/commit/b59995e108e4cc9b6d093c2487cebece0d02a707) Thanks [@iray-tno](https://github.com/iray-tno)! - The Native `Menu` sheet clears the home indicator and the Android gesture handle: it adds the bottom inset an app's `<SafeAreaProvider>` reports below its own padding, and nothing in an app without one. `@hozo/engine` gains `useHozoProvidedSafeArea()` for that, which reads zeros instead of throwing when the provider or `react-native-safe-area-context` is missing, and the missing-package warning for a safe-area class now fires when such a class first renders rather than whenever the Native entry loads.

- [#1056](https://github.com/iray-tno/hozo/pull/1056) [`c1ca21a`](https://github.com/iray-tno/hozo/commit/c1ca21afee0e3f4dd92110570f3ff3775b01c4cf) Thanks [@iray-tno](https://github.com/iray-tno)! - On Native, a `style` a caller passes through a component's `{...rest}` no longer replaces the styles compiled from its classes: the two compose, classes first and the caller's style after, as the owner itself composes them. Elements whose spreads cannot carry `style` compile as before.

- [#1155](https://github.com/iray-tno/hozo/pull/1155) [`416d627`](https://github.com/iray-tno/hozo/commit/416d627e8afc6a3f321c95dbe1f74b630d173d7b) Thanks [@iray-tno](https://github.com/iray-tno)! - On the Web, a spread onto a compiled `View`, `Text` or `Image` keeps the props that need the element.
  
  - **`onLayout`** is called on mount and when the layout changes, as it is uncompiled. It is not called again on a re-render.
  - **The responder props** (`onStartShouldSetResponder`, `onResponderGrant`, `onResponderMove`, …) claim and release the pointer on a `View`.
  - **An `Image` whose `src` fails to load falls back to `defaultSource`.**
  
  Before this, these reached the DOM raw and did nothing. The spread's translation now adds a callback ref when the spread carries one of them. `@hozo/engine` exports `createSpreadResponder` for it: the responder without a hook.

## 0.3.0

### Patch Changes

- Interrupted colour transitions read the RGBA string produced by their previous
  blend, preserving the intermediate colour when a new transition starts.

### Minor Changes

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Resolve Native pattern class-name slots through the project's runtime class resolver. Pattern controls now share the primitive interaction engine and deliver hover, focus, focus-visible and pressed facts to their actual owners instead of reporting pressed alone.
  
  Static interaction styles are additionally wired for Chip, ColorPicker swatches, Pagination page controls and CommandPalette pointer-state item slots. Selection slots and nested controls retain their own ownership: a remove button does not inherit its row's focus, and a command item does not borrow the input's focus. Other static state slots and semantic predicates remain subject to their existing diagnostics.
  
  Styled Button receives a pressed look; Checkbox and Switch indicators are real elements on both platforms rather than Native-invisible pseudo-elements. Non-transition Native Pressables and their Text children no longer allocate animation values/listeners. Interaction ownership remains mounted when transitions are added or removed. This removes idle animation work, not every initial-mount cost or every platform delivery difference; measured list mount/update tradeoffs remain tracked separately.

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Compile project-defined Tailwind animations and their keyframes for both backends, including keyframes needed by dynamic class candidates. StyleX conditions inside property values now reach the shared condition model.
  
  Extend Native negated conditions across supported environment, breakpoint, pixel-width, container, prop, sibling and interaction predicates. Link states use the existing interaction owner, descendant focus-visible follows that owner, and independent transform resets and runtime-state transform families compose without losing their other transform entries. Unsupported predicates are still diagnosed, not assumed false.
  
  Respect project radius tokens and built-in radius overrides, discover runtime candidates in quoted class arrays, and preserve separate Native style keys for ternary branches. Caller classes override a component's resting look while explicit state classes retain their precedence. On Web, fallback candidate rules stay below authored Tailwind utilities, and conditional class selection reaches elements that remain components.
  
  Native line-breaking utilities that cannot be represented now warn instead of failing the build. This does not implement Android/CJK line-break controls that React Native does not expose.

### Patch Changes

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Uncompiled View, Text and Image forward refs to their platform hosts. Container measurement preserves the host instead of replacing it, and Web View layout defaults agree between compiled output and fallback components.
  
  An uncompiled Svg now uses its accessibility label as its name, as the compiled path already did. Web controls, including generated Canvas controls and form/pattern actions, show the shared clickable cursor without giving disabled controls an active pointer.

## 0.2.0

- Add the Native `useHozoKeyframes` hook and generated animation ABI for the supported project-keyframe subset.
- Keep the compiled-output engine aligned with 0.2.0 motion/theme lowering. Rebuild output when upgrading rather than mixing compiler and engine versions.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.
