# @hozo/charts

Bar, Line, Area, Composed (bars and lines), Scatter, Pie, Donut, Funnel, Treemap, Radar and RadialBar charts, and sparklines, that a screen reader, a keyboard and a finger can all use, drawn with
[`@hozo/svg`](https://www.npmjs.com/package/@hozo/svg) on the Web and React Native.

```tsx
import { BarChart, LineChart } from '@hozo/charts'

const revenue = [
  { month: 'Jan', online: 120, store: 80 },
  { month: 'Feb', online: 200, store: null }, // a gap: no bar, "No value" in the table
  { month: 'Mar', online: 90, store: 60 },
]
const series = [
  { key: 'online', label: 'Online' },
  { key: 'store', label: 'In store', color: '#0d9488' },
]

export function Revenue() {
  return (
    <>
      <BarChart
        accessibilityLabel="Revenue by month, online and in store"
        data={revenue}
        x={{ key: 'month', label: 'Month' }}
        y={{ label: 'Revenue', format: (value) => `$${value}` }}
        series={series}
        height={240}
        stacked
      />
      <LineChart
        accessibilityLabel="Revenue trend"
        data={revenue}
        x={{ key: 'month' }}
        series={series}
        height={240}
        points
      />
    </>
  )
}
```

Install `react-native-svg` 15.9.0 or newer in a React Native app, as for `@hozo/svg`. The app has
to declare it itself, because only a declared dependency is linked into the Android and iOS builds.

## What a reader meets

- **One stop, one name.** The chart is a single focusable element named by
  `accessibilityLabel`. On the Web it is a `group` described as a chart. On Native it is
  `adjustable`.
- **One active value, however it was chosen.** The arrow keys, Home and End on the Web, swipe up
  and down with VoiceOver or TalkBack, and the pointer or a finger on the plot all move the same
  active category. A tooltip shows it and a polite live region reads it, for example "Jan.
  Online: $120. In store: $80." On Native the same sentence is the element's value.
- **The data as a table.** Every chart also renders a table of its rows, named with the chart's
  label. It is out of sight but still read, and `showTable` puts it on screen. The drawing is
  hidden from assistive technology, because its ticks and shapes say less than the table.
- **A summary first.** The chart is described by one paragraph: how many categories, the
  range they cover, and each series' lowest and highest value, with any gaps counted. Above
  1,000 categories (`TABLE_ROW_LIMIT`) the table is left out unless `showTable` asks for it, and
  the summary says so. Page Up and Page Down move a tenth of the data at a time.

## Pie and donut

```tsx
<PieChart
  accessibilityLabel="Revenue by channel"
  data={channels}
  x={{ key: 'channel' }}
  value={{ key: 'revenue', label: 'Revenue', format: (value) => `$${value}` }}
  height={220}
/>
```

`DonutChart` is the same with `innerRadius` 0.6. A value is read with its share of the positive
total, for example "Online. Revenue: $960 (46.8%)." A zero, negative or missing value has no
slice and no legend row, and the table still lists it. Slices take the palette in order, and a
last slice that would repeat the first colour beside it takes the next colour instead. `colors`
sets them by row. The legend sits beside the circle when there is room and under it otherwise. The
pointer finds a slice by its angle, or a legend row by its line.

## Funnel

```tsx
<FunnelChart
  accessibilityLabel="Sign-up funnel"
  data={stages}
  x={{ key: 'stage' }}
  value={{ key: 'people', label: 'People' }}
  height={220}
/>
```

One trapezoid per stage, top to bottom in data order. Its top edge is as wide as its value and its
bottom edge narrows to the next stage's, so the drop is the slope between them. The stage names
are on the left and the values on the right, each with what it kept of the stage before:
"3,100 (25%)". The table has that share as a second column, "Kept from the stage before", each
stage reads it, for example "Signed up. People: 3,100. Kept from the stage before: 25%.", and the
summary lists it for every stage and ends with the last stage against the first. The arrow keys
step down and up the stages. A stage with no value or a value of zero or less is not drawn, and
the table still lists it.

## RadialBar

```tsx
<RadialBarChart
  accessibilityLabel="Goals met today, percent"
  data={goals}
  x={{ key: 'goal' }}
  y={{ domain: [0, 100], format: (value) => `${value}%` }}
  series={[{ key: 'done', label: 'Done' }]}
  height={300}
/>
```

One ring per row, the first outermost, each series a bar bent along its ring clockwise from twelve
o'clock, as long in angle as its value. The axis is three quarters of a turn, so the longest bar
never closes into a circle that hides where it ends, and each ring's full sweep is drawn faintly
behind it as a track. The free quarter holds the rows' names, level with their rings, and the value
ticks go round the outside. Two or more series share each ring side by side, with a key above. It
reads as bars do; Down and Up step through the rings. A value of zero or less has no bar, and the
table still lists it.

## Radar

```tsx
<RadarChart
  accessibilityLabel="Ratings by area"
  data={ratings}
  x={{ key: 'area' }}
  y={{ domain: [0, 100] }}
  series={[{ key: 'current', label: 'This release' }, { key: 'next', label: 'Next release' }]}
  height={320}
  points
/>
```

One spoke per row, clockwise from twelve o'clock in data order, and one closed outline per series
through its value on each spoke, filled lightly underneath. The centre is zero, or the lowest value
when one is below it; rings mark the ticks, labelled beside the top spoke. It reads as a line chart
does: each spoke with every series there, and each series' lowest and highest in the summary. The
arrow keys go round in the table's order and stop at the last row. A gap breaks the outline, which
then has no fill, rather than drawing across a value nobody gave.

## Treemap

```tsx
<TreemapChart
  accessibilityLabel="Budget by team"
  data={[
    { team: 'Hardware', children: [{ team: 'Phones', budget: 420 }, { team: 'Laptops', budget: 310 }] },
    { team: 'Design', budget: 200 },
  ]}
  x={{ key: 'team', label: 'Team' }}
  value={{ key: 'budget', label: 'Budget' }}
  height={300}
/>
```

Nested rows, each a rectangle whose area is its share of the whole, its children inside it, laid
out squarified so that none is a sliver. A row's children are under `childrenKey` (`'children'`
by default); a group's value is the sum of its children's. Only the leaves are drawn, coloured by
their top-level group, with a key of the groups above them; `colors` sets one per group. A leaf's
name and value sit inside it where they fit whole, in black or white, whichever reads better on
its colour.

