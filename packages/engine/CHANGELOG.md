# @hozo/engine

## 0.4.0

### Minor Changes

- [#1462](https://github.com/iray-tno/hozo/pull/1462) [`add3e7b`](https://github.com/iray-tno/hozo/commit/add3e7b2c5a152c770eabee7d09d723e925958e1) Thanks [@iray-tno](https://github.com/iray-tno)! - `HozoAnimated` and `PresenceContext` move from `@hozo/primitives` to `@hozo/engine` (`@hozo/engine/generated/animated`), so `@hozo/patterns` can run them. `@hozo/primitives/generated/animated` is gone; compiled output imports them through `@hozo/core/generated/animated` as before.

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
