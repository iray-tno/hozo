// Charts (RFC 015): Bar, Line, Area, Scatter, Pie and Donut from @hozo/charts. Each is one
// tab stop; the arrow keys, Home and End move along the data and a live region reads
// every series there, the pointer does the same with a tooltip, and a
// screen reader also has the table of the data, out of sight unless shown.

import {
  AreaChart,
  BarChart,
  ComposedChart,
  DonutChart,
  LineChart,
  PieChart,
  ScatterChart,
  Sparkline,
} from '@hozo/charts'
import { Text, View } from '@hozo/primitives'
import { Section } from '@hozo/semantics'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'

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
