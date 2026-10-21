import { Paragraph, View } from '@hozo/core'
import { ColorPicker } from '@hozo/ui'
import { useState } from 'react'

export function ColorPickerDemo() {
  const [color, setColor] = useState('#3b82f6')
  return (
    <View className="w-full max-w-xs gap-3">
      <ColorPicker
        accessibilityLabel="Theme colour"
        value={color}
        onChange={setColor}
        presets={['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7']}
      />
      <Paragraph className="text-sm text-hozo-text-body">{`Chosen: ${color}`}</Paragraph>
    </View>
  )
}
