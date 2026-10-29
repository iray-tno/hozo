# Date picker gap authors retain button and frame lifetimes

Test-only follow-up to [shared date picker composition](date-picker-gap-composition.md),
continuing #1230. Merge the composition fix first. No production resolver,
component, class order, ABI, Rust or eligibility change in this layer.

## Actual button interaction

DatePicker, DateRangePicker and DateTimePicker triggers, plus DateTime Done,
join delivered hover-in/press-in/press-out/hover-out/focus/blur probes. All
four owners additionally cross parent disabled/enabled updates. Done does not borrow
the inputs' disabled prop: its actual button remains available to close the
dialog. Four public caller shapes, three authors, these 36 owner/frames and
eight fixed Yoga layouts compare **3,456 observations**, all agreeing.
No-gap controls change with actual facts, while generic/nested authors
remain authoritative. Exactly one marked Pressable is required and its
owned Text receives no gap properties. This tests the real shared button,
not a Calendar child or synthesized interaction object.

## Frame evaluation and text ancestry

On all three public pickers and four caller shapes, a frozen dialog gap
getter throws if read while closed. Initial closed rendering and both close
paths leave it unread; opening and reopening project current values. Focus
on the actual trigger rereads only that button's author, not the wrapper or
dialog. A changed wrapper author is observed when its parent renders again.
The actual trigger opens, Modal.onRequestClose closes, then a hidden backdrop
(Date/Range) or the actual Done button (DateTime) closes the reopened dialog.
Each public open-change sequence is exactly [true, false, true, false].

The wrapper and dialog boxes have gap but no text properties; actual trigger
Text prefers its own explicit text override over its box text and inherited
wrapper text. Actual Calendar day Text prefers dialog color/weight over the
wrapper and inherits its font size. None receives the box gap. These checks
guard the existing cross-Modal text composition order while fixing gap; no
context/provider or element cloning is introduced.

The RN Modal stand-in intentionally retains children even when visible=false.
The closed-frame check therefore requires visible=false and no marked dialog
style, **not unmounted children**. It proves the frame's resolution gate,
not RN mounting semantics, focus restoration or OS/AT delivery.

## Verification and limits

CPU1/Idle/serial: owner file **7 tests**; combined form/pattern owner,
Native-render, host/cache and existing Native-control indicators **189 tests**,
no skips. All 1,440 rest observations and previous form/pattern state and
lifetime probes remain passing. Lint, generated docs/metadata, ABI (58 leaves,
81 names) and diff checks pass.

Public opt-in forms remain passthrough through the real Metro transform;
these caller shapes do not claim AOT form lowering. No full local root suite,
browser differential, app/Metro/device build, OS Modal/keyboard/picker/focus,
AT/pixels or performance run. No snapshot or changeset per user instruction.
Calendar/TimePicker/NativeSelect and other gap boundaries remain before
eligibility and legacy removal. Other agents' CodeBlock work is untouched;
no whole six-group family closes.
