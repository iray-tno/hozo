// Charts (RFC 015): Bar, Line, Area, Scatter, Pie, Donut, Funnel, Treemap and Radar from @hozo/charts. Each is one
// tab stop; the arrow keys, Home and End move along the data and a live region reads
// every series there, the pointer does the same with a tooltip, and a
// screen reader also has the table of the data, out of sight unless shown.

import {
  AreaChart,
  BarChart,
  ChartSync,
  ChartThemeProvider,
  ComposedChart,
  DonutChart,
  FunnelChart,
  LineChart,
  PieChart,
  RadarChart,
  ScatterChart,
  Sparkline,
  TreemapChart,
} from '@hozo/charts'
import { Button, Text, View } from '@hozo/primitives'
import { Section } from '@hozo/semantics'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

const revenue = [
  { month: 'Jan', online: 120, store: 80 },
  { month: 'Feb', online: 200, store: null },
  { month: 'Mar', online: 90, store: 60 },
  { month: 'Apr', online: 160, store: 110 },
  { month: 'May', online: 210, store: 95 },
  { month: 'Jun', online: 180, store: 130 },
]
const series = [
  { key: 'online', label: 'Online' },
  { key: 'store', label: 'In store' },
]
const dollars = { label: 'Revenue', format: (value: number) => `$${value}` }

function Gallery({ showTable = false }: { showTable?: boolean }) {
  return (
    <View className="w-full max-w-2xl gap-8 p-6 text-slate-700">
      <Section className="gap-2">
        <Heading level={2}>Grouped bars</Heading>
        <Paragraph>February has no in-store figure: no bar, and the table says so.</Paragraph>
        <BarChart
          accessibilityLabel="Revenue by month, online and in store"
          data={revenue}
          x={{ key: 'month', label: 'Month' }}
          y={dollars}
          series={series}
          height={240}
          showTable={showTable}
        />
      </Section>
      <Section className="gap-2">
        <Heading level={2}>Stacked bars</Heading>
        <BarChart
          accessibilityLabel="Total revenue by month, stacked by channel"
          data={revenue}
          x={{ key: 'month', label: 'Month' }}
          y={dollars}
          series={series}
          height={240}
          stacked
          showTable={showTable}
        />
      </Section>
      <Section className="gap-2">
        <Heading level={2}>Lines</Heading>
        <Paragraph>The in-store line breaks at February rather than drawing across it.</Paragraph>
        <LineChart
          accessibilityLabel="Revenue trend by month, online and in store"
          data={revenue}
          x={{ key: 'month', label: 'Month' }}
          y={dollars}
          series={series}
          height={240}
          points
          showTable={showTable}
        />
      </Section>
      <Section className="gap-2">
        <Heading level={2}>Stacked areas</Heading>
        <Paragraph>
          The top edge is the total; the table still gives each channel. February's missing in-store
          figure breaks its band.
        </Paragraph>
        <AreaChart
          accessibilityLabel="Revenue by month, stacked areas by channel"
          data={revenue}
          x={{ key: 'month', label: 'Month' }}
          y={dollars}
          series={series}
          height={240}
          stacked
          showTable={showTable}
        />
      </Section>
    </View>
  )
}

const meta = {
  title: 'Data/Charts',
  component: Gallery,
} satisfies Meta<typeof Gallery>

export default meta

export const Default: StoryObj<typeof meta> = {}

/** The same charts with their tables on screen, as `showTable` puts them. */
export const WithTables: StoryObj<typeof meta> = { args: { showTable: true } }

const channels = [
  { channel: 'Online', revenue: 960 },
  { channel: 'In store', revenue: 475 },
  { channel: 'Partners', revenue: 310 },
  { channel: 'Phone', revenue: null },
  { channel: 'Wholesale', revenue: 220 },
  { channel: 'Events', revenue: 85 },
]
const share = { key: 'revenue', label: 'Revenue', format: (value: number) => `$${value}` }

/**
 * A pie and a donut of the same revenue: the active slice is outlined and
 * read with its share, and Phone, which has no figure, has no slice and no
 * legend row but is still in the table.
 */
export const PieAndDonut: StoryObj<typeof meta> = {
  render: () => (
    <View className="w-full max-w-2xl gap-8 p-6 text-slate-700">
      <Section className="gap-2">
        <Heading level={2}>Pie</Heading>
        <PieChart
          accessibilityLabel="Revenue by channel"
          data={channels}
          x={{ key: 'channel', label: 'Channel' }}
          value={share}
          height={220}
        />
      </Section>
      <Section className="gap-2">
        <Heading level={2}>Donut</Heading>
        <DonutChart
          accessibilityLabel="Revenue by channel, as a donut"
          data={channels}
          x={{ key: 'channel', label: 'Channel' }}
          value={share}
          height={220}
        />
      </Section>
    </View>
  ),
}

