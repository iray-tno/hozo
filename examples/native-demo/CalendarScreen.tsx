// A `Calendar` on its own screen, so a device can be asked what it says.
//
// Its own surface rather than a corner of `App.tsx`, for a reason that is
// about the harness rather than about layout. `android-talkback.sh` walks
// the acceptance screen with Tab until it laps, and gates the run on what
// was said and on reaching the dialog's opener within `MAX_STEPS`. A
// forty-two cell grid in that lap would be most of it: the lap would
// lengthen, the opener would move, and a measurement would have taken a
// gate hostage. Here the grid is somewhere the existing assertions have
// already finished with.
//
// Reached through a `Modal` rather than by replacing the screen, which is
// what the Gallery button does. Replacing it unmounts the acceptance
// screen's `FlatList`, and with TalkBack on that crashes React Native
// 0.87.1 -- see the note at the `Modal` in `App.tsx`. This file was written
// as a replacement screen first, and the device said otherwise.
//
// Nothing in `packages/tailwind-conformance` reads this file, which is the
// other half of the same care. `announcedByCompiler` is pointed at
// `App.tsx` and `Gallery.tsx` by name, and `missingOnDevice` fails when a
// `testID` in one of those is absent from the checked-in dump -- so a new
// `testID` there is a fixture regeneration, and a new screen here is not.
//
// Every value is pinned. `today` and `defaultMonth` so the month drawn does
// not depend on the day the job ran; `value` and `min` because the two
// states worth hearing are the ones a grid of plain days would not have.
// Sep 10th is selected, and Sep 1st and 2nd are below the minimum.

import { Calendar } from '@hozo/form'
import { Text, View } from 'react-native'

export default function CalendarScreen() {
  return (
    <View style={{ backgroundColor: '#ffffff', flex: 1, padding: 16 }}>
      <Text accessibilityRole="header" style={{ fontSize: 20, marginBottom: 12 }}>
        Calendar
      </Text>
      <Calendar
        accessibilityLabel="Departure date"
        today={{ year: 2026, month: 9, day: 24 }}
        defaultMonth={{ year: 2026, month: 9 }}
        value={{ year: 2026, month: 9, day: 10 }}
        min={{ year: 2026, month: 9, day: 3 }}
        locale="en-US"
        firstDayOfWeek={1}
        headerStyle={{ alignItems: 'center', flexDirection: 'row', gap: 16 }}
        weekStyle={{ flexDirection: 'row' }}
        dayStyle={{
          alignItems: 'center',
          height: 40,
          justifyContent: 'center',
          width: 44,
        }}
      />
    </View>
  )
}
