import { Text, View } from '@hozo/core'
import { SegmentedControl } from '@hozo/ui'
import { useState } from 'react'

const RANGES = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

export function SegmentedControlDemo() {
  const [range, setRange] = useState('week')
  return (
    <View className="gap-3">
      <SegmentedControl
        options={RANGES}
        accessibilityLabel="Range"
        value={range}
        onValueChange={setRange}
      />
      <Text className="text-sm text-hozo-text-muted">Showing one {range}.</Text>
    </View>
  )
}
