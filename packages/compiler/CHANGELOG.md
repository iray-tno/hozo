# @hozo/compiler

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

- [#809](https://github.com/iray-tno/hozo/pull/809) [`70cc763`](https://github.com/iray-tno/hozo/commit/70cc763166d3f3aa04c466c5a12e7a8a4dba0a0f) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `OtpInput`, for a one-time code or a PIN. It is one real input drawn as cells, so a screen reader finds one field ("Verification code, 6 characters"), and a pasted or autofilled code lands at once. It asks each platform for a one-time code: `autocomplete="one-time-code"` on the Web, `textContentType="oneTimeCode"` on iOS and `autoComplete="sms-otp"` on Android. `mask` turns it into a PIN. The active and filled cells are styled by class lists the pattern applies, so the look reaches React Native as well.

- [#797](https://github.com/iray-tno/hozo/pull/797) [`9a33076`](https://github.com/iray-tno/hozo/commit/9a3307689c1a37847d45bea9083cee1f63c7edba) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Pagination`: numbered pages with previous and next, inside a `<nav>` named "Pagination". The current page is marked with `aria-current="page"` (`selected` on Native), and the ends are disabled in place rather than removed. With `getPageHref` every page is a link, which on Native goes through the installed router. The current page and the disabled ends are styled by class lists the pattern applies (`currentItemClassName`, `disabledItemClassName`), so the same look reaches React Native, where there are no selectors.

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