const funnelStages = [
  { stage: 'Visited', people: 12400 },
  { stage: 'Signed up', people: 3100 },
  { stage: 'Started a trial', people: 1240 },
  { stage: 'Paid', people: 310 },
]

/**
 * A funnel of four stages. Each value is read with what it kept of the
 * stage before, and the summary ends with the last stage against the first.
 */
export const Funnel: StoryObj<typeof meta> = {
  render: () => (
    <View className="w-full max-w-2xl gap-2 p-6 text-slate-700">
      <FunnelChart
        accessibilityLabel="Sign-up funnel"
        data={funnelStages}
        x={{ key: 'stage', label: 'Stage' }}
        value={{
          key: 'people',
          label: 'People',
          format: (value) => value.toLocaleString('en-US'),
        }}
        height={220}
      />
    </View>
  ),
}

const budget = [
  {
    team: 'Hardware',
    children: [
      { team: 'Phones', budget: 420000 },
      { team: 'Laptops', budget: 310000 },
      { team: 'Tablets', budget: 120000 },
      { team: 'Watches', budget: 60000 },
    ],
  },
  {
    team: 'Software',
    children: [
      { team: 'Apps', budget: 380000 },
      { team: 'Cloud', budget: 260000 },
      { team: 'Security', budget: 90000 },
    ],
  },
  {
    team: 'Services',
    children: [
      { team: 'Support', budget: 180000 },
      { team: 'Training', budget: 70000 },
    ],
  },
]

/**
 * A treemap of a budget by group and team. Each rectangle is read with its
 * groups and its share of its group; the arrows move among neighbours,
 * Enter goes into a group and Escape comes back out.
 */
export const Treemap: StoryObj<typeof meta> = {
  render: () => (
    <View className="w-full max-w-2xl gap-2 p-6 text-slate-700">
      <TreemapChart
        accessibilityLabel="Budget by team"
        data={budget}
        x={{ key: 'team', label: 'Team' }}
        value={{
          key: 'budget',
          label: 'Budget',
          format: (value) => `$${value.toLocaleString('en-US')}`,
        }}
        height={300}
      />
    </View>
  ),
}

const ratings = [
  { area: 'Speed', current: 72, next: 85 },
  { area: 'Reliability', current: 88, next: 90 },
  { area: 'Ease of use', current: 64, next: 82 },
  { area: 'Support', current: 70, next: 68 },
  { area: 'Price', current: 80, next: 60 },
  { area: 'Features', current: 58, next: 77 },
]

/**
 * Two releases rated across six areas. Each spoke is a row of the table,
 * clockwise from the top, and the arrow keys go round it in that order.
 */
export const Radar: StoryObj<typeof meta> = {
  render: () => (
    <View className="w-full max-w-2xl gap-2 p-6 text-slate-700">
      <RadarChart
        accessibilityLabel="Ratings by area, this release and the next"
        data={ratings}
        x={{ key: 'area', label: 'Area' }}
        y={{ domain: [0, 100] }}
        series={[
          { key: 'current', label: 'This release' },
          { key: 'next', label: 'Next release' },
        ]}
        height={320}
        points
      />
    </View>
  ),
}

// 120 days of visits: a weekly rhythm on a slow rise, with a launch spike.
const visits = Array.from({ length: 120 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 0, 1 + i))
  const weekday = date.getUTCDay()
  const weekend = weekday === 0 || weekday === 6 ? 0.6 : 1
  const launch = i >= 70 && i < 76 ? 2.2 - (i - 70) * 0.2 : 1
  return {
    day: date.toISOString().slice(0, 10),
    visits: Math.round((800 + i * 6 + 90 * Math.sin(i / 9)) * weekend * launch),
  }
})

/**
 * A long series with a brush under it. The chart shows the last 30 days at
 * first; each end of the strip is a slider, moved with the arrow keys or
 * dragged, and the summary and the table say which days are shown.
 */
export const Brush: StoryObj<typeof meta> = {
  render: () => (
    <View className="w-full max-w-2xl gap-2 p-6 text-slate-700">
      <LineChart
        accessibilityLabel="Visits by day"
        data={visits}
        x={{ key: 'day', type: 'time', label: 'Date' }}
        y={{ label: 'Visits', format: (value) => value.toLocaleString('en-US') }}
        series={[{ key: 'visits', label: 'Visits' }]}
        height={220}
        brush={{ defaultRange: { start: 90, end: 119 } }}
      />
    </View>
  ),
}

