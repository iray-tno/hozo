# Bounded positive ARIA ordering

This layer follows #1357 and continues #1230. It is not all-condition support.

## Contract

Original owner selectors of exactly `[aria-busy="true"]`,
`[aria-checked="true"]`, `[aria-expanded="true"]`, `[aria-selected="true"]`
and `[aria-invalid="true"]` can supply assessed specificity and ownership.
The parser already represents these predicates, including the explicit
`aria-[invalid=true]:` spelling; no new variant parser or runtime state is
added. The actual IR predicate must have exactly the same atom multiplicities
as the original nested rule. Class spelling alone supplies no proof.

Native's two old output buckets distinguished guards read from props from
guards read inside an interaction callback. That is delivery, not CSS priority.
An initial differential comparison failed for checked+selected+hover: static
Native chose 48px and the generated map chose 56px. The later hover bucket had
overridden the established common sequence. For one entirely assessed input,
the backend now moves the existing generated fragments through a compiler-only
ordered buffer. Guard resolution is unchanged and happens once. No callback is
added unless an actually resolved guard already requires one; a View with
unavailable hover still retains its valid ARIA styles and diagnostic.

The shared single-input test is also used by IR condition grouping. Different
frontend inputs, source tiers, inline/spread styles and unassessed predicates
do not gain permission to join this sequence. Default font-register projection
and its existing runtime helper are unchanged.

`scalar-order-v6` invalidates v5 output caches, including a validly hashed old
Metro transfer. The extra atom counts are compiler-side evidence; emitted
runtime predicate keys and resolver ABI are unchanged. State updates do not
parse selectors, sort ranks, or allocate new metadata.

## Measurements and exclusions

The Native differential exercises five independent ARIA bits, independent
disabled and hover facts, and both class orders: **256 comparisons**. It also
checks undefined/null/mixed/non-true values, whole-input barriers, unavailable
events, callback absence and explicit authored style precedence. The browser
oracle uses actual Tailwind CSS and evaluates compiled Web owner props rather
than inventing their attributes: **128 reference/compiled observations** across
both class orders. Legacy output is a required negative control.

Initial probes exposed two additional assumptions, retained as failures:

- An unparsed arbitrary ARIA token has no emitted IR predicate to freeze.
  Its diagnostic is not proof that every remaining input stayed untouched;
  barrier assertions therefore use actual emitted unsupported predicates.
- A manually constructed Web button omitted the compiled disabled data
  attribute. Reading actual emitted Web owner props corrected the harness and
  then exposed a separate real normalization defect: duplicate disabled/state
  props and divergent effective facts. See [#1359](https://github.com/iray-tno/hozo/issues/1359).

`aria-disabled` consequently remains unassessed, together with negations,
hidden/pressed/readonly/required and arbitrary values/flags/operators. We do
not report those owner facts as equivalent. Responsive/dark/data/relational
conditions still need their own original-rule and delivery proof.

Final local checks before rebasing: workspace Rust **1,078 passed / one
intentional ignored**, fmt and all-target Clippy with warnings denied; freshly
rebuilt addon and compiler/Tailwind/Metro packages; Tailwind **153**, compiler
**358 / one existing skip**, Metro **93**, full browser composition **36**,
Native source-receipt/cache guards **16** passed. The two new Rust tests reject
unproven selectors/guards, and the three new Tailwind tests include the
availability/callback/inline-style regressions. Post-rebase checks are recorded
in the PR. CPU 1/Idle/serial;
fresh addon required after Rust edits. Source receipt regeneration is not a
new device test. No new conformance percentage, AT/event-delivery equivalence,
whole-app performance result or completed six-group migration is claimed.
