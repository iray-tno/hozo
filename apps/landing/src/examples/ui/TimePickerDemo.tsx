import { Paragraph, View } from '@hozo/core'
import { TimePicker } from '@hozo/ui'
import { useState } from 'react'

type Time = { hour: number; minute: number }

export function TimePickerDemo() {
  const [time, setTime] = useState<Time | null>({ hour: 9, minute: 30 })
  return (
    <View className="items-start gap-3">
      <TimePicker
        accessibilityLabel="Arrival time"
        locale="en-US"
        hour12
        step={15}
        value={time}
        onChange={setTime}
      />
      <Paragraph className="text-sm text-hozo-text-body">
        {time ? `Stored as ${time.hour}:${String(time.minute).padStart(2, '0')}` : 'No time'}
      </Paragraph>
    </View>
  )
}
