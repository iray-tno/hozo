# @hozo/primitives

## 0.6.0

### Minor Changes

- [#2312](https://github.com/iray-tno/hozo/pull/2312) [`ffba3d5`](https://github.com/iray-tno/hozo/commit/ffba3d5f258b839d78a704f53d608063f799d913) Thanks [@iray-tno](https://github.com/iray-tno)! - Evaluate parent-relative `%`-mixed `calc()`, `min()`, `max()`, and `clamp()` on React Native when the parent lives in the same component (`w`, `h`, `size`, `min/max-*`, `basis`, `m*`, `p*`, `top/right/bottom/left/inset*`, and `space-x`/`space-y`) via opt-in `HozoMeasuredParent` and `HozoParentSizeQuery`, subtracting resolved border and padding insets with zero wrapper Views and zero runtime cost when unused.

- [#2357](https://github.com/iray-tno/hozo/pull/2357) [`dd5e2b0`](https://github.com/iray-tno/hozo/commit/dd5e2b07654c656ec278c16cf7290e65df06471e) Thanks [@iray-tno](https://github.com/iray-tno)! - Lower conditional `placeholder:text-*`, `placeholder-*`, `selection:bg-*`, and `caret-*` colour variants on React Native `TextInput` across breakpoints, environment queries, props, structural/container/peer guards, and focus states (`HozoTextInput` `hozoFieldColors`).

- [#2325](https://github.com/iray-tno/hozo/pull/2325) [`9aa5245`](https://github.com/iray-tno/hozo/commit/9aa52454f4332e93409bb6c4a9a7f658398cfad6) Thanks [@iray-tno](https://github.com/iray-tno)! - Support `%` and `%`-mixed `calc()` / `min()` / `max()` / `clamp()` grid row tracks on React Native when the grid container has a definite height (`h-*`, `h-screen`, `h-full`, `size-*`, `block-*`) by measuring its content-box height via `HozoMeasuredParent` and passing `containerHeight` into `HozoGrid`, while keeping auto-height `%` row tracks refused with an actionable diagnostic. Also supports plain `%` column tracks (`grid-cols-[30%_70%]`).

- [#2379](https://github.com/iray-tno/hozo/pull/2379) [`9fabdd4`](https://github.com/iray-tno/hozo/commit/9fabdd4c0c2b03e7612d26a5ea41890918dd4450) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `HozoInteractionQuery` and lower `group-hover:`, `group-focus:`, `group-active:`, and `group-focus-visible:` (including stacked variants, `backdrop:`, `placeholder:`/`caret-*`, class slots, and `group-*:*:`) on any descendant inside an interactive `.group` ancestor on React Native (`Pressable`, `Button`, `Link`, `TextInput`, `Dialog`, `Image`, `ScrollView`, animated views, and pattern hosts).

### Patch Changes

- [#2312](https://github.com/iray-tno/hozo/pull/2312) [`bace67a`](https://github.com/iray-tno/hozo/commit/bace67ab73e78d35dce0bf2e0a856f79e807d620) Thanks [@iray-tno](https://github.com/iray-tno)! - Support CSS math expressions (`calc()`, `min()`, `max()`, `clamp()`) for viewport units (`vw`/`vh`/`vmin`/`vmax`), `@container` units (`cqw`/`cqh`/`cqi`/`cqb`/`cqmin`/`cqmax`), and self-measured React Native boxes (`translate*`, `rounded*`, `gap*`, and `HozoGrid` column tracks) via opt-in `onLayout` without wrapper Views.

- [#2332](https://github.com/iray-tno/hozo/pull/2332) [`4d7cd69`](https://github.com/iray-tno/hozo/commit/4d7cd69db6a3cd7aca172c6abfb57aa5272298d9) Thanks [@iray-tno](https://github.com/iray-tno)! - Lower `focus-within:`, `has-[:focus]:`, `has-[:focus-visible]:`, `has-[:hover]:`, `has-[:active]:`, `has-hover:`, `has-focus:`, `has-focus-visible:`, and `has-pressed:` (and their negations) on React Native via zero-host-View opt-in `HozoSubtreeScope` and `HozoSubtreeBoundary`.

- [#2332](https://github.com/iray-tno/hozo/pull/2332) [`09f13ad`](https://github.com/iray-tno/hozo/commit/09f13ad2eddfbd1d76a79533f67057df6cff5569) Thanks [@iray-tno](https://github.com/iray-tno)! - Lower same-component `peer-*` sibling variants (`peer-aria-*`, `peer-disabled`/`peer-enabled`, `peer-data-*`, `peer-rtl`/`peer-ltr`, `peer-first`/`last`/`odd`/`even`/`only`/`nth-*`, `peer-read-only`/`peer-placeholder-shown`, interactive `peer-hover`/`peer-focus`/`peer-focus-visible`/`peer-pressed`, and negated `not-peer-*`/`peer-not-*`) on React Native via zero-host-View opt-in `HozoPeerScope` and `HozoPeerQuery`.

- [#2284](https://github.com/iray-tno/hozo/pull/2284) [`ec0aa3f`](https://github.com/iray-tno/hozo/commit/ec0aa3f460ce508b34d8dfb5429ebe1b0a2c17de) Thanks [@iray-tno](https://github.com/iray-tno)! - Fix React Native `HozoPressable` transitions (`TransitionPressable`) leaving `backgroundColor`, `opacity`, and `transform` stuck at their initial mount values when a prop or theme change (such as toggling `disabled` or switching colour scheme) updates the resolved style without a pointer or focus event.
- Updated dependencies [[`44a8f8c`](https://github.com/iray-tno/hozo/commit/44a8f8c100cf5bcc5eb2ebd46573891eca4264e9)]:
  - @hozo/engine@0.6.0
  - @hozo/behaviors@0.6.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`cf3f4f0`](https://github.com/iray-tno/hozo/commit/cf3f4f0ab1dea633d5709a4a8efd2361de69c7d3), [`e908356`](https://github.com/iray-tno/hozo/commit/e908356bcdacc1810533237abaf9bf061bd1223d)]:
  - @hozo/behaviors@0.5.1
  - @hozo/engine@0.5.1

## 0.5.0

### Minor Changes

- [#2051](https://github.com/iray-tno/hozo/pull/2051) [`9a5c4ac`](https://github.com/iray-tno/hozo/commit/9a5c4ac57fdc996649a323c72b4be55aeb221cd7) Thanks [@iray-tno](https://github.com/iray-tno)! - On Native, text classes on a container now reach a `Text` the compiler cannot see: one rendered by a component from another file, passed in as `children`, or returned by an expression. `<View className="text-red-500 text-lg"><Label /></View>` colours and sizes `Label`'s text, as it does on the Web. Before, React Native's `Text` inherited only from an enclosing `Text`, so the classes stopped at the component boundary and nothing reported it.
  
  Where the compiler can see the `Text`, nothing changes: the classes are still copied onto it. Only what it cannot see is read at run time. An outermost `Text` that does not set all of colour, size, weight, line height, letter spacing, alignment and transform reads the rest from the nearest container. A container whose children include one it cannot see wraps them in a scope that renders no host. See [decision 013](https://github.com/iray-tno/hozo/blob/main/docs/decisions/013-text-inheritance-compiled-where-visible.md).
  
  To keep the previous behaviour, pass `nativeTextInheritance: 'compiled'` to `withHozo`.

- [#2059](https://github.com/iray-tno/hozo/pull/2059) [`cca1211`](https://github.com/iray-tno/hozo/commit/cca1211b176ec411112275399fc582a92a50efbe) Thanks [@iray-tno](https://github.com/iray-tno)! - RFC 006's whole-component Native text inheritance route is removed, now that [decision 013](https://github.com/iray-tno/hozo/blob/main/docs/decisions/013-text-inheritance-compiled-where-visible.md) is the default. The internal `textInheritance` and `textStatic` compile options are gone. So are the generated components that only that route emitted: `HozoInheritedText`, `HozoInheritedView`, `HozoInheritedRelativeText`, `HozoInheritedPressable` and `HozoInheritedLabel`, with their `@hozo/core/generated/*` and `@hozo/primitives/generated/*` entries. Compiled output never referred to them unless the internal option was set. Native Chip's internal `hozoInheritedLabel` and `hozoInheritedText` props are gone too, along with the colour-motion field of the inheritance protocol, which only RFC 006's pressable published.

### Patch Changes

- [#1760](https://github.com/iray-tno/hozo/pull/1760) [`e5c848d`](https://github.com/iray-tno/hozo/commit/e5c848de8f4ff732fc7fc4a2d343e34938df1800) Thanks [@iray-tno](https://github.com/iray-tno)! - `Button` takes `accessibilityState` and `aria-controls`, so a menu or disclosure trigger can say whether what it opens is open and which element that is. On the Web they become `aria-expanded` and its kin and `aria-controls`, compiled or not, named or spread. On React Native `accessibilityState` reaches the Pressable and `aria-controls` is dropped. `accessibilityState.disabled` disables the button as the `disabled` prop does.

- [#1684](https://github.com/iray-tno/hozo/pull/1684) [`6cf46e3`](https://github.com/iray-tno/hozo/commit/6cf46e30640459d327305ffce8b38d26e27b3a9b) Thanks [@iray-tno](https://github.com/iray-tno)! - `Image` declares `width`, `height`, `loading`, `decoding` and `fetchPriority`. The uncompiled Web `Image` now forwards them to the `<img>`, as compiled output already did, so a server-rendered page reserves the image's box and lazy-loads it with or without the compiler ([#1674](https://github.com/iray-tno/hozo/issues/1674)). On React Native, `width` and `height` are React Native's own props, and the three loading hints type-check but are ignored.

- [#2158](https://github.com/iray-tno/hozo/pull/2158) [`b4bc0e3`](https://github.com/iray-tno/hozo/commit/b4bc0e3bec63c02a0d97b55b256714985385372f) Thanks [@iray-tno](https://github.com/iray-tno)! - `group-hover:`, `group-focus:`, `group-focus-visible:` and `group-pressed:` now work on a `View` inside a `Pressable`, `Button` or `Link` on React Native, as they already did on a `Text`. Before, a `group` card could restyle its label but not the box beside it, and the build refused the View with a message saying nothing above it was a Pressable. A `group-*:` the Pressable does not hand down, such as `group-aria-checked:`, is still refused, now with a message that says which state is missing instead of claiming there is no Pressable.
- Updated dependencies [[`cb4b456`](https://github.com/iray-tno/hozo/commit/cb4b4564ddb95d7ecb6f729433bf5c956788b53e), [`ba5beaf`](https://github.com/iray-tno/hozo/commit/ba5beaf2fbaff50a5b6bb1595ee156cae9dd5a1c), [`43d6add`](https://github.com/iray-tno/hozo/commit/43d6add1b83dce0acda189ce9a1b610fb4a9d70d), [`0001fc4`](https://github.com/iray-tno/hozo/commit/0001fc442e38955770974fb5377002e4deb4b95f), [`ed04074`](https://github.com/iray-tno/hozo/commit/ed04074de82890b87590afb537a0bea99b2751a7), [`6cf46e3`](https://github.com/iray-tno/hozo/commit/6cf46e30640459d327305ffce8b38d26e27b3a9b), [`052b447`](https://github.com/iray-tno/hozo/commit/052b447351a669a12c5b8ced61bef5d07dc8a604), [`43680e3`](https://github.com/iray-tno/hozo/commit/43680e3643ba9f3f6e01f5c7aa885feb8e5c7b04), [`35cc5c3`](https://github.com/iray-tno/hozo/commit/35cc5c31ce90497de9a6f345e884af2d20a6bc60), [`5c823ee`](https://github.com/iray-tno/hozo/commit/5c823ee87f1996f7011290af68702ef7f19e5388), [`70643e9`](https://github.com/iray-tno/hozo/commit/70643e959d229a75fcdbd1316f9a972efb4a2622), [`3a3a8d5`](https://github.com/iray-tno/hozo/commit/3a3a8d52d64d0d580d9afaa298977c5c33f295f2), [`45eda5b`](https://github.com/iray-tno/hozo/commit/45eda5b451bdf1449c7c16172c03b2a9e743aaa6), [`cca1211`](https://github.com/iray-tno/hozo/commit/cca1211b176ec411112275399fc582a92a50efbe), [`4f62450`](https://github.com/iray-tno/hozo/commit/4f624503a4fb9f4af6f699f7d2deb55b69a72c36), [`ddd7c73`](https://github.com/iray-tno/hozo/commit/ddd7c73d09768ad8fbcf55c40859729b7271ea1a), [`2d28017`](https://github.com/iray-tno/hozo/commit/2d2801735d14c61193610e74bc6178f15b79d07e), [`cabc969`](https://github.com/iray-tno/hozo/commit/cabc9695ae805afa2c690aebcad5657f76f95eac), [`3f1754a`](https://github.com/iray-tno/hozo/commit/3f1754a523e62dc44ccc3da7294e9510e5203302), [`b3cf38b`](https://github.com/iray-tno/hozo/commit/b3cf38b30f2fe748c4f73110d01de2566826355a)]:
  - @hozo/engine@0.5.0
  - @hozo/behaviors@0.5.0

## 0.4.0

### Minor Changes

- [#1462](https://github.com/iray-tno/hozo/pull/1462) [`b0c6f22`](https://github.com/iray-tno/hozo/commit/b0c6f220c74d8a5c5a0c13bcf5fc9f8b97a25419) Thanks [@iray-tno](https://github.com/iray-tno)! - `HozoAnimated` can animate position and size (`start`, `end`, `top`, `left`, `width`, `height` and the rest) between numbers, when its transition spec names them in the new `properties` list (`inset-inline-start`, `width`, `all`, ...). Without `properties` nothing new animates.

- [#1462](https://github.com/iray-tno/hozo/pull/1462) [`add3e7b`](https://github.com/iray-tno/hozo/commit/add3e7b2c5a152c770eabee7d09d723e925958e1) Thanks [@iray-tno](https://github.com/iray-tno)! - `HozoAnimated` and `PresenceContext` move from `@hozo/primitives` to `@hozo/engine` (`@hozo/engine/generated/animated`), so `@hozo/patterns` can run them. `@hozo/primitives/generated/animated` is gone; compiled output imports them through `@hozo/core/generated/animated` as before.

- [#1597](https://github.com/iray-tno/hozo/pull/1597) [`b3df5b7`](https://github.com/iray-tno/hozo/commit/b3df5b73a8ec104fe407d89472e4339411de311d) Thanks [@iray-tno](https://github.com/iray-tno)! - React Native 0.87 is now the lowest supported version (`react-native: >=0.87`), and `@hozo/media`'s Expo peers move to SDK 58 (`expo-video`, `expo-audio` and `expo-asset` `>=58 <59`). Native gradients go under `backgroundImage` again: the `experimental_backgroundImage` spelling existed only for React Native 0.86, which read nothing else.

### Patch Changes

- [#1099](https://github.com/iray-tno/hozo/pull/1099) [`d7dd5b9`](https://github.com/iray-tno/hozo/commit/d7dd5b9d91a77c6cf647ba2de6fb321f8e558613) Thanks [@iray-tno](https://github.com/iray-tno)! - A `Button` whose props reach it through a rest spread (`function B({ href, ...rest }) { return <Button {...rest} /> }`) works again on the Web. Since the compiler started deciding such a Button's element at build time, the spread reached the `<button>` or `<a>` raw, so `onPress` never became `onClick` and clicking an `@hozo/ui` Button did nothing. The spread now goes through the same translation as the uncompiled `Button`: `onPress`, `accessibilityLabel`, `accessibilityHint`, `testID`, `nativeID`, `disabled` and `data-*`. On an anchor, a press is still suppressed while disabled.

- [#1148](https://github.com/iray-tno/hozo/pull/1148) [`27536fc`](https://github.com/iray-tno/hozo/commit/27536fc602947b8928df7fa4d8940363fc0e3a67) Thanks [@iray-tno](https://github.com/iray-tno)! - On the Web a `Button` forwards `tabIndex`, so a `Button` in a `Toolbar` takes the roving tab stop the toolbar hands it, and the toolbar is one tab stop. Before this, every item stayed in the tab order. On a link that is disabled, the tab stop is still `-1`.

- [#1142](https://github.com/iray-tno/hozo/pull/1142) [`99892e2`](https://github.com/iray-tno/hozo/commit/99892e25f536991e2966aa60769bd7155d5d8336) Thanks [@iray-tno](https://github.com/iray-tno)! - A `Button` forwards what a wrapper needs to make it a trigger. That means `Tooltip` now opens around a `Button`, including `@hozo/ui`'s, whether it is compiled or not.
  
  - On the Web: `ref`, `onFocus`, `onBlur`, `onKeyDown`, `onPointerEnter`, `onPointerLeave` and `aria-describedby`.
  - On React Native: `ref`, `onFocus`, `onBlur`, `onHoverIn`, `onHoverOut` and `onLongPress`.
  
  Before this, the uncompiled `Button` and the translation of a spread onto a compiled one both dropped these props. Other props it does not name are still not forwarded.

- [#1384](https://github.com/iray-tno/hozo/pull/1384) [`1b54676`](https://github.com/iray-tno/hozo/commit/1b54676fbc476f848d2e834a9443fde0bf888ce9) Thanks [@iray-tno](https://github.com/iray-tno)! - A windowed `CodeBlock` now windows on the Web too: only the lines near the visible ones are mounted, the rest are held as space, and an unwrapped block keeps its scrolling width with a hidden copy of the widest line. The lines stay one `<pre><code>`.

- [#1213](https://github.com/iray-tno/hozo/pull/1213) [`ffd5b6b`](https://github.com/iray-tno/hozo/commit/ffd5b6bbb0021d512d416fc5d8ae7441cc18c463) Thanks [@iray-tno](https://github.com/iray-tno)! - On the Web, a server-rendered `Image` whose `src` has already failed before hydration (`complete && naturalWidth === 0` when the ref attaches) now falls back to `defaultSource`, both directly and through a compiled spread.

- [#1039](https://github.com/iray-tno/hozo/pull/1039) [`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb) Thanks [@iray-tno](https://github.com/iray-tno)! - A Text nested in `@hozo/ui`'s `Checkbox` or `Switch` label now takes their `hover:`, `active:` and `focus-visible:` text classes on Native. `@hozo/patterns`' pressable provides its state through `HozoInteractionContext`, now in `@hozo/behaviors/pressable-interaction` and shared with `@hozo/primitives`, so the `HozoText` a caller's Text compiles to reads it.

- [#1155](https://github.com/iray-tno/hozo/pull/1155) [`416d627`](https://github.com/iray-tno/hozo/commit/416d627e8afc6a3f321c95dbe1f74b630d173d7b) Thanks [@iray-tno](https://github.com/iray-tno)! - On the Web, a spread onto a compiled `View`, `Text` or `Image` keeps the props that need the element.
  
  - **`onLayout`** is called on mount and when the layout changes, as it is uncompiled. It is not called again on a re-render.
  - **The responder props** (`onStartShouldSetResponder`, `onResponderGrant`, `onResponderMove`, …) claim and release the pointer on a `View`.
  - **An `Image` whose `src` fails to load falls back to `defaultSource`.**
  
  Before this, these reached the DOM raw and did nothing. The spread's translation now adds a callback ref when the spread carries one of them. `@hozo/engine` exports `createSpreadResponder` for it: the responder without a hook.

- [#1119](https://github.com/iray-tno/hozo/pull/1119) [`242253d`](https://github.com/iray-tno/hozo/commit/242253da3910698e0838d74cbc9d51e1ca5995d6) Thanks [@iray-tno](https://github.com/iray-tno)! - A `TextInput` whose props reach it through a spread (`function F(props) { return <TextInput {...props} /> }`) works on the Web. The spread reached the `<input>` or `<textarea>` raw, so `onChangeText` was never called and a controlled `@hozo/ui` `Input` could not be typed into. The spread now goes through the same translation as the uncompiled `TextInput`: `onChangeText`, `onSubmitEditing`, `editable`, `keyboardType`, `secureTextEntry`, `returnKeyType`, `autoCorrect`, the `accessibility*` props, `testID` and `nativeID`. A named `onChangeText` that is `undefined` no longer throws when the field is typed into.

- [#1124](https://github.com/iray-tno/hozo/pull/1124) [`e7d97e9`](https://github.com/iray-tno/hozo/commit/e7d97e981615355534d0ea20c4a70410556cbda4) Thanks [@iray-tno](https://github.com/iray-tno)! - A `View`, `Text`, `Image` or document primitive whose props reach it through a spread (`function Box(props) { return <View {...props} /> }`) keeps them on the Web. The spread reached the element raw, so `accessibilityLabel`, `accessibilityHint`, `testID`, `nativeID`, `pointerEvents`, `accessibilityState`, `accessibilityValue` and `accessibilityLiveRegion` became unknown attributes, and the element lost its accessible name. The spread now goes through the same translation as the uncompiled primitive. On an `Image` it also resolves an object or list `src` and uses the accessibility label as `alt`.
- Updated dependencies [[`4270a72`](https://github.com/iray-tno/hozo/commit/4270a727b14605d7ff5c9831238e60cb518e3ed6), [`1c052da`](https://github.com/iray-tno/hozo/commit/1c052dad66426e8a4acd462c776f161249330c35), [`480e00a`](https://github.com/iray-tno/hozo/commit/480e00a0d6e165b92beb8dbf9310710fcceb7fd1), [`fac2f53`](https://github.com/iray-tno/hozo/commit/fac2f53a7636c7373cf22c4d49fcf5a137bb08ec), [`add3e7b`](https://github.com/iray-tno/hozo/commit/add3e7b2c5a152c770eabee7d09d723e925958e1), [`e4734c8`](https://github.com/iray-tno/hozo/commit/e4734c832c6469edc4ba88a7e09209b2b2ccd29b), [`b59995e`](https://github.com/iray-tno/hozo/commit/b59995e108e4cc9b6d093c2487cebece0d02a707), [`d5a1a1e`](https://github.com/iray-tno/hozo/commit/d5a1a1ee6a55dd50c6c2f91289a11a8665dd9d74), [`c1ca21a`](https://github.com/iray-tno/hozo/commit/c1ca21afee0e3f4dd92110570f3ff3775b01c4cf), [`5cbbb5d`](https://github.com/iray-tno/hozo/commit/5cbbb5de2ba68dd8e44c1939535a84f5325bb950), [`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb), [`c4696a4`](https://github.com/iray-tno/hozo/commit/c4696a4660ceb546fc9e29bc18d1fe73979681e5), [`b3df5b7`](https://github.com/iray-tno/hozo/commit/b3df5b73a8ec104fe407d89472e4339411de311d), [`c9a3b4d`](https://github.com/iray-tno/hozo/commit/c9a3b4d61541024c66165c91a4b7e2a75c9a203c), [`416d627`](https://github.com/iray-tno/hozo/commit/416d627e8afc6a3f321c95dbe1f74b630d173d7b), [`37a9151`](https://github.com/iray-tno/hozo/commit/37a915152634d8e25dfa9b2958661d4bc8f0a134)]:
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
