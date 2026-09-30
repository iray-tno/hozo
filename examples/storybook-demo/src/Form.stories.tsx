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

/*
 * Each picker has a closed story and an open one.
 *
 * Opening one on mount used not to work. `check-utterances.mjs` decided a
 * story had ended when the cursor wrapped back to the node it started on, and
 * with `aria-modal="true"` the traversal never leaves the dialog to reach that
 * node again -- so the walk burned its whole budget and the story was reported
 * as never finishing. Size was never the problem: the 325-phrase showcase
 * finished inside the same 400 steps.
 *
 * `utterance-walk.mjs` now stops when a node says the same thing twice, which
 * a confined cycle does wherever it closes. So the open stories exist, and
 * they are what #560 asked for: a golden for what a reader hears *inside* an
 * overlay rather than up to the button that opens it.
 *
 * Both, not either. The closed reading order is what a reader meets first and
 * is worth keeping approved on its own.
 */

const panel = 'max-w-xl w-full space-y-6 rounded-2xl bg-white p-8 shadow-sm'
const title = 'text-xl font-bold text-slate-900'
const prose = 'text-sm text-slate-600'

const grid = 'w-full border-collapse text-sm'

/**
 * The month header, and the reason it is here rather than defaulted.
 *
 * The header is a button, a `div` holding the month, and a button. A `div` is
 * block, so with no class on the row the month breaks the line and the two
 * chevrons end up above and below it -- which is what Storybook showed. Hozo
 * ships no CSS, so there is no default that could have prevented it; the row
 * has to be asked for.
 */
const header = 'flex flex-row items-center justify-between gap-4 mb-2'

/**
 * The two month buttons, which are otherwise four pixels wide.
 *
 * They hold `‹` and `›` and nothing else, and Preflight gives a `<button>` no
 * padding, so a browser draws them the width of the glyph -- measured at 4.4px
 * against WCAG 2.5.8's 24 by 24. Hozo ships no CSS, so the size is the
 * application's to give and `monthButtonClassName` is where it gives it.
 *
 * `disabled:` rather than a hover-only style, because a month with nothing
 * reachable in it disables its button and a control that looks identical
 * either way is a control that lies.
 *
 * `slate-500` for that state and not the `slate-400` a designer would reach
 * for, on the same grounds as `cellBase` below. axe skips a real `disabled`
 * control when it checks contrast, so this would pass either way; the rule
 * this file follows is that a greyed-out thing is still readable, and a rule
 * kept only where it is enforced is not one.
 */
const monthButton =
  'px-3 py-1 text-slate-700 rounded-lg hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:text-slate-500 disabled:hover:bg-transparent disabled:cursor-not-allowed'

/**
 * The clock, spelled out rather than left to the default.
 *
 * `DateTimePicker` renders a `TimePicker` when `children` is left out, and it
 * forwards no classes to it -- deliberately, since forwarding both controls'
 * props through one component is the `variant` shape #148 rejected. So the
 * default one is unstyled, and unstyled means three block `div`s in a column.
 * That is what Storybook showed inside the dialog, and the render prop is the
 * answer the component is built around.
 */
const clock = 'flex flex-row items-center gap-2'

/**
 * Every colour here clears 4.5:1, because `check-a11y.mjs` runs axe with no
 * rule filtering and three of the first five findings it ever made were about
 * computed colour. So a greyed-out day is `slate-500` struck through rather
 * than the `slate-300` a designer would reach for.
 *
 * The focus ring is on the cell because the cell is the tab stop: this grid
 * moves a roving `tabIndex` across the `<td>`s themselves rather than putting a
 * button in each. Without it the arrow keys move and nothing on screen says
 * where they went, which `check-appearance.mjs` found in three of these stories
 * at once.
 */
const cellBase =
  'p-2 text-center text-slate-700 cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 aria-disabled:text-slate-500 aria-disabled:line-through aria-disabled:cursor-not-allowed data-[hozo-outside]:text-slate-500 data-[hozo-outside]:italic'
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
  'px-4 py-2.5 text-sm font-medium text-slate-700 rounded-lg border border-slate-300 hover:border-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
const dialog = 'mt-2 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg'
/**
 * The two arrow layouts, which are one markup and two stylesheets.
 *
 * A field is a group holding an up arrow, the value and a down arrow, in that
 * order, and `data-hozo-step` says which arrow is which. That is enough for
 * both layouts people expect from a time field: pinned inside the field's
 * right edge, or above and below it the way the Native half draws them. Hozo
 * ships no CSS and has no `variant` prop -- #148 and ADR 001 -- so the
 * difference lives here, in the application, which is the point being shown.
 */
const inlineField =
  'relative w-16 min-h-12 py-2 pl-2 pr-6 text-center text-sm font-medium text-slate-900 rounded-lg bg-slate-100'

/**
 * The value, which is the element a pointer has to hit and the one that takes
 * focus -- and which had no class at all until `valueClassName` existed.
 *
 * `check-appearance.mjs` measured it at 36 by 20 in this layout and 9 by 20 in
 * the stacked one, against WCAG 2.5.8's 24 by 24, and with no focus ring in
 * either: `fieldClassName` dresses the group around it, so there was nowhere to
 * put one. That is what #686 added the prop for, and this is the same fix the
 * styled `TimePicker` in `@hozo/ui` makes.
 */
