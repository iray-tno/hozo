# Avatar, OTP and command-palette authored gap boundaries

Continues the [status-owner slice](status-pattern-gap-composition.md) and
retains its [changing-state controls](pattern-gap-interaction-precedence.md).
No canonical gap eligibility, ordering policy or generated ABI changes.

## Ownership

The existing `hozoAuthoredStyle` now projects19more public authored props:
Avatar root/image/fallback/status, OTP root/cell/active/filled/input, and
CommandPalette root/scrim/panel/input/list/heading/item/active/shortcut/empty.
Projection stays immediately before the author joins class styles. Existing
focus, selection and visibility gates remain; inactive OTP cells do not
newly inspect active-cell styles. No resolver, sorter, provider, subscription
or mutable-style cache is added. The unchanged helper's no-gap identity and
author-array flattening costs still apply; widget speed is not measured.

## Evidence and measurement boundaries

The source-backed owner matrix now has50authored props across ten components
and56selected host/style-channel pairs. Four caller routes, three authored
inputs and eight Yoga layouts give **5,376 rest observations**. The corrected
unmodified-main baseline reproduced **416 mismatches**; after wiring, **zero**.
The earlier5,376interaction observations are retained and also pass.

The selection is not just the first host carrying a property:

- CommandPalette list gap is measured on `ScrollView.contentContainerStyle`,
  not its viewport style. The test asserts that exact channel.
- OTP's active cell is reached through the actual input's focus handler.
  The two-cell fixture checks both ordinary cells and the one filled/active
  cell, with exact multiplicities.
- OTP resets input-frame padding intentionally. Its input descriptor uses
  an unaffected box marker, requires one decorative frame plus one real
  TextInput, and asserts padding remains0 on both. The first attempted probe
  looked for the reset padding marker and correctly failed; that was a
  measurement-selection error, not the product baseline.
- Image and decorative Text styles are included as emitted style values.
  Applying them to a fixed Yoga fixture does not establish child layout or
  visible spacing inside an actual leaf Image/TextInput/Text host.

These are real Native component sources and a compiler-generated candidate
map, rendered against stand-in RN hosts and measured with upstream
Yoga3.2.1WASM. There is no second candidate resolver or independent fake
normalizer in the harness. No compatibility headline/report snapshot moves.

CPU1/Idle/serial local verification: pattern typecheck and156unit tests;
owner/dynamic-slot/inheritance63tests, no skips.
Full candidate-cascade and Native control/indicator files passed174tests,
no skips (70.81s). No Rust source changed from
the verified addon. Typography/pattern output was refreshed normally before
the baseline. Original setup/baseline/final logs are retained under ignored
`artifacts/tailwind-order/namespace-invariance/input-palette-gap-*`.

## Still separate

The [Slider/ColorPicker follow-up](slider-color-gap-composition.md) covers
that delegated boundary with a per-thumb author-read/isolation regression.
Other
component packages, gate replacement, direct style callbacks, reset/null/
percentage values, mixed StyleX tiers and contextual grid remain before gap
eligibility can expand. No full local root suite, app/Metro/device build,
device/widget/browser pixels, AT or OS event delivery is claimed. No
changeset per user instruction.
