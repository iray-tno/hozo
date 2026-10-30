# Shared date picker owners compose authored gaps before class axes

Continuing #1230, the shared date picker frame and PickerButton now project
the authored contribution before mixing it with class axes and splitting
box/text styles. This covers DatePicker, DateRangePicker and DateTimePicker
wrapper/trigger/dialog styles, plus DateTimePicker's Done style: ten public
style inputs, implemented at three shared composition boundaries in two files.

## Reproduction and result

The public form matrix adds these ten owners to the five already assessed.
Four caller shapes, three authors and eight fixed Yoga layouts now compare
**1,440 rest observations**. The unchanged production baseline reproduced
**640 differences**, the two gap authors on all ten new owners. The fix
reduces that to **zero**, retaining the previous form cases. No-gap controls
retain class axes; nested authors retain their explicit row override. Frozen
inputs are unchanged, exactly one correctly typed marked host is required,
Modal.visible and trigger/Done roles are checked, and gap does not leak to
owned Text labels. These are matrix counts, not headline coverage percentages.

The raw/literal/opaque/spread form callers remain public Native components
through the real Metro transform and generated candidate sheet. Form is not
a default semantic lowering source; this does not claim AOT form lowering.
The existing wrapper identity assertion prevents counting a replacement as
the original form implementation.

The closed-frame conditional still surrounds dialog class resolution and
author projection. Text inheritance order is unchanged. No cache, provider,
subscription, new resolver, class order, public API, ABI or eligibility change.

## Verification

CPU1/Idle/serial:

- Form typecheck/build and serial compiled unit suite: **179 tests**, no skips.
- Form owner file: **5 tests**, no skips; all 1,440 rest observations agree.
- Serial form/pattern owner, Native-render, Native-host/cache and existing
  Native-control indicators selection: **187 tests**, no skips.
- Source-cache guards include both shared files and the three public Native
  picker implementations. Existing source globs cover those and the pure
  authored-gap helper; no production dependency or broader glob is added.
- Lint, generated docs/metadata, ABI (58 leaves, 81 names) and diff checks pass.

## Limits

No full local root suite, browser differential, app/Metro/device build,
OS Modal/focus/AT delivery, Native pixels or performance measurement.
RN hosts and fixed numeric-gap Yoga layouts do not prove widget geometry.
Delivered interaction, closed-frame evaluation and label inheritance are the
next test layer. Calendar/TimePicker/NativeSelect authors and the other
gap/callback/tier/gate/reset/percentage/mixed StyleX/grid boundaries remain
before whole-gap eligibility and legacy removal. No Rust, snapshot or
changeset (per user instruction). No whole six-group family closes; other
agents' CodeBlock work remains untouched.
