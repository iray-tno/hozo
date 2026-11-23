# @hozo/form

## 0.5.0

### Minor Changes

- [#2088](https://github.com/iray-tno/hozo/pull/2088) [`e405d06`](https://github.com/iray-tno/hozo/commit/e405d0670a81f1e62cba4d359891ee04d780ef94) Thanks [@iray-tno](https://github.com/iray-tno)! - Migrate `@hozo/form`'s `Field` (all 5 slots) and `TextArea` (all 3 slots) to audited owner contracts and route their literal class props through the prepared Web/Native path by default (supporting `Text` and `TextInput` leaf hosts, empty `authoredStyles`, and `readOnly`/`aria-invalid`/`aria-required` owner facts).

- [#2088](https://github.com/iray-tno/hozo/pull/2088) [`ce37d65`](https://github.com/iray-tno/hozo/commit/ce37d65abf5c33baf3ac03f0e14e0383325d264f) Thanks [@iray-tno](https://github.com/iray-tno)! - Migrate `@hozo/form`'s `NativeSelect` root control (`className`) to an audited owner contract (`hozoSelectStyle`) and route its literal class props through the prepared Web/Native path by default.

- [#2088](https://github.com/iray-tno/hozo/pull/2088) [`6202509`](https://github.com/iray-tno/hozo/commit/6202509a9dcbc5f70a789f71181ad60cdf0d37c3) Thanks [@iray-tno](https://github.com/iray-tno)! - Migrate `@hozo/form`'s `Calendar` (all 5 slots: `className`, `headerClassName`, `gridClassName`, `monthButtonClassName`, `dayClassName`) to audited owner contracts and route their literal class props through the prepared Web/Native path by default (supporting stateless split-text `View` hosts, `table`/`td` web hosts, and `data-hozo-*` calendar cell owner facts; also adding missing `data-hozo-disabled` on Web `Calendar` month buttons).

- [#2088](https://github.com/iray-tno/hozo/pull/2088) [`70d5d22`](https://github.com/iray-tno/hozo/commit/70d5d228ee2a47aa343290d1bdeca9438ea86e15) Thanks [@iray-tno](https://github.com/iray-tno)! - Migrate `@hozo/form`'s `DatePicker` (8 slots), `DateRangePicker` (8 slots), and `DateTimePicker` (9 slots) to audited owner contracts and route their literal class props through the prepared Web/Native path by default (supporting `aria-expanded` owner facts, forwarding prepared `Calendar` carriers, and adding missing `data-hozo-disabled` on Web picker triggers).

- [#2080](https://github.com/iray-tno/hozo/pull/2080) [`8e7ebb0`](https://github.com/iray-tno/hozo/commit/8e7ebb0db6f0712b255717e8041a692a719dde23) Thanks [@iray-tno](https://github.com/iray-tno)! - `@hozo/patterns`, `@hozo/form` and `@hozo/ui` now ship version 2 of `hozo.manifest.json`. It carries the package's exports, with the compiler primitive each one is where it is one, the owner contracts per class prop, `textPublish` (the pattern components that render a string child inside a `View`), the classes the package's own code requests, its class joiners, and whether its sources are compiled by the consumer. `@hozo/form` ships a manifest for the first time.
  
  The compiler reads `textForwarding` from version 1 and version 2 alike, and still reads the version 1 files that `hozo manifest` writes. A compiler from before this release reads nothing from a version 2 manifest, so upgrade `@hozo/compiler` together with these packages, or text styles handed to a nested Text from `@hozo/ui`'s components are lost on React Native.

### Patch Changes

- [#2085](https://github.com/iray-tno/hozo/pull/2085) [`25b982a`](https://github.com/iray-tno/hozo/commit/25b982a01af4aced3c574a12168bad7737aa51e8) Thanks [@iray-tno](https://github.com/iray-tno)! - Migrate `@hozo/form`'s `Form`, `SubmitButton`, and `FileDropzone` (`className`) to audited owner contracts and route their literal class lists through the prepared path by default on Web and Native ([#2045](https://github.com/iray-tno/hozo/issues/2045)).

- [#2088](https://github.com/iray-tno/hozo/pull/2088) [`6bf74bf`](https://github.com/iray-tno/hozo/commit/6bf74bfe5d7a6ab5daec57684e7bf714664c6e2c) Thanks [@iray-tno](https://github.com/iray-tno)! - Route `TimePicker` across all five slots (`className`, `fieldClassName`, `valueClassName`, `periodClassName`, and `stepClassName`) through audited `@hozo/form` owner contracts and the Native prepared-style carrier path, adding interactive split-text `View` event support and `data-hozo-step` owner facts.

- [#1758](https://github.com/iray-tno/hozo/pull/1758) [`129cf57`](https://github.com/iray-tno/hozo/commit/129cf57606c40599c34352f85caab5a38ab33da0) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `SubmitButton`, the button that submits the enclosing `Form`. On Web it is a real `<button type="submit">`, so Enter in any single-line field submits a form with several fields. On React Native it calls `useFormSubmit()`.

- [#2245](https://github.com/iray-tno/hozo/pull/2245) [`92dd0bf`](https://github.com/iray-tno/hozo/commit/92dd0bfd1da00d8d94ab6e62d6643c4b4a32b7e7) Thanks [@iray-tno](https://github.com/iray-tno)! - Declare Drawer, BottomSheet and NativeSelect's Native scrims as Pressable hosts in their styling contracts. Prepared resting styles and runtime interaction styles continue to use their existing paths.

- [#2097](https://github.com/iray-tno/hozo/pull/2097) [`1c38aa7`](https://github.com/iray-tno/hozo/commit/1c38aa77c632e059773c5dec024458899ea3f1e8) Thanks [@iray-tno](https://github.com/iray-tno)! - Support explicit single-platform owner contract shapes (`nativeHost: null` or `webHost: null`) and migrate the remaining five `@hozo/form` slots (`FileDropzone.activeClassName` on Web; `NativeSelect.{indicatorClassName,sheetClassName,scrimClassName,optionClassName}` on Native), bringing `formPendingOwners` to `0`.
- Updated dependencies [[`cb4b456`](https://github.com/iray-tno/hozo/commit/cb4b4564ddb95d7ecb6f729433bf5c956788b53e), [`ba5beaf`](https://github.com/iray-tno/hozo/commit/ba5beaf2fbaff50a5b6bb1595ee156cae9dd5a1c), [`43d6add`](https://github.com/iray-tno/hozo/commit/43d6add1b83dce0acda189ce9a1b610fb4a9d70d), [`0001fc4`](https://github.com/iray-tno/hozo/commit/0001fc442e38955770974fb5377002e4deb4b95f), [`ed04074`](https://github.com/iray-tno/hozo/commit/ed04074de82890b87590afb537a0bea99b2751a7), [`6cf46e3`](https://github.com/iray-tno/hozo/commit/6cf46e30640459d327305ffce8b38d26e27b3a9b), [`052b447`](https://github.com/iray-tno/hozo/commit/052b447351a669a12c5b8ced61bef5d07dc8a604), [`43680e3`](https://github.com/iray-tno/hozo/commit/43680e3643ba9f3f6e01f5c7aa885feb8e5c7b04), [`35cc5c3`](https://github.com/iray-tno/hozo/commit/35cc5c31ce90497de9a6f345e884af2d20a6bc60), [`5c823ee`](https://github.com/iray-tno/hozo/commit/5c823ee87f1996f7011290af68702ef7f19e5388), [`70643e9`](https://github.com/iray-tno/hozo/commit/70643e959d229a75fcdbd1316f9a972efb4a2622), [`3a3a8d5`](https://github.com/iray-tno/hozo/commit/3a3a8d52d64d0d580d9afaa298977c5c33f295f2), [`45eda5b`](https://github.com/iray-tno/hozo/commit/45eda5b451bdf1449c7c16172c03b2a9e743aaa6), [`cca1211`](https://github.com/iray-tno/hozo/commit/cca1211b176ec411112275399fc582a92a50efbe), [`4f62450`](https://github.com/iray-tno/hozo/commit/4f624503a4fb9f4af6f699f7d2deb55b69a72c36), [`ddd7c73`](https://github.com/iray-tno/hozo/commit/ddd7c73d09768ad8fbcf55c40859729b7271ea1a), [`2d28017`](https://github.com/iray-tno/hozo/commit/2d2801735d14c61193610e74bc6178f15b79d07e), [`cabc969`](https://github.com/iray-tno/hozo/commit/cabc9695ae805afa2c690aebcad5657f76f95eac), [`3f1754a`](https://github.com/iray-tno/hozo/commit/3f1754a523e62dc44ccc3da7294e9510e5203302), [`b3cf38b`](https://github.com/iray-tno/hozo/commit/b3cf38b30f2fe748c4f73110d01de2566826355a)]:
  - @hozo/engine@0.5.0
  - @hozo/behaviors@0.5.0

## 0.4.0

### Minor Changes

- [#1597](https://github.com/iray-tno/hozo/pull/1597) [`b3df5b7`](https://github.com/iray-tno/hozo/commit/b3df5b73a8ec104fe407d89472e4339411de311d) Thanks [@iray-tno](https://github.com/iray-tno)! - React Native 0.87 is now the lowest supported version (`react-native: >=0.87`), and `@hozo/media`'s Expo peers move to SDK 58 (`expo-video`, `expo-audio` and `expo-asset` `>=58 <59`). Native gradients go under `backgroundImage` again: the `experimental_backgroundImage` spelling existed only for React Native 0.86, which read nothing else.

### Patch Changes

- [#1144](https://github.com/iray-tno/hozo/pull/1144) [`54aa3b3`](https://github.com/iray-tno/hozo/commit/54aa3b34fe5628f0d90a6171ca51a6238a62a44e) Thanks [@iray-tno](https://github.com/iray-tno)! - On the Web, `DatePicker`, `DateRangePicker` and `DateTimePicker` open their calendar in the top layer. The panel was fixed-positioned with no stacking of its own, so positioned content later in the page, such as a code block below the picker, painted over it.

- [#1303](https://github.com/iray-tno/hozo/pull/1303) [`79b0319`](https://github.com/iray-tno/hozo/commit/79b0319e7159d58d4cd15f997d6c1e88e16d6d4a) Thanks [@iray-tno](https://github.com/iray-tno)! - `Accordion` and `NativeSelect` show their chevrons on React Native. `@hozo/patterns`' `Accordion` takes an `indicator` callback, given each header's `expanded` and `disabled`, which draws a hidden node after the header, the same slot `Checkbox`, `Switch` and `RadioGroup` have. `@hozo/form`'s `NativeSelect` takes `indicatorClassName` for a hidden node after the value on React Native; the Web `<select>` draws its own. `@hozo/ui` uses both instead of an `::after` chevron, which React Native cannot draw.
- Updated dependencies [[`4270a72`](https://github.com/iray-tno/hozo/commit/4270a727b14605d7ff5c9831238e60cb518e3ed6), [`1c052da`](https://github.com/iray-tno/hozo/commit/1c052dad66426e8a4acd462c776f161249330c35), [`480e00a`](https://github.com/iray-tno/hozo/commit/480e00a0d6e165b92beb8dbf9310710fcceb7fd1), [`fac2f53`](https://github.com/iray-tno/hozo/commit/fac2f53a7636c7373cf22c4d49fcf5a137bb08ec), [`add3e7b`](https://github.com/iray-tno/hozo/commit/add3e7b2c5a152c770eabee7d09d723e925958e1), [`e4734c8`](https://github.com/iray-tno/hozo/commit/e4734c832c6469edc4ba88a7e09209b2b2ccd29b), [`b59995e`](https://github.com/iray-tno/hozo/commit/b59995e108e4cc9b6d093c2487cebece0d02a707), [`d5a1a1e`](https://github.com/iray-tno/hozo/commit/d5a1a1ee6a55dd50c6c2f91289a11a8665dd9d74), [`c1ca21a`](https://github.com/iray-tno/hozo/commit/c1ca21afee0e3f4dd92110570f3ff3775b01c4cf), [`5cbbb5d`](https://github.com/iray-tno/hozo/commit/5cbbb5de2ba68dd8e44c1939535a84f5325bb950), [`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb), [`c4696a4`](https://github.com/iray-tno/hozo/commit/c4696a4660ceb546fc9e29bc18d1fe73979681e5), [`b3df5b7`](https://github.com/iray-tno/hozo/commit/b3df5b73a8ec104fe407d89472e4339411de311d), [`c9a3b4d`](https://github.com/iray-tno/hozo/commit/c9a3b4d61541024c66165c91a4b7e2a75c9a203c), [`416d627`](https://github.com/iray-tno/hozo/commit/416d627e8afc6a3f321c95dbe1f74b630d173d7b), [`37a9151`](https://github.com/iray-tno/hozo/commit/37a915152634d8e25dfa9b2958661d4bc8f0a134)]:
  - @hozo/behaviors@0.4.0
  - @hozo/engine@0.4.0

## 0.3.0

### Minor Changes

- [#821](https://github.com/iray-tno/hozo/pull/821) [`ad1ad0b`](https://github.com/iray-tno/hozo/commit/ad1ad0b355c6ecae07372f44a65aed279e539e22) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `FileDropzone`. It is a button that opens the file picker, with dropping files on it as a shortcut on the Web. Every pick is sorted by `accept`, the size limits and the count, and what was added and what was refused (with each reason) is announced in one sentence. On React Native it opens the application's `pickFiles`, or `expo-document-picker` when installed. With neither, it is disabled and says no picker is available.

### Patch Changes

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Uncompiled View, Text and Image forward refs to their platform hosts. Container measurement preserves the host instead of replacing it, and Web View layout defaults agree between compiled output and fallback components.
  
  An uncompiled Svg now uses its accessibility label as its name, as the compiled path already did. Web controls, including generated Canvas controls and form/pattern actions, show the shared clickable cursor without giving disabled controls an active pointer.

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `HozoI18nProvider`, `hozoMessages`, locale/direction hooks and structural adapters for i18next and react-intl. Hozo's component labels, status descriptions and announcements can use the application's existing translation catalog, with English fallback messages. Hozo connects to an i18n library; it does not introduce a second translation engine or require one of these libraries as a dependency.
- Updated dependencies [[`80f2686`](https://github.com/iray-tno/hozo/commit/80f2686ace0922e27502695d0b88c1dba2e08be0), [`adfe1fd`](https://github.com/iray-tno/hozo/commit/adfe1fd914d60effc27677efdaee6edf19feaf6b), [`496f1b7`](https://github.com/iray-tno/hozo/commit/496f1b75e06bc5f5b079870ce566754e7161c21a), [`ad1ad0b`](https://github.com/iray-tno/hozo/commit/ad1ad0b355c6ecae07372f44a65aed279e539e22), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`70cc763`](https://github.com/iray-tno/hozo/commit/70cc763166d3f3aa04c466c5a12e7a8a4dba0a0f), [`9a33076`](https://github.com/iray-tno/hozo/commit/9a3307689c1a37847d45bea9083cee1f63c7edba), [`030d179`](https://github.com/iray-tno/hozo/commit/030d1791515ef5523560c38c1788e4b23f6bfd92)]:
  - @hozo/behaviors@0.3.0

## 0.2.0

- Introduce Calendar, DatePicker, DateRangePicker, TimePicker and DateTimePicker, including range selection, controlled month, locale-aware formatting and shared date/time arithmetic.
- Add Form submission/invalid-control coordination and TextArea sizing/count feedback.
- Add NativeSelect: browser select, iOS ActionSheet, modal-list fallback and an application-injected Native presenter.
- Include Web keyboard, virtual/real-reader and Native accessibility evidence. The unstyled controls still require application styling or the styled UI layer.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/behaviors@0.2.0
