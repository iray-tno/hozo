# @hozo/primitives

## 0.3.1

### Patch Changes

- [#1039](https://github.com/iray-tno/hozo/pull/1039) [`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb) Thanks [@iray-tno](https://github.com/iray-tno)! - A Text nested in `@hozo/ui`'s `Checkbox` or `Switch` label now takes their `hover:`, `active:` and `focus-visible:` text classes on Native. `@hozo/patterns`' pressable provides its state through `HozoInteractionContext`, now in `@hozo/behaviors/pressable-interaction` and shared with `@hozo/primitives`, so the `HozoText` a caller's Text compiles to reads it.
- Updated dependencies [[`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb)]:
  - @hozo/behaviors@0.3.1
  - @hozo/engine@0.3.1

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
