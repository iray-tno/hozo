# Checked controls keep authored gaps separate from decorative slots

Test-only follow-up to [the Toggle/RadioGroup boundary repair](toggle-radio-gap-composition.md),
continuing #1230. No production resolver, component, ABI, ordering policy or
gap eligibility changes in this layer.

## What is exercised

The actual Native Checkbox, Switch and both RadioGroup options receive their
own real Pressable handlers. Four caller forms, three author inputs and 13
frames cover rest, hover, press/release, leave, focus/blur, activation, checked
hover/leave, a second activation/selection, disabled props and reenabled props.
No fabricated checked/hover/focus facts are passed to the candidate resolver.
Notifications must be `[true, false]` for toggles and `['a', 'b']` for radios;
the announced checked state must follow the independently expected sequence.

Each actual control has exactly one decorative indicator and one mark. The
decorations retain their separate class gaps, hover/checked/disabled response,
markers and accessibility hiding. The caller's gap/padding marker stays on
the actual control, never its label or indicator. Thus adding authored gap
normalization to class-only `controlIndicator` would solve no demonstrated
author boundary; the test checks isolation instead. String labels must not
receive View gap properties.

Four actual controls (including two radios), four caller forms, three authors,
13 frames, three independent style targets and eight Yoga layouts give
**14,976 additional observations, zero mismatches**. No-gap controls visibly
follow class state; generic/nested authored gaps remain authoritative only
on the actual control. A separate mixed-checkbox regression requires the
indicator callback to receive `'mixed'`, then `true` after activation, with
the same effective inline gap and independent indicator/mark gaps.

The retained **7,296 rest** and **5,376 earlier interaction** observations,
inactive-accessor/owner-refusal/delegated-thumb regressions also pass. The
expanded owner file has **7 passing tests**, no skips.

The final combined owner/input-slot/dynamic-slot and Native-host/source-cache
command passes **66 tests**, no skips. Lower-layer pattern type/build and
156 unit tests, plus candidate-cascade/Native-control 174 tests, remain the
production-change evidence; this follow-up changes only tests and measurement.

## Limits

CPU1/Idle/serial. These are source-backed React host-handler tests plus
Yoga3.2.1WASM fixed layouts, not trusted OS pointer/keyboard delivery, Native
widget pixels, Fabric, AT or performance measurements. Disabled is checked
on the actual Native host; the probe does not bypass that host by calling a
disabled control's onPress and claiming to test OS suppression. No new gap
browser differential or compatibility headline, full local root/app/device
build, or six-group closure is claimed. No changeset per user instruction.

Other owners, state-tier/gate competition, resets/percentages/direct style
functions, mixed StyleX and contextual grid remain before enabling the whole
gap family or deleting its old-path barrier.
