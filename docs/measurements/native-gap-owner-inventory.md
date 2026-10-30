# Native gap consumer inventory

Issue: [#1230](https://github.com/iray-tno/hozo/issues/1230).
This follows the [Calendar / TimePicker composition](calendar-time-gap-composition.md)
and [owner lifetime probes](calendar-time-gap-lifetimes.md). It changes tests
and review evidence only, not production output or gap eligibility.

## What the inventory can say

`native-gap-inventory.ts` discovers packages with a `src/index.native.ts` or
`src/index.native.tsx`, then parses their Native and shared TypeScript source.
It omits tests/fixtures, declarations, explicit Web/DOM modules and the Web
half of a same-stem Native split. This is a **physical source scope**, not a
proof of platform export resolution or whole-program reachability.

At this revision it reads 381 modules across 14 roots: behaviors, canvas,
core, engine, form, media, navigation, patterns, primitives, rn-compat,
semantics, svg, typography and webview. Its 38 helper-consuming files contain
131 direct project resolver calls, 102 direct authored-gap projection calls
and one forwarding export. These are syntax counts, not style slots,
components or compatibility percentages.

Babel import bindings distinguish aliases and namespaces from shadowed
identifiers. Calls through a named import or constant namespace member are
recorded; passing a helper, creating a local function alias, dynamic namespace
access and re-exports stay opaque. The known generated core gap forwarding
route is included explicitly. Type-only imports, comments and strings do not
create runtime uses. Parse errors fail rather than report zero. Source and
project configuration are not executed (`babelrc` and `configFile` are off).

This is deliberately **not a second style analyzer**. It does not follow
relative/package barrel re-exports, `require`/dynamic imports, higher-order
aliases or arbitrary generated resolver factories. It does not discover
packages without a Native root entry (for example source-only UI wrappers),
or generated application output. Those routes still need their existing
compiler/ABI/host tests and a separate closure review.

## Review dispositions

The executable ledger is in
[`native-gap-inventory.test.ts`](../../packages/tailwind-conformance/src/native-gap-inventory.test.ts).
It fails for a new or removed consumer, an unexpected opaque use, or removal
of a file's projection calls. It is not an automatic eligibility allowlist.

| Disposition | Files | Meaning |
| --- | ---: | --- |
| Projection present | 33 | Eight form and 25 patterns modules call the existing projection. Presence does **not** prove every style slot has the correct author/tier/gate/lifetime. |
| Class-only | 2 | Field's root/labels and decorative control-indicator nodes accept class sources, not an authored `StyleProp` on those owners. Do not add projection to arbitrary child elements. |
| Open composition review | 2 | CodeBlock and CodeLines still mix authored contributions with resolver results without this projection. |
| Generated forwarding | 1 | `core/src/generated/gap-styles.ts` re-exports the engine leaf. It renders no host and must not count as a missed drawing owner. |

The open CodeBlock sites include its root, gutter and caption; CodeLines has
root and line/mark composition, plus row reuse keys. Fixing only a top-level
`style` would not settle their per-line/key ownership. This slice leaves both
implementations unchanged. Their related mount-cost work (#1420) and Native
screen-reader work (#1408) are assigned to claude-1; #1289 is already closed.
Coordinate the actual fix rather than silently changing those owners' cache
or accessibility contracts.

## Closure checklist before widening gap eligibility

1. Settle CodeBlock/CodeLines root, row/mark, gutter, caption and reuse-key
   ownership with the agent handling that domain. Retain real class/author
   precedence and callback/closed-gate evaluation, not only helper counts.
2. Review compiled roots/spreads and delegated or source-only component
   routes outside the inventory. A package with zero direct resolver calls
   is not thereby certified, nor is every slot in a projection-present file.
3. Compare absence, null/undefined/reset, percentages, nested authors and
   class/caller/state tiers; include mixed StyleX and contextual grid and RTL
   where the existing APIs support them. Class-only secondary hosts must not
   borrow a sibling's author source.
4. Only then assess the bounded gap/logical rule domain in the canonical
   planner and dynamic candidate path together. Compare actual Yoga/browser
   results and final adapter output before deleting their legacy barrier.
   Other logical shorthands and transform/text registers remain separate.

The existing [gap boundary measurement](tailwind-gap-alias-boundary.md) and
[authored composition scope](native-authored-gap-composition.md) remain the
authority for what has and has not been compared. This inventory neither
marks group 2 complete nor raises a conformance headline.

## Verification and retained failed observations

Run the bounded inventory and source guards serially:

```sh
node --test --test-concurrency=1 packages/tailwind-conformance/src/native-gap-inventory.test.ts scripts/turbo-source-inputs.test.mjs scripts/native-hosts.test.mjs
```

Controls exercise alias/shadow discrimination, namespace/static-bracket calls,
opaque handoffs, type-only uses, generated forwarding, syntax failure and a
new package/shared module discovered without adding it to a package list.
The source-cache guard covers representative inputs; the existing
`packages/*/src/**` Turbo input already covers the full physical scope, so no
production dependency or broader cache glob was added.

The first repository ledger run failed because it had omitted core's real
generated forwarding leaf. That failure is retained in
`artifacts/tailwind-order/namespace-invariance/native-gap-inventory-initial.log`;
the leaf was reviewed as forwarding, not hidden or labeled a rendering bug.
An initial cache receipt lookup used `webview/index.native.ts`; the actual
file is `index.native.tsx`. The existing wildcard already hashed it; the
explicit guard and lookup were corrected rather than claiming the false
lookup proved cache coverage. The final related selection passed 205 tests
with no skips, including all eight inventory controls and the existing
Calendar/TimePicker, NativeSelect, form/pattern gap, Native-render,
Native-control, host and source-cache tests. Its log is
`artifacts/tailwind-order/namespace-invariance/native-gap-inventory-related.log`.
Lint checked 1,770 files; docs, package metadata and generated ABI checks
passed (58 leaves, 81 names). The final Turbo dry-run task hash was
`9a3580d049eceea9`, with 1,168 raw inputs; six direct receipt assertions include
the actual WebView Native root, core forwarding leaf and local discovery
fixture. The full dry receipt is retained as
`artifacts/tailwind-order/namespace-invariance/native-gap-inventory-turbo-final.json`.
Local checks run CPU 1 / Idle / serial. No full root suite, device,
browser/Metro build, pixel/AT, application performance or registry report was
run for this test-only slice.
