# @hozo/form

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
