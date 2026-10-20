import { DateRangePicker } from '@hozo/ui'
import { useState } from 'react'

type Day = { year: number; month: number; day: number }
type Span = { start: Day; end: Day }

const TODAY: Day = { year: 2026, month: 9, day: 24 }

export function DateRangePickerDemo() {
  const [stay, setStay] = useState<Span | null>(null)
  return (
    <DateRangePicker
      accessibilityLabel="Stay"
      locale="en-US"
      today={TODAY}
      value={stay}
      onChange={setStay}
      placeholder="Pick your dates"
    />
  )
}
