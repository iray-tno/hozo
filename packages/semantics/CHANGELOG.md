# @hozo/semantics

## 0.3.0

### Minor Changes

- [#800](https://github.com/iray-tno/hozo/pull/800) [`18a0e93`](https://github.com/iray-tno/hozo/commit/18a0e93cac8a778ca919c23d0ccfe7a65c506ef6) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Table`, `TableCaption`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead` and `TableCell`.
  
  - **Web:** they are the table elements themselves, and a header cell is `scope="col"` unless the author says otherwise.
  - **React Native,** which has no table:
    - Each column is as wide as its widest cell, the way the browser's automatic table layout does it. A table is shrink-to-fit by default, shares out the spare room in proportion with `w-full`, shrinks its columns to fit when too wide, or scrolls sideways with `scrollable`.
    - A data cell is read with its column's header ("Price, $12").
    - Each cell carries its row and column for TalkBack.

### Patch Changes

- [#794](https://github.com/iray-tno/hozo/pull/794) [`42d0e77`](https://github.com/iray-tno/hozo/commit/42d0e7772061d498b1bc2a1ae170cea93607ba10) Thanks [@iray-tno](https://github.com/iray-tno)! - `Meter` now draws its bar on React Native: a track, a fill as wide as the amount, and the fill coloured by `low`, `high` and `optimum` the way Chrome colours `<meter>`. Before, Native rendered an empty 80 x 16 box. The author's `className` styles the track. The compiled and uncompiled paths are now one component, `HozoMeter`.

- [#802](https://github.com/iray-tno/hozo/pull/802) [`8a7c8c7`](https://github.com/iray-tno/hozo/commit/8a7c8c73dc20d025a10ae5fe472bb81dc8659ce7) Thanks [@iray-tno](https://github.com/iray-tno)! - On the Web, a `<meter>` now carries its amount as a percentage in `aria-valuetext`, as Native already did. Without it, NVDA read `<Meter value={0.6}>` as "progress bar, 0.6" and VoiceOver as "0.6". An author's own `aria-valuetext` still wins.
  
  A `Stepper` step's description is now separated from its status by a space a reader keeps. Before, VoiceOver read "completedEmail and password".

- [#804](https://github.com/iray-tno/hozo/pull/804) [`714cb5a`](https://github.com/iray-tno/hozo/commit/714cb5a934d99b93ef9221545eff0dc0db11bf65) Thanks [@iray-tno](https://github.com/iray-tno)! - A `TableCell` (and `TableHead`) takes a `ref` to its cell element on both platforms, for focusing it or measuring where it landed.
  
  On Native, a table's header cells no longer carry `accessibilityRole="header"`, which made TalkBack read row headers as headings too. A column header is still read as a heading ("Price, Heading"), through its collection item.
- Updated dependencies [[`80f2686`](https://github.com/iray-tno/hozo/commit/80f2686ace0922e27502695d0b88c1dba2e08be0), [`adfe1fd`](https://github.com/iray-tno/hozo/commit/adfe1fd914d60effc27677efdaee6edf19feaf6b), [`496f1b7`](https://github.com/iray-tno/hozo/commit/496f1b75e06bc5f5b079870ce566754e7161c21a), [`ad1ad0b`](https://github.com/iray-tno/hozo/commit/ad1ad0b355c6ecae07372f44a65aed279e539e22), [`70cc763`](https://github.com/iray-tno/hozo/commit/70cc763166d3f3aa04c466c5a12e7a8a4dba0a0f), [`9a33076`](https://github.com/iray-tno/hozo/commit/9a3307689c1a37847d45bea9083cee1f63c7edba), [`030d179`](https://github.com/iray-tno/hozo/commit/030d1791515ef5523560c38c1788e4b23f6bfd92)]:
  - @hozo/behaviors@0.3.0
  - @hozo/engine@0.3.0

## 0.2.0

- No package-specific public API change. Release in lockstep with the compiler, engine and component owners at 0.2.0.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/engine@0.2.0
  - @hozo/behaviors@0.2.0
