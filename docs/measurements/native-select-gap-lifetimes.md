# NativeSelect keeps gap authors on the active owner and transport

Test-only follow-up to [NativeSelect gap composition](native-select-gap-composition.md),
continuing #1230. Merge the composition fix first. No production/Rust/ABI,
resolver, order or eligibility change in this layer.

## Control and option state

Four public caller shapes and three authors exercise ten actual control
frames (hover/press/focus/blur, a focused disabled transition and reenable),
then two selection states across three rows and two pressed snapshots. Eight
Yoga layouts give **2,112 observations**, all agreeing. No-gap controls follow
their actual facts; generic/nested authors stay authoritative. A select is
read-only; its Native expanded state must not create a Web aria-expanded
styling predicate. Disabled rows mask pressed snapshots, while selected
rows expose their own selection. Choosing the enabled Gamma row changes
the public value exactly once, closes the fallback, and reopening updates
which row is selected.

Row press snapshots are supplied to the real RN style callback, not claimed
as delivered hover/focus events. Owned label isolation is inspected on the
rendered labels; this is not a simulated OS pointer dispatch.

## Evaluation and transport

Across all four callers, frozen popup authors throw if evaluated while
unused. The logical fallback initially mounts no popup owners, opening
projects each independent author, and closing/reopening uses current values.
Changing only the option author's backing gap then invoking one actual row
callback reads that author once more without rereading control/sheet/scrim
authors. Its new style is checked with Yoga, not a parent-cached copy.
Modal request-close and the sheet's accessibility escape action both leave
closed popup authors unread. Owned option text preserves explicit textStyle
over option color and sheet text, retaining the sheet's font weight without
box-gap leakage.

The real public NativeSelectProvider is exercised on Android and iOS, plus
the default iOS ActionSheet branch: **12 caller/transport cases**. Unused
fallback gap getters throw throughout. Application presenters receive the
exact options/current value and take precedence on iOS too. Cancel does not
change the value; selection does once. The mocked system ActionSheet omits
disabled rows and retains the correct cancel index. Disabled controls invoke
neither transport. No system picker UI is presented by these probes.

## Verification and limits

CPU 1 / Idle / serial: NativeSelect owner file **4 tests**; combined related
NativeSelect/form/pattern/Native-render/host/cache/Native-control selection
**193 tests**, no skips. All 576 rest observations and previous probes remain
passing. Lint, generated docs/metadata, ABI (58 leaves, 81 names) and diff pass.

Forms remain public passthrough through real Metro and project candidates,
not default AOT form lowering. The local logical Modal gates children by
visibility, not native animation/mounting/focus semantics. No full local root
suite, browser differential, app/Metro/device build, OS picker/Modal/focus/AT,
pixels or performance run. No snapshot or changeset per user instruction.
Calendar/TimePicker and other gap/callback/tier/gate/reset/percentage/mixed
StyleX/grid boundaries remain before eligibility and legacy removal. Other
agents' work is untouched; no whole six-group family closes.
