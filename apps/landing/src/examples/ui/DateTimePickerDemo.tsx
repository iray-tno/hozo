import { DateTimePicker } from '@hozo/ui'
import { useState } from 'react'

type Moment = { year: number; month: number; day: number; hour: number; minute: number }

const TODAY = { year: 2026, month: 9, day: 24 }

export function DateTimePickerDemo() {
  const [moment, setMoment] = useState<Moment | null>(null)
  return (
    <DateTimePicker
      accessibilityLabel="Meeting"
      locale="en-US"
      today={TODAY}
      value={moment}
      onChange={setMoment}
      placeholder="Pick a moment"
    />
  )
}
