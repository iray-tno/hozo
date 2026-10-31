# @hozo/core

## 0.4.0

### Minor Changes

- [#1243](https://github.com/iray-tno/hozo/pull/1243) [`480e00a`](https://github.com/iray-tno/hozo/commit/480e00a0d6e165b92beb8dbf9310710fcceb7fd1) Thanks [@iray-tno](https://github.com/iray-tno)! - Add a portable one-axis drag behavior, Splitter and ResizablePane. Panes resize with captured pointer drags, Web keyboard commands and Native accessibility actions, support logical sides and collapse/restore, and expose change/commit callbacks for application-owned persistence.

- [#1245](https://github.com/iray-tno/hozo/pull/1245) [`37a9151`](https://github.com/iray-tno/hozo/commit/37a915152634d8e25dfa9b2958661d4bc8f0a134) Thanks [@iray-tno](https://github.com/iray-tno)! - Add portable CodeLines and CodeBlock with application-supplied tokens, semantic line marks, hidden gutters, line numbers, wrapping, accessible scrolling and copy feedback. Supply Native clipboard access through CodeClipboardProvider. Pure model, Shiki connection and fence metadata helpers have independent subpaths; no highlighter or diff runtime is included.
  
  Del now renders a semantic `<del>` on Web instead of `<s>`. Strikethrough retains `<s>`; Ins adds `<ins>` with underline on Native.

### Patch Changes

- [#1099](https://github.com/iray-tno/hozo/pull/1099) [`d7dd5b9`](https://github.com/iray-tno/hozo/commit/d7dd5b9d91a77c6cf647ba2de6fb321f8e558613) Thanks [@iray-tno](https://github.com/iray-tno)! - A `Button` whose props reach it through a rest spread (`function B({ href, ...rest }) { return <Button {...rest} /> }`) works again on the Web. Since the compiler started deciding such a Button's element at build time, the spread reached the `<button>` or `<a>` raw, so `onPress` never became `onClick` and clicking an `@hozo/ui` Button did nothing. The spread now goes through the same translation as the uncompiled `Button`: `onPress`, `accessibilityLabel`, `accessibilityHint`, `testID`, `nativeID`, `disabled` and `data-*`. On an anchor, a press is still suppressed while disabled.

- [#1056](https://github.com/iray-tno/hozo/pull/1056) [`c1ca21a`](https://github.com/iray-tno/hozo/commit/c1ca21afee0e3f4dd92110570f3ff3775b01c4cf) Thanks [@iray-tno](https://github.com/iray-tno)! - On Native, a `style` a caller passes through a component's `{...rest}` no longer replaces the styles compiled from its classes: the two compose, classes first and the caller's style after, as the owner itself composes them. Elements whose spreads cannot carry `style` compile as before.

- [#1119](https://github.com/iray-tno/hozo/pull/1119) [`242253d`](https://github.com/iray-tno/hozo/commit/242253da3910698e0838d74cbc9d51e1ca5995d6) Thanks [@iray-tno](https://github.com/iray-tno)! - A `TextInput` whose props reach it through a spread (`function F(props) { return <TextInput {...props} /> }`) works on the Web. The spread reached the `<input>` or `<textarea>` raw, so `onChangeText` was never called and a controlled `@hozo/ui` `Input` could not be typed into. The spread now goes through the same translation as the uncompiled `TextInput`: `onChangeText`, `onSubmitEditing`, `editable`, `keyboardType`, `secureTextEntry`, `returnKeyType`, `autoCorrect`, the `accessibility*` props, `testID` and `nativeID`. A named `onChangeText` that is `undefined` no longer throws when the field is typed into.

- [#1124](https://github.com/iray-tno/hozo/pull/1124) [`e7d97e9`](https://github.com/iray-tno/hozo/commit/e7d97e981615355534d0ea20c4a70410556cbda4) Thanks [@iray-tno](https://github.com/iray-tno)! - A `View`, `Text`, `Image` or document primitive whose props reach it through a spread (`function Box(props) { return <View {...props} /> }`) keeps them on the Web. The spread reached the element raw, so `accessibilityLabel`, `accessibilityHint`, `testID`, `nativeID`, `pointerEvents`, `accessibilityState`, `accessibilityValue` and `accessibilityLiveRegion` became unknown attributes, and the element lost its accessible name. The spread now goes through the same translation as the uncompiled primitive. On an `Image` it also resolves an object or list `src` and uses the accessibility label as `alt`.
- Updated dependencies [[`3ad9a9d`](https://github.com/iray-tno/hozo/commit/3ad9a9d10138f5aafa64d80971e628ab4434aa03), [`e90b243`](https://github.com/iray-tno/hozo/commit/e90b2430e542706bff0c8c5001d94d1180b7d8a2), [`d7dd5b9`](https://github.com/iray-tno/hozo/commit/d7dd5b9d91a77c6cf647ba2de6fb321f8e558613), [`27536fc`](https://github.com/iray-tno/hozo/commit/27536fc602947b8928df7fa4d8940363fc0e3a67), [`99892e2`](https://github.com/iray-tno/hozo/commit/99892e25f536991e2966aa60769bd7155d5d8336), [`6dd5256`](https://github.com/iray-tno/hozo/commit/6dd525626b8535772381dfb7c28dac665a063a16), [`4270a72`](https://github.com/iray-tno/hozo/commit/4270a727b14605d7ff5c9831238e60cb518e3ed6), [`d674538`](https://github.com/iray-tno/hozo/commit/d674538468608c9aa128494f983bf022722c4337), [`38ac1a9`](https://github.com/iray-tno/hozo/commit/38ac1a9521cb83e714471d76885925aa9bd6ade8), [`1c052da`](https://github.com/iray-tno/hozo/commit/1c052dad66426e8a4acd462c776f161249330c35), [`7ad0aaa`](https://github.com/iray-tno/hozo/commit/7ad0aaa1ea5db43cb04d4cb4f471e738265f4f1e), [`1b54676`](https://github.com/iray-tno/hozo/commit/1b54676fbc476f848d2e834a9443fde0bf888ce9), [`301e475`](https://github.com/iray-tno/hozo/commit/301e475d88e4628517a9b4fb2b2f0a245af62144), [`2c37b3c`](https://github.com/iray-tno/hozo/commit/2c37b3cccc43c7671c61c5f46b81e60fc5ba82a2), [`3fb505a`](https://github.com/iray-tno/hozo/commit/3fb505a3ce6a7793eef0037ec27d72edea0abf27), [`205b7a6`](https://github.com/iray-tno/hozo/commit/205b7a66a93fdfe3df702c4cd326abb3a4a0a9a4), [`82c2472`](https://github.com/iray-tno/hozo/commit/82c24723090e6f1b4c29f60017d8d1d10a639b62), [`0b1a810`](https://github.com/iray-tno/hozo/commit/0b1a810adccf701a2b1ec76b9cc61af484e7282d), [`480e00a`](https://github.com/iray-tno/hozo/commit/480e00a0d6e165b92beb8dbf9310710fcceb7fd1), [`fac2f53`](https://github.com/iray-tno/hozo/commit/fac2f53a7636c7373cf22c4d49fcf5a137bb08ec), [`b0c6f22`](https://github.com/iray-tno/hozo/commit/b0c6f220c74d8a5c5a0c13bcf5fc9f8b97a25419), [`add3e7b`](https://github.com/iray-tno/hozo/commit/add3e7b2c5a152c770eabee7d09d723e925958e1), [`ffd5b6b`](https://github.com/iray-tno/hozo/commit/ffd5b6bbb0021d512d416fc5d8ae7441cc18c463), [`97b956c`](https://github.com/iray-tno/hozo/commit/97b956c9ee6ef1bd0721bc09923c1bc9102b14f7), [`e3730c7`](https://github.com/iray-tno/hozo/commit/e3730c735239b78d713e275429a568f047653a49), [`c49b78b`](https://github.com/iray-tno/hozo/commit/c49b78b8daa63e0fdc2a44f6d83461960f71bf27), [`381b826`](https://github.com/iray-tno/hozo/commit/381b826b09abefbc36c17ceb812ad13d528d818b), [`4b50482`](https://github.com/iray-tno/hozo/commit/4b50482e7ce1085970cda578e17fe4deeffa7234), [`79b0319`](https://github.com/iray-tno/hozo/commit/79b0319e7159d58d4cd15f997d6c1e88e16d6d4a), [`262aca9`](https://github.com/iray-tno/hozo/commit/262aca978ebe1c79c61bac914b01f50e5768c0bc), [`d6beff8`](https://github.com/iray-tno/hozo/commit/d6beff866c9b57a9d7bcf12bf7ab16622dcde78c), [`e4734c8`](https://github.com/iray-tno/hozo/commit/e4734c832c6469edc4ba88a7e09209b2b2ccd29b), [`b59995e`](https://github.com/iray-tno/hozo/commit/b59995e108e4cc9b6d093c2487cebece0d02a707), [`272063f`](https://github.com/iray-tno/hozo/commit/272063f6f13901c9b919e987b496f6cf7d7c1952), [`701eb1f`](https://github.com/iray-tno/hozo/commit/701eb1fdd1abce723bad1f8d8faad98b3fc6dcd5), [`d5a1a1e`](https://github.com/iray-tno/hozo/commit/d5a1a1ee6a55dd50c6c2f91289a11a8665dd9d74), [`c1ca21a`](https://github.com/iray-tno/hozo/commit/c1ca21afee0e3f4dd92110570f3ff3775b01c4cf), [`eb31fc7`](https://github.com/iray-tno/hozo/commit/eb31fc745fb581ee06db50e10db3b0aa60518870), [`5cbbb5d`](https://github.com/iray-tno/hozo/commit/5cbbb5de2ba68dd8e44c1939535a84f5325bb950), [`4b50034`](https://github.com/iray-tno/hozo/commit/4b500340d7b3ec96066a6a37c8c23d326a9f73ef), [`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb), [`c4696a4`](https://github.com/iray-tno/hozo/commit/c4696a4660ceb546fc9e29bc18d1fe73979681e5), [`c9a3b4d`](https://github.com/iray-tno/hozo/commit/c9a3b4d61541024c66165c91a4b7e2a75c9a203c), [`9499425`](https://github.com/iray-tno/hozo/commit/94994254d4cc7efce6fa611ea22c1b03ada99118), [`416d627`](https://github.com/iray-tno/hozo/commit/416d627e8afc6a3f321c95dbe1f74b630d173d7b), [`242253d`](https://github.com/iray-tno/hozo/commit/242253da3910698e0838d74cbc9d51e1ca5995d6), [`37a9151`](https://github.com/iray-tno/hozo/commit/37a915152634d8e25dfa9b2958661d4bc8f0a134), [`6901bd2`](https://github.com/iray-tno/hozo/commit/6901bd2ed536d9482b3cb273cae9059a803b14b4), [`98c1e65`](https://github.com/iray-tno/hozo/commit/98c1e65e578b885bd8184dd2eee1617b6d01cfbc), [`bc65476`](https://github.com/iray-tno/hozo/commit/bc654769284e1429e00028d8b6176cbdafab59c8), [`e7d97e9`](https://github.com/iray-tno/hozo/commit/e7d97e981615355534d0ea20c4a70410556cbda4)]:
  - @hozo/patterns@0.4.0
  - @hozo/primitives@0.4.0
  - @hozo/behaviors@0.4.0
  - @hozo/typography@0.4.0
  - @hozo/engine@0.4.0
  - @hozo/semantics@0.4.0

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

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `HozoI18nProvider`, `hozoMessages`, locale/direction hooks and structural adapters for i18next and react-intl. Hozo's component labels, status descriptions and announcements can use the application's existing translation catalog, with English fallback messages. Hozo connects to an i18n library; it does not introduce a second translation engine or require one of these libraries as a dependency.

- [#809](https://github.com/iray-tno/hozo/pull/809) [`70cc763`](https://github.com/iray-tno/hozo/commit/70cc763166d3f3aa04c466c5a12e7a8a4dba0a0f) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `OtpInput`, for a one-time code or a PIN. It is one real input drawn as cells, so a screen reader finds one field ("Verification code, 6 characters"), and a pasted or autofilled code lands at once. It asks each platform for a one-time code: `autocomplete="one-time-code"` on the Web, `textContentType="oneTimeCode"` on iOS and `autoComplete="sms-otp"` on Android. `mask` turns it into a PIN. The active and filled cells are styled by class lists the pattern applies, so the look reaches React Native as well.

- [#797](https://github.com/iray-tno/hozo/pull/797) [`9a33076`](https://github.com/iray-tno/hozo/commit/9a3307689c1a37847d45bea9083cee1f63c7edba) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Pagination`: numbered pages with previous and next, inside a `<nav>` named "Pagination". The current page is marked with `aria-current="page"` (`selected` on Native), and the ends are disabled in place rather than removed. With `getPageHref` every page is a link, which on Native goes through the installed router. The current page and the disabled ends are styled by class lists the pattern applies (`currentItemClassName`, `disabledItemClassName`), so the same look reaches React Native, where there are no selectors.

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Preformatted` for content whose whitespace is meaningful: a real `<pre>` on Web and monospace Text preserving line breaks on Native. Put `Code` inside it for a code sample; the block and the inline code keep their separate semantics.

- [#798](https://github.com/iray-tno/hozo/pull/798) [`030d179`](https://github.com/iray-tno/hozo/commit/030d1791515ef5523560c38c1788e4b23f6bfd92) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Stepper`: where a person is in a process of several steps. Each step is read with its position and status in words ("Step 2 of 3: Profile, current"), so the status is never carried by colour alone. The current step is marked `aria-current="step"` on the Web and `selected` on Native. With `onStepPress` the steps are buttons. Each status has class lists for the step and its indicator, applied by the pattern, so the look reaches React Native as well.

- [#800](https://github.com/iray-tno/hozo/pull/800) [`18a0e93`](https://github.com/iray-tno/hozo/commit/18a0e93cac8a778ca919c23d0ccfe7a65c506ef6) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Table`, `TableCaption`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead` and `TableCell`.
  
  - **Web:** they are the table elements themselves, and a header cell is `scope="col"` unless the author says otherwise.
  - **React Native,** which has no table:
    - Each column is as wide as its widest cell, the way the browser's automatic table layout does it. A table is shrink-to-fit by default, shares out the spare room in proportion with `w-full`, shrinks its columns to fit when too wide, or scrolls sideways with `scrollable`.
    - A data cell is read with its column's header ("Price, $12").
    - Each cell carries its row and column for TalkBack.

### Patch Changes

- [#795](https://github.com/iray-tno/hozo/pull/795) [`8e110be`](https://github.com/iray-tno/hozo/commit/8e110be92d0ea8d435ecd1f5e7dcfb236b00b368) Thanks [@iray-tno](https://github.com/iray-tno)! - `Chip`'s `className` and `removeClassName` now style it on React Native. Before, both were ignored there. The compiler lowers `Chip` from `@hozo/core` to `HozoChip` and hands its two class lists over as `style` and `removeStyle`. On the Web they are compiled to classes as before. The Native pattern moves text styles such as `text-white` onto its label, where a `Text` can draw them.

- [#794](https://github.com/iray-tno/hozo/pull/794) [`42d0e77`](https://github.com/iray-tno/hozo/commit/42d0e7772061d498b1bc2a1ae170cea93607ba10) Thanks [@iray-tno](https://github.com/iray-tno)! - `Meter` now draws its bar on React Native: a track, a fill as wide as the amount, and the fill coloured by `low`, `high` and `optimum` the way Chrome colours `<meter>`. Before, Native rendered an empty 80 x 16 box. The author's `className` styles the track. The compiled and uncompiled paths are now one component, `HozoMeter`.
- Updated dependencies [[`80f2686`](https://github.com/iray-tno/hozo/commit/80f2686ace0922e27502695d0b88c1dba2e08be0), [`8e110be`](https://github.com/iray-tno/hozo/commit/8e110be92d0ea8d435ecd1f5e7dcfb236b00b368), [`adfe1fd`](https://github.com/iray-tno/hozo/commit/adfe1fd914d60effc27677efdaee6edf19feaf6b), [`496f1b7`](https://github.com/iray-tno/hozo/commit/496f1b75e06bc5f5b079870ce566754e7161c21a), [`ace032d`](https://github.com/iray-tno/hozo/commit/ace032d26b7e9e50aecf058cd222f7b362a3f225), [`ad1ad0b`](https://github.com/iray-tno/hozo/commit/ad1ad0b355c6ecae07372f44a65aed279e539e22), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`42d0e77`](https://github.com/iray-tno/hozo/commit/42d0e7772061d498b1bc2a1ae170cea93607ba10), [`8a7c8c7`](https://github.com/iray-tno/hozo/commit/8a7c8c73dc20d025a10ae5fe472bb81dc8659ce7), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`70cc763`](https://github.com/iray-tno/hozo/commit/70cc763166d3f3aa04c466c5a12e7a8a4dba0a0f), [`9a33076`](https://github.com/iray-tno/hozo/commit/9a3307689c1a37847d45bea9083cee1f63c7edba), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`030d179`](https://github.com/iray-tno/hozo/commit/030d1791515ef5523560c38c1788e4b23f6bfd92), [`714cb5a`](https://github.com/iray-tno/hozo/commit/714cb5a934d99b93ef9221545eff0dc0db11bf65), [`18a0e93`](https://github.com/iray-tno/hozo/commit/18a0e93cac8a778ca919c23d0ccfe7a65c506ef6)]:
  - @hozo/patterns@0.3.0
  - @hozo/behaviors@0.3.0
  - @hozo/primitives@0.3.0
  - @hozo/engine@0.3.0
  - @hozo/semantics@0.3.0
  - @hozo/typography@0.3.0

## 0.2.0

- Keep the existing facade API and upgrade its primitive, pattern, typography, semantic and SVG owners together.
- Existing re-exported primitives benefit from React 19 ref-prop fixes and owner-package motion/accessibility repairs. Import newly added patterns and form/UI domains from their own packages; this release does not add every new widget to the facade.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/primitives@0.2.0
  - @hozo/patterns@0.2.0
  - @hozo/semantics@0.2.0
  - @hozo/typography@0.2.0
  - @hozo/engine@0.2.0
