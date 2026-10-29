# Slider and delegated ColorPicker gap boundaries

Follows the [input/palette owners](input-palette-gap-composition.md).
No ordering policy, eligibility, generated ABI, exports or gesture algorithm
changes. The existing authored-gap helper is used at the actual class/author
composition boundaries, not a new resolver or state provider.

## Owner placement

Slider projects its root, rail, fill and thumb author styles before class
composition. ColorPicker projects root, swatch, selected swatch, slider and
hex-input styles. Its public thumb style is intentionally forwarded untouched:
each real Slider thumb owns the class lookup, focus facts and final author
projection. Selected swatch gates and track/fill/thumb positioning remain at
their original positions. No mutable-style cache is added.

The fixture uses Slider's existing `@hozo/patterns` export. Its first attempt
incorrectly imported Slider from the core facade and rendered undefined;
that setup failure is retained. Correcting the import does not add a facade
export or claim every literal component caller is fully AOT lowered. All four
caller forms still run through the actual Metro transform and Native sources.

## Results

The retained/expanded matrix covers60authored props across twelve components
and71selected host/style-channel pairs. Four caller forms, three author
inputs and eight Yoga layouts give **6,816 rest observations**. The corrected
parent baseline reproduced **544 mismatches**, and final wiring leaves **zero**.
The earlier5,376changing-state observations remain passing.

The ColorPicker fixtures require all three tracks and thumbs, both ordinary
swatches, the single selected swatch and the input, rather than choosing an
arbitrary first match. A separate delegated-thumb regression reads a frozen
accessor-valued author once per real thumb: three initial reads. After the
getter's value changes, focusing one thumb produces exactly one further read
and updates only that thumb; its two siblings retain their previous values.
This guards the placement/lifetime, not an application speed or memory claim.

CPU1/Idle/serial, no subagents:

- Owner matrix/delegation, actual input-slot and dynamic-slot files:
  **50 tests passed**, no skips (34.33s).
- Pattern typecheck and **156 unit tests** passed.
- Full candidate-cascade and Native control/indicator files: **174 passed**,
  no skips (70.56s).
- The existing Native-only drag regression passed: track-local starts and
  final deltas in both axes/directions, mock hosts. Its Web test was not run
  by that filtered command. Host/cache guards passed14tests.

Logs, including the bad-import setup and original baseline, remain under
ignored `artifacts/tailwind-order/namespace-invariance/slider-color-gap-*`.
No Rust source changed from the verified addon. No full local root suite,
app/Metro/device build, new gap browser differential, device/widget pixels,
AT, OS gesture delivery or headline support/snapshot change is claimed.
Yoga3.2.1WASM still measures effective gaps in a fixed fixture, not the layout
of an entire control or spacing inside actual leaf hosts.

## Remaining scope

Other patterns/component packages, gate replacement, direct style callbacks,
reset/null/percentage values, mixed StyleX tiers and contextual grid remain
before gap's canonical eligibility barrier can be removed. The helper's
existing no-gap identity and author-array flattening costs are unchanged;
this is not zero-overhead proof. No changeset per user instruction.

## CI source-probe repair

After #1393 merged, this PR was rebased onto main `25745f62`. Both the
original CI run `40815321059` and rebased run `40819808442` failed the same
three Media seeking tests: their raw Native Slider probe could not resolve
`@hozo/engine/generated/gap-styles`. This was a deterministic test-loader
boundary, not a flaky gesture failure. The failed logs remain in the artifact
directory above.

The probe now bundles the actual generated source leaf, just as it already
bundles Slider's interaction hooks, without adding an engine production
dependency to Media. A metafile assertion requires the real authored-gap
implementation. A new rendered-source regression checks all four Slider
owners using a frozen nested author, explicit row-gap precedence and retained
fill/thumb positions; an identity helper stub would not satisfy it. Existing
drag, cancellation, RTL and accessibility assertions are unchanged.

CPU1/Idle/serial revalidation: **139 non-browser Media tests** passed with no
skips, including all 13 seeking tests; the gap-owner matrix/delegation file
passed **5 tests**, and the Native-only mock-host drag regression passed
**1 test**. Source-cache guards passed **11 tests**. Turbo's dry run confirms
all four engine source files (generated leaf, authored-gap, gap-styles and
spread-styles) participate in `@hozo/media#test`'s inputs. This repair does not
change production code, test expectations, timeouts or the prior measurement's
limitations. Media's browser tests and the full root suite remain CI work.
