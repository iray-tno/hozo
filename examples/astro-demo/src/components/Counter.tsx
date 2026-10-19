import { Button, Text, View } from '@hozo/core'
import { useState } from 'react'

// Interactive: needs a `client:` directive where it is used. Without one,
// Astro renders the button and drops `onPress`.
export function Counter() {
  const [count, setCount] = useState(0)
  return (
    <View className="mt-6 flex-row items-center gap-4">
      <Button
        accessibilityLabel="Add one"
        className="rounded-lg bg-brand px-4 py-3 text-white"
        onPress={() => setCount(count + 1)}
      >
        Add one
      </Button>
      <Text className="text-white">Pressed {count} times</Text>
    </View>
  )
}
