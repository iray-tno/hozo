// RFC 015's Native evidence: the same Bar and Line charts the Web tests
// render, through @hozo/charts' Native entry (react-native-svg and an
// `onLayout` box). It lives in the optional-renderer entry beside Canvas,
// so the main demo's bundle budget keeps measuring what Hozo costs an app
// that does not install charts.

import { BarChart, DonutChart, LineChart } from '@hozo/charts'
import { Text, View } from '@hozo/core'

const sales = [
  { month: 'Jan', online: 120, store: 80 },
  { month: 'Feb', online: 200, store: null },
  { month: 'Mar', online: 90, store: 60 },
  { month: 'Apr', online: 160, store: 110 },
]
const series = [
  { key: 'online', label: 'Online' },
  { key: 'store', label: 'In store' },
]

export function ChartsBench() {
  return (
    <View className="gap-4 p-4" testID="charts-bench">
      <Text className="text-lg font-semibold">Charts</Text>
      <BarChart
        accessibilityLabel="Native chart: revenue by month"
        data={sales}
        x={{ key: 'month' }}
        series={series}
        height={200}
        textColor="#4b5563"
      />
      <LineChart
        accessibilityLabel="Native chart: revenue trend"
        data={sales}
        x={{ key: 'month' }}
        series={series}
        height={200}
        textColor="#4b5563"
        points
      />
      <DonutChart
        accessibilityLabel="Native chart: revenue by channel"
        data={sales}
        x={{ key: 'month' }}
        value={{ key: 'online', label: 'Online' }}
        height={200}
        textColor="#4b5563"
      />
    </View>
  )
}
