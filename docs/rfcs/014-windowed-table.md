# RFC 014: Windowed Table

- **Status**: Draft; declared-width measurement and API proposal ready for review
- **Authors**: codex-2
- **Tracking issue**: [#1373](https://github.com/iray-tno/hozo/issues/1373)
- **Target packages**: `@hozo/patterns`, `@hozo/core`; existing `@hozo/semantics` Table and `@hozo/primitives` FlatList
- **Baseline**: main `1b655da6`; measurement source and run recorded below

## 1. Decision and motivation

Add a separate, opt-in, data-based `WindowedTable` in patterns, re-exported
through core. Existing Table keeps its JSX children, browser table layout and
Native natural-width sizing. A caller choosing windowing supplies data,
stable row keys and column definitions; constructing every row's JSX before
selecting a window would retain much of the mounting cost.

Start with Native windowing, declared column widths and fixed row heights.
Reuse HozoFlatList's existing Native backing. Web initially renders every
row as a semantic HTML table: browser find, selection and table navigation
remain available. Web row windowing needs a separate decision and browser/AT
evidence. The Native measurement here does not justify changing Web output.

The diagnostic prototype is a performance control, without public exports.
It does not implement the proposed component's table accessibility contract.

## 2. Data and width contract

The first production slice has this shape (a proposal, not an available API):

```tsx
import type { ReactNode } from 'react'

type WindowedTableColumn<Row> = {
  key: string
  header: string
  width: number
  getText: (row: Row) => string
  renderCell?: (text: string, row: Row) => ReactNode
}

type WindowedTableProps<Row> = {
  data: readonly Row[]
  getRowKey: (row: Row) => string
  columns: readonly WindowedTableColumn<Row>[]
  rowHeight: number
  maxHeight: number
  accessibilityLabel: string
}
```

Widths and heights are finite positive logical pixels; empty or duplicate
column keys and duplicate row keys are invalid. Column order is array order.
Headers do not consume a data row key. Row height includes padding/borders.
Cells fit that height, with full `getText` values available to accessibility.
The initial slice supports noninteractive text and decoration; interactive
cells need the focus-retention work below. Callers recompute row height for
font-scale changes. A render
callback is called only for mounted/overscan rows on Native. No eager JSX
children API is offered. Web executes render callbacks for all rows.

Declared widths win over estimates and measurement. When every column has a
declared width, mounting a row must never run natural-width cell probes.
The shared width vector controls header and body. Horizontal scrolling is
separate from the vertical FlatList viewport when their sum exceeds its width.
Scrolling, data append/reorder and remounting cannot choose a new row key.

### Later text estimation and monotonic growth

This is a subsequent implementation slice; the present prototype measures
declared widths only. Its rules are settled here so fixed widths do not
become an incompatible API corner:

1. A declared `width` remains exact. Otherwise a plain-text column uses its
   data-only `getText` getter and may supply a finite positive `estimatedWidth`.
   Arbitrary React content needs a declared width; offscreen render callbacks
   are never executed to discover text or measure content.
2. Without an explicit estimate, inspect data text and the header, retaining
   the five highest weighted-length candidates per column. CJK/emoji weighting
   and the chosen font size give an initial estimate, bounded by column
   minimum/maximum widths. This scan is O(rows × text columns), stores five
   candidates per column and allocates no offscreen React trees. It is a
   font heuristic, with no claim to know shaped proportional-font widths.
3. Observe natural text widths only for mounted/overscan rows. Text-only
   measurement content is hidden from accessibility. A larger observation
   grows the shared width, up to the maximum; a smaller one never shrinks it.
   Batch width changes once per layout cycle. The header always uses the same
   vector. Declared columns do not participate in this observer path.
4. A fast fling/jump may reveal a wider value and widen a column. Document
   that visible effect. Fixed-height rows preserve the vertical row key and
   pixel offset; preserve the horizontal anchor by column key and offset
   when preceding columns grow. Clamp anchors when data/columns disappear.
5. Data append/filter/reorder keeps learned widths. Font family/size/scale,
   column identity or explicit sizing-reset identity starts a new sizing
   epoch, in which widths may shrink back to their initial estimates. The
   reset identity belongs to the later sizing API, not this initial slice.

Merged cells, variable row heights, editing, sorting, selection, pinned
columns and a second virtualization engine are outside the initial feature.
Callers needing spanning/automatic document-style layout keep using Table.

## 3. Layering and compiler contribution

Patterns owns the data/window lifecycle and column sizing policy. Reuse the
existing FlatList implementation, and extract shared Table text/header
semantics only where production implementation needs them. There is no new
compiler primitive, class resolver or engine merger in this RFC. Normal
style lowering and package manifests apply to any new public component/slots.
Core exports and package metadata continue to come from their generators.

Web uses table, thead, tbody, tr, th and td, with explicit header associations.
Declared widths use a colgroup and fixed table layout at the sum of widths;
an outer horizontal scroller handles overflow. Rendering all Web rows is an
explicit first-release tradeoff. A future Web window must set total
aria-rowcount/aria-colcount and absolute aria-rowindex/aria-colindex and prove
keyboard and screen-reader navigation across unmounted rows.

## 4. Native accessibility and focus

Keep header text in each data-cell label, the existing Table convention;
provide absolute row/column metadata from the data index, including the
header-row offset. Do not report the number of mounted rows as the total.
An accessible table label can state total data rows/columns while the
collection API is unavailable, but does not claim collection navigation.
Changing a sizing estimate must not announce a new table or re-mount the
focused row. Recycled rows must discard old keys, text labels and focus refs.

Do not restore Android `accessibilityCollection` as part of this feature.
[#525](https://github.com/iray-tno/hozo/issues/525) tracks its upstream crash.
The installed RN 0.88.1 delegate still casts each direct child's collection
item with non-null `as ReadableMap`; FlatList spacer/header views can lack
that tag. A successful performance run without TalkBack cannot validate it.
Use the existing safe FlatList wrapper and retain the upstream restriction.

| Surface | Required proof before production completion | Present evidence |
| --- | --- | --- |
| Web markup | Header associations, total rows/columns, unchanged full-row rendering | Existing Table covers the baseline; new API pending |
| Native structure | Absolute indices, full header/value labels, row-key recycling | New API pending |
| Android TalkBack | First/last visible row, jump past one window, return to a focused control | Not measured by this performance probe |
| iOS VoiceOver | Header/value naming and navigation across recycled rows | Not measured |
| Window bounds | Initial mount stays bounded as data grows; later scroll/jump/return also stays bounded | Initial mount diagnostic below; later recycling pending |
| Sizing | Fixed columns cause zero natural-width reports; later widths grow once per epoch and reset deliberately | Fixed-width diagnostic below; later sizing pending |

No screen-reader or physical-device approval is inferred from release-emulator
mount measurements. Offscreen Native rows are absent from the accessibility
tree, as in FlatList; document that reachability limitation and test scrolling
to them. Interactive cells require focused-row retention before supported.

## 5. Measurement

The [fresh release run](https://github.com/iray-tno/hozo/actions/runs/44691410353)
passed at `d37733131e02ac64cd8d97b3bf7518da2423e7f4`: API 36, x86_64 Pixel 6,
Google APIs image, `swangle`, Hermes; React 19.3.0 / React Native 0.88.1.
The Linux host exposed four CPUs (AMD EPYC 9V74). APK SHA256:
`896ce9fe890bb3481f19db9957af07bd747e42674de56e079db37a3c8e9056a6`.
Native Table source SHA256:
`0f3b95cbdcf3e5d1772f63a2c25dec0ca980d931d36744ab5c27535f6c3f0cfa`.

Four ASCII text columns, 14px font / 24px line height / 4px cell padding,
100, 500 and 1000 data rows. Header rows are additional. Both strategies
have a 240dp viewport. The control declares `[64, 96, 96, 96]` widths,
32dp rows, eight initial rows, batches of eight and `windowSize=3`.
Native clipped-subview removal is disabled for the control; its cell views
are retained. Ordinary Table keeps its natural-width algorithm. No scrolling,
text extraction or width estimation is timed. Fixtures are prepared before
the input handler. The row/cell observers have overhead in both strategies.

Each strategy gets one excluded 100-row warm-up, then three fresh mounts per
size. Strategy order alternates by round. All 20 captures also pass retained
frame verification for all four headers and first-row values: node bounds
and actual text pixels agree. The committed raw samples include warm-ups in
[windowed-table-2026-11-20.csv](../measurements/windowed-table-2026-11-20.csv).
The Table and fixture/generator hashes match the measured source. The later
pixel verifier was replayed over these retained frames and adds no timing
samples.

Medians of three samples; times in milliseconds:

| Data rows | Strategy | Initial observation | Quiet streak began | Quiet confirmed | Natural-width reports | Peak committed rows |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 100 | normal | 234.8 | 296.2 | 781.8 | 404 | 101 |
| 100 | windowed | 36.2 | 200.2 | 699.6 | 0 | 15 |
| 500 | normal | 770.5 | 1009.7 | 1499.6 | 2004 | 501 |
| 500 | windowed | 35.9 | 156.8 | 667.0 | 0 | 15 |
| 1000 | normal | 1436.6 | 2919.8 | 3416.3 | 4004 | 1001 |
| 1000 | windowed | 36.5 | 166.7 | 666.5 | 0 | 15 |

The initial observation runs from the input handler to resolved columns and
observed cell layouts. Quiet starts when counters stop changing and rAF gaps
stay at most 34ms; confirmation waits 30 such frames. The fixed confirmation
period is included only in the "Quiet confirmed" column. These boundaries
measure JS/layout observations, with no GPU presentation-fence claim. Pixel
checks occur after the observation window and supply eventual content proof.

The first 1000-row normal observation was 6303.7ms; the later two were 1436.6
and 1400.4ms. Retain that cold/host variation; three samples do not establish
a stable latency limit. Both modes were compared within the same binary/run.
Fixed widths and row windowing are combined in the control, so this does not
attribute the difference to windowing alone. The deterministic evidence is
bounded initial committed rows (15 at every size) and zero natural probes,
against `(data rows + 1) × 4` natural reports in ordinary Table.

This establishes the value of the declared-width initial slice. Physical
devices, sustained scroll/jump/recycling behavior, memory, frame jank,
non-ASCII/proportional-font estimates, width growth and assistive-technology
navigation remain separate production checks. The control does not ship
table accessibility semantics. Web remains unwindowed and has no performance
claim from these Native results. Reproduction and archive verification are
documented in [the showcase README](../../examples/native-showcase/README.md#table-mount-measurement).

## 6. Completion boundary

This RFC and its diagnostic close the design/measurement task #1373 when
reviewed and merged. They do not ship WindowedTable. Production work starts
in [#2130](https://github.com/iray-tno/hozo/issues/2130), with declared
widths/fixed heights and the accessibility checks above. Text
estimation/growth follows with its own measurement and recycling tests.
