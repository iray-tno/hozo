# Tailwind's order as the default for every compile

Part of #1230, consolidation domain, above
[built-in descriptors](tailwind-builtin-order.md). Policy unchanged
(`scalar-order-v36`): ranking itself is the same; what changes is which
compiles get a context.

## What changed

- A compile with no ordered project context now orders with descriptors built
  from the Tailwind facts compiled into Hozo
  (`hozo_parser::order_module_tailwind_builtin`): the standalone
  `compile`/`compileNative`/`compileNativeModule` API, a Web preview, the WASM
  binding, and a Vite or Metro build whose CSS could not be captured.
- A **pass-through** context (`setTailwindOrder`, `prepareTailwindContext`),
  which reports evidence without applying its own ranks, uses the built-in
  order too, so setting one never changes output.
- `prepareAuthoredTailwindContext` (internal) keeps authored order. It exists
  only as a **negative control** for tests -- the output a vanished final
  context would fall back to -- and is now what those controls use.
- A captured, ordered project context is unchanged and still wins: real
  Tailwind's descriptors, the project's own theme and variants.

## What it costs

The built-in data now ships in every binding. WASM, built the same way on
both sides: **1,879,923 → 2,039,436 bytes raw (+8.5%)**, **627,977 → 676,062
gzip (+7.7%)**. It is build-time compiler size, not app or device payload:
nothing is added to generated code. RFC 007 §9 left this budget open; this is
the number to decide it against. The data is still uncompressed beyond
leaving out `@property` blocks (repeated selector and at-rule strings could be
shared), so it can shrink if the budget asks for it.

## Behaviour that moved, and why it is right

Tests that asserted the old default were updated, each to the property it
was really protecting:

- **Negative controls** (`final-batch`, `namespace-invariance`,
  `simple-projections`, a `hozo_napi` preview test) compared the final
  context with a context-free or pass-through compile and required a
  difference. Both now follow Tailwind's order and agree, so they use the
  authored control instead.
- **Agreement where there used to be a difference**: `owner-final-context`
  (conformance), `web-style-continuation` and the napi preview test now assert
  that the context-free output **equals** the captured final output under the
  same default theme. The final-context wiring itself is still pinned by
  their counts and identity checks.
- **Old default stated directly**: `tailwind-session` expected a standalone
  `p-4 p-2` to keep 8px; it now expects 16px. Vite's snapshot-unavailable
  build expected the authored 8px; it now expects the built-in order at the
  default spacing, and the test was strengthened so the first build uses a
  different spacing (32px) and the fallback must not reuse it.
- Metro's hook-splicing test asserted the dark hook was declared before the
  breakpoint hook; their order follows the classes' Tailwind order (`md:`
  before `dark:`). It now asserts both open the function body.
- The coverage script's barrier test reports over the built-in order.

Turning this on also exposed a Native defect in #1827's ranking of JS-guarded
classes -- a ranked input that revisits a condition lost a style object to a
name collision (the text-inheritance case `dynamic-direct-label`). That fix is
#1830, on main independently.

## Verification

After `build:native` and a fresh WASM build: clippy, Rust crate tests
(`hozo_ir`, `hozo_parser`, `hozo_native`, `hozo_web`, `hozo_napi`); tailwind 224,
compiler 497, engine 99, vite 113, metro 152, next 21, storybook 2,
storybook-demo 297, `@hozo/ui` 86, `@hozo/patterns` 165, tailwind-conformance
972 (including the napi/WASM binding parity tests), native-showcase 240.
