# Style-slot contracts

Tracking: [#987](https://github.com/iray-tno/hozo/issues/987). Follow-up to #909
and #985; these are successive slices, not a completed parity certification.

## Resolution and ownership are independent

There are two resolution engines, AOT and the candidate-runtime resolver.
Mixed expressions use both. A literal `hover:*` utility has statically known
style data but a runtime predicate; it is not an opaque dynamic class string.
The owner supplying that predicate is a separate contract.

Root `className` and named secondary class props must eventually share one
plan for static, dynamic and mixed input. Neither should resolve an opaque
string before its actual owner can supply state. Authored expressions must
not be moved inside event callbacks or evaluated more often than before.

## First slice: canonical build-time metadata

`scripts/style-slots/catalog.mjs` inventories top-level class props of every
exported `@hozo/patterns` component on Web and Native. Public types are the
independent denominator, checked through the installed TypeScript CLI. A new
component/prop absent from the catalog, a spurious catalog prop, a missing
Native style prop or a missing private callback declaration fails the check.
Nested data/indicator callback class lists are not top-level component props
and are not covered by that inventory yet.

The catalog generates the IR's secondary class/style mapping, the Native
compiler's existing owner/semantic/callback ABI tables, and Native semantic
fact types. Components calculate their own facts using existing events and
shape, with type-only imports and `satisfies` checks. This does not move state
machines into the compiler or use RN announcements as Web CSS attributes.

Known true, known false and unavailable are different: boolean profile entries
are constants; alias entries are supplied by the actual owner; omitted facts
are unavailable. Constant truth must survive negation. Missing event owners
must not become false and then unconditional through negation.

Owner identity, application gate and composition annotations make the intended
boundary explicit, but do not generate behavior in this first slice. Entries
marked `pending-audit` are inventory, not evidence that stateful classes work.
ColorPicker's eyedropper is explicitly unused on Native, not silently claimed
supported. Callback type declarations do not prove runtime consumption; the
existing lifecycle/mutation tests still provide that separate evidence.

Run `node scripts/style-slots/generate.mjs` after editing the catalog. The
generated-file and actual public-prop checks run outside Turbo's test cache in
`scripts/style-slots.test.mjs`, included by root `test:publishing`. Generated
metadata is checked in and requires no JS generator to compile a Rust crate.

`node scripts/style-slots/measure.mjs --benchmark > artifacts/slots-before.json`
captures browser-free codegen/runtime-JS evidence and optional timings. After
rebuilding the other revision with the same fixture/catalog, pass
`--baseline=artifacts/slots-before.json` and redirect to a different file.
The output comparison is exact; timings are descriptive, not a flaky CI gate.

## Next slices

1. Unify root/secondary expression routing while retaining the ordinary
   primitive fast paths. Repair Chip's dynamic root className via that shared
   route, preserving partially static expressions and style precedence.
2. Audit pending owners and decorative semantics. Require literal/dynamic/
   mixed, shape changes, absent owners, explicit style overrides and status
   gates in matrix fixtures. A decorative label can inherit text styling
   without borrowing the parent's focus predicate.

Use actual Web DOM/Tailwind as an independent semantic oracle, and execute
generated Native output against actual component source. Stand-in hosts do
not certify device pixels, event delivery or assistive technology.

## Performance and coverage constraints

- Keep static work AOT, including existing negated and ambient conditions.
  Do not reduce it to the runtime condition subset.
- Keep the existing candidate cache/resolver for opaque residual strings.
  Do not add an application-time metadata registry or AST interpreter.
- Add no event subscription, state machine, provider or layout host solely
  for metadata uniformity. Type-only consumer checks erase from runtime JS.
- Before/after the first refactor, compare generated JSX, styles, hooks,
  imports, diagnostics, candidate module and stripped/minified Native JS.
  Measure compilation cost separately from output identity; timing on one
  host is not a proof of universal zero regression.
- Heavy bundle/performance/browser suites remain hosted. A catalog count is
  not a compatibility percentage, and declared pending owners are not passes.
