// All four of `@hozo/form`'s controls on a screen a device can be asked about.
//
// Its own surface rather than a corner of `CalendarScreen.tsx`, and the
// reason is the dump rather than the layout. `android-smoke.sh` reads the
// calendar screen with `uiautomator dump`, which reports only what is on
// screen, and that screen is already one cell short of forty-two because the
// last row sits near the bottom edge. Anything added below the grid would be
// below the fold and would not appear at all -- so it would be measured by
// nothing, which is worse than not being there.
//
// Reached through a `Modal` for the reason `CalendarScreen.tsx` gives:
// replacing the screen unmounts the acceptance screen's `FlatList`, and with
// TalkBack on that crashes React Native 0.87.1 (#512, #525).
//
// Nothing in `packages/tailwind-conformance` reads this file, the same as
// that one. `announcedByCompiler` is pointed at `App.tsx` and `Gallery.tsx`
// by name, so a new screen here is not a fixture regeneration -- and the
// opener added to `App.tsx` carries no `testID` and reuses a class list that
// is already in the fixture, so it is not one either.
//
// Every value is pinned, because a run must not depend on the day it ran.
// The time is 09:30 on a twelve-hour clock, so the period button has
// something to say; `hour12` is passed rather than inferred, because whether
// Hermes answers `resolvedOptions` is exactly one of the things this screen
// exists to find out -- the fields would read on a twenty-four hour clock if
// it does not, and the two are told apart by what is on screen.
//
// The three pickers start closed. `android-talkback.sh` opens one of them,
// which nests a `Modal` inside a `Modal` with a screen reader running -- the
// shape #512 crashed on -- and gates on the app surviving both the opening and
// the Back that closes it.
//
// `DatePicker` was the last of the four to arrive here, and its absence had a
// cost. It carried the same defect the other two did -- a named trigger whose
// value reached no reader on iOS (#608) -- and was fixed alongside them on the
// strength of sharing their shape rather than on anything measured about it.
// Every one of them carries `accessibilityLabel` for that reason: without a
// name the button's name is its own text, and the bug only exists when a name
// displaces it.

import { DatePicker, DateRangePicker, DateTimePicker, TimePicker } from '@hozo/form'
import { Text, View } from 'react-native'

const surface = { backgroundColor: '#ffffff', flex: 1, padding: 16 } as const
const heading = { fontSize: 20, marginBottom: 12 } as const
const label = { color: '#475569', fontSize: 13, marginBottom: 4, marginTop: 16 } as const

const field = {
  alignItems: 'center',
  backgroundColor: '#f1f5f9',
  borderRadius: 8,
  justifyContent: 'center',
  minWidth: 48,
  paddingVertical: 8,
} as const

const step = {
  alignItems: 'center',
  backgroundColor: '#e2e8f0',
  borderRadius: 6,
  height: 32,
  justifyContent: 'center',
  width: 32,
} as const

const trigger = {
  backgroundColor: '#e2e8f0',
  borderRadius: 8,
  padding: 12,
} as const

export default function FormScreen() {
  return (
    <View style={surface}>
      <Text accessibilityRole="header" style={heading}>
        Pickers
      </Text>

      <Text style={label}>DatePicker</Text>
      <DatePicker
        accessibilityLabel="Departure date"
        value={{ year: 2026, month: 9, day: 10 }}
        today={{ year: 2026, month: 9, day: 24 }}
        defaultMonth={{ year: 2026, month: 9 }}
        min={{ year: 2026, month: 9, day: 3 }}
        locale="en-US"
        firstDayOfWeek={1}
        triggerStyle={trigger}
      />

      <Text style={label}>TimePicker</Text>
      <TimePicker
        accessibilityLabel="Arrival time"
        value={{ hour: 9, minute: 30 }}
        step={15}
        locale="en-US"
        hour12
        style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}
        fieldStyle={field}
        stepStyle={step}
      />

      <Text style={label}>DateTimePicker</Text>
      <DateTimePicker
        accessibilityLabel="Departure"
        value={{ year: 2026, month: 9, day: 24, hour: 9, minute: 30 }}
        today={{ year: 2026, month: 9, day: 24 }}
        defaultMonth={{ year: 2026, month: 9 }}
        min={{ year: 2026, month: 9, day: 24, hour: 9, minute: 0 }}
        locale="en-US"
        hour12
        firstDayOfWeek={1}
        triggerStyle={trigger}
      />

      <Text style={label}>DateRangePicker</Text>
      <DateRangePicker
        accessibilityLabel="Dates of stay"
        value={{ start: { year: 2026, month: 9, day: 10 }, end: { year: 2026, month: 9, day: 12 } }}
        today={{ year: 2026, month: 9, day: 24 }}
        defaultMonth={{ year: 2026, month: 9 }}
        locale="en-US"
        firstDayOfWeek={1}
        triggerStyle={trigger}
      />
    </View>
  )
}
