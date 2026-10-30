# Calendar and TimePicker compose authored gaps at the actual owner

Continuing #1230, Calendar root/header/day/month-button and TimePicker root/
field-group contributions now use the existing author projection before
class composition and box/text separation. Six placements in two files;
no new resolver, provider, context, cache, order policy or eligibility.

## Reproduction and result

Seven public style inputs have eight class-source presentations: TimePicker
fieldStyle is intentionally shared by two field groups and the period, but
fieldClassName and periodClassName belong to different owners. Fifty-seven
selected host channels, four caller shapes, three authors and eight Yoga
layouts give **5,472 observations**. The unchanged production baseline has
**3,136 differences**; the fix reduces them to zero.

Calendar dayStyle must reach all 42 actual day hosts and monthButtonStyle
both month controls. TimePicker stepStyle must reach all four step buttons.
The existing shared button projection already handles steps and the period;
they remain equality controls, not additional production changes. A no-gap
fieldStyle keeps the field class axes on the groups but cannot borrow those
classes for the period, and vice versa. Frozen nested authors keep their own
axis overrides. Exact host counts/roles, period label and Text gap isolation
are required; absent or wrongly repeated owners cannot pass.

An initial fixture expected the English period name Period. The actual
message catalogue says AM or PM; that setup expectation was corrected before
measuring the unchanged-production baseline. Both logs are retained. No
product word, value or assertion was relaxed to hide a gap mismatch.

The public form imports remain passthrough through actual Metro and the
generated candidate sheet; wrapper identity is asserted. This is not a
claim of default AOT form lowering. Calendar weekStyle and grid ownership,
custom labels, date/clock algorithms and public APIs are unchanged.

## Verification and limits

CPU 1 / Idle / serial: Form typecheck/build and serial compiled unit suite
**179 tests**; new owner file **1 test**; combined Calendar/TimePicker,
NativeSelect/form/pattern, Native-render, host/cache and Native-control
selection **194 tests**, all passing with no skips. Lint, generated docs/
metadata, ABI (58 leaves, 81 names), diff and source-cache guard/dry-input
checks pass. Source probes cover both actual implementations and their
format/rule helpers without adding a production dependency or broader glob.

No full local root suite, browser differential, app/Metro/device build,
Native pixels/Fabric/AT or performance run. These are real source owners
with stand-in RN hosts and bounded numeric-gap Yoga layouts, not widget
geometry or OS interaction evidence. Actual state/selection/step boundaries
and evaluation lifetimes follow in a test-only layer. Other packages,
callbacks, tier/gate/reset/percentage/mixed StyleX/grid and logical-property
boundaries remain before gap eligibility and legacy removal. No Rust,
snapshot or changeset (per user instruction); no whole six-group family
closes. Other agents' work is untouched.
