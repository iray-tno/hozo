import { DatePicker } from '@hozo/ui'
import { useState } from 'react'

type Day = { year: number; month: number; day: number }

const TODAY: Day = { year: 2026, month: 9, day: 24 }

export function DatePickerDemo() {
  const [day, setDay] = useState<Day | null>(null)
  return (
    <DatePicker
      accessibilityLabel="Delivery day"
      locale="en-US"
      today={TODAY}
      value={day}
      onChange={setDay}
      placeholder="Pick a day"
    />
  )
}
