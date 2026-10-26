import { View } from '@hozo/core'
import { Tabs } from '@hozo/ui'

const PANELS = [
  { label: 'Details', content: 'A universal UI framework, compiled by Rust.' },
  { label: 'Shipping', content: 'Two days, or four to an island.' },
  { label: 'Returns', content: 'Not yet.', disabled: true },
]

export function TabsDemo() {
  return (
    <View className="w-full max-w-md">
      <Tabs tabs={PANELS} accessibilityLabel="Product" />
    </View>
  )
}
