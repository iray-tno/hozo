# @hozo/charts

## 0.6.0

### Minor Changes

- [#2370](https://github.com/iray-tno/hozo/pull/2370) [`509b411`](https://github.com/iray-tno/hozo/commit/509b4110e4e332aad6e9aa412ce3180a3a411aba) Thanks [@iray-tno](https://github.com/iray-tno)! - Charts move their marks to new data over 300 ms instead of jumping: bars grow and shrink, new bars rise from the baseline, and lines and points slide. Nothing moves when the reader asks for reduced motion, and `animate={false}` turns it off. The table, summary and announcement describe the new data at once.

- [#2336](https://github.com/iray-tno/hozo/pull/2336) [`43b49ae`](https://github.com/iray-tno/hozo/commit/43b49ae2bf05302bfed4e1c315a836baa1322946) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `AreaChart`: lines with the band under each filled, or stacked so the top edge is the
  total. A gap breaks the band as it breaks the line, and the table still reads each series' own
  value.

- [#2370](https://github.com/iray-tno/hozo/pull/2370) [`ac9a3b4`](https://github.com/iray-tno/hozo/commit/ac9a3b479273f9739b11519608e939ce4c82f839) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `brush` to `BarChart`, `LineChart`, `AreaChart` and `ComposedChart`: a strip under the chart
  that picks which run of rows it shows, each end a slider moved by keys or dragged. The summary
  says how many rows are shown and the table is named with their range.

- [#2341](https://github.com/iray-tno/hozo/pull/2341) [`97c90fb`](https://github.com/iray-tno/hozo/commit/97c90fbd3b13e84b2de3f12b3b90f3a0b1d2b71a) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `ComposedChart`: bars and lines over one category axis, for example revenue as bars against a
  target line. A series is drawn as bars unless it has `type: 'line'`. The table and what a
  reader hears are the same for every series, whatever its mark.

- [#2366](https://github.com/iray-tno/hozo/pull/2366) [`fd934e0`](https://github.com/iray-tno/hozo/commit/fd934e02b369341c4324ac6bd8cdd895d9ce4151) Thanks [@iray-tno](https://github.com/iray-tno)! - `curve="monotone"` on `LineChart`, `AreaChart` and `ComposedChart` draws the lines as a monotone curve through each value, which never overshoots one. A gap still breaks the line, and nothing read aloud changes.

- [#2370](https://github.com/iray-tno/hozo/pull/2370) [`01296e0`](https://github.com/iray-tno/hozo/commit/01296e07d7aa3032bdc61d0e2786b181b5d4071c) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `FunnelChart`: one trapezoid per stage, each value read with what it kept of the stage
  before, in the table, the tooltip, the sentence and the summary. A series may now carry a
  `format` of its own, over the chart's `y.format`.

- [#2340](https://github.com/iray-tno/hozo/pull/2340) [`acc2435`](https://github.com/iray-tno/hozo/commit/acc2435a5c630cb778e2783ad6796f22f8aae491) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `horizontal` to `BarChart`: bars run left to right with the categories down the left, for
  long labels and rankings. Down and Up step through the rows as well as Right and Left.

- [#2363](https://github.com/iray-tno/hozo/pull/2363) [`3eb6de1`](https://github.com/iray-tno/hozo/commit/3eb6de1c512fea7052b4b732cb00efc25777d5c4) Thanks [@iray-tno](https://github.com/iray-tno)! - Charts with two or more series now draw a key above the plot, each swatch shaped like its series'
  mark, so colour is no longer the only way to tell series apart; `legend={false}` turns it off.
  `DEFAULT_PALETTE` is reordered from the third colour on: the old order put emerald beside pink, which
  deuteranopia renders as one colour. Bars are at most 24px thick and round their value end, with a
  2px gap between neighbours and between stacked segments. Gridlines, the baseline and value tick
  labels are quieter, with tick labels kept at 4.5:1. Bar marks gain `end`, and `ChartModel` gains
  `legend`.

- [#2322](https://github.com/iray-tno/hozo/pull/2322) [`d8b7414`](https://github.com/iray-tno/hozo/commit/d8b7414c97c2a3fb5b578a9fe295c21f4d970b41) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `PieChart` and `DonutChart`: one value per row, read with its share of the whole, with a
  legend, the same table, summary, active datum and tooltip as Bar and Line, and a pointer that
  finds a slice by its angle.

- [#2321](https://github.com/iray-tno/hozo/pull/2321) [`2ee4b00`](https://github.com/iray-tno/hozo/commit/2ee4b00f46c0cc51dc76d3a7b051e70b6bd3a8c4) Thanks [@iray-tno](https://github.com/iray-tno)! - Publish `@hozo/charts`: accessible Bar (grouped and stacked) and Line charts on Web and
  React Native. Each chart is one named focus stop whose active value moves by keys, pointer,
  touch or screen-reader swipe, with a tooltip and a spoken sentence, and it carries a table of
  its data for screen readers.

- [#2341](https://github.com/iray-tno/hozo/pull/2341) [`e997269`](https://github.com/iray-tno/hozo/commit/e9972695d9773173ea94473771d93ea451dea071) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `references` to every chart with a value axis: `{ value, label }` draws a dashed line, for example
  a target, and `{ value, to, label }` shades a range. The axis widens to show them. The summary reads
  each one after the series, for example "Target: $150.", so a reader is not left with only the
  drawing.

- [#2341](https://github.com/iray-tno/hozo/pull/2341) [`a51e3a3`](https://github.com/iray-tno/hozo/commit/a51e3a31fcfe61741c013608c41d0c1699e4b358) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `ScatterChart`: two numeric axes and a dot per row and series. The rows are read in x order,
  each by its `name` and x value ("Cobalt, Price: $30. Rating: 4.1."). The table has an x column,
  and the summary gives the x range and counts the rows left out for having no x.

- [#2322](https://github.com/iray-tno/hozo/pull/2322) [`1ea405b`](https://github.com/iray-tno/hozo/commit/1ea405b282327f1448e0a90432c98917ed6b0b4b) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Sparkline`: a word-sized line for a sentence or a table cell, one image whose name says
  where the line starts and ends and its extremes.

- [#2322](https://github.com/iray-tno/hozo/pull/2322) [`a1e5163`](https://github.com/iray-tno/hozo/commit/a1e516304a6ba059a2eab5c390fa5e2a0ba269a9) Thanks [@iray-tno](https://github.com/iray-tno)! - Describe every chart with a summary of its range and each series' extremes, and leave the
  table out above 1,000 categories unless `showTable` asks for it. Page Up and Page Down move
  the active datum a tenth of the data at a time.

- [#2366](https://github.com/iray-tno/hozo/pull/2366) [`b6f88ae`](https://github.com/iray-tno/hozo/commit/b6f88ae4f6607a2c5ee066f2bd86c34220a921bf) Thanks [@iray-tno](https://github.com/iray-tno)! - `ChartSync`: charts inside it share the active category, matched by label, so pointing at or stepping to a month in one shows it in all. Only the chart in use announces. `category` and `onCategoryChange` control it from outside.

- [#2363](https://github.com/iray-tno/hozo/pull/2363) [`7eb50cd`](https://github.com/iray-tno/hozo/commit/7eb50cdfdefbd5033510a7899dc9639afeca8270) Thanks [@iray-tno](https://github.com/iray-tno)! - Add a chart theme. `ChartThemeProvider` sets it for every chart inside, and each chart takes a
  `theme` prop on top: `palette` (one set for light and dark, or a `{ light, dark }` pair picked by the
  system colour scheme or the provider's `colorScheme`), `bar` (`radius`, `maxWidth`, `gap`), `line`
  (`width`, `pointRadius`) and `frame` (`grid`, `axis`). `Sparkline` takes its colour from it too.
  `seriesColor` and `datumRows` take an optional palette, and the bar models take `bar`.

- [#2366](https://github.com/iray-tno/hozo/pull/2366) [`9be0e22`](https://github.com/iray-tno/hozo/commit/9be0e2256f21c9ba27bee75d6add15792634b5ef) Thanks [@iray-tno](https://github.com/iray-tno)! - A time axis and a log value axis. `x.type: 'time'` places Line and Area rows by date, with ticks on calendar boundaries, and makes every chart read the field as a date; it is UTC unless `timeZone: 'local'`. `y.scale: 'log'` on Line and Scatter spaces each tenfold step evenly, leaves zero and below undrawn but read, and the summary says "Values on a log scale."

### Patch Changes

- [#2366](https://github.com/iray-tno/hozo/pull/2366) [`c1780db`](https://github.com/iray-tno/hozo/commit/c1780db1bdf0793c31ac9d0d9bbe9fc8f0a3e591) Thanks [@iray-tno](https://github.com/iray-tno)! - The first and last category labels stay inside the chart: one that would run past an edge is drawn against it, and a neighbour it would then touch is left out.

- [#2322](https://github.com/iray-tno/hozo/pull/2322) [`acb94cf`](https://github.com/iray-tno/hozo/commit/acb94cf86a3c44676872fcfcd465bad824b51d5a) Thanks [@iray-tno](https://github.com/iray-tno)! - Moving the active datum no longer rebuilds the layout, the table and every mark: a step
  takes one frame at 20,000 values, where it took about 64 ms.
- Updated dependencies []:
  - @hozo/semantics@0.6.0
  - @hozo/svg@0.6.0
