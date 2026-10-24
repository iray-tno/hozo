# @hozo/ui

## 0.4.0

### Minor Changes

- [#1243](https://github.com/iray-tno/hozo/pull/1243) [`480e00a`](https://github.com/iray-tno/hozo/commit/480e00a0d6e165b92beb8dbf9310710fcceb7fd1) Thanks [@iray-tno](https://github.com/iray-tno)! - Add a portable one-axis drag behavior, Splitter and ResizablePane. Panes resize with captured pointer drags, Web keyboard commands and Native accessibility actions, support logical sides and collapse/restore, and expose change/commit callbacks for application-owned persistence.

- [#1245](https://github.com/iray-tno/hozo/pull/1245) [`37a9151`](https://github.com/iray-tno/hozo/commit/37a915152634d8e25dfa9b2958661d4bc8f0a134) Thanks [@iray-tno](https://github.com/iray-tno)! - Add portable CodeLines and CodeBlock with application-supplied tokens, semantic line marks, hidden gutters, line numbers, wrapping, accessible scrolling and copy feedback. Supply Native clipboard access through CodeClipboardProvider. Pure model, Shiki connection and fence metadata helpers have independent subpaths; no highlighter or diff runtime is included.
  
  Del now renders a semantic `<del>` on Web instead of `<s>`. Strikethrough retains `<s>`; Ins adds `<ins>` with underline on Native.

### Patch Changes

- [#1037](https://github.com/iray-tno/hozo/pull/1037) [`6b0c271`](https://github.com/iray-tno/hozo/commit/6b0c271b754c3ba96bf7efe8f241f8784a3e4081) Thanks [@iray-tno](https://github.com/iray-tno)! - A Text nested in `@hozo/ui`'s `Checkbox` or `Switch` now gets its label text styles on Native, as one in `Button` and `Alert` already did. The manifest extractor reads `@hozo/patterns`' Checkbox and Switch as hosts, and takes a `disabled` left in the rest spread as the caller's, so `disabled:` text follows the caller's own `disabled`.

- [#1038](https://github.com/iray-tno/hozo/pull/1038) [`f56c33a`](https://github.com/iray-tno/hozo/commit/f56c33a14738c3f71b2dd0690fad5fb6ef817133) Thanks [@iray-tno](https://github.com/iray-tno)! - A package component whose host is a pressable primitive now hands its `hover:`, `active:` and `focus-visible:` text classes to a Text the caller nests, on Native: the manifest records `hostStates`, and the caller's Text reads the host's state through `HozoText`.

- [#1039](https://github.com/iray-tno/hozo/pull/1039) [`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb) Thanks [@iray-tno](https://github.com/iray-tno)! - A Text nested in `@hozo/ui`'s `Checkbox` or `Switch` label now takes their `hover:`, `active:` and `focus-visible:` text classes on Native. `@hozo/patterns`' pressable provides its state through `HozoInteractionContext`, now in `@hozo/behaviors/pressable-interaction` and shared with `@hozo/primitives`, so the `HozoText` a caller's Text compiles to reads it.

- [#1145](https://github.com/iray-tno/hozo/pull/1145) [`bc65476`](https://github.com/iray-tno/hozo/commit/bc654769284e1429e00028d8b6176cbdafab59c8) Thanks [@iray-tno](https://github.com/iray-tno)! - A `Tree` branch can be opened and closed with a pointer. By default a press on a branch row now selects it and opens or closes it, on both platforms. Before this, the Web half only selected and the Native half only toggled.
  
  `toggleOn="marker"` makes only the marker open and close, for a `+` box or for a tree whose branches are things to choose. On React Native the row then offers expand and collapse as accessibility actions. `renderRow` receives a `toggle` for a marker it draws itself. `@hozo/ui`'s `Tree`, whose marker is a chevron, keeps the row behaviour.

- [#1134](https://github.com/iray-tno/hozo/pull/1134) [`ec7c2ab`](https://github.com/iray-tno/hozo/commit/ec7c2abe362f72f12ec263f59e009ddd626832a2) Thanks [@iray-tno](https://github.com/iray-tno)! - On the Web, an `Avatar`'s initials are centred in its circle, and a `Skeleton` given a corner class such as `rounded-full` takes that shape. The Avatar lacked `flex`, which a React Native View has by default and a `<span>` does not. The Skeleton's default `rounded-hozo-control` sat beside the caller's corner class and won by stylesheet order; it is now added only when the caller's `className` names no corners.

- [#1148](https://github.com/iray-tno/hozo/pull/1148) [`34fef26`](https://github.com/iray-tno/hozo/commit/34fef2610141418d48e9e73c773f2eb9cbf110f2) Thanks [@iray-tno](https://github.com/iray-tno)! - On the Web, a `Stepper`'s step numbers and an `OtpInput`'s characters are centred in their boxes, and a step's indicator keeps its size. Their class lists lacked `flex`. A React Native View has it by default, but the `<li>`, `<button>` and `<span>` the Web renders do not. A test now checks every class list in the package that arranges children for `flex` or `grid`.
  
  `useFormSubmit` is re-exported from `@hozo/ui`. A `Button` is not a submit button, so this hook is how it submits the `Form` it is in, and it no longer needs `@hozo/form` installed beside it.
- Updated dependencies [[`d7dd5b9`](https://github.com/iray-tno/hozo/commit/d7dd5b9d91a77c6cf647ba2de6fb321f8e558613), [`27536fc`](https://github.com/iray-tno/hozo/commit/27536fc602947b8928df7fa4d8940363fc0e3a67), [`99892e2`](https://github.com/iray-tno/hozo/commit/99892e25f536991e2966aa60769bd7155d5d8336), [`54aa3b3`](https://github.com/iray-tno/hozo/commit/54aa3b34fe5628f0d90a6171ca51a6238a62a44e), [`480e00a`](https://github.com/iray-tno/hozo/commit/480e00a0d6e165b92beb8dbf9310710fcceb7fd1), [`ffd5b6b`](https://github.com/iray-tno/hozo/commit/ffd5b6bbb0021d512d416fc5d8ae7441cc18c463), [`c1ca21a`](https://github.com/iray-tno/hozo/commit/c1ca21afee0e3f4dd92110570f3ff3775b01c4cf), [`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb), [`416d627`](https://github.com/iray-tno/hozo/commit/416d627e8afc6a3f321c95dbe1f74b630d173d7b), [`242253d`](https://github.com/iray-tno/hozo/commit/242253da3910698e0838d74cbc9d51e1ca5995d6), [`37a9151`](https://github.com/iray-tno/hozo/commit/37a915152634d8e25dfa9b2958661d4bc8f0a134), [`98c1e65`](https://github.com/iray-tno/hozo/commit/98c1e65e578b885bd8184dd2eee1617b6d01cfbc), [`bc65476`](https://github.com/iray-tno/hozo/commit/bc654769284e1429e00028d8b6176cbdafab59c8), [`e7d97e9`](https://github.com/iray-tno/hozo/commit/e7d97e981615355534d0ea20c4a70410556cbda4)]:
  - @hozo/primitives@0.4.0
  - @hozo/core@0.4.0
  - @hozo/form@0.4.0
  - @hozo/patterns@0.4.0
  - @hozo/typography@0.4.0

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

- [#811](https://github.com/iray-tno/hozo/pull/811) [`ace032d`](https://github.com/iray-tno/hozo/commit/ace032d26b7e9e50aecf058cd222f7b362a3f225) Thanks [@iray-tno](https://github.com/iray-tno)! - `Drawer`'s `side` now also takes `'start'` and `'end'`, which follow the reading direction. The direction comes from `HozoI18nProvider`'s `dir`, or else from the document's direction on the Web and `I18nManager.isRTL` on React Native. A navigation drawer written `side="start"` therefore opens from the right in Arabic or Hebrew. `useHozoDrawerSide` is exported for a look that needs the resolved edge. The default is still `'left'`.

- [#821](https://github.com/iray-tno/hozo/pull/821) [`ad1ad0b`](https://github.com/iray-tno/hozo/commit/ad1ad0b355c6ecae07372f44a65aed279e539e22) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `FileDropzone`. It is a button that opens the file picker, with dropping files on it as a shortcut on the Web. Every pick is sorted by `accept`, the size limits and the count, and what was added and what was refused (with each reason) is announced in one sentence. On React Native it opens the application's `pickFiles`, or `expo-document-picker` when installed. With neither, it is disabled and says no picker is available.

- [#809](https://github.com/iray-tno/hozo/pull/809) [`70cc763`](https://github.com/iray-tno/hozo/commit/70cc763166d3f3aa04c466c5a12e7a8a4dba0a0f) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `OtpInput`, for a one-time code or a PIN. It is one real input drawn as cells, so a screen reader finds one field ("Verification code, 6 characters"), and a pasted or autofilled code lands at once. It asks each platform for a one-time code: `autocomplete="one-time-code"` on the Web, `textContentType="oneTimeCode"` on iOS and `autoComplete="sms-otp"` on Android. `mask` turns it into a PIN. The active and filled cells are styled by class lists the pattern applies, so the look reaches React Native as well.

- [#797](https://github.com/iray-tno/hozo/pull/797) [`9a33076`](https://github.com/iray-tno/hozo/commit/9a3307689c1a37847d45bea9083cee1f63c7edba) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Pagination`: numbered pages with previous and next, inside a `<nav>` named "Pagination". The current page is marked with `aria-current="page"` (`selected` on Native), and the ends are disabled in place rather than removed. With `getPageHref` every page is a link, which on Native goes through the installed router. The current page and the disabled ends are styled by class lists the pattern applies (`currentItemClassName`, `disabledItemClassName`), so the same look reaches React Native, where there are no selectors.

- [#798](https://github.com/iray-tno/hozo/pull/798) [`030d179`](https://github.com/iray-tno/hozo/commit/030d1791515ef5523560c38c1788e4b23f6bfd92) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Stepper`: where a person is in a process of several steps. Each step is read with its position and status in words ("Step 2 of 3: Profile, current"), so the status is never carried by colour alone. The current step is marked `aria-current="step"` on the Web and `selected` on Native. With `onStepPress` the steps are buttons. Each status has class lists for the step and its indicator, applied by the pattern, so the look reaches React Native as well.

### Patch Changes

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Resolve Native pattern class-name slots through the project's runtime class resolver. Pattern controls now share the primitive interaction engine and deliver hover, focus, focus-visible and pressed facts to their actual owners instead of reporting pressed alone.
  
  Static interaction styles are additionally wired for Chip, ColorPicker swatches, Pagination page controls and CommandPalette pointer-state item slots. Selection slots and nested controls retain their own ownership: a remove button does not inherit its row's focus, and a command item does not borrow the input's focus. Other static state slots and semantic predicates remain subject to their existing diagnostics.
  
  Styled Button receives a pressed look; Checkbox and Switch indicators are real elements on both platforms rather than Native-invisible pseudo-elements. Non-transition Native Pressables and their Text children no longer allocate animation values/listeners. Interaction ownership remains mounted when transitions are added or removed. This removes idle animation work, not every initial-mount cost or every platform delivery difference; measured list mount/update tradeoffs remain tracked separately.

- [#802](https://github.com/iray-tno/hozo/pull/802) [`f416f23`](https://github.com/iray-tno/hozo/commit/f416f2374745bb6f728b7eaa288126128301fc60) Thanks [@iray-tno](https://github.com/iray-tno)! - `Pagination`'s controls are now `inline-flex`, so their 36px minimum size also applies to the link version (`getPageHref`). Before, an `<a>` was inline, and its targets came out about 21×17px.
- Updated dependencies [[`80f2686`](https://github.com/iray-tno/hozo/commit/80f2686ace0922e27502695d0b88c1dba2e08be0), [`8e110be`](https://github.com/iray-tno/hozo/commit/8e110be92d0ea8d435ecd1f5e7dcfb236b00b368), [`adfe1fd`](https://github.com/iray-tno/hozo/commit/adfe1fd914d60effc27677efdaee6edf19feaf6b), [`496f1b7`](https://github.com/iray-tno/hozo/commit/496f1b75e06bc5f5b079870ce566754e7161c21a), [`ace032d`](https://github.com/iray-tno/hozo/commit/ace032d26b7e9e50aecf058cd222f7b362a3f225), [`ad1ad0b`](https://github.com/iray-tno/hozo/commit/ad1ad0b355c6ecae07372f44a65aed279e539e22), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`42d0e77`](https://github.com/iray-tno/hozo/commit/42d0e7772061d498b1bc2a1ae170cea93607ba10), [`8a7c8c7`](https://github.com/iray-tno/hozo/commit/8a7c8c73dc20d025a10ae5fe472bb81dc8659ce7), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`70cc763`](https://github.com/iray-tno/hozo/commit/70cc763166d3f3aa04c466c5a12e7a8a4dba0a0f), [`9a33076`](https://github.com/iray-tno/hozo/commit/9a3307689c1a37847d45bea9083cee1f63c7edba), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`030d179`](https://github.com/iray-tno/hozo/commit/030d1791515ef5523560c38c1788e4b23f6bfd92), [`18a0e93`](https://github.com/iray-tno/hozo/commit/18a0e93cac8a778ca919c23d0ccfe7a65c506ef6)]:
  - @hozo/patterns@0.3.0
  - @hozo/core@0.3.0
  - @hozo/form@0.3.0
  - @hozo/primitives@0.3.0
  - @hozo/typography@0.3.0

## 0.2.0

- Introduce styled buttons, fields/inputs, toggles, slider, accordion, tabs, overlays, selection widgets, calendar/pickers, cards/layout and feedback components over primitives, patterns and forms.
- Ship literal-class TSX source and `theme.css` tokens for the consumer’s own Hozo build, not prebuilt component CSS. Override paired light/dark tokens in the application theme.
- Add focus-ring, contrast, target-size, selected-state and 4px layout-grid checks. Native widget slots are not universal runtime class resolution; use documented style props where required.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/core@0.2.0
  - @hozo/primitives@0.2.0
  - @hozo/patterns@0.2.0
  - @hozo/form@0.2.0
  - @hozo/typography@0.2.0
