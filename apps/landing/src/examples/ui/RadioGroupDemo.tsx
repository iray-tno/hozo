import { Text, View } from '@hozo/core'
import { RadioGroup } from '@hozo/ui'
import { useState } from 'react'

const SHIPPING = [
  { value: 'standard', label: 'Standard, two days' },
  { value: 'express', label: 'Express, tomorrow' },
  { value: 'pigeon', label: 'By pigeon', disabled: true },
]

export function RadioGroupDemo() {
  const [shipping, setShipping] = useState('standard')
  return (
    <View className="gap-3">
      <RadioGroup
        options={SHIPPING}
        accessibilityLabel="Shipping"
        value={shipping}
        onValueChange={setShipping}
      />
      <Text className="text-sm text-hozo-text-muted">Shipping: {shipping}</Text>
    </View>
  )
}
