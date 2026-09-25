import {
  Calendar,
  type CalendarDate,
  type CalendarDateTime,
  type CalendarRange,
  type CalendarTime,
  DateRangePicker,
  DateTimePicker,
  TimePicker,
} from '@hozo/form'
import { View } from '@hozo/primitives'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

/**
 * Every date in this file is pinned.
 *
 * `today` is a prop on all four components for exactly this reason: the grid
 * marks a day with `aria-current`, and a golden reading order that let the
 * real clock decide which day that was would change on its own overnight.
 */
const TODAY: CalendarDate = { year: 2026, month: 9, day: 24 }
const SEPTEMBER = { year: 2026, month: 9 }

const panel = 'max-w-xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm'
const title = 'text-xl font-bold text-slate-900'
const prose = 'text-sm text-slate-600'

const grid = 'w-full border-collapse text-sm'

/**
 * Every colour here clears 4.5:1, because `check-a11y.mjs` runs axe with no
 * rule filtering and three of the first five findings it ever made were about
 * computed colour. So a greyed-out day is `slate-500` struck through rather
 * than the `slate-300` a designer would reach for.
 */
const cellBase =
  'p-2 text-center text-slate-700 cursor-pointer rounded-lg aria-disabled:text-slate-500 aria-disabled:line-through aria-disabled:cursor-not-allowed data-[hozo-outside]:text-slate-500 data-[hozo-outside]:italic'
const cell = `${cellBase} aria-selected:bg-indigo-600 aria-selected:text-white`

/**
 * The range cell takes its colours from the data attributes only.
 *
 * Every day in a range is `aria-selected`, middles included, so painting on
 * that flag would put white text on the pale middle and fail contrast. The
 * three data attributes are mutually exclusive by construction -- `inRange`
 * is selected-and-neither-end -- so there is no ordering question either.
 */
const rangeCell = `${cellBase} data-[hozo-in-range]:bg-indigo-100 data-[hozo-range-start]:bg-indigo-600 data-[hozo-range-start]:text-white data-[hozo-range-end]:bg-indigo-600 data-[hozo-range-end]:text-white`
const trigger =
  'px-4 py-2.5 text-sm font-medium text-slate-700 rounded-lg border border-slate-300 hover:border-indigo-500'
const dialog = 'mt-2 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg'
const field =
  'px-3 py-2 w-12 text-center text-sm font-medium text-slate-900 rounded-lg bg-slate-100'

function MonthGridDemo() {
  const [day, setDay] = useState<CalendarDate | null>({ year: 2026, month: 9, day: 10 })
  return (
    <View className={panel}>
      <Heading level={2} className={title}>
        Calendar (@hozo/form)
      </Heading>
      <Paragraph className={prose}>
        A grid of days reached with the arrow keys, Home and End, and PageUp or PageDown -- a month,
        or a year with Shift. Each cell is named with the whole date, because a user arriving by
        arrow key never passes through the column header.
      </Paragraph>
      <Calendar
        value={day}
        onChange={setDay}
        today={TODAY}
        defaultMonth={SEPTEMBER}
        min={{ year: 2026, month: 9, day: 3 }}
        locale="en-US"
        firstDayOfWeek={1}
        accessibilityLabel="Departure date"
        className={grid}
        dayClassName={cell}
      />
    </View>
  )
}

function RangeGridDemo() {
  const [stay, setStay] = useState<CalendarRange | null>({
    start: { year: 2026, month: 9, day: 10 },
    end: { year: 2026, month: 9, day: 12 },
  })
  return (
    <View className={panel}>
      <Heading level={2} className={title}>
        Calendar, range mode
      </Heading>
      <Paragraph className={prose}>
        The grid says it selects more than one day, and every day in the range is selected. The two
        ends say which end they are in their own name, because a selected flag is one bit and
        cannot.
      </Paragraph>
      <Calendar
        range
        value={stay}
        onChange={setStay}
        today={TODAY}
        defaultMonth={SEPTEMBER}
        locale="en-US"
        firstDayOfWeek={1}
        accessibilityLabel="Dates of stay"
        className={grid}
        dayClassName={rangeCell}
      />
    </View>
  )
}