const metrics = [
  { name: 'Visits', week: [412, 380, 455, 71, 520, 730, 640] },
  { name: 'Sign-ups', week: [12, 15, null, 9, 14, 22, 19] },
  { name: 'Refunds', week: [3, 2, 2, 1, 1, 0, 0] },
]

/**
 * Word-sized lines beside each metric. Each is one image whose name says
 * where it starts and ends and its extremes; none is a tab stop.
 */
export const Sparklines: StoryObj<typeof meta> = {
  render: () => (
    <View className="max-w-md gap-3 p-6 text-slate-700">
      <Heading level={2}>This week</Heading>
      {metrics.map((metric) => (
        <View key={metric.name} className="flex-row items-center justify-between gap-4">
          <Text>{metric.name}</Text>
          <Sparkline accessibilityLabel={`${metric.name}, last 7 days`} values={metric.week} />
        </View>
      ))}
    </View>
  ),
}

const daily = Array.from({ length: 5000 }, (_, day) => ({
  day: `Day ${day + 1}`,
  visits: Math.round(400 + 250 * Math.sin(day / 40) + 80 * Math.sin(day / 3)),
}))

/**
 * Five thousand values: too many rows for a table, so the summary stands in
 * for it and the keys (Page Up and Page Down a tenth at a time) step through.
 */
export const ManyValues: StoryObj<typeof meta> = {
  render: () => (
    <View className="w-full max-w-2xl gap-2 p-6 text-slate-700">
      <Heading level={2}>Daily visits</Heading>
      <LineChart
        accessibilityLabel="Daily visits over 5,000 days"
        data={daily}
        x={{ key: 'day' }}
        y={{ label: 'Visits' }}
        series={[{ key: 'visits', label: 'Visits' }]}
        height={240}
      />
    </View>
  ),
}

const tickets = [
  { team: 'Customer support', open: 42, closed: 30 },
  { team: 'Billing and invoices', open: 12, closed: null },
  { team: 'Platform', open: 27, closed: 18 },
  { team: 'Mobile apps', open: 19, closed: 22 },
]

/**
 * Horizontal bars for long category names: the rows run down the chart,
 * so Down and Up step through them as well as Right and Left.
 */
export const HorizontalBars: StoryObj<typeof meta> = {
  render: () => (
    <View className="w-full max-w-2xl gap-2 p-6 text-slate-700">
      <Heading level={2}>Tickets by team</Heading>
      <BarChart
        accessibilityLabel="Open and closed tickets by team"
        data={tickets}
        x={{ key: 'team', label: 'Team' }}
        y={{ label: 'Tickets' }}
        series={[
          { key: 'open', label: 'Open' },
          { key: 'closed', label: 'Closed' },
        ]}
        height={220}
        horizontal
      />
    </View>
  ),
}

const catalogue = [
  { product: 'Amber kettle', price: 24, rating: 3.9, returns: 2.1 },
  { product: 'Birch stool', price: 48, rating: 4.4, returns: 1.2 },
  { product: 'Cobalt lamp', price: 65, rating: 4.1, returns: 3.4 },
  { product: 'Dune rug', price: 120, rating: 4.7, returns: 0.8 },
  { product: 'Ember mug', price: 12, rating: 4.2, returns: null },
  { product: 'Fern planter', price: 35, rating: 3.4, returns: 4.6 },
  { product: 'Gale fan', price: 89, rating: 3.8, returns: 2.9 },
]

/**
 * A scatter plot: the points are read in price order, each by its name and
 * price, and Ember mug's missing return rate is a gap in the table.
 */
export const Scatter: StoryObj<typeof meta> = {
  render: () => (
    <View className="w-full max-w-2xl gap-2 p-6 text-slate-700">
      <Heading level={2}>Price against rating and returns</Heading>
      <ScatterChart
        accessibilityLabel="Rating and return rate by price"
        data={catalogue}
        x={{ key: 'price', label: 'Price', format: (value: number) => `$${value}` }}
        name={{ key: 'product', label: 'Product' }}
        series={[
          { key: 'rating', label: 'Rating' },
          { key: 'returns', label: 'Returns %' },
        ]}
        height={240}
      />
    </View>
  ),
}

const plan = revenue.map((row, i) => ({ ...row, target: [180, 190, 200, 210, 230, 240][i] }))

