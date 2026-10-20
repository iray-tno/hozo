import { View } from '@hozo/core'
import { Badge } from '@hozo/ui'

export function BadgeDemo() {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Badge>Draft</Badge>
      <Badge tone="accent">New</Badge>
      <Badge tone="danger">Overdue</Badge>
      <Badge tone="accent" count={3} accessibilityLabel="3 unread messages" />
      <Badge tone="danger" count={240} max={99} accessibilityLabel="240 failed checks" />
    </View>
  )
}
