# @hozo/compiler

## 0.4.0

### Minor Changes

- [#1462](https://github.com/iray-tno/hozo/pull/1462) [`c9a3b4d`](https://github.com/iray-tno/hozo/commit/c9a3b4d61541024c66165c91a4b7e2a75c9a203c) Thanks [@iray-tno](https://github.com/iray-tno)! - The Native candidate module now emits a `hozoClassTransitions` table for transition utilities (`transition-*`, `duration-*`, `delay-*`, `ease-*`, also under `motion-reduce:` / `motion-safe:`) instead of reporting them as Web-only, and `@hozo/engine` adds `createClassTransitions` to read a runtime class string into a `HozoAnimated` transition spec.

### Patch Changes

- [#1055](https://github.com/iray-tno/hozo/pull/1055) [`08dd756`](https://github.com/iray-tno/hozo/commit/08dd756fb0ec9cead28d3f7243412bdd6194525b) Thanks [@iray-tno](https://github.com/iray-tno)! - `hozo-migration-audit --fix` prints, as a diff, the `react-native` imports the Web build moves to `@hozo/rn-compat`, written into source; `--write` applies them. `@hozo/compiler/analysis` exports the pass it uses, `reactNativeImportFix`.

- [#1099](https://github.com/iray-tno/hozo/pull/1099) [`d7dd5b9`](https://github.com/iray-tno/hozo/commit/d7dd5b9d91a77c6cf647ba2de6fb321f8e558613) Thanks [@iray-tno](https://github.com/iray-tno)! - A `Button` whose props reach it through a rest spread (`function B({ href, ...rest }) { return <Button {...rest} /> }`) works again on the Web. Since the compiler started deciding such a Button's element at build time, the spread reached the `<button>` or `<a>` raw, so `onPress` never became `onClick` and clicking an `@hozo/ui` Button did nothing. The spread now goes through the same translation as the uncompiled `Button`: `onPress`, `accessibilityLabel`, `accessibilityHint`, `testID`, `nativeID`, `disabled` and `data-*`. On an anchor, a press is still suppressed while disabled.

- [#1136](https://github.com/iray-tno/hozo/pull/1136) [`3e5d88d`](https://github.com/iray-tno/hozo/commit/3e5d88d106e8292c4a01762f445fd97402fce83b) Thanks [@iray-tno](https://github.com/iray-tno)! - A `before:` or `after:` class that reaches the page only through the candidate stylesheet now draws its pseudo-element. The rule writes `content: var(--hozo-content)`, and the `@property` that gives it an initial value of `""` was emitted only beside a lowered file that used one. A class list passed to a plain element at runtime, such as a `BottomSheet`'s grabber, had no such file, so the bar was never drawn.

- [#1059](https://github.com/iray-tno/hozo/pull/1059) [`cad9081`](https://github.com/iray-tno/hozo/commit/cad908183b81180e2fd8bb7ef31a1bb2f12f8e95) Thanks [@iray-tno](https://github.com/iray-tno)! - A `<Listbox>` with no `accessibilityLabel` (and no spread that might carry one) now raises `A11Y_MISSING_ACCESSIBLE_NAME`, as `OtpInput` and `ColorPicker` do: on both platforms its options were announced under no name.

- [#1037](https://github.com/iray-tno/hozo/pull/1037) [`6b0c271`](https://github.com/iray-tno/hozo/commit/6b0c271b754c3ba96bf7efe8f241f8784a3e4081) Thanks [@iray-tno](https://github.com/iray-tno)! - A Text nested in `@hozo/ui`'s `Checkbox` or `Switch` now gets its label text styles on Native, as one in `Button` and `Alert` already did. The manifest extractor reads `@hozo/patterns`' Checkbox and Switch as hosts, and takes a `disabled` left in the rest spread as the caller's, so `disabled:` text follows the caller's own `disabled`.

- [#1038](https://github.com/iray-tno/hozo/pull/1038) [`f56c33a`](https://github.com/iray-tno/hozo/commit/f56c33a14738c3f71b2dd0690fad5fb6ef817133) Thanks [@iray-tno](https://github.com/iray-tno)! - A package component whose host is a pressable primitive now hands its `hover:`, `active:` and `focus-visible:` text classes to a Text the caller nests, on Native: the manifest records `hostStates`, and the caller's Text reads the host's state through `HozoText`.

- [#1043](https://github.com/iray-tno/hozo/pull/1043) [`dec0ba9`](https://github.com/iray-tno/hozo/commit/dec0ba98522749a6c5013f4148c58395a8e5a7f4) Thanks [@iray-tno](https://github.com/iray-tno)! - A package component that picks its classes from an object map (`tones[tone]`) now gets a text-forwarding manifest entry, so a Text its caller nests takes the classes it hands down.

- [#1026](https://github.com/iray-tno/hozo/pull/1026) [`771b369`](https://github.com/iray-tno/hozo/commit/771b369bd74c6ca67717c67d36bfee3de8ea1654) Thanks [@iray-tno](https://github.com/iray-tno)! - Warn (`A11Y_NAME_NOT_FORWARDED`) when a `Modal` is given an accessible name. Neither React Native nor the Web runtime passes it on, so it was never announced; use a `Dialog`, or name a `View` inside the modal.

- [#1151](https://github.com/iray-tno/hozo/pull/1151) [`f3da373`](https://github.com/iray-tno/hozo/commit/f3da3738010f3a0f09e1449d8985905993201980) Thanks [@iray-tno](https://github.com/iray-tno)! - On the Web, a prop written after a spread wins over the spread, as it does in JSX and on React Native. In `<View {...props} testID="t">`, the compiled element is now `data-testid="t"`, even when `props` holds a `testID`.
  
  The compiler emits the props it models before the spread. Since spreads are translated (`accessibilityLabel` becoming `aria-label`, and so on), a key inside the spread overrode the author's later value. Now the keys written after a spread are taken out of it. This applies to translated spreads and to spreads kept on a component such as `HozoView`. A spread with nothing written after it is unchanged.

- [#1220](https://github.com/iray-tno/hozo/pull/1220) [`4186a98`](https://github.com/iray-tno/hozo/commit/4186a98cfaaec9e23537bf2cc55f391e6b897368) Thanks [@iray-tno](https://github.com/iray-tno)! - Metro now warns, at the prop, about a class React Native cannot draw when the class sits somewhere the build would otherwise say nothing about it. The warning code is `CLASS_NOT_DRAWN_ON_NATIVE`. It fires in two places:
  
  - a class prop handed to a pattern, such as `handleClassName="before:block"` on a `BottomSheet`;
  - a class list on a lowered element that the compiler could not take apart, so it was resolved on device.
  
  Only classes Native cannot draw at all are reported. A cursor or a transition is not, and a dependency's files under `node_modules` are not.
  
  `compileNativeModule` returns these warnings in a new module-level `diagnostics` field.

- [#1318](https://github.com/iray-tno/hozo/pull/1318) [`e4965d5`](https://github.com/iray-tno/hozo/commit/e4965d5cfb6e21d1dd41b3bdda3cdb0d09c27cd3) Thanks [@iray-tno](https://github.com/iray-tno)! - `CLASS_NOT_DRAWN_ON_NATIVE` and `nativeClassReport` no longer report a class the Native backend draws where it is written, such as `max-h-[85vh]` (a runtime viewport size) or `backdrop:bg-*` (the scrim) on a `Dialog`. The class-level verdict answers for a class resolved on device, where neither works; a class the compiler lowered statically is now checked by lowering it. `nativeClassesDrawnStatically(source)` lists the classes left out.

- [#1168](https://github.com/iray-tno/hozo/pull/1168) [`60a76ad`](https://github.com/iray-tno/hozo/commit/60a76ad8affe8df7488cff17a85c4836e6c56736) Thanks [@iray-tno](https://github.com/iray-tno)! - `nativeClassReport(source)` lists the classes in a module's `className` and `*ClassName` props that React Native cannot draw, each with a reason. That includes class lists handed to a pattern such as `BottomSheet`, which the compiler does not lower and so never examined.
  
  `nativeClassVerdicts(classNames)` gives the same verdict for loose class names.
  
  - A verdict of `missing` is something the Web draws and Native does not: a pseudo-element, a scrim, a selector, a fixed position.
  - A verdict of `cosmetic` is a cursor shape or a CSS transition.
  - Classes that depend on state a component's Native half may supply (`hover:`, `aria-*:`, `data-*:`) are not reported.
  
  These are not yet build warnings.

- [#1316](https://github.com/iray-tno/hozo/pull/1316) [`549e29e`](https://github.com/iray-tno/hozo/commit/549e29e29ec3bcec55262c092bf3dd4a9adcbc1f) Thanks [@iray-tno](https://github.com/iray-tno)! - On React Native, every `backdrop:` class on a `Dialog` reaches its scrim. Only `backdrop:bg-*` did; another, such as `backdrop:px-4`, stayed on the panel, was reported as not wired, and wrote a style entry under the scrim's key, which overwrote the scrim's own.

- [#1320](https://github.com/iray-tno/hozo/pull/1320) [`4b50482`](https://github.com/iray-tno/hozo/commit/4b50482e7ce1085970cda578e17fe4deeffa7234) Thanks [@iray-tno](https://github.com/iray-tno)! - `backdrop:backdrop-blur-*` on a `Dialog` compiles for React Native and blurs behind the panel through the app's backdrop-filter adapter (`configureHozoBackdropFilter`). With no adapter the blur is left out and the scrim keeps its colour. `@hozo/ui`'s Dialog now blurs the page a little (`backdrop-blur-xs`) on both platforms.

- [#1271](https://github.com/iray-tno/hozo/pull/1271) [`905c572`](https://github.com/iray-tno/hozo/commit/905c57243c8d23548a5a2ae518e908643ccafe56) Thanks [@iray-tno](https://github.com/iray-tno)! - Native gradients (`bg-linear-*`, `bg-radial-*`, `bg-none` and StyleX `backgroundImage`) are written as `experimental_backgroundImage`. React Native 0.86 has no unprefixed `backgroundImage` and dropped them without a warning; 0.87 reads both.

- [#1061](https://github.com/iray-tno/hozo/pull/1061) [`9d242c4`](https://github.com/iray-tno/hozo/commit/9d242c474776e81a505b45ef14b80840df51f20f) Thanks [@iray-tno](https://github.com/iray-tno)! - On Native, when a prop between two spreads is written in a form Hozo does not take apart (an entity in a string, an element as the value), the element now raises `UNSAFE_PROP_SPREAD_AFTER_STYLE` at that prop. Its compiled `style` could not be composed with the spreads there, so a `style` they carry replaces it; this used to happen silently.

- [#1056](https://github.com/iray-tno/hozo/pull/1056) [`c1ca21a`](https://github.com/iray-tno/hozo/commit/c1ca21afee0e3f4dd92110570f3ff3775b01c4cf) Thanks [@iray-tno](https://github.com/iray-tno)! - On Native, a `style` a caller passes through a component's `{...rest}` no longer replaces the styles compiled from its classes: the two compose, classes first and the caller's style after, as the owner itself composes them. Elements whose spreads cannot carry `style` compile as before.

- [#1300](https://github.com/iray-tno/hozo/pull/1300) [`adcbaf3`](https://github.com/iray-tno/hozo/commit/adcbaf331ad5fa911dafcaf57f2ea5708b3ab482) Thanks [@iray-tno](https://github.com/iray-tno)! - On Android, a rounded `border-dashed` or `border-dotted` box is drawn dashed or dotted. A border width on all four sides now also sets React Native's `borderWidth`, which Android needs before it draws a rounded border with dashes; with four side widths alone it filled each side solid. The side widths are still written, so which class overrides which is unchanged.

- [#1319](https://github.com/iray-tno/hozo/pull/1319) [`93a606c`](https://github.com/iray-tno/hozo/commit/93a606c73bb13cf4d8fb909e173744c3df71d056) Thanks [@iray-tno](https://github.com/iray-tno)! - On React Native, a `calc()` of viewport and fixed lengths, such as `w-[calc(100vw-2rem)]`, is drawn as a runtime size from the window, as `w-[50vw]` already was. A `calc()` with a percentage or anything else still reports that Native cannot draw it. `@hozo/ui`'s `Dialog` uses it to keep a 1rem gutter on a phone on both platforms, where it ran edge to edge.

- [#1184](https://github.com/iray-tno/hozo/pull/1184) [`b0e68ac`](https://github.com/iray-tno/hozo/commit/b0e68ac2b9afbe7ef3fbece6838392f7bfb82125) Thanks [@iray-tno](https://github.com/iray-tno)! - On React Native, a primitive with a class that needs a hook (`dark:`, a breakpoint, a dark-paired token) inside a class component's `render` is refused at build time, with a message that says so.
  
  Before this, the compiler hoisted `useHozoDark()` to the top of `render()`, as it does in a function component. In a class that is an invalid hook call, so it threw on every render, on the device. A function component written inside the class still gets its hook.

- [#1028](https://github.com/iray-tno/hozo/pull/1028) [`e88bc55`](https://github.com/iray-tno/hozo/commit/e88bc55c736558b296ac69bef8eb57a50a69c635) Thanks [@iray-tno](https://github.com/iray-tno)! - Warn (`A11Y_MISSING_ACCESSIBLE_NAME`) when an `OtpInput` or a `ColorPicker` has no accessible name. Neither has a default name to fall back on, and a build that strips types without checking them never reported the missing `accessibilityLabel`.

- [#1039](https://github.com/iray-tno/hozo/pull/1039) [`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb) Thanks [@iray-tno](https://github.com/iray-tno)! - A Text nested in `@hozo/ui`'s `Checkbox` or `Switch` label now takes their `hover:`, `active:` and `focus-visible:` text classes on Native. `@hozo/patterns`' pressable provides its state through `HozoInteractionContext`, now in `@hozo/behaviors/pressable-interaction` and shared with `@hozo/primitives`, so the `HozoText` a caller's Text compiles to reads it.

- [#1009](https://github.com/iray-tno/hozo/pull/1009) [`e7b4592`](https://github.com/iray-tno/hozo/commit/e7b4592a8f9ea6e6a556e860a9202876c62d73c8) Thanks [@iray-tno](https://github.com/iray-tno)! - A `ScrollView` given React Native's `refreshControl={<RefreshControl … />}` now pulls to refresh on the Web. It compiled to a plain `div` that took the control as an unknown attribute, so the indicator never appeared and a pull did nothing.

- [#1433](https://github.com/iray-tno/hozo/pull/1433) [`dd08c90`](https://github.com/iray-tno/hozo/commit/dd08c90fc9b3fd8208102775e42ddab710ac4f15) Thanks [@iray-tno](https://github.com/iray-tno)! - An `Svg.*` element inside an expression, such as `{rows.map(() => <Svg.Text className="…" />)}` or a conditional, inside another element now compiles in place. It used to reach the page with its classes uncompiled and no diagnostic.

- [#1478](https://github.com/iray-tno/hozo/pull/1478) [`5d2da52`](https://github.com/iray-tno/hozo/commit/5d2da52d31e3b7eaa265b1685548413a4d401990) Thanks [@iray-tno](https://github.com/iray-tno)! - Tailwind v4's variable shorthand now reaches the candidate stylesheet from a class string: `h-(--panel)`, `md:w-(--x)`, and the hinted `bg-(color:--brand)` and `text-(length:--size)`. The scanner used to cut the class at its `(`, so it emitted nothing and said nothing. A `length` hint on `text-` is also read now: `text-[length:var(--s)]` was a colour, and is a font size.

- [#1119](https://github.com/iray-tno/hozo/pull/1119) [`242253d`](https://github.com/iray-tno/hozo/commit/242253da3910698e0838d74cbc9d51e1ca5995d6) Thanks [@iray-tno](https://github.com/iray-tno)! - A `TextInput` whose props reach it through a spread (`function F(props) { return <TextInput {...props} /> }`) works on the Web. The spread reached the `<input>` or `<textarea>` raw, so `onChangeText` was never called and a controlled `@hozo/ui` `Input` could not be typed into. The spread now goes through the same translation as the uncompiled `TextInput`: `onChangeText`, `onSubmitEditing`, `editable`, `keyboardType`, `secureTextEntry`, `returnKeyType`, `autoCorrect`, the `accessibility*` props, `testID` and `nativeID`. A named `onChangeText` that is `undefined` no longer throws when the field is typed into.

- [#1124](https://github.com/iray-tno/hozo/pull/1124) [`e7d97e9`](https://github.com/iray-tno/hozo/commit/e7d97e981615355534d0ea20c4a70410556cbda4) Thanks [@iray-tno](https://github.com/iray-tno)! - A `View`, `Text`, `Image` or document primitive whose props reach it through a spread (`function Box(props) { return <View {...props} /> }`) keeps them on the Web. The spread reached the element raw, so `accessibilityLabel`, `accessibilityHint`, `testID`, `nativeID`, `pointerEvents`, `accessibilityState`, `accessibilityValue` and `accessibilityLiveRegion` became unknown attributes, and the element lost its accessible name. The spread now goes through the same translation as the uncompiled primitive. On an `Image` it also resolves an object or list `src` and uses the accessibility label as `alt`.

## 0.3.0

### Minor Changes

- [`80f2686`](https://github.com/iray-tno/hozo/commit/80f2686ace0922e27502695d0b88c1dba2e08be0) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Avatar`: a person's picture, or their initials when it is absent or fails to load, read as one image named for the person, with an optional status read after the name ("Ada Lovelace, online"). The headless version lives in `@hozo/patterns`, and the look (three sizes and a status dot) in `@hozo/ui`. Its class lists compile on both platforms, as `Chip`'s do. `@hozo/core` now also exports `Chip`, which it previously reached only through compiled output.

- [#818](https://github.com/iray-tno/hozo/pull/818) [`adfe1fd`](https://github.com/iray-tno/hozo/commit/adfe1fd914d60effc27677efdaee6edf19feaf6b) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `ColorPicker`. It offers:
  - preset swatches as a radio group;
  - hue, saturation and lightness (and opacity, with `alpha`) as ordinary sliders rather than a two-dimensional square, which a keyboard and a screen reader can reach but not operate;
  - a hex field;
  - on the Web, an optional eyedropper where the browser has one.
  
  Every colour is read named and numbered, for example "dark blue, #1e3a8a", and the names go through the i18n connection. `Slider` on the Web now also takes a track `style`.

- [#817](https://github.com/iray-tno/hozo/pull/817) [`496f1b7`](https://github.com/iray-tno/hozo/commit/496f1b75e06bc5f5b079870ce566754e7161c21a) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `CommandPalette` and `useCommandShortcut`.
  
  **`CommandPalette`** is a searchable list of commands in a modal.
  - On the Web it is a dialog holding a combobox and a grouped listbox. The arrow keys move through the matching commands while focus stays in the field (`aria-activedescendant`), Enter runs one, and Escape closes it and returns focus.
  - On React Native it is a full-screen modal with a button per command.
  - On both platforms, matches are ranked (starts with, then a word that starts with, then contains, then the letters in order), and the number of matches is announced as the query narrows them.
  - The headless version lives in `@hozo/patterns` and the look in `@hozo/ui`.
  
  **`useCommandShortcut`** (`@hozo/behaviors`) calls a function for ⌘K on a Mac and Ctrl+K elsewhere. It does nothing on React Native.

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Resolve Native pattern class-name slots through the project's runtime class resolver. Pattern controls now share the primitive interaction engine and deliver hover, focus, focus-visible and pressed facts to their actual owners instead of reporting pressed alone.
  
  Static interaction styles are additionally wired for Chip, ColorPicker swatches, Pagination page controls and CommandPalette pointer-state item slots. Selection slots and nested controls retain their own ownership: a remove button does not inherit its row's focus, and a command item does not borrow the input's focus. Other static state slots and semantic predicates remain subject to their existing diagnostics.
  
  Styled Button receives a pressed look; Checkbox and Switch indicators are real elements on both platforms rather than Native-invisible pseudo-elements. Non-transition Native Pressables and their Text children no longer allocate animation values/listeners. Interaction ownership remains mounted when transitions are added or removed. This removes idle animation work, not every initial-mount cost or every platform delivery difference; measured list mount/update tradeoffs remain tracked separately.

- [#809](https://github.com/iray-tno/hozo/pull/809) [`70cc763`](https://github.com/iray-tno/hozo/commit/70cc763166d3f3aa04c466c5a12e7a8a4dba0a0f) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `OtpInput`, for a one-time code or a PIN. It is one real input drawn as cells, so a screen reader finds one field ("Verification code, 6 characters"), and a pasted or autofilled code lands at once. It asks each platform for a one-time code: `autocomplete="one-time-code"` on the Web, `textContentType="oneTimeCode"` on iOS and `autoComplete="sms-otp"` on Android. `mask` turns it into a PIN. The active and filled cells are styled by class lists the pattern applies, so the look reaches React Native as well.

- [#797](https://github.com/iray-tno/hozo/pull/797) [`9a33076`](https://github.com/iray-tno/hozo/commit/9a3307689c1a37847d45bea9083cee1f63c7edba) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Pagination`: numbered pages with previous and next, inside a `<nav>` named "Pagination". The current page is marked with `aria-current="page"` (`selected` on Native), and the ends are disabled in place rather than removed. With `getPageHref` every page is a link, which on Native goes through the installed router. The current page and the disabled ends are styled by class lists the pattern applies (`currentItemClassName`, `disabledItemClassName`), so the same look reaches React Native, where there are no selectors.

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Preformatted` for content whose whitespace is meaningful: a real `<pre>` on Web and monospace Text preserving line breaks on Native. Put `Code` inside it for a code sample; the block and the inline code keep their separate semantics.

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Add the compiler-owned `@hozo/compiler/analysis` entry and project-aware migration analysis. The audit records canonical lowering diagnostics, authored locations or explicit unmapped locations, source/binding provenance, React Native import/tag/reference/value rewrite journals, project facts and stage timings rather than reconstructing compiler decisions from output alone.
  
  The CLI discovers nonempty `src/` and `app/` layouts, falls back to the checkout root, accepts repeated source/include/exclude selections and inventories JS/TS separately from imported context modules. Interactive stdout is Markdown; piped stdout remains JSON, with explicit format/output overrides. Bluesky-specific ALF checks remain in the corpus measurement path, not the generic report.
  
  Static theme, preflight assumptions, platform-scoped StyleX imports, installed/local tsconfig presets and supplied font-registration facts can inform analysis. Executable CSS configuration and remote stylesheets are reported as not assessed, never executed; missing and invalid context is not treated as successful absence. Baseline comparison distinguishes compatible comparisons from unassessed context and can fail CI on current errors or new error findings.
  
  **Report consumers must migrate to JSON schema 3.** Older baselines cannot supply a schema-3 semantic comparison. A clean compiler audit still does not prove production dependency removal, runtime behavior, Native Metro preparation or device font availability. See the migration-audit README for the supported facts and comparison boundaries.

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Compile project-defined Tailwind animations and their keyframes for both backends, including keyframes needed by dynamic class candidates. StyleX conditions inside property values now reach the shared condition model.
  
  Extend Native negated conditions across supported environment, breakpoint, pixel-width, container, prop, sibling and interaction predicates. Link states use the existing interaction owner, descendant focus-visible follows that owner, and independent transform resets and runtime-state transform families compose without losing their other transform entries. Unsupported predicates are still diagnosed, not assumed false.
  
  Respect project radius tokens and built-in radius overrides, discover runtime candidates in quoted class arrays, and preserve separate Native style keys for ternary branches. Caller classes override a component's resting look while explicit state classes retain their precedence. On Web, fallback candidate rules stay below authored Tailwind utilities, and conditional class selection reaches elements that remain components.
  
  Native line-breaking utilities that cannot be represented now warn instead of failing the build. This does not implement Android/CJK line-break controls that React Native does not expose.

- [#798](https://github.com/iray-tno/hozo/pull/798) [`030d179`](https://github.com/iray-tno/hozo/commit/030d1791515ef5523560c38c1788e4b23f6bfd92) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Stepper`: where a person is in a process of several steps. Each step is read with its position and status in words ("Step 2 of 3: Profile, current"), so the status is never carried by colour alone. The current step is marked `aria-current="step"` on the Web and `selected` on Native. With `onStepPress` the steps are buttons. Each status has class lists for the step and its indicator, applied by the pattern, so the look reaches React Native as well.

- [#800](https://github.com/iray-tno/hozo/pull/800) [`18a0e93`](https://github.com/iray-tno/hozo/commit/18a0e93cac8a778ca919c23d0ccfe7a65c506ef6) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Table`, `TableCaption`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead` and `TableCell`.
  
  - **Web:** they are the table elements themselves, and a header cell is `scope="col"` unless the author says otherwise.
  - **React Native,** which has no table:
    - Each column is as wide as its widest cell, the way the browser's automatic table layout does it. A table is shrink-to-fit by default, shares out the spare room in proportion with `w-full`, shrinks its columns to fit when too wide, or scrolls sideways with `scrollable`.
    - A data cell is read with its column's header ("Price, $12").
    - Each cell carries its row and column for TalkBack.

### Patch Changes

- [#812](https://github.com/iray-tno/hozo/pull/812) [`cc85dce`](https://github.com/iray-tno/hozo/commit/cc85dce47dcd3df869e8659dceffee7f6b01123b) Thanks [@iray-tno](https://github.com/iray-tno)! - On React Native, `break-keep` on a `Text` now sets `lineBreakStrategyIOS="hangul-word"`, so iOS keeps Korean words whole. It is still reported for what it does not cover: Chinese and Japanese, and Android. The Native line-breaking warning now also says that ordinary kinsoku is already the platform default, and points to [#813](https://github.com/iray-tno/hozo/issues/813) for what waits on React Native.

- [#795](https://github.com/iray-tno/hozo/pull/795) [`8e110be`](https://github.com/iray-tno/hozo/commit/8e110be92d0ea8d435ecd1f5e7dcfb236b00b368) Thanks [@iray-tno](https://github.com/iray-tno)! - `Chip`'s `className` and `removeClassName` now style it on React Native. Before, both were ignored there. The compiler lowers `Chip` from `@hozo/core` to `HozoChip` and hands its two class lists over as `style` and `removeStyle`. On the Web they are compiled to classes as before. The Native pattern moves text styles such as `text-white` onto its label, where a `Text` can draw them.

- [#810](https://github.com/iray-tno/hozo/pull/810) [`6e2cff6`](https://github.com/iray-tno/hozo/commit/6e2cff6013e69b3ae276473c39a7fbe7f1e7e1b4) Thanks [@iray-tno](https://github.com/iray-tno)! - On Native, the compiler warns when an `Image`'s `srcSet` uses width descriptors (`800w`). React Native reads `srcSet` by density only and skips those on device with a runtime warning, so such an image could draw nothing.

- [#794](https://github.com/iray-tno/hozo/pull/794) [`42d0e77`](https://github.com/iray-tno/hozo/commit/42d0e7772061d498b1bc2a1ae170cea93607ba10) Thanks [@iray-tno](https://github.com/iray-tno)! - `Meter` now draws its bar on React Native: a track, a fill as wide as the amount, and the fill coloured by `low`, `high` and `optimum` the way Chrome colours `<meter>`. Before, Native rendered an empty 80 x 16 box. The author's `className` styles the track. The compiled and uncompiled paths are now one component, `HozoMeter`.

- [#802](https://github.com/iray-tno/hozo/pull/802) [`8a7c8c7`](https://github.com/iray-tno/hozo/commit/8a7c8c73dc20d025a10ae5fe472bb81dc8659ce7) Thanks [@iray-tno](https://github.com/iray-tno)! - On the Web, a `<meter>` now carries its amount as a percentage in `aria-valuetext`, as Native already did. Without it, NVDA read `<Meter value={0.6}>` as "progress bar, 0.6" and VoiceOver as "0.6". An author's own `aria-valuetext` still wins.
  
  A `Stepper` step's description is now separated from its status by a space a reader keeps. Before, VoiceOver read "completedEmail and password".

- [#792](https://github.com/iray-tno/hozo/pull/792) [`f730194`](https://github.com/iray-tno/hozo/commit/f7301946a75b7fc1e67bc4c135df43497b2b7f72) Thanks [@iray-tno](https://github.com/iray-tno)! - On Native, an animation inside a `Skeleton` now stops under reduced motion, as it already did on Web. Before this, only the skeleton's own animation was guarded, so a spinner placed inside a placeholder kept spinning.

## 0.2.0

- Discover and transform source-distributed dependencies: declared Hozo packages are scanned by default; `content.packages` replaces that list. Resolve stylesheet paths from the project.
- Preserve arbitrary-value data-attribute candidates, resolve chained and paired dark theme tokens, and parse StyleX `@starting-style` / `data-*` conditions.
- Require trusted authoring imports, preserve shapes hidden by unknown spreads, and reject generated import-binding collisions with `RUNTIME_IMPORT_COLLISION`.
- Extend Native lowering for entrance/exit motion, project keyframes, animated Text and the SVG filter imports. Unsupported animation properties remain diagnostic.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.
