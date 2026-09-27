# 5. A control's value goes in the value channel, not in its content

**Status:** decided
**Date:** 2026-09-27

## Decision

When a control has both a purpose and a current value — a date field showing a
date, a time field showing a time — and a name has been given for the purpose,
the value must be exposed through the platform's **value** channel:

| | |
| --- | --- |
| React Native | `accessibilityValue={{ text }}`, and `accessible` on the element that carries it |
| Web | `aria-labelledby` composing the purpose and the value into one name |

Never left as the element's text content and nothing else. Text content is read
by some readers and not others, and "some" is the part that makes it look like it
works.

When **no** name is given, the value is the name, and neither of the above is
set. Setting both makes the value arrive twice.

## What went wrong twice

Both halves of `@hozo/form` shipped with the props that look right and a value
no reader could reach, and neither a type, a DOM test, nor a compiled-output
assertion could see either one. A device run found each.

### `TimePicker`'s fields were not elements at all

`accessibilityRole`, `accessibilityLabel` and `accessibilityValue` were all on
the field, and a React Native `View` is not an accessibility element unless it
says `accessible`. TalkBack's walk of the screen was seven items — four steppers,
the period and two triggers — and the hour and minute were on it nowhere. A
reader could press Increase Hour and had no way to hear the hour.

`android-smoke.sh` listed `9` and `30` among the nodes that are *drawn and
undescribed*, which is what a `Text` inside an inert `View` is: the elements
existed, the description did not.

Fixed in #559. `packages/form/src/time-picker.native.tsx:216` is the line.

### The triggers' values were nowhere on iOS

`DatePicker`, `DateTimePicker` and `DateRangePicker` put the formatted value in a
`Text` inside an accessible `Pressable`, with `accessibilityLabel` naming the
field. iOS **collapses the children of an accessible `Pressable`**, so the name
was the label and the value was in no element:

```
button   "Departure"        ← no value, and no other element carries one
```

A VoiceOver user heard "Departure, button" and could not hear which date was
selected. Fixed in #608:
`packages/form/src/date-picker.native.tsx:166` and its two siblings.

**Android hid it.** `BaseViewManager` joins label, state and value into one
`contentDescription`, and TalkBack reads a button's `Text` children as its
contents — so the same markup announced the value there, and the Android dump
listed the date among the *drawn and undescribed* nodes. Two device runs read
that screen before one of them could see the defect.

### And the Web had it too, on one reader of two

`<button aria-label="Departure">Thursday, September 24, 2026 at 9:30 AM</button>`

NVDA reads the content; VoiceOver on Safari does not. Its walk said `Departure
dialog pop up button` with the date nowhere. Fixed in #612:
`packages/form/src/date-picker.tsx:153` and its two siblings.

## The rule this generalises to

**A defect that one platform's redundancy hides is still a defect**, and "it
announces correctly on Android" is not evidence that it announces correctly.
The readers this project measures split two and two: TalkBack and NVDA read a
control's value out of its content, and both VoiceOvers — on iOS and on Safari —
do not. Either pair alone would have called the markup fine.

This is the concrete argument for both device rows of the verification matrix in
#148, and for `examples/screen-readers` driving two real readers rather than one.

## What was rejected

**Composing the value into `aria-label`.** Considered because `Calendar` already
composes a word into a cell's name (`"Thursday, September 10, 2026, start of
range"`). Rejected as the general rule: that composition adds a *word* the
element does not otherwise contain, while this would duplicate content that is
already there — and `aria-labelledby` expresses "these two elements, in order"
without a separator this project would have to choose.

Measured afterwards, and worth recording because it was the objection that made
`aria-labelledby` look like a trade: **neither real reader repeats the value.**

```
NVDA       button, expanded, opens dialog, Departure Thursday, September 24, 2026 at 9:30 AM
VoiceOver  Departure Thursday, September 24, 2026 at 9:30 AM dialog pop up button
```

The virtual screen reader in `examples/storybook-demo` does emit it twice, since
it reports a button as name, contents and end. That is a property of its
traversal rather than of anything a person hears, and its goldens record it as
such.

**Dropping the name and labelling the field visibly.** The ARIA-purest answer,
and it removes a prop applications are already using. Left available: a caller
who omits `accessibilityLabel` gets exactly this, and the components are
byte-identical to their pre-#612 markup in that case.

## Evidence

- `packages/form/src/time-picker.native.tsx:216` — `accessible`, without which the
  three props below it reach nobody.
- `packages/form/src/date-picker.native.tsx:166`,
  `date-time-picker.native.tsx:263`, `date-range-picker.native.tsx:177` — the
  value, only when a name displaces it.
- `packages/form/src/date-picker.tsx:153`, `date-time-picker.tsx:247`,
  `date-range-picker.tsx:169` — the Web composition.
- `packages/tailwind-conformance/src/time-picker-native.test.ts` — tree
  assertions for both shapes, which is where they belong: the props are right in
  both defects and only a rendered tree can see the difference.
- `examples/screen-readers/expected/nvda/` and `expected/voiceover/` — the
  measured phrases, with the run each line came from named in the file.
- `examples/native-demo/ios/HozoNativeDemoUITests/AccessibilityTreeTests.swift` —
  the iOS tree that found the second defect on its first run.

## When to revisit

If React Native exposes a value channel for the Web backend, or if the accessible
name computation changes how it treats a referenced hidden element, the Web half
of this is worth re-reading. A new reader in the matrix is a reason to re-measure
rather than to reopen: the decision is about which channel carries the value, and
a reader that ignores content only strengthens it.
