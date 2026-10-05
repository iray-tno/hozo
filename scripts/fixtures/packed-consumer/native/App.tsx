import { setAccessibilityFocusMover } from '@hozo/behaviors/native'
import { Text, View } from '@hozo/core'
import { moveAccessibilityFocus } from '@hozo/native'
import { Button } from '@hozo/ui'

setAccessibilityFocusMover(moveAccessibilityFocus)

export default function App() {
  return (
    <View className="p-4">
      <Text>Packed Native consumer</Text>
      <Button tone="accent">Packed button</Button>
    </View>
  )
}
