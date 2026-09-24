# @hozo/form

Accessible universal form and date-selection components for Hozo.

A separate package rather than part of [`@hozo/patterns`](https://www.npmjs.com/package/@hozo/patterns), for two reasons that are specific to this domain. Its platform-native variants reach for the operating system's own pickers — `UIDatePicker` on iOS, Material's `DatePickerDialog` on Android, the iOS wheel picker behind a select — which is an optional dependency on native code that an application using only Tabs and Tree should not acquire. And its locale and calendar data changes on a schedule of its own, which a stable widget package should not be versioned against.

## What is here today

`Calendar`, a month grid that works the same way on both platforms:

```tsx
import { Calendar } from '@hozo/form'

<Calendar
  value={departure}
  onChange={setDeparture}
  min={{ year: 2026, month: 9, day: 1 }}
  locale="ja-JP"
  accessibilityLabel="Departure date"
/>
```

On the Web it is a `role="grid"` table whose cells are reached with the arrow keys, Home and End, and PageUp/PageDown — a month, or a year with Shift. Each cell's accessible name is the whole date, weekday included, because a user arriving by arrow key never passes through the column header; the header row is hidden from the accessibility tree for the same reason.

On React Native each day is a `Pressable` inside an `accessibilityRole="grid"`. There is no keyboard half, and that is the platform rather than an omission: React Native has no tab order to rove within, so the grid is walked by TalkBack and VoiceOver and pressed with a finger.

The arithmetic underneath is exported too, and has no `Date` in its types:

```ts
import { firstDayOfWeek, monthGrid, moveFocus } from '@hozo/form'

const first = firstDayOfWeek('ja-JP') // 0, Sunday
const weeks = monthGrid({ year: 2026, month: 9, firstDayOfWeek: first })

// Arrow keys, Home/End, and PageUp/PageDown over an unbounded domain.
moveFocus({ year: 2026, month: 9, day: 29 }, 'ArrowDown') // 2026-10-06
```

`CalendarDate` is a plain `{ year, month, day }` record with `month` numbered 1-12. A month grid is made of *civil* dates, and `Date` is an instant on a timeline: building one from local parts shifts across DST and timezone boundaries, which is how a grid ends up drawing the first of the month twice, or losing the last day of it, for users east of UTC. Every calculation here goes through UTC internally, where a day is always the same length.

`moveFocus` returns `null` for a key the grid does not own and the date unchanged for a move it refuses, so a component can tell "let the event through" apart from "handled, and `preventDefault` is still owed".

## Why the week data is a table

`Intl.Locale.prototype.getWeekInfo` would say which day a locale's week starts on. It is a later addition to ECMA-402, and Hermes ships only `Collator`, `DateTimeFormat` and `NumberFormat` — the same wall [`@hozo/canvas`](https://www.npmjs.com/package/@hozo/canvas) met with `Intl.Segmenter`. A lookup that worked on the Web and guessed on a phone would mean the same month drawn two ways, so `firstDayOfWeek` is a deterministic table instead, identical on both platforms, with a prop to override it.

Month and weekday *names* are a different matter: `Intl.DateTimeFormat` does exist on both, so nothing here hand-rolls those.

## `DatePicker`

A button that opens the grid in a dialog, composed from pieces that already existed: `FloatingPositioner` anchors the panel and flips it when there is no room, `DismissableLayer` closes it on Escape and on a press outside, and `FocusScope` traps Tab and hands focus back to the button afterwards.

```tsx
import { DatePicker } from '@hozo/form'

<DatePicker value={departure} onChange={setDeparture} accessibilityLabel="Departure date" />
```

`FocusScope`'s own `autoFocus` is off and the grid's is on. The scope would focus the first tabbable thing in the dialog -- the previous-month button -- and APG puts the opening focus on the day being shown.

On React Native it is a `Modal` rather than an anchored panel. A date grid anchored to a button is most of a phone screen anyway, and `Modal` is what takes the window, routes Android's back button to `onRequestClose`, and lets `accessibilityViewIsModal` tell VoiceOver to stop offering what is behind it.

## Marking today

The two platforms say it differently, and only one of them can say it without a word.

On the Web the grid sets `aria-current="date"` and the screen reader supplies the wording in its own language. React Native has no `aria-current`, no `current` in `accessibilityState`, and no reachable `setStateDescription` ([`docs/decisions/001`](https://github.com/iray-tno/hozo/blob/main/docs/decisions/001-disabled-and-focus.md) covers why that last one is closed), so text is the only channel left -- and text needs a word. `todayLabel` is that word, defaulting to `"today"` and opting out when empty.

It reaches the announcement through `accessibilityValue.text` rather than through `accessibilityLabel`, because `BaseViewManager` joins label, state descriptions and value text with `", "` into one `contentDescription`. So React Native composes "Thursday, September 24, 2026, today" and the label stays the date.

The prop is accepted and ignored on the Web, where a word would announce the same fact twice.

## Times

`CalendarTime` is a plain `{ hour, minute }` record with an optional `second`, for the reason `CalendarDate` is one: half past nine is not an instant, and making it one means choosing a day and a zone nobody asked for. Everything goes through seconds since midnight, so stepping wraps at midnight in one place and comparing is integer arithmetic.

A minimum above a maximum is an empty range rather than one that crosses midnight. A clock is cyclic; an interval on it is not, and supporting 22:00 to 02:00 would mean every comparison asking which kind of interval it had been given.

The list half of time selection is a builder rather than a component:

```tsx
import { Listbox } from '@hozo/core'
import { timeOptions } from '@hozo/form'

<Listbox
  options={timeOptions({
    from: { hour: 9, minute: 0 },
    to: { hour: 17, minute: 0 },
    step: 30,
    locale: 'en-US',
    disabled: (at) => taken.has(at.hour * 60 + at.minute),
  })}
  value={arrival}
  onValueChange={setArrival}
  accessibilityLabel="Arrival time"
/>
```

A spinbutton expresses a continuum and cannot disable 09:37 on its own; a list expresses a set the caller owns and can. Those are different capabilities, so they stay different things, and `CalendarTime` is what makes them interchangeable. Wrapping `Listbox` instead would add a second Native half to maintain and no new behaviour. See [#148](https://github.com/iray-tno/hozo/issues/148).

## Status

Design is recorded in [#148](https://github.com/iray-tno/hozo/issues/148). `TimePicker` and `DateRangePicker` come next.

The shown month is controllable: `defaultMonth` for the uncontrolled case, `month` plus `onMonthChange` when the caller wants to own it. Handing over a `month` and ignoring `onMonthChange` gives a grid whose paging buttons and month-crossing arrow keys appear to do nothing -- the bargain every controlled component makes, mentioned here because the keys that stop working are in the middle of the widget.

The platform-native variants (`<input type="date">` on the Web, `UIDatePicker` and Material's `DatePickerDialog` on Native) are not built. That stays additive.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