Each rectangle is read with its groups and its share of its group: "Hardware, Laptops. Budget:
$310. Share of its group: 42.5%." The table lists every row, groups before their children, with a
Group column (`rootLabel`, `'All'` by default, for the top level) and the share as a second
column. The summary reads the top level and the largest in each group. The arrows, Page Up and
Down, Home and End move among the active rectangle's neighbours in data order; Enter goes into a
group and Escape back out. On Native these are the adjustable element's swipes and its activate
and escape actions. A pointer or finger picks the leaf under it.

## Sparklines

```tsx
<Sparkline accessibilityLabel="Visits, last 7 days" values={[412, 380, 455, 71, 520, 730, 640]} />
```

A word-sized line for a sentence or a table cell, 96 × 24 by default, with the last value marked.
It is one image, not a tab stop, and has no table. Its name is the label plus what the line shows:
"Visits, last 7 days: 7 values, from 412 to 640; lowest 71, highest 730." A gap breaks the line
and is counted.

## Theme

```tsx
<ChartThemeProvider
  theme={{
    palette: { light: ['#0d9488', '#c2410c'], dark: ['#0d9488', '#ea580c'] },
    bar: { radius: 0, maxWidth: 40, gap: 0 },
  }}
>
  <App />
</ChartThemeProvider>
```

A theme changes how charts look, not what they say. `palette` is one set for light and dark
pages, or a `{ light, dark }` pair picked by the system colour scheme, or by the provider's
`colorScheme` when the app has its own switch. `bar` sets the rounding, the thickest a bar gets and
the gap between bars; `line` the stroke width and dot radius; `frame` how strongly gridlines and
the baseline show, as a fraction of the text colour. Every field is optional. A provider inside
another changes only what it names, a chart's `theme` prop goes on top, and a series' `color` wins
over both. The key, the tick label contrast and the default palette's checks are not part of a
theme.

## Synchronised charts

Charts inside one `ChartSync` share the active category: pointing at or
stepping to March in one shows March in all of them. They match by category
label, so charts whose rows differ still meet on the ones they share. Only
the chart the reader is using announces, so a screen reader hears one
sentence, not one per chart.

```tsx
<ChartSync>
  <BarChart accessibilityLabel="Revenue" data={revenue} x={{ key: 'month' }} series={channels} height={200} />
  <LineChart accessibilityLabel="Against target" data={plan} x={{ key: 'month' }} series={lines} height={200} />
</ChartSync>
```

`category` and `onCategoryChange` control it from outside, for example to
name the month elsewhere on the page. A category set that way is shown in
every chart and announced by none, because the reader did not move there.

## Props

