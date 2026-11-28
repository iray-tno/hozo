# RFC 015: Charts

- **Status**: Phase 1 implemented and `@hozo/charts` published with the next release; pie, donut, area, scatter and sparklines added; a Canvas renderer set aside after [measurement](../measurements/charts-scale.md)
- **Authors**: claude-1
- **Tracking issue**: [#154](https://github.com/iray-tno/hozo/issues/154)
- **Target packages**: new `@hozo/charts`; existing `@hozo/svg`, `@hozo/canvas`, `@hozo/semantics`, `@hozo/behaviors`
- **Budget**: phase 1 in about 8 merged pull requests

## 1. Decision

Add `@hozo/charts`: Bar and Line charts that draw on Web and Native from
one description, with a screen-reader equivalent built from the data and a
keyboard and touch way to reach each value.

The package has one shared layer and thin renderers:

```text
data + chart definition
  -> scales, ticks, layout        (pure TypeScript, no React)
  -> marks                        (plain data: geometry + datum index)
       -> SVG renderer            (@hozo/svg; phase 1)
       -> Canvas renderer         (@hozo/canvas; later)
interaction state, accessible table  <- data, not marks
```

Phase 1 ships the SVG renderer only. The Canvas renderer is a later,
separate decision (§8), but the layer under it is built now so that adding
it is one renderer, not a second chart library.

## 2. Why a shared chart layer, and still no general scene IR

[`docs/proposal.md`](../proposal.md) §15 ("描画 — SVG と Canvas を両方持つ") keeps SVG and Canvas as separate
backends with no shared scene IR, and that stands for Hozo as a whole: the
two have different vocabularies (SVG filters, markers and patterns; Canvas
meshes and many-thousand-point drawing), and an IR covering both would keep
only their intersection.

The decisive argument at the time was events: SVG has a handler per
element, Canvas needed hand-written hit testing, so a shared IR would make
charts that work on SVG and are inert on Canvas. `@hozo/canvas` has since
gained per-leaf `onPress` and `onActiveChange`, a shared hit test and
keyboard reach, so that gap has mostly closed.

What a chart is made of is mostly not drawing: scales from data to pixels,
tick choice, margins, the geometry of each bar or point and which datum it
came from, which point is active, and the table a screen reader reads.
Written twice, once per renderer, those drift. So this layer is shared, and
it is chart-specific: a mark is a bar, a line, a point or a tick, not a
generic shape. Each renderer stays free to use what only it has.

Marks are plain arrays, not React elements, so a Canvas renderer can draw
ten thousand points without creating ten thousand elements.

## 3. API

Data plus definitions, like `WindowedTable` (RFC 014), rather than
children that a chart inspects. A chart has to know every axis and series
before it can lay out any of them; reading that from children means a
second render pass or inspecting element types, both of which the compiler
and the Native renderer handle badly.

```tsx
import { BarChart, LineChart } from '@hozo/charts'

<BarChart
  accessibilityLabel="Revenue by month, 2026"
  data={sales}
  x={{ key: 'month', label: 'Month' }}
  y={{ label: 'Revenue', format: (v) => `$${v.toLocaleString()}` }}
  series={[
    { key: 'online', label: 'Online' },
    { key: 'store', label: 'In store', color: '#0891b2' },
  ]}
  height={240}
/>
```

- `data` is an array of rows; `x.key` names the category (Bar) or the
  independent value (Line) in each row, and each series' `key` names a
  numeric value. A missing or non-finite value is a gap, not zero: Bar
  draws nothing there and Line breaks.
- `accessibilityLabel` is required. A chart with no name is refused at the
  type level, as `Canvas` refuses one.
- `height` is required; width fills the container and is measured
  (ResizeObserver on Web, `onLayout` on Native). `width` may be given to
  skip the measurement, and server rendering uses it when present.
- `color` on a series is a colour value, not a class list. Series
  arrive as data at run time, and on Native `className` is compile-time
  input that a runtime string never reaches, so a class would work on Web
  only. A default palette of six hues applies when it is absent, each
  keeping 3:1 against white and near-black. Theme-token colours are a
  later step, once a runtime token read exists on both platforms.
- Bar has `grouped` (default) and `stacked`. Line has `points` (whether
  each datum gets a dot) and `curve`: `'monotone'` bends through each value
  without overshooting it (Fritsch–Carlson tangents, as d3's
  `curveMonotoneX`), so the drawing never shows a peak the data lacks.

### 3.1 Theme

A chart's look splits in two. What keeps it readable is a default no
option turns off: the series key, tick labels at 4.5:1, and a palette
order checked under colour-vision simulation. What is taste is a theme:

```ts
interface ChartTheme {
  palette?: readonly string[] | { light: readonly string[]; dark: readonly string[] }
  bar?: { radius?: number; maxWidth?: number; gap?: number }
  line?: { width?: number; pointRadius?: number }
  frame?: { grid?: number; axis?: number }   // fractions of the text colour
}
```

- **Two ways to give it.** `<ChartThemeProvider theme>` sets it for
  every chart inside, so an app states it once. A chart's `theme` prop
  goes on top, and a series' own `color` on top of that. A provider
  inside another changes only what it names.
- **One palette or two.** An array is used on light and dark pages
  alike, as the default is: it then has to hold 3:1 against both. A
  `{ light, dark }` pair is picked by the colour scheme, which is the
  system's (`prefers-color-scheme` on Web, `useColorScheme` on Native)
  unless the provider's `colorScheme` names one, for an app with its own
  switch. The server renders light, as React Native Web does.
- **Plain values.** Like a series' `color`, a theme is run-time data, so
  it cannot be a class list on Native.
- **Not in the theme.** Tick label strength, because a lower value breaks
  the contrast floor. The tooltip, which is dark on any page. Font size,
  which stays the `fontSize` prop because the margins are estimated from
  it.

## 4. The shared layer

### Scales

Five, written here rather than taken from `d3-scale`, which brings
`d3-array`, `d3-interpolate`, `d3-format` and `d3-time` with it:

- **linear**, with a "nice" domain and ticks at 1, 2 or 5 times a power of
  ten, as d3 chooses them; the tests compare against d3's choices for a
  fixed set of domains so the result is familiar.
- **band**, for Bar categories, with inner and outer padding.
- **point**, for Line categories.
- **time**, for Line and Area over dates (`x.type: 'time'`): rows are
  placed by when they happened, and ticks fall on minutes, hours, days,
  Monday weeks, months or years, labelled as briefly as the step allows.
  UTC unless asked otherwise, because the server and the browser must draw
  the same ticks.
- **log**, base 10, for a Line or Scatter value axis (`y.scale: 'log'`).
  Bars and areas have none: they measure from zero. A value of zero or
  below is left undrawn and still read in the table and the summary.

### Layout

The plot area is the container minus margins for the axes. Tick labels
cannot be measured synchronously on Native, so phase 1 estimates their
width from the font size and character count, and a `margin` prop
overrides the estimate. Labels that would overlap are thinned to every
n-th tick rather than rotated.

### Marks

```ts
type Mark =
  | { kind: 'bar'; series: number; datum: number; x: number; y: number; width: number; height: number }
  | { kind: 'line'; series: number; path: string; data: readonly number[] }
  | { kind: 'point'; series: number; datum: number; cx: number; cy: number }
  | { kind: 'tick'; axis: 'x' | 'y'; position: number; label: string }
```

A line is an SVG path string because both renderers already take one:
`Path2D` on Web, `react-native-svg`, and Skia's `MakeFromSVGString`.

## 5. Accessibility

The equivalent comes from the data, never from the marks: a table built
from bars and points is worse than one built from the series.

- **Name and table.** Every chart renders a table of its data, named with
  `accessibilityLabel`: the x value per row (a row header) and one column
  per series, through `@hozo/semantics`' table, so Native gets the table
  semantics that component already has. A gap reads "No value", never 0.
  It is visually hidden by default; `showTable` shows it. The drawing
  itself is hidden from screen readers (`aria-hidden`, and
  `importantForAccessibility`/`accessibilityElementsHidden` on Native):
  its tick labels and shapes would only repeat the table less well. The
  table carries the name rather than a wrapping group, so the name is read
  once.
- **One value at a time.** The drawing is one tab stop, a group named
  with `accessibilityLabel` and described as a "chart". Left/Right move the
  active datum along x and Home/End go to the ends; the active datum is
  announced through a polite live region as one sentence with every series,
  "Mar. Online: $90. In store: $60.", so moving along x is the only
  navigation needed (an earlier draft had Up/Down between series; reading
  them all at once made it redundant). On Native the drawing is one
  `adjustable` element: swipe up and down move the active datum, and its
  `accessibilityValue` is the same sentence. The name is therefore heard on
  the tab stop and on the table; each is a different way in.
- **A summary, and no table past 1,000 rows.** The tab stop is described
  by a summary: the categories' range and each series' lowest and highest
  value, gaps counted. Above 1,000 categories the table is left out unless
  `showTable` asks for it, because it was most of the first draw and no one
  reads that many rows ([measured](../measurements/charts-scale.md)); the
  summary says so, and Page Up/Page Down move a tenth of the data.
- **Pointer and touch.** Hover on Web and touch on Native set the same
  active datum, so the tooltip, the announcement and the keyboard share
  one state. The tooltip is drawn in the SVG, so both platforms share it:
  a band behind the datum, a ring on each line's value, and a dark box
  listing every series there.
- **Colour.** Series are never told apart by colour alone in the tooltip
  and the table; both carry the series label.

## 6. Native

The SVG renderer runs on `react-native-svg` through `@hozo/svg`'s Native
half, which already exists. Touch uses the chart root's responder, not a
handler per mark, so a thin line or a small point is still reachable: the
nearest datum in x wins.

## 7. Phase 1 and when it stops

1. This RFC.
2. Scales and ticks, with the d3 comparison tests.
3. Layout and marks for Bar and Line.
4. The SVG renderer and `BarChart`/`LineChart` on Web.
5. Native: the same charts in `examples/native-demo`, with its checks.
6. The accessible table and name.
7. Active datum, keyboard, touch and tooltip.
8. Storybook stories under the axe audit, and documentation.

Phase 1 stops when Bar and Line render on Web and Native, appear in
Storybook and native-demo, and pass the axe audit and the Native checks.
What is then left is decided afresh, not continued by default.

## 8. Not in phase 1

- **Canvas renderer**, for data too large for one element per mark. It
  needs a measurement of where SVG stops being enough before it is worth
  building; the shared layer is ready for it.
  [Measured](../measurements/charts-scale.md): at 20,000 bars the SVG
  elements are about 100 ms of a 457 ms first draw and the accessible
  table 351 ms, and Line draws one element per series at any size. Large
  data needs a different accessible equivalent before a second renderer.
- Pie and donut, area, sparklines, horizontal bars, scatter, bars with lines and reference lines have since
  been added (#2339). A scatter point has no category, so the rows are
  read in x order, each named and given its x value.
- A key above the plot for two or more series, a palette order checked
  under colour-vision simulation, capped bars with a rounded value end,
  and a quieter frame have since been added; how much of that a user can
  change is the theme in §3.1.
- Monotone curves, a time axis and a log value axis have since been added.
- **Brushing and zoom, animation.**

## 9. Open questions

- Whether `aria-activedescendant` on an SVG element is read reliably
  across Chrome, Safari and Firefox with their screen readers. The live
  region in §5 works without it; this decides whether it can be dropped.
- Whether the estimated tick-label width is close enough on Native, or
  phase 1 needs a measured pass for the y axis.