/**
 * Bars and a line in one chart: the channels as bars, the target as a line
 * over them. A reader hears every series at once, whatever its mark.
 */
export const BarsAndLine: StoryObj<typeof meta> = {
  render: () => (
    <View className="w-full max-w-2xl gap-2 p-6 text-slate-700">
      <Heading level={2}>Revenue against target</Heading>
      <ComposedChart
        accessibilityLabel="Revenue by channel against the monthly target"
        data={plan}
        x={{ key: 'month', label: 'Month' }}
        y={dollars}
        series={[...series, { key: 'target', label: 'Target', type: 'line' }]}
        height={240}
        points
      />
    </View>
  ),
}

/**
 * A target line over the bars and a range shaded under a line. Both are
 * drawn and also read: the summary ends "Target: $150." and "Usual range:
 * $80 to $140.".
 */
export const ReferenceLines: StoryObj<typeof meta> = {
  render: () => (
    <View className="w-full max-w-2xl gap-8 p-6 text-slate-700">
      <Section className="gap-2">
        <Heading level={2}>Against a target</Heading>
        <BarChart
          accessibilityLabel="Online revenue by month against the target"
          data={revenue}
          x={{ key: 'month', label: 'Month' }}
          y={dollars}
          series={[{ key: 'online', label: 'Online' }]}
          height={220}
          references={[{ value: 150, label: 'Target' }]}
        />
      </Section>
      <Section className="gap-2">
        <Heading level={2}>Within a range</Heading>
        <LineChart
          accessibilityLabel="In-store revenue by month within its usual range"
          data={revenue}
          x={{ key: 'month', label: 'Month' }}
          y={dollars}
          series={[{ key: 'store', label: 'In store' }]}
          height={220}
          points
          references={[{ value: 80, to: 140, label: 'Usual range' }]}
        />
      </Section>
    </View>
  ),
}

// A theme changes how a chart looks, not what it says: the table, the summary
// and the key stay the same. `palette` takes one set for light and dark pages
// or a `{ light, dark }` pair; a provider themes every chart inside it, and a
// chart's own `theme` goes on top.
export const Theming: StoryObj<typeof meta> = {
  render: () => (
    <View className="w-full max-w-2xl gap-8 p-6 text-slate-700">
      <Section className="gap-2">
        <Heading level={2}>Square, wider bars</Heading>
        <BarChart
          accessibilityLabel="Revenue by month and channel, square bars"
          data={revenue}
          x={{ key: 'month', label: 'Month' }}
          y={dollars}
          series={series}
          height={220}
          theme={{ bar: { radius: 0, maxWidth: 40, gap: 0 } }}
        />
      </Section>
      <ChartThemeProvider
        theme={{
          // Both sets pass the same colour-vision and contrast checks as the default.
          palette: { light: ['#0d9488', '#c2410c'], dark: ['#0d9488', '#ea580c'] },
          line: { width: 3 },
        }}
      >
        <Section className="gap-2">
          <Heading level={2}>A palette for each scheme</Heading>
          <LineChart
            accessibilityLabel="Revenue by month and channel, themed palette"
            data={revenue}
            x={{ key: 'month', label: 'Month' }}
            y={dollars}
            series={series}
            height={220}
            points
          />
        </Section>
      </ChartThemeProvider>
    </View>
  ),
}

// A monotone curve bends through each value without passing it, so a peak
// or a dip on the curve is one in the data. How the line runs is drawing
// only: the table and the summary read the same values as a straight line.
export const Curves: StoryObj<typeof meta> = {
  render: () => (
    <View className="w-full max-w-2xl gap-8 p-6 text-slate-700">
      <Section className="gap-2">
        <Heading level={2}>Curved lines</Heading>
        <LineChart
          accessibilityLabel="Revenue by month and channel, curved"
          data={revenue}
          x={{ key: 'month', label: 'Month' }}
          y={dollars}
          series={series}
          height={220}
          curve="monotone"
          points
        />
      </Section>
      <Section className="gap-2">
        <Heading level={2}>Curved stacked areas</Heading>
        <AreaChart
          accessibilityLabel="Revenue by month and channel, stacked and curved"
          data={revenue}
          x={{ key: 'month', label: 'Month' }}
          y={dollars}
          series={series}
          height={220}
          curve="monotone"
          stacked
        />
      </Section>
    </View>
  ),
}

const signups = [
  { day: '2026-01-05', users: 12 },
  { day: '2026-01-06', users: 30 },
  { day: '2026-01-09', users: 140 },
  { day: '2026-01-20', users: 900 },
  { day: '2026-02-02', users: 2600 },
  { day: '2026-02-16', users: 8100 },
  { day: '2026-03-02', users: 21000 },
]