| Prop | |
| --- | --- |
| `accessibilityLabel` | Required. The chart's name, and its table's. |
| `data` | Rows. A missing, `null` or non-finite value is a gap. |
| `x` | `{ key, label?, format?, type?, timeZone?, locale? }`: the field that holds each row's category. With `type: 'time'` the field is a `Date`, milliseconds or a date string: Line and Area place each row by when it happened, with ticks on calendar boundaries, and every chart reads it as a date ("Mar 1, 2026"). Times are UTC unless `timeZone: 'local'`, so the server and the browser draw the same ticks. Rows go in time order. |
| `y` | `{ label?, format?, domain?, scale? }`. The domain otherwise comes from the data, rounded to tidy ticks. `scale: 'log'` (Line and Scatter) spaces each tenfold step evenly; zero and below are not drawn but are still read, and the summary says "Values on a log scale." Bars and areas stay linear, because they measure from zero. |
| `series` | `{ key, label, color? }[]`. Without `color`, a series takes the next colour of `DEFAULT_PALETTE`. Each palette colour has at least 3:1 contrast on white and on near-black, and the order keeps neighbours apart under protanopia and deuteranopia, so one set serves light and dark pages. |
| `theme` | Palette, bar shape, line weight and frame for this chart, over any `ChartThemeProvider` above it. See [Theme](#theme). |
| `legend` | Every chart but Pie and Donut: `false` hides the key above the plot. It is shown for two or more series, each swatch shaped like the series' mark (a block for bars, a stroke for a line, a dot for points). |
| `height` | Required, in points. |
| `width` | A fixed width. Otherwise the chart fills its container and lays out again when that resizes. |
| `textColor` | Axis text and lines. On the Web it otherwise inherits the surrounding colour. |
| `showTable` | Show the table under the chart. |
| `animate` | `false` stops the marks moving to new data; they move over 300 ms by default, when `data` changes (a resize or a new theme redraws at once). Never when the reader asks for reduced motion (`prefers-reduced-motion` on Web, the system setting on Native). Pie and donut slices change at once. The table, summary and announcement describe the new data from the first frame. |
| `references` | Every chart but Pie and Donut: `{ value, label }[]` draws a dashed line, for example a target, and `{ value, to, label }` shades a range. The axis widens to show them, and the summary reads each one after the series ("Target: $150."). |
| `series[].type` | `ComposedChart`: `'line'` draws that series as a line over the bars; the rest are bars, side by side. |
| `name` | `ScatterChart`: `{ key, label? }`, the field that names each point. Without it, a point is named by its x value. In `ScatterChart`, `x` is numeric (`{ key, label?, format?, domain? }`) and the rows are read in its order. |
| `horizontal` | `BarChart`: bars run left to right, with the categories down the left side, for long labels and rankings. `y` still describes the values. Down and Up also step through the rows. |
| `stacked` | `BarChart` and `AreaChart`: stack the series instead of grouping or overlapping them. A stacked area's top edge is the total; the table still reads each series' own value. |
| `points` | `LineChart` and `AreaChart`: draw a dot at each value. |
| `brush` | `BarChart`, `LineChart`, `AreaChart` and `ComposedChart`: a strip under the chart, drawing the whole of the first series, that picks which run of rows the chart shows. `true` starts with every row; `{ defaultRange, range, onRangeChange, height }` sets where it starts, or controls it. Each end is a slider (one tab stop, read as its row's name) moved a row by the arrow keys, a tenth of the rows by Page Up and Page Down, and to the limit by Home and End; on Native each is an adjustable element. A press on the strip drags the nearer end, or the whole range when inside it. The summary then begins "Showing 30 of 120 categories." and the table is named with the run it lists. Rows are taken in the order given. |
| `curve` | `LineChart`, `AreaChart` and the lines of `ComposedChart`: `'linear'` (the default) or `'monotone'`, a curve through each value that never overshoots it, so it shows no peak or dip that is not in the data. A gap still breaks it. |

`color` is a runtime string rather than a `className`, because a class list is compile-time
input on Native.

The scales (`linearScale`, `bandScale`, `pointScale` and `ticks`) and the layout models
(`barChartModel`, `lineChartModel` and `areaChartModel`) are exported too. They give the same answers as d3-scale,
and the models are plain data, so another renderer can draw them. See
[RFC 015](https://github.com/iray-tno/hozo/blob/main/docs/rfcs/015-charts.md).

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a universal UI framework for React Native, compiled by Rust, with native semantics on every platform, first-class accessibility, and diagnostics for humans and AI agents alike. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://iray-tno.github.io/hozo/docs/getting-started/). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