const fieldValue =
  'inline-flex min-h-6 min-w-6 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
/**
 * The two arrows meet at the field's middle rather than at its edges.
 *
 * `top-1`/`bottom-1` pinned them a few pixels from the top and bottom, which
 * is centred as a pair -- their midpoint is the field's -- and reads as two
 * arrows in the corners with the number between them. A stepper is a pair, so
 * the pair is what gets placed: `bottom-1/2` puts the up arrow's lower edge on
 * the middle, `top-1/2` puts the down arrow's upper edge there, and one pixel
 * of margin each keeps them from touching.
 *
 * Each one is 24 by 24. They were the glyph's own size -- `check-appearance.mjs`
 * measured **9 by 9** -- which is a third of what WCAG 2.5.8 asks and is why
 * this file's other comment about four-pixel month buttons was only half the
 * story: the same mistake was two constants below it. The field is `min-h-12`
 * so a 24px pair fits inside it without the arrows touching.
 */
const inlineStep =
  'absolute right-1 inline-flex size-6 items-center justify-center text-[9px] leading-none text-slate-500 hover:text-indigo-600 cursor-pointer data-[hozo-step=increase]:bottom-1/2 data-[hozo-step=increase]:mb-px data-[hozo-step=decrease]:top-1/2 data-[hozo-step=decrease]:mt-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'

const stackedField =
  'flex flex-col items-center gap-0.5 w-12 px-2 py-1 text-center text-sm font-medium text-slate-900 rounded-lg bg-slate-100'
const stackedStep =
  'inline-flex size-6 items-center justify-center text-[9px] leading-none text-slate-500 hover:text-indigo-600 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'

/**
 * The period, which is a button rather than a third spinbutton and has no
 * arrows. 48 by 36, and it needed the focus ring it did not have: it is a tab
 * stop, and a keyboard user reaching it saw nothing happen.
 */
const period =
  'px-3 py-2 w-12 text-center text-sm font-medium text-slate-900 rounded-lg bg-slate-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'

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
        className="w-full"
        headerClassName={header}
        monthButtonClassName={monthButton}
        gridClassName={grid}
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
        className="w-full"
        headerClassName={header}
        monthButtonClassName={monthButton}
        gridClassName={grid}
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
        className={clock}
        fieldClassName={inlineField}
        valueClassName={fieldValue}
        stepClassName={inlineStep}
        periodClassName={period}
      />
      <Paragraph className={prose}>
        The same component again, with the arrows above and below instead. Both are the same markup:
        only the two class names differ, and a keyboard user cannot tell them apart -- the arrows
        are out of the tab order, because the field already answers Up and Down.
      </Paragraph>
      <TimePicker
        value={arrival}
        onChange={setArrival}
        step={15}
        locale="en-US"
        hour12
        accessibilityLabel="Arrival time, stacked arrows"
        className={clock}
        fieldClassName={stackedField}
        valueClassName={fieldValue}
        stepClassName={stackedStep}
        periodClassName={period}
      />
    </View>
  )
}

function DateAndTimeDemo({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
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
        A button that opens a grid and a clock in one dialog. It closes on Done rather than on a day
        press, because a day press happens before the clock has been touched.
      </Paragraph>
      <DateTimePicker
        defaultOpen={initiallyOpen}
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
        calendarClassName="w-full"
        headerClassName={header}
        monthButtonClassName={monthButton}
        gridClassName={grid}
        dayClassName={cell}
        doneClassName={trigger}
      >
        {(time) => (
          <TimePicker
            {...time}
            className={clock}
            fieldClassName={stackedField}
            valueClassName={fieldValue}
            stepClassName={stackedStep}
            periodClassName={period}
          />
        )}
      </DateTimePicker>
    </View>
  )
}

function DateRangeDemo({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [stay, setStay] = useState<CalendarRange | null>(null)
  return (
    <View className={panel}>
      <Heading level={2} className={title}>
        DateRangePicker
      </Heading>
      <Paragraph className={prose}>
        Nothing chosen yet, so the trigger reads its placeholder. There is no Done button: the grid
        reports only a range with both ends, so the press that completes it is the press that
        finished the job.
      </Paragraph>
      <DateRangePicker
        defaultOpen={initiallyOpen}
        value={stay}
        onChange={setStay}
        today={TODAY}
        defaultMonth={SEPTEMBER}
        locale="en-US"
        firstDayOfWeek={1}
        accessibilityLabel="Dates of stay"
        triggerClassName={trigger}
        dialogClassName={dialog}
        calendarClassName="w-full"
        headerClassName={header}
        monthButtonClassName={monthButton}
        gridClassName={grid}
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
export const DateAndTimeOpen: StoryObj<typeof meta> = {
  render: () => <DateAndTimeDemo initiallyOpen />,
}
export const DateRangeOpen: StoryObj<typeof meta> = {
  render: () => <DateRangeDemo initiallyOpen />,
}
