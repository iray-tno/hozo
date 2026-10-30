# NativeSelect composes authored gaps at its actual owners

Continuing #1230, NativeSelect projects control, sheet, scrim and option
authors before composing class axes and splitting text. The scrim keeps its
unopened author untouched: system/presenter paths must not eagerly evaluate
fallback styles. Row projection stays in the existing actual row callback;
no parent preprocessing or cache is introduced.

## Reproduction

The four public style inputs are tested through raw/literal/opaque/spread
callers and three authors. Control is tested both with and without the
intrinsic indicator layout; optionStyle must reach both fallback rows.
These five presentations select six host channels. Eight Yoga layouts give
**576 observations**, with **384 pre-fix differences** on generic/nested gap
authors. After the fix all agree. Exactly the real hosts, combobox value,
modal visibility, modal/row/scrim roles, hidden indicator, Text isolation
and unchanged frozen inputs are required. No absent popup counts as support.

As with the other form probes, the real Metro transform retains these public
opt-in Native form components; wrapper identity is asserted. Classes come
from a real generated candidate sheet. This is not default AOT form lowering.

The local RN adapter re-exports the existing stand-in hosts but supplies a
logical Modal that renders its children only when visible. It establishes
which callback/style owners exist in this probe, not OS dismissal animation,
Fabric mounting or accessibility focus. The generic Native harness and its
other tests are unchanged.

## Verification

CPU 1 / Idle / serial:

- Form typecheck/build and compiled serial units: **179 tests**, no skips.
- NativeSelect owner file: **1 test**, all 576 comparisons agree.
- Combined NativeSelect/form/pattern owner, Native-render, host/cache and
  existing Native-control indicators: **190 tests**, no skips.
- Source-cache guards include the actual NativeSelect implementation;
  existing source inputs cover the public barrel and generated gap helper.
- Lint, generated docs/metadata, ABI (58 leaves, 81 names) and diff pass.

## Limits

No full local root suite, browser differential, app/Metro/device build,
OS picker/Modal/focus/AT, pixels or performance measurement. Selection
callbacks and transports are unchanged. State, unused chrome and presenter/
system routing probes follow in a test-only layer. Calendar/TimePicker,
other packages, callbacks, tier/gate/reset/percentage/mixed StyleX/grid
remain before whole-gap eligibility and legacy removal. No resolver/order/
context/provider/ABI/eligibility/snapshot/Rust change or changeset (per user
instruction). No whole six-group family closes; other agents' work is untouched.