// Rows placed by date, so the long gaps between later rows show as distance,
// and a log axis, so each tenfold rise is the same height. The table and the
// summary read the dates and the exact counts; the summary also names the
// log scale.
export const TimeAndLog: StoryObj<typeof meta> = {
  render: () => (
    <View className="w-full max-w-2xl gap-8 p-6 text-slate-700">
      <Section className="gap-2">
        <Heading level={2}>By date</Heading>
        <LineChart
          accessibilityLabel="Total sign-ups by date"
          data={signups}
          x={{ key: 'day', type: 'time', label: 'Date' }}
          y={{ label: 'Sign-ups', format: (value) => value.toLocaleString('en-US') }}
          series={[{ key: 'users', label: 'Sign-ups' }]}
          height={220}
          points
        />
      </Section>
      <Section className="gap-2">
        <Heading level={2}>By date, on a log scale</Heading>
        <LineChart
          accessibilityLabel="Total sign-ups by date, log scale"
          data={signups}
          x={{ key: 'day', type: 'time', label: 'Date' }}
          y={{ label: 'Sign-ups', scale: 'log', format: (value) => value.toLocaleString('en-US') }}
          series={[{ key: 'users', label: 'Sign-ups' }]}
          height={220}
          points
        />
      </Section>
    </View>
  ),
}

function SyncedCharts() {
  const [month, setMonth] = useState<string | null>(null)
  return (
    <View className="w-full max-w-2xl gap-8 p-6 text-slate-700">
      <Paragraph>{month ? `Showing ${month} in both charts.` : 'Point at a month.'}</Paragraph>
      <ChartSync category={month} onCategoryChange={setMonth}>
        <Section className="gap-2">
          <Heading level={2}>Revenue</Heading>
          <BarChart
            accessibilityLabel="Revenue by month and channel"
            data={revenue}
            x={{ key: 'month', label: 'Month' }}
            y={dollars}
            series={series}
            height={200}
          />
        </Section>
        <Section className="gap-2">
          <Heading level={2}>Against target</Heading>
          <LineChart
            accessibilityLabel="Online revenue against the target"
            data={plan}
            x={{ key: 'month', label: 'Month' }}
            y={dollars}
            series={[
              { key: 'online', label: 'Online' },
              { key: 'target', label: 'Target' },
            ]}
            height={200}
            points
          />
        </Section>
      </ChartSync>
    </View>
  )
}

// Charts in one ChartSync share the active month: pointing at or stepping
// to March in one shows March in both. Only the chart in use announces, so a
// screen reader hears one sentence, not one per chart. The month is also
// controlled here, to name it above the charts.
export const Synced: StoryObj<typeof meta> = { render: () => <SyncedCharts /> }

const quarters = {
  H1: revenue,
  H2: [
    { month: 'Jul', online: 220, store: 120 },
    { month: 'Aug', online: 150, store: 140 },
    { month: 'Sep', online: 240, store: 90 },
    { month: 'Oct', online: 190, store: 160 },
    { month: 'Nov', online: 260, store: 150 },
    { month: 'Dec', online: 300, store: 210 },
  ],
}

function MovingCharts() {
  const [half, setHalf] = useState<keyof typeof quarters>('H1')
  const data = quarters[half]
  return (
    <View className="w-full max-w-2xl gap-6 p-6 text-slate-700">
      <Button
        className="self-start rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        onPress={() => setHalf(half === 'H1' ? 'H2' : 'H1')}
      >
        <Text>{half === 'H1' ? 'Show July to December' : 'Show January to June'}</Text>
      </Button>
      <BarChart
        accessibilityLabel={`Revenue by month and channel, ${half}`}
        data={data}
        x={{ key: 'month', label: 'Month' }}
        y={{ ...dollars, domain: [0, 320] }}
        series={series}
        height={200}
      />
      <LineChart
        accessibilityLabel={`Revenue by month and channel as lines, ${half}`}
        data={data}
        x={{ key: 'month', label: 'Month' }}
        y={{ ...dollars, domain: [0, 320] }}
        series={series}
        height={200}
        points
      />
    </View>
  )
}

// New data moves the marks rather than replacing them, over 300 ms, so the
// eye can follow which bar rose and which fell. Nothing moves for a reader
// who asked for reduced motion, and the table and summary describe the new
// data from the first frame either way.
export const Animation: StoryObj<typeof meta> = { render: () => <MovingCharts /> }
