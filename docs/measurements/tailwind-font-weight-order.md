# Named font weights: registrations, project values and shared ordering

## Why an eligibility flag alone was insufficient

Tailwind's `font-bold` emits a hoisted `@property --tw-font-weight` definition,
then selector-owned register/font-weight declarations. Treating the hoisted
definition as another selector branch made the common plan unassessed.
Conversely, discarding every hoisted node would hide arbitrary stylesheet
writes. The plan now ignores only the closed registration shape: a valid
custom-property name, unique `syntax`/`inherits` and optional `initial-value`
descriptor declarations, no importance and no nested/unknown directives.
These definitions contribute neither owner writes nor selector specificity.
The original upstream rule signature still determines ordering.

Inspection also found a pre-existing value problem: named font weights were
parsed as fixed numbers. A theme overriding `--font-weight-bold` to 900 still
emitted 700 on both backends. Named Tailwind weights now retain their static
token/fallback in IR; explicit StyleX weights and semantic defaults remain
absolute. The captured theme reads font-weight values through the existing
Tailwind design-system loader and token-reference resolver. Both emitters and
the generated Native map resolve those same facts. The ordinary standalone
default theme retains previous builtin values without needing a JS loader.

## Native limits are explicit

The installed RN 0.86.3 `StyleSheetTypes.d.ts` and Android
`ReactTypefaceUtils.parseFontWeight` accept the 100-step weights from 100
through 900 (plus named equivalents). No claim about a device's variable-font
capabilities is inferred from CSS accepting arbitrary numeric weights.
`650`, unresolved references and other unsupported theme values remain in
the theme and Web output; actual Native root/secondary owners diagnose them,
and candidate generation refuses the invalid entry instead of emitting an
invalid style or silently falling back to 700. Equivalent numeric CSS
spellings normalize without rounding. Theme-free lexical audit APIs do not
magically acquire project-value validation from this change.

The output policy is `scalar-order-v3`. This changes Native fingerprints,
captured plan mode and Metro's existing transferred/cache identity together.
The generated resolver object ABI and state cache are unchanged. No device
theme lookup, provider, CSS parser or per-render sort is introduced.

## Verification

The browser probe uses the actual upstream CSS and emitted Web CSS, the
actual Native label prop and the executed generated factory. Two themes
(700/400 and 900/300), both class orders, both browser owners and four
overlapping owner-state stages produce **32 observations**. Mixed physical
spacing remains at the common 16px winner rather than being frozen by an
unassessed font registration. Values and winners agree.

The Tailwind package tests cover captured token references, static/generated
font values, state priority, absolute StyleX/Strong controls, unsupported
Native values at root/secondary/runtime-map boundaries, and malformed hoisted
rules/registration descriptors remaining whole-input barriers. Rust tests
cover registration ownership/specificity, malformed definitions, absolute
versus themed weights, dark-theme copying and Native limits.

The serial local results are 1,075 Rust workspace tests passed (one existing
intentional cost probe ignored), 145 Tailwind tests, 358 compiler tests (one
existing skip), 92 Metro tests, 62 Vite tests and 21 Next tests passed. The
Metro suite includes a real captured-theme mutation/restart check for both
static workers and the executed generated map. Four focused browser tests
and 16 Native-fixture/cache-guard tests passed. All-target workspace Clippy
with warnings denied, rustfmt, Biome and generated-doc checks also passed.
The addon was freshly rebuilt after the final Rust edit; these are not
results from a stale binding. Full root/package-packing/app integration and
fresh device execution remain CI work, not additional local claims.

Reproduce with one worker after a fresh addon and dependent package builds:

```sh
cargo test --workspace
pnpm --filter @hozo/compiler build:native
pnpm --filter @hozo/compiler build
pnpm --filter @hozo/tailwind build
pnpm --filter @hozo/metro build
pnpm --filter @hozo/tailwind exec node --test --test-concurrency=1 'src/*.test.ts'
node --test --test-concurrency=1 --test-name-pattern="font-weight registration|simple projected properties|generated common-plan resolver" examples/storybook-demo/scripts/caller-composition.test.mjs
node examples/native-showcase/scripts/generate-text-inheritance.mjs --check
```

Logs live in `artifacts/tailwind-order/namespace-invariance/font-*`. Initial
validation caught a missing field in a theme clone and an ASI mistake in the
VM test harness; neither was hidden by retrying CI or classified as a flake.
The Native fixture is regenerated for source receipts, adding the newly
relevant theme/parser files to its receipt and raw-source cache guards. That
regeneration does not constitute a new device run.

## Remaining boundary

This adds the nine existing named font-weight utilities, not arbitrary new
theme class names or all typography. Font-size/line-height/letter-spacing
interactions must preserve compound defaults and relative-metric folding
before they can share this ordering path. Gap/logical aliases, transform
register composition, remaining unmapped properties and complete portable
standalone defaults are also still open. No overall coverage or fresh
full-app/device/AT claim is inferred from these focused tests.
