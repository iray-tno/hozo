import { Text, View } from '@hozo/core'
import { Button } from '@hozo/ui'
import { useState } from 'react'

export function ButtonDemo() {
  const [pressed, setPressed] = useState('nothing yet')
  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap gap-2">
        <Button tone="accent" onPress={() => setPressed('Accent')}>
          Accent
        </Button>
        <Button tone="neutral" onPress={() => setPressed('Neutral')}>
          Neutral
        </Button>
        <Button tone="quiet" onPress={() => setPressed('Quiet')}>
          Quiet
        </Button>
        <Button tone="danger" onPress={() => setPressed('Danger')}>
          Danger
        </Button>
        <Button tone="accent" size="sm" onPress={() => setPressed('Small')}>
          Small
        </Button>
        <Button tone="neutral" disabled onPress={() => setPressed('Disabled')}>
          Disabled
        </Button>
      </View>
      <Text className="text-sm text-hozo-text-muted">Last pressed: {pressed}</Text>
    </View>
  )
}
