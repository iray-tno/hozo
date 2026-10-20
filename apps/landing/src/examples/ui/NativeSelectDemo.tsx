import { View } from '@hozo/core'
import { Field, NativeSelect } from '@hozo/ui'
import { useState } from 'react'

const COURIERS = [
  { value: 'post', label: 'Post office' },
  { value: 'bike', label: 'Bike courier' },
  { value: 'drone', label: 'Drone', disabled: true },
]

export function NativeSelectDemo() {
  const [courier, setCourier] = useState<string>()
  return (
    <View className="w-full max-w-md">
      <Field label="Courier" description="Who carries it to the door.">
        {(control) => (
          <NativeSelect
            {...control}
            options={COURIERS}
            placeholder="Choose a courier"
            value={courier}
            onValueChange={setCourier}
          />
        )}
      </Field>
    </View>
  )
}
