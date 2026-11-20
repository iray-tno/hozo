# RFC 014: Windowed Table

- **Status**: Declared-width/fixed-height slice implemented; Native reader speech remains unverified
- **Authors**: codex-2
- **Tracking issue**: [#1373](https://github.com/iray-tno/hozo/issues/1373)
- **Implementation**: [#2130](https://github.com/iray-tno/hozo/issues/2130) (at most two merged PRs)
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

The first production slice has this shape:

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
| Web markup | Header associations, total rows/columns, unchanged full-row rendering | WindowedTable SSR test: all 1,000 rows, column widths and header associations |
| Native structure | Absolute indices, full header/value labels, row-key recycling | Host tests cover metadata, lazy callbacks, append/reorder and compiled core routing; Android release-APK jump/return retains full labels and pixel alignment |
| Android TalkBack | First/last visible row, jump past one window, return to a focused control | Not measured by this performance probe |
| iOS VoiceOver | Header/value naming and navigation across recycled rows | Not measured |
| Window bounds | Initial mount stays bounded as data grows; later scroll/jump/return also stays bounded | Production source: initial 15 rows at 100/500/1,000 data rows; 25 after the 1,000-row jump, 15 after return; details below |
| Sizing | Declared widths stay exact and cause zero natural-width reports; estimation/growth belongs to later work | Chromium/Yoga agree at widths 1/8/64 and row heights 1/4/32/64; Android checks fixed columns, horizontal overflow and caller-recomputed height at font scale 1.3 |

No screen-reader or physical-device approval is inferred from release-emulator
mount measurements. Unmounted Native rows are absent from the accessibility
tree. Overscan and the initial render batch can remain mounted outside the
viewport, and Android can expose clipped/inverted bounds for those nodes.
Document that reachability limitation and test scrolling to real visible
rows. Interactive cells require focused-row retention before supported.

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

The design/measurement task #1373 is closed. The declared-width/fixed-height
production slice in [#2130](https://github.com/iray-tno/hozo/issues/2130)
finishes with [#2134](https://github.com/iray-tno/hozo/pull/2134) followed by
[#2135](https://github.com/iray-tno/hozo/pull/2135), within its two-merged-PR
budget. Its stop condition is the public API, full semantic Web rows, bounded
Native mounts through jump/return, stable keys/labels/indices, fixed geometry
and a source-bound production comparison. The evidence below meets that bar;
the Native AT and physical-device gaps above remain explicitly unverified.
Any text estimation/growth implementation is separate work with its own
measurement and recycling tests; it is not required to close #2130.

## 7. Production slice evidence (2026-11-21)

The [fresh release/Hermes producer](https://github.com/iray-tno/hozo/actions/runs/44757999733)
built source `fc3c2a5ec36c923f07910d2b96d2297efce37cb1`. It completed
all 20 mount cases: two excluded 100-row warmups and three samples of each
mode/size. Both controls use 16px text, 24px line height and 4px cell padding;
the windowed table uses widths `[64, 96, 96, 96]`, 32dp rows and a 240dp viewport.
This matches the production component's text fixture, rather than mixing it
with the earlier 14px prototype. Host: four AMD EPYC 9V74 vCPUs; Android API 36,
x86_64, Google APIs image, swangle, React Native 0.88.1 and React 19.3.

| Data rows | Table first boundary / quiet began (median ms) | WindowedTable first boundary / quiet began (median ms) | Natural-width reports, Table / windowed | Peak mounted rows, Table / windowed |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 363.9 / 363.9 | 35.9 / 188.0 | 404 / 0 | 101 / 15 |
| 500 | 1239.9 / 1492.6 | 35.2 / 132.9 | 2004 / 0 | 501 / 15 |
| 1,000 | 1442.8 / 2861.9 | 33.1 / 171.4 | 4004 / 0 | 1001 / 15 |

The [raw 20-case CSV](../measurements/windowed-table-production-2026-11-21.csv)
keeps every sample and warmup. No outlier was removed. These boundaries retain
the JS/layout definition in section 5; quiet confirmation adds 30 stable rAFs.
They compare complete fixed-width/windowed and automatic-width/full-mount
strategies, without attributing the difference to windowing alone or claiming
GPU presentation or physical-device memory performance.

The producer's overall job subsequently failed in a window-check collector:
`Region, West` repeats across rows, and the selector chose a clipped overscan
node instead of the target row. The corrected collector associates cells with
a unique ID/Name/Total in the same row. Replaying the retained frames with
`verify-table-captures.mjs <artifact> --matrix-only` verifies all 20 complete
mount cases while retaining the original failed verdict and excluding windows.
The default verifier continues to require a successful whole recorded run.

The [successful window-only diagnostic](https://github.com/iray-tno/hozo/actions/runs/44767582409)
uses that exact APK, SHA256
`aee19e5b3bba545d5c73d4ca709bf110abfb2aa41ba1997b7317af521fc73216`.
Its driver is `9cb72067f5ee39aea718744a548e4c7cf2c18785`; a Git comparison
accepts only the named collector/verifier/test files and documentation. It
does not claim a fresh build of the driver revision. Native source SHA256 is
`464a0dc212416a9c3c6d88383a84252d428e6f3a761139b7d427d2cc67f598e4`;
the unchanged key/size model is
`d53aaf9fd216e8f09e757abeb70573b0a5eed8c0d0bd6fb98876c52430c14cd0`.

| Window checkpoint | Live rows | Peak rows in that mount | Cumulative row mounts |
| --- | ---: | ---: | ---: |
| Initial 1,000-row window | 15 | 15 | 15 |
| Jump to data row 999 | 25 | 25 | 31 |
| Return to the first row | 15 | 25 | 37 |
| Horizontal overflow in a 220dp viewport | 15 | 25 | 37 |
| Fresh mount at system font scale 1.3, caller row height 41.6dp | 12 | 12 | 12 |

The [window CSV](../measurements/windowed-table-windows-2026-11-21.csv)
records this separate cohort (four Intel Xeon Platinum 8573C vCPUs). Its one
excluded readiness mount supplies no new timing medians. All five checkpoints
pass full header/value naming, visible text pixels, fixed dimensions and
bounded mounts; the last row leaves the window on return. The retained-frame
verifier rechecks the readiness frame and all five checkpoints. The original
system font setting is restored. Diagnostic scroll commands use an observed
backing-list ref, with no new public imperative API.

The header and initial eight data rows stay mounted after the jump, along with
the current overscan window. Android's tree includes some offscreen nodes with
clipped/inverted bounds; they are not evidence that a row is visible. This is
why the Native reader-navigation/total-count limitations remain explicit.
Native interactive cells, variable heights, automatic widths, Web windowing,
physical-device performance and TalkBack/VoiceOver approval are outside this
completed slice. No further implementation is implied by closing #2130.
