# @hozo/primitives

## 0.4.0

### Patch Changes

- [#1099](https://github.com/iray-tno/hozo/pull/1099) [`d7dd5b9`](https://github.com/iray-tno/hozo/commit/d7dd5b9d91a77c6cf647ba2de6fb321f8e558613) Thanks [@iray-tno](https://github.com/iray-tno)! - A `Button` whose props reach it through a rest spread (`function B({ href, ...rest }) { return <Button {...rest} /> }`) works again on the Web. Since the compiler started deciding such a Button's element at build time, the spread reached the `<button>` or `<a>` raw, so `onPress` never became `onClick` and clicking an `@hozo/ui` Button did nothing. The spread now goes through the same translation as the uncompiled `Button`: `onPress`, `accessibilityLabel`, `accessibilityHint`, `testID`, `nativeID`, `disabled` and `data-*`. On an anchor, a press is still suppressed while disabled.

- [#1148](https://github.com/iray-tno/hozo/pull/1148) [`27536fc`](https://github.com/iray-tno/hozo/commit/27536fc602947b8928df7fa4d8940363fc0e3a67) Thanks [@iray-tno](https://github.com/iray-tno)! - On the Web a `Button` forwards `tabIndex`, so a `Button` in a `Toolbar` takes the roving tab stop the toolbar hands it, and the toolbar is one tab stop. Before this, every item stayed in the tab order. On a link that is disabled, the tab stop is still `-1`.

- [#1142](https://github.com/iray-tno/hozo/pull/1142) [`99892e2`](https://github.com/iray-tno/hozo/commit/99892e25f536991e2966aa60769bd7155d5d8336) Thanks [@iray-tno](https://github.com/iray-tno)! - A `Button` forwards what a wrapper needs to make it a trigger. That means `Tooltip` now opens around a `Button`, including `@hozo/ui`'s, whether it is compiled or not.
  
  - On the Web: `ref`, `onFocus`, `onBlur`, `onKeyDown`, `onPointerEnter`, `onPointerLeave` and `aria-describedby`.
  - On React Native: `ref`, `onFocus`, `onBlur`, `onHoverIn`, `onHoverOut` and `onLongPress`.
  
  Before this, the uncompiled `Button` and the translation of a spread onto a compiled one both dropped these props. Other props it does not name are still not forwarded.

- [#1213](https://github.com/iray-tno/hozo/pull/1213) [`ffd5b6b`](https://github.com/iray-tno/hozo/commit/ffd5b6bbb0021d512d416fc5d8ae7441cc18c463) Thanks [@iray-tno](https://github.com/iray-tno)! - On the Web, a server-rendered `Image` whose `src` has already failed before hydration (`complete && naturalWidth === 0` when the ref attaches) now falls back to `defaultSource`, both directly and through a compiled spread.

- [#1039](https://github.com/iray-tno/hozo/pull/1039) [`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb) Thanks [@iray-tno](https://github.com/iray-tno)! - A Text nested in `@hozo/ui`'s `Checkbox` or `Switch` label now takes their `hover:`, `active:` and `focus-visible:` text classes on Native. `@hozo/patterns`' pressable provides its state through `HozoInteractionContext`, now in `@hozo/behaviors/pressable-interaction` and shared with `@hozo/primitives`, so the `HozoText` a caller's Text compiles to reads it.

- [#1155](https://github.com/iray-tno/hozo/pull/1155) [`416d627`](https://github.com/iray-tno/hozo/commit/416d627e8afc6a3f321c95dbe1f74b630d173d7b) Thanks [@iray-tno](https://github.com/iray-tno)! - On the Web, a spread onto a compiled `View`, `Text` or `Image` keeps the props that need the element.
  
  - **`onLayout`** is called on mount and when the layout changes, as it is uncompiled. It is not called again on a re-render.
  - **The responder props** (`onStartShouldSetResponder`, `onResponderGrant`, `onResponderMove`, …) claim and release the pointer on a `View`.
  - **An `Image` whose `src` fails to load falls back to `defaultSource`.**
  
  Before this, these reached the DOM raw and did nothing. The spread's translation now adds a callback ref when the spread carries one of them. `@hozo/engine` exports `createSpreadResponder` for it: the responder without a hook.

- [#1119](https://github.com/iray-tno/hozo/pull/1119) [`242253d`](https://github.com/iray-tno/hozo/commit/242253da3910698e0838d74cbc9d51e1ca5995d6) Thanks [@iray-tno](https://github.com/iray-tno)! - A `TextInput` whose props reach it through a spread (`function F(props) { return <TextInput {...props} /> }`) works on the Web. The spread reached the `<input>` or `<textarea>` raw, so `onChangeText` was never called and a controlled `@hozo/ui` `Input` could not be typed into. The spread now goes through the same translation as the uncompiled `TextInput`: `onChangeText`, `onSubmitEditing`, `editable`, `keyboardType`, `secureTextEntry`, `returnKeyType`, `autoCorrect`, the `accessibility*` props, `testID` and `nativeID`. A named `onChangeText` that is `undefined` no longer throws when the field is typed into.

- [#1124](https://github.com/iray-tno/hozo/pull/1124) [`e7d97e9`](https://github.com/iray-tno/hozo/commit/e7d97e981615355534d0ea20c4a70410556cbda4) Thanks [@iray-tno](https://github.com/iray-tno)! - A `View`, `Text`, `Image` or document primitive whose props reach it through a spread (`function Box(props) { return <View {...props} /> }`) keeps them on the Web. The spread reached the element raw, so `accessibilityLabel`, `accessibilityHint`, `testID`, `nativeID`, `pointerEvents`, `accessibilityState`, `accessibilityValue` and `accessibilityLiveRegion` became unknown attributes, and the element lost its accessible name. The spread now goes through the same translation as the uncompiled primitive. On an `Image` it also resolves an object or list `src` and uses the accessibility label as `alt`.
- Updated dependencies [[`480e00a`](https://github.com/iray-tno/hozo/commit/480e00a0d6e165b92beb8dbf9310710fcceb7fd1), [`c1ca21a`](https://github.com/iray-tno/hozo/commit/c1ca21afee0e3f4dd92110570f3ff3775b01c4cf), [`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb), [`416d627`](https://github.com/iray-tno/hozo/commit/416d627e8afc6a3f321c95dbe1f74b630d173d7b), [`37a9151`](https://github.com/iray-tno/hozo/commit/37a915152634d8e25dfa9b2958661d4bc8f0a134)]:
  - @hozo/behaviors@0.4.0
  - @hozo/engine@0.4.0

## 0.3.0

### Minor Changes

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Compile project-defined Tailwind animations and their keyframes for both backends, including keyframes needed by dynamic class candidates. StyleX conditions inside property values now reach the shared condition model.
  
  Extend Native negated conditions across supported environment, breakpoint, pixel-width, container, prop, sibling and interaction predicates. Link states use the existing interaction owner, descendant focus-visible follows that owner, and independent transform resets and runtime-state transform families compose without losing their other transform entries. Unsupported predicates are still diagnosed, not assumed false.
  
  Respect project radius tokens and built-in radius overrides, discover runtime candidates in quoted class arrays, and preserve separate Native style keys for ternary branches. Caller classes override a component's resting look while explicit state classes retain their precedence. On Web, fallback candidate rules stay below authored Tailwind utilities, and conditional class selection reaches elements that remain components.
  
  Native line-breaking utilities that cannot be represented now warn instead of failing the build. This does not implement Android/CJK line-break controls that React Native does not expose.

### Patch Changes

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Uncompiled View, Text and Image forward refs to their platform hosts. Container measurement preserves the host instead of replacing it, and Web View layout defaults agree between compiled output and fallback components.
  
  An uncompiled Svg now uses its accessibility label as its name, as the compiled path already did. Web controls, including generated Canvas controls and form/pattern actions, show the shared clickable cursor without giving disabled controls an active pointer.

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Resolve Native pattern class-name slots through the project's runtime class resolver. Pattern controls now share the primitive interaction engine and deliver hover, focus, focus-visible and pressed facts to their actual owners instead of reporting pressed alone.
  
  Static interaction styles are additionally wired for Chip, ColorPicker swatches, Pagination page controls and CommandPalette pointer-state item slots. Selection slots and nested controls retain their own ownership: a remove button does not inherit its row's focus, and a command item does not borrow the input's focus. Other static state slots and semantic predicates remain subject to their existing diagnostics.
  
  Styled Button receives a pressed look; Checkbox and Switch indicators are real elements on both platforms rather than Native-invisible pseudo-elements. Non-transition Native Pressables and their Text children no longer allocate animation values/listeners. Interaction ownership remains mounted when transitions are added or removed. This removes idle animation work, not every initial-mount cost or every platform delivery difference; measured list mount/update tradeoffs remain tracked separately.
- Updated dependencies [[`80f2686`](https://github.com/iray-tno/hozo/commit/80f2686ace0922e27502695d0b88c1dba2e08be0), [`adfe1fd`](https://github.com/iray-tno/hozo/commit/adfe1fd914d60effc27677efdaee6edf19feaf6b), [`496f1b7`](https://github.com/iray-tno/hozo/commit/496f1b75e06bc5f5b079870ce566754e7161c21a), [`ad1ad0b`](https://github.com/iray-tno/hozo/commit/ad1ad0b355c6ecae07372f44a65aed279e539e22), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`70cc763`](https://github.com/iray-tno/hozo/commit/70cc763166d3f3aa04c466c5a12e7a8a4dba0a0f), [`9a33076`](https://github.com/iray-tno/hozo/commit/9a3307689c1a37847d45bea9083cee1f63c7edba), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`030d179`](https://github.com/iray-tno/hozo/commit/030d1791515ef5523560c38c1788e4b23f6bfd92)]:
  - @hozo/behaviors@0.3.0
  - @hozo/engine@0.3.0

## 0.2.0

- Add `Presence` to retain a child through exit animation and expose `data-state="closed"`.
- Use React 19 ref props for Web components without forwardRef casts, repair Pressable ref forwarding and preserve existing author-facing ref usage.
- Integrate the compiled Native entrance/exit/keyframe path while keeping animated Text as a Text host.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/engine@0.2.0
  - @hozo/behaviors@0.2.0