function ClockDemo() {
  const [arrival, setArrival] = useState<CalendarTime | null>({ hour: 9, minute: 30 })
  return (
    <View className={panel}>
      <Heading level={2} className={title}>
        TimePicker
      </Heading>
      <Paragraph className={prose}>
        Spinbuttons that can be typed as well as stepped. Each field announces the whole time rather
        than its own digits, because a reader moving the hour wants to hear where that put the time.
      </Paragraph>
      <TimePicker
        value={arrival}
        onChange={setArrival}
        step={15}
        locale="en-US"
        hour12
        accessibilityLabel="Arrival time"
        className="flex flex-row items-center gap-2"
        fieldClassName={field}
        periodClassName={`${field} cursor-pointer`}
      />
    </View>
  )
}

function DateAndTimeDemo() {
  const [departure, setDeparture] = useState<CalendarDateTime | null>({
    year: 2026,
    month: 9,
    day: 24,
    hour: 9,
    minute: 30,
  })
  return (
    <View className={panel}>
      <Heading level={2} className={title}>
        DateTimePicker
      </Heading>
      <Paragraph className={prose}>
        Open on mount, so the reading order below covers the dialog. It closes on Done rather than
        on a day press, because a day press happens before the clock has been touched.
      </Paragraph>
      <DateTimePicker
        defaultOpen
        value={departure}
        onChange={setDeparture}
        today={TODAY}
        defaultMonth={SEPTEMBER}
        min={{ year: 2026, month: 9, day: 24, hour: 9, minute: 0 }}
        locale="en-US"
        hour12
        firstDayOfWeek={1}
        accessibilityLabel="Departure"
        triggerClassName={trigger}
        dialogClassName={dialog}
        calendarClassName={grid}
        dayClassName={cell}
        doneClassName={trigger}
      />
    </View>
  )
}

function DateRangeDemo() {
  const [stay, setStay] = useState<CalendarRange | null>(null)
  return (
    <View className={panel}>
      <Heading level={2} className={title}>
        DateRangePicker
      </Heading>
      <Paragraph className={prose}>
        Open on mount, and with nothing chosen yet, so the trigger reads its placeholder. There is
        no Done button: the grid reports only a range with both ends, so the press that completes it
        is the press that finished the job.
      </Paragraph>
      <DateRangePicker
        defaultOpen
        value={stay}
        onChange={setStay}
        today={TODAY}
        defaultMonth={SEPTEMBER}
        locale="en-US"
        firstDayOfWeek={1}
        accessibilityLabel="Dates of stay"
        triggerClassName={trigger}
        dialogClassName={dialog}
        calendarClassName={grid}
        dayClassName={rangeCell}
      />
    </View>
  )
}

function FormShowcase() {
  return (
    <View className="flex flex-col items-center gap-8">
      <MonthGridDemo />
      <RangeGridDemo />
      <ClockDemo />
    </View>
  )
}

const meta = {
  title: 'Form/Date and time',
  component: FormShowcase,
} satisfies Meta<typeof FormShowcase>

export default meta
export const Showcase: StoryObj<typeof meta> = { render: () => <FormShowcase /> }
export const MonthGrid: StoryObj<typeof meta> = { render: () => <MonthGridDemo /> }
export const Range: StoryObj<typeof meta> = { render: () => <RangeGridDemo /> }
export const Clock: StoryObj<typeof meta> = { render: () => <ClockDemo /> }
export const DateAndTime: StoryObj<typeof meta> = { render: () => <DateAndTimeDemo /> }
export const DateRange: StoryObj<typeof meta> = { render: () => <DateRangeDemo /> }
