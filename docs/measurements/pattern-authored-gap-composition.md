# Native pattern author/slot gap composition

This extends the [compiled-root boundary](native-authored-gap-composition.md),
not canonical gap eligibility. Yoga's axis gutter wins over a generic gutter
even when the generic `gap` comes from a later authored style. The author must
be projected to its effective axes **before** joining class styles.

## Ownership and implementation

Chip, Listbox, Menu and Combobox now call the existing `hozoAuthoredStyle`
at their twelve public authored style boundaries: four roots, Chip removal,
Listbox options, Menu trigger/menu/items and Combobox input/list/options.
Opaque and uncompiled class values remain resolved by the actual owner with
its own state. Neither class lookup nor interaction facts move to the caller.

Static secondary classes exposed a second boundary: the compiler can put
compiled axes and the author in the same public slot style array. Projecting
that entire array inside the component is too late to distinguish authored
axes from compiled ones. Native lowering now projects just the author before
forming such an array, and uses the existing gap-aware spread composer when
a spread can replace it. Private owner callbacks still keep classes separate;
unrelated static classes retain the ordinary path. Compiler guards cover
explicit/spread gap slots, opaque owner routing and an unrelated opacity slot.

No additional resolver, sorter, provider, subscription, generated ABI or
candidate encoding is introduced. Existing composition arrays and author
positions remain. The helper returns an ordinary no-gap object unchanged;
author arrays are flattened, and mutable authored values are not cached.
The earlier [helper cost measurement](native-authored-gap-composition.md#cost-and-imports)
still describes that unchanged implementation, not the render cost of these
widgets. This slice does not claim zero overhead or measured widget speed.

## Evidence

`packages/tailwind-conformance/src/pattern-gap-owners.test.ts` loads the real
Native pattern sources through the existing Metro fixture loader. It selects
the one RN host carrying an authored sentinel, not its label or ancestor,
and feeds that host's effective gap styles to upstream Yoga 3.2.1 WASM.

The matrix is twelve owners x four routes (uncompiled caller, compiled literal,
compiled opaque and compiled spread) x three authored inputs (no-gap control,
generic gap and nested array with an explicit axis) x eight direction/layout
combinations = **1,152 observations, zero final mismatches**. Frozen author
objects also guard against mutating caller-owned input. This is selected-style
geometry in a fixed Yoga fixture, not full widget layout or device evidence.

The three-route baseline reproduced **448/864** mismatches. Component wiring
alone reduced it to **160/864**, exposing the literal slot-array boundary;
the compiler fix closes it. An earlier setup incorrectly omitted opaque/raw
choices from the generated candidate map (320/864, including broken no-gap
controls). That was a measurement defect, not a product result. The fixture
now scans a separate class-choice data module and asserts both candidates
exist before rendering; no hand-authored fallback style map replaces it.
All initial and final logs remain under ignored
`artifacts/tailwind-order/namespace-invariance/pattern-gap-*`.

Local verification uses CPU 1/Idle, serial execution, no subagents:

- Workspace Rust: **1,083 passed, one intentional ignore**; fmt and all-target
  Clippy with warnings denied; fresh Native addon before JS measurements.
- Pattern typecheck/build and **154** unit tests.
- Owner matrix plus existing actual-source dynamic-slot tests: **34 passed**,
  no skips (25.72s).
- Full Storybook candidate-cascade file: **42 passed**, no skips (56.37s),
  including its negative/mutation controls. The Native module adapter supplies
  the real gap helper, not an identity mock.
- Compiler: **360 passed, one existing Windows skip**; Metro: **93 passed**.
  Gap/Yoga, Chip, uncompiled fallback and raw-source/native-host guards:
  **35 passed**. Metadata and generated ABI checks passed (58 leaves/81 names).
- Real Native-source control/indicator harness: **131 passed**, no skips.
  Two old scroller tests expected the generic `gap` key itself; they now
  require its absence and both equivalent 4px axes. The caller override case
  also requires both 16px axes while viewport/content separation, padding,
  margin and scroll disabling stay intact.

One compiler run from the repository root failed a cwd-dependent RN-compat
resolution fixture; running the unchanged suite from its package directory
passed. Metro initially retained one old Avatar opaque-slot string assertion;
it now checks the projected author while preserving its exact facts, single
source evaluation and absence of a private state callback. Initial failures
are retained, not discarded as flakes.

The Native generated text fixture is regenerated normally for source receipt
freshness. Its hash change does not constitute another device run.

## Limits and next boundary

No full local root suite, application/Metro/device build, Fabric pixels or AT
run is claimed. No compatibility headline, report snapshot, order policy or
gap assessment barrier changes. These four components are a bounded owner
slice, not all exported Native components or every stateful slot.

Other uncompiled owners, private conditional callback gap paths, direct
authored callback composition, resets/null, percentages, mixed StyleX/class
tiers and contextual grid still need their own checks before gap eligibility
can expand. Logical edge aliases and transform registers are separate work.
