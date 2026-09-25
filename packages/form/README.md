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

### Ranges

`range` turns the same grid into a range picker, and changes the shape of `value` and `onChange` with it:

```tsx
<Calendar range value={stay} onChange={setStay} accessibilityLabel="Dates of stay" />
```

`value` is then a `CalendarRange`, `{ start, end }`, and `onChange` is given one. The props are a discriminated union, so a `range` calendar handed a single `CalendarDate` does not typecheck, and neither does a single one handed a handler that expects a range — the same arrangement `Listbox` uses for `multiple`.

The half-chosen start is the component's, not the caller's. A first press is held internally and `onChange` fires only with a range that has both ends, so nothing downstream has to model a start with no end; Escape abandons it. Either end may be picked first — `orderRange` sorts the pair — because which of two dates someone clicks second is not something they should have to think about.

On the Web the grid carries `aria-multiselectable="true"` and *every* day in the range is `aria-selected="true"`, which is what the attribute means. The two ends say which end they are in their accessible name — "Thursday, September 10, 2026, start of range" — because `aria-selected` is one bit and cannot. `rangeStartLabel` and `rangeEndLabel` are those words, since Hozo owns no message catalogue ([#157](https://github.com/iray-tno/hozo/issues/157)). On React Native the same words arrive through `accessibilityValue.text`, joined here because React Native gives them one slot.

For styling, cells carry `data-hozo-range-start`, `data-hozo-range-end` and `data-hozo-in-range`, and `renderDay` receives `rangeStart`, `rangeEnd` and `inRange` on each day. None of them appear in single mode, so a stylesheet's end caps cannot leak onto a lone selected day.

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

## `TimePicker`

Two spinbuttons, and a period on a twelve-hour clock.

```tsx
import { TimePicker } from '@hozo/form'

<TimePicker value={arrival} onChange={setArrival} step={15} accessibilityLabel="Arrival time" />
```

`role="spinbutton"` on a field that can be typed as well as stepped, which is what ARIA's spinbutton is and what `<input type="time">` behaves like. A stepper that can only be stepped is the version people find unusable -- twenty-nine presses to reach half past.

Each field's `aria-valuetext` is the **whole** time rather than its own digits. A reader moving the hour wants to hear where that put the time; "14" is the one thing they already knew.

The period is a `button` rather than a third spinbutton, because a spinbutton carries `aria-valuenow` and a number for "am" is a number nobody can read. The arrows still work on it.

On React Native the fields step through a pair of buttons instead. There is no editable field there without a `TextInput`, and a `TextInput` per segment raises a keyboard over the control it is meant to be operating -- so the value moves the way a phone's own pickers move it, and each field says the whole time through `accessibilityValue.text`.

## `DateTimePicker`

A button that opens a `Calendar` and a clock in one dialog.

```tsx
import { DateTimePicker } from '@hozo/form'

<DateTimePicker
  value={departure}
  onChange={setDeparture}
  min={{ year: 2026, month: 9, day: 24, hour: 9, minute: 0 }}
  accessibilityLabel="Departure"
/>
```

`CalendarDateTime` is `CalendarDate & CalendarTime` — one flat record, not a `{ date, time }` pair. The intersection is the point: a value of that type is assignable wherever a `CalendarDate` or a `CalendarTime` is wanted, so both halves take it unchanged and only `onChange` has anything to merge.

### The time half is the caller's

`children` is a render prop, given everything the clock needs. Left out, it is a `TimePicker`:

```tsx
// The clock, with a step
<DateTimePicker value={departure} onChange={setDeparture}>
  {(time) => <TimePicker {...time} step={15} />}
</DateTimePicker>

// Or a set of slots, with the taken ones out
<DateTimePicker value={departure} onChange={setDeparture}>
  {(time) => (
    <Listbox
      options={timeOptions({ from, to, step: 30, disabled: taken })}
      value={time.value}
      onValueChange={time.onChange}
    />
  )}
</DateTimePicker>
```

Not an element with props cloned into it. [#148](https://github.com/iray-tno/hozo/issues/148) records why the two are different capabilities rather than two looks, and injection would quietly overwrite props the caller wrote — and could not reach a `Listbox` at all, whose value is an option rather than a `CalendarTime`. Forwarding the union of both controls' props through `DateTimePicker` instead is the `variant` shape [`docs/decisions/001`](https://github.com/iray-tno/hozo/blob/main/docs/decisions/001-disabled-and-focus.md) rejected: each mode carrying props the other ignores.

### One bound, two questions

`min` and `max` are whole values, so a bound can name an hour on a day. That is one fact the two halves have to read differently:

- The **grid** is bounded by the day. A minimum of 09:00 on the 24th leaves the 24th open, because its afternoon is allowed, and greying the cell out would say otherwise.
- The **clock** is bounded only on the days a bound names: 09:00 is a floor on the 24th and says nothing about the 25th.

`dateBounds` and `timeBoundsOn` are those two readings, exported because a caller assembling the same pair by hand would have to get the distinction right themselves.

Moving the day under a time that is already set can put the value outside the bounds — 08:00 showing, and the 24th pressed. The time is raised to the bound and the day is kept, because the day is what was just asked for and a cell that refuses a press looks broken.

### Done is a real control

`DatePicker` closes when a day is pressed. Here that would close before the clock had been touched, so the dialog stays open and carries an explicit Done. Escape and a press outside still dismiss it, and every change has been reported by then — Done confirms nothing, it only closes, which is why there is no Cancel beside it to imply otherwise.

## `DateRangePicker`

`DatePicker`'s shape over the range `Calendar`.

```tsx
import { DateRangePicker } from '@hozo/form'

<DateRangePicker value={stay} onChange={setStay} accessibilityLabel="Dates of stay" />
```

It closes when the range arrives, and needs no Done button to do it. A range `Calendar` reports only a range that has both ends, so the press that fires `onChange` is the press that finished the job — `DateTimePicker` has to ask because its two halves complete independently. The half-chosen start lives inside the `Calendar`, so dismissing the dialog discards it by unmounting; no partial range is ever handed out.

`rangeLabel` writes the button's text, which is also its accessible name. `Intl.DateTimeFormat.prototype.formatRange` is what collapses the parts the two ends share — "September 10 – 12, 2026" rather than the month and year twice — and it is an ES2021 addition, the same kind of unknown as `resolvedOptions`. So it is attempted, and the answer degrades to both dates in full joined by `rangeSeparator`, which the caller owns because an en dash is English and a wave dash is Japanese. The degraded form is longer rather than shorter: dropping the shared year by hand would put a locale's ordering rules in Hozo, which is the job `formatRange` exists to do.

## Status

Design is recorded in [#148](https://github.com/iray-tno/hozo/issues/148). All four components #148 lists are here. What is left is a device: no Native half of `TimePicker`, `DateTimePicker` or `DateRangePicker` has been run on a phone, and the verification matrix in #148 is still unticked.

The shown month is controllable: `defaultMonth` for the uncontrolled case, `month` plus `onMonthChange` when the caller wants to own it. Handing over a `month` and ignoring `onMonthChange` gives a grid whose paging buttons and month-crossing arrow keys appear to do nothing -- the bargain every controlled component makes, mentioned here because the keys that stop working are in the middle of the widget.

The platform-native variants -- `<input type="date">` on the Web, `UIDatePicker` and Material's `DatePickerDialog` on Native -- are set aside rather than pending. An operating system's picker cannot be styled, which puts it against the premise the library rests on: one `className`, the same result on both platforms. [#148](https://github.com/iray-tno/hozo/issues/148) says so about the Web in its own opening paragraph, and the same reasoning had never been written down for Native.

So the grid is not the fallback for a platform picker. It is the answer. A user asking for the system picker specifically is what would reopen it.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
