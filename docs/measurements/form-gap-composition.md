# Form owners compose authored gaps before class axes

Continuing #1230: Form.style, TextArea.style/fieldStyle/countStyle and
FileDropzone.style now project their own author before class composition.
They reuse the existing generated gap helper; no new resolver, context,
subscription, class order, ABI or eligibility is introduced. TextArea growth
still reads the same resolved field style that it draws. FileDropzone still
separates label text from its box after composing the contributions.

## Reproduction

Five public owners, four caller shapes (raw export, literal, opaque class
value and spread author), three authors and eight Yoga layouts give **480
observations**. The unchanged production baseline reproduced **320
mismatches**, exactly the generic/nested gap authors across all owners.
After the fix all 480 agree. No-gap controls retain the class axes; nested
authors retain their explicit axis; frozen inputs remain unchanged. Exactly
one correctly typed host is required, along with the field's editable/value
props, hidden counter, enabled picker button and box/text gap separation.

These are **not four AOT form paths**. The opt-in @hozo/form package is not a
default semantic lowering source. A separate public View keeps the real
Metro transform active; each wrapper must still return the original public
form component. Its classes resolve through the actual generated project
candidate sheet. No compiler-source list or package API is changed to make
the fixture pass. The initial form-only fixture was declined by Metro; that
setup failure is not a product defect or counted observation.

The public Native barrel also exposed two missing host-probe exports:
Keyboard.dismiss and ActionSheetIOS. The stub now permits observing dismiss
calls, but an attempted iOS action sheet throws rather than claiming to
present OS UI. Both missing-export setup failures are retained separately
from the subsequent 320-mismatch baseline.

## Verification

CPU1/Idle/serial:

- Form typecheck/build and serial compiled unit suite: **179 tests**, no skips.
- New owner matrix: **1 test**, all 480 comparisons pass.
- Form/pattern owner, Native-render, Native-host and source-cache selection:
  **52 tests**, no skips. The final public-wrapper assertion also passes.
- Existing Native control indicators: **131 tests**, no skips.
- Source-cache guards include all three implementation files, public barrel
  and their local helpers. Turbo's existing all-package source input covers
  them and the generated gap helper; no production dependency is added.
- Lint, generated docs/metadata/ABI (58 leaves, 81 names) and diff checks pass.

## Limits

No full local root suite, browser differential, app/Metro/device build,
actual keyboard or picker UI, AT/pixels or performance run. These are Native
mock-host sources and fixed numeric-gap Yoga layouts, not widget geometry
or headline compatibility coverage. No snapshot or Rust change. No changeset
per user instruction. Interaction/evaluation lifetimes follow separately;
date/time/select owners, other packages, callbacks, tier/gate/reset/
percentage/mixed StyleX/grid boundaries remain before whole-gap eligibility
and legacy removal. CodeBlock body/windowing/cache and other agents' claims
are untouched; no whole six-group family closes.
