import { Paragraph, View } from '@hozo/core'
import { Calendar } from '@hozo/ui'
import { useState } from 'react'

type Day = { year: number; month: number; day: number }

// Pinned so the page shows the same month whenever it is read.
const TODAY: Day = { year: 2026, month: 9, day: 24 }

const pad = (n: number) => String(n).padStart(2, '0')

export function CalendarDemo() {
  const [day, setDay] = useState<Day | null>(null)
  return (
    <View className="items-start gap-3">
      <Calendar
        accessibilityLabel="Delivery day"
        locale="en-US"
        today={TODAY}
        defaultMonth={{ year: 2026, month: 9 }}
        min={TODAY}
        value={day}
        onChange={setDay}
      />
      <Paragraph className="text-sm text-hozo-text-body">
        {day ? `Delivery: ${day.year}-${pad(day.month)}-${pad(day.day)}` : 'No day chosen'}
      </Paragraph>
    </View>
  )
}
