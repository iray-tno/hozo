# Calendar and clock gap authors retain actual owner lifetimes

Test-only follow-up to [Calendar/TimePicker gap composition](calendar-time-gap-composition.md),
continuing #1230. Merge the composition fix first. No production resolver,
component, class order, ABI, Rust or eligibility change in this layer.

## Actual interaction and disabled semantics

The selected day, next-month button, hour step and period button receive real
component hover/press/focus/blur handlers and disabled/reenabled updates.
Four public caller shapes, three authors, ten frames per owner and eight
Yoga layouts compare **3,840 observations**, all agreeing. Generic/nested
authors remain authoritative; no-gap controls follow their own actual facts.

dayClassName belongs to the Web td, not a disabled HTML button. The selected
day retains delivered focus when bounds make it aria-disabled; that fact
must not invent a :disabled style. Month/step/period buttons instead reset
their disabled interaction as their actual Web button owner does. Roles,
disabled props and gap isolation from owned Text remain asserted.

## Evaluation and behavior

Across all four callers, frozen Calendar root/header/day/month authors are
independent. Focusing one day rereads its author once more, observes its new
gap, leaves other authors unchanged and keeps renderDay at 42 calls. Paging
the actual next-month button emits exactly one month callback, rerenders the
42 days and observes current parent/day authors. Week rows retain their own
gap and row direction below a separately classed grid. Opaque renderDay Text
keeps its exact caller-owned style object, not cloned/inherited decoration.
Primitive labels retain owned dayTextStyle over inherited wrapper text.

TimePicker step focus rereads only that actual button's author. Adjustable
value focus does not reread root/field/step authors, and its class axes stay
separate from the containing field's authored gap. Actual accessibility
actions reject 08:30 below a 09:00 bound and 10:30 above a 10:00 bound, emit 09:45 then 10:00 once
each, and reject the next step. Disabled actions and step presses emit no
change. Accepted parent updates observe current root/field authors, while
owned value/step Text retains existing explicit/inherited precedence.

The initial new clock fixture omitted the explicit second: 0 returned by the
existing seconds-based time rules. The exact expected records were corrected
after inspecting that implementation; no production arithmetic, expected
hour/minute, bound or assertion strength changed. Both test logs are retained.

## Verification and limits

CPU 1 / Idle / serial: owner file **4 tests**; combined Calendar/TimePicker,
NativeSelect/form/pattern, Native-render, host/cache and Native-control
selection **197 tests**, no skips. All 5,472 rest observations and previous
probes remain passing. Lint, generated docs/metadata, ABI (58 leaves,
81 names) and diff pass.

These are real public Native form sources and actual Metro/project candidates,
not default AOT form lowering. RN hosts/handlers and fixed numeric-gap Yoga
layouts do not establish OS focus/gesture/AT or widget pixels. No full local
root suite, browser differential, app/Metro/device build, Native/Fabric/AT or
performance run. Local callback counts are not a whole-app rendering guarantee.
No snapshot or changeset per user instruction. Other package/callback/tier/
gate/reset/percentage/mixed StyleX/grid/logical boundaries remain before gap
eligibility and legacy removal; no whole six-group family closes. Other
agents' work remains untouched.
