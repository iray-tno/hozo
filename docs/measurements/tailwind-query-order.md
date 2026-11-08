# Query variants and Tailwind order

Continues #1230. This is a bounded condition expansion under RFC 007 (policy
**scalar-order-v9**), not the completion of the condition workstream.

## What was wrong

A rule inside `@media`, `@container` or `@supports` adds no selector weight,
so it beats its unprefixed twin only by coming later. Tailwind always emits it
later. Before this change, rule assessment refused every query except hover's
`(hover: hover)`. An input with one such class kept its authored order, so
`md:p-4 p-2` emitted the `md:` rule first and `p-2` won at every width. The
same applied to `max-*`, `min-[…]`, `dark:` (media strategy), the
environment queries (`print:`, `motion-*`, `portrait:`, `pointer-*`, …),
`@md:`-style container queries and `supports-[…]:`. It also applied to
breakpoint against breakpoint: `lg:p-8 md:p-4` let `md:` win above `lg`.

## What changed

- Assessment records every `@media`, `@container` and `@supports` wrapper on
  a rule's single chain as `(name, params)`. A query adds no weight.
- `scalar_write_priority` ranks a write only when the queries its own IR
  condition asks are exactly the rule's wrappers, each used once:
  - `dark:` and environment queries compare the at-rule text exactly. Web
    emission and this check read the same table, `Environment::web_at_rule`,
    which moved from `hozo_web` into IR.
  - `Responsive`, `Width` and `Container` compare kind, side and container
    name. Their values are the theme's, written `48rem` by Tailwind and
    `768px` in the IR. The candidate name ties the two together.
  - `supports-[…]:` compares the kind.
  - Hover now contributes its `(hover: hover)` wrapper to the same check,
    instead of the wrapper being skipped.
- Not admitted: `ltr:`/`rtl:` (selectors, not queries), a project's own
  `@custom-variant dark` that is not the media query, arbitrary `[@…]:`
  at-rules and `starting:`. They stay barriers for their input.
- The dynamic Native candidate map refuses every query candidate
  (`unsupported-condition-or-property`), before and after. Ranking the static
  path therefore opens no static/dynamic disagreement. The new test fails if
  that map starts generating query candidates without ranking them.

## Verification

- **Chromium, real Tailwind as the oracle.** `tailwindcss` 4.3.3 `build()`
  output against Hozo's ordered `prepareWebModule(...).emit(context)` and the
  legacy `compile()` output, seven pairs in both authored orders, six
  environments (500/900/1200px wide, dark, print, reduced motion), reading the
  element's computed `padding-top`. **84 observations: 84 agree.** The legacy
  output disagreed with Tailwind in 16 of them, for example `md:p-4 p-2` at
  900px (Tailwind 16px, legacy 8px) and `lg:p-8 md:p-4` at 1200px (Tailwind
  32px, legacy 16px).
- `packages/tailwind/src/query-order.test.ts`: 14 pairs, both authored orders.
  Web CSS is identical across orders and puts the query rule last. Native
  static styles and JSX are identical across orders.
- Rust unit tests: a query ranks only for the same query, side, kind and
  count; each query kind matches only its own spelling; direction is not a
  query.
- Workspace Rust, and the `@hozo/tailwind`, `@hozo/compiler`, `@hozo/engine`,
  `@hozo/metro`, `@hozo/vite`, `@hozo/next` and conformance suites, after a
  fresh addon. Conformance stays 972/972.
