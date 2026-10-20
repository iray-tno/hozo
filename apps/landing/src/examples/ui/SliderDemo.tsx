import { Text, View } from '@hozo/core'
import { Slider } from '@hozo/ui'
import { useState } from 'react'

export function SliderDemo() {
  const [volume, setVolume] = useState(40)
  return (
    <View className="w-full max-w-sm gap-3">
      <Slider
        accessibilityLabel="Volume"
        value={volume}
        onValueChange={setVolume}
        valueText={(level) => `${level} percent`}
      />
      <Text className="text-sm text-hozo-text-muted">Volume: {volume}</Text>
    </View>
  )
}
