# @hozo/behaviors

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

- [#821](https://github.com/iray-tno/hozo/pull/821) [`ad1ad0b`](https://github.com/iray-tno/hozo/commit/ad1ad0b355c6ecae07372f44a65aed279e539e22) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `FileDropzone`. It is a button that opens the file picker, with dropping files on it as a shortcut on the Web. Every pick is sorted by `accept`, the size limits and the count, and what was added and what was refused (with each reason) is announced in one sentence. On React Native it opens the application's `pickFiles`, or `expo-document-picker` when installed. With neither, it is disabled and says no picker is available.

- [#809](https://github.com/iray-tno/hozo/pull/809) [`70cc763`](https://github.com/iray-tno/hozo/commit/70cc763166d3f3aa04c466c5a12e7a8a4dba0a0f) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `OtpInput`, for a one-time code or a PIN. It is one real input drawn as cells, so a screen reader finds one field ("Verification code, 6 characters"), and a pasted or autofilled code lands at once. It asks each platform for a one-time code: `autocomplete="one-time-code"` on the Web, `textContentType="oneTimeCode"` on iOS and `autoComplete="sms-otp"` on Android. `mask` turns it into a PIN. The active and filled cells are styled by class lists the pattern applies, so the look reaches React Native as well.

- [#797](https://github.com/iray-tno/hozo/pull/797) [`9a33076`](https://github.com/iray-tno/hozo/commit/9a3307689c1a37847d45bea9083cee1f63c7edba) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Pagination`: numbered pages with previous and next, inside a `<nav>` named "Pagination". The current page is marked with `aria-current="page"` (`selected` on Native), and the ends are disabled in place rather than removed. With `getPageHref` every page is a link, which on Native goes through the installed router. The current page and the disabled ends are styled by class lists the pattern applies (`currentItemClassName`, `disabledItemClassName`), so the same look reaches React Native, where there are no selectors.

- [#798](https://github.com/iray-tno/hozo/pull/798) [`030d179`](https://github.com/iray-tno/hozo/commit/030d1791515ef5523560c38c1788e4b23f6bfd92) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Stepper`: where a person is in a process of several steps. Each step is read with its position and status in words ("Step 2 of 3: Profile, current"), so the status is never carried by colour alone. The current step is marked `aria-current="step"` on the Web and `selected` on Native. With `onStepPress` the steps are buttons. Each status has class lists for the step and its indicator, applied by the pattern, so the look reaches React Native as well.

## 0.2.0

- Add headless `usePresence` with `PresenceBinding` / `PresenceState` for shared exit lifecycles.
- Let FocusScope place its first focus into a panel mounted after the scope.
- Support application injection of the optional Android accessibility-focus mover; keep absence of the native module a supported fallback.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.
