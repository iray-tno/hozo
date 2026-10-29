# Form gap authors retain actual-owner state and evaluation lifetimes

Test-only follow-up to [form gap composition](form-gap-composition.md),
continuing #1230. Merge that fix first. No production/Rust/ABI, resolver,
class order, eligibility or headline compatibility changes in this layer.

## Interaction and editable state

The actual TextArea input receives focus/blur, then disabled, read-only and
editable updates. The actual FileDropzone Pressable receives hover/press/
focus and disabled updates. Four public caller shapes, three authors and
eight Yoga layouts compare **1,440 observations**, with no differences.
No-gap controls follow their own real facts; generic/nested authors remain
authoritative. The TextArea wrapper and counter cannot borrow the input's
author or interaction. FileDropzone's Native busy announcement does not
manufacture an aria-busy styling predicate absent from the Web button.

These are public opt-in form components retained through a real Metro
transform and backed by the generated project sheet, not an AOT form
lowering claim. No authored classes are replaced by test-written styles.

## Evaluation and behavior

Across all four caller shapes:

- A frozen TextArea counter gap getter throws if read while the counter is
  unmounted. It stays unread before maxLength exists and after removal.
  Revealing the counter reflects its current author, hides it from AT and
  gives the input the same text as its hint. Input changes preserve the
  value; actual content-size callbacks give heights 48 -> 88 -> 108 using
  the drawn field's line height/padding/minimum/maximum, with fresh gap
  authors and an independent wrapper gap.
- The public useFormSubmit hook reads the actual Form context. Calling it
  invokes Keyboard.dismiss before the application callback, exactly once
  each, without disturbing the wrapper's authored axes.
- FileDropzone drives a deferred application picker through its actual
  onPress. Busy and completion renders reread the frozen author (16 -> 24
  -> 32); a second activation while busy cannot open another picker.
  Completion emits the exact accepted file once. Gap properties stay on
  the Pressable, not its owned label.

Keyboard, picker and RN hosts are controlled stand-ins. This proves hook/
state/prop routing and reevaluation, not OS UI, assistive technology delivery
or a general React render-count/performance guarantee.

## Verification and limits

CPU1/Idle/serial: owner file **5 tests**; related form/pattern/Native-render/
host/cache selection **56 tests**, no skips. All 480 rest comparisons and
existing pattern observations remain passing. Lint, generated docs/metadata,
ABI (58 leaves, 81 names) and diff checks pass.

No full local root suite, browser differential, app/Metro/device build,
Native pixels/Fabric/AT or performance run. No coverage snapshot or changeset
(per user instruction). Date/time/select owners, other packages, callbacks,
tier/gate/reset/percentage/mixed StyleX/grid boundaries remain before gap
eligibility and legacy removal. CodeBlock body/windowing/cache and other
agents' claims remain untouched; no whole six-group family closes.
