# @hozo/charts

Bar, Line, Area, Pie and Donut charts, and sparklines, that a screen reader, a keyboard and a finger can all use, drawn with
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

## Sparklines

```tsx
<Sparkline accessibilityLabel="Visits, last 7 days" values={[412, 380, 455, 71, 520, 730, 640]} />
```

A word-sized line for a sentence or a table cell, 96 × 24 by default, with the last value marked.
It is one image, not a tab stop, and has no table. Its name is the label plus what the line shows:
"Visits, last 7 days: 7 values, from 412 to 640; lowest 71, highest 730." A gap breaks the line
and is counted.

## Props

| Prop | |
| --- | --- |
| `accessibilityLabel` | Required. The chart's name, and its table's. |
| `data` | Rows. A missing, `null` or non-finite value is a gap. |
| `x` | `{ key, label?, format? }`: the field that holds each row's category. |
| `y` | `{ label?, format?, domain? }`. The domain otherwise comes from the data, rounded to tidy ticks. |
| `series` | `{ key, label, color? }[]`. Without `color`, a series takes the next colour of `DEFAULT_PALETTE`. Each palette colour has at least 3:1 contrast on white and on near-black. |
| `height` | Required, in points. |
| `width` | A fixed width. Otherwise the chart fills its container and lays out again when that resizes. |
| `textColor` | Axis text and lines. On the Web it otherwise inherits the surrounding colour. |
| `showTable` | Show the table under the chart. |
| `horizontal` | `BarChart`: bars run left to right, with the categories down the left side, for long labels and rankings. `y` still describes the values. Down and Up also step through the rows. |
| `stacked` | `BarChart` and `AreaChart`: stack the series instead of grouping or overlapping them. A stacked area's top edge is the total; the table still reads each series' own value. |
| `points` | `LineChart` and `AreaChart`: draw a dot at each value. |

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
