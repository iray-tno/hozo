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

## Status

Design is recorded in [#148](https://github.com/iray-tno/hozo/issues/148). `DatePicker`, `TimePicker` and `DateRangePicker` come next, composing this grid with [`@hozo/behaviors`](https://www.npmjs.com/package/@hozo/behaviors) for the popover, the focus scope and the dismissal.

Two things `Calendar` deliberately does not do yet. The shown month is not controllable from outside — `defaultMonth` sets it and `onMonthChange` reports it, but there is no `month` prop — and the platform-native variants (`<input type="date">` on the Web, `UIDatePicker` and Material's `DatePickerDialog` on Native) are not built. Both are additive.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
