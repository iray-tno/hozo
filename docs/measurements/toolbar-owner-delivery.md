# Toolbar root: bounded owner delivery

Tracking: [#1458](https://github.com/iray-tno/hozo/issues/1458), RFC 010 §7B–E.
Baseline: `324d8727` (main before this stack).

## Scope

The catalog describes `Toolbar.root`, one non-interactive Native View / Web
div with an always-present root while the component is mounted. Only the
actual `@hozo/patterns` Toolbar/HozoToolbar exports publish it. It stays
`audit: unknown`; publication, generated equality and host stand-ins cannot
promote it to an audited or ordinarily admitted owner.

The Native internal `hozoToolbarStyle` is a complete class contribution,
evaluated once per wrapper render, before the existing authored-gap projection.
The producer consumes className; supplying both throws. It does not introduce
a wrapper, provider, state machine or subscription, or borrow a child's
disabled/focus/pointer state. Item render APIs and platform-owned keyboard
behavior are unchanged.

This slice measures padding, width, background and gap-axis selected styles.
It does not establish arbitrary text inheritance, Yoga layout equality,
Native device events/pixels or complete CSS fidelity. Native interaction
recipes on this View remain unassessed and retained; Web's ability to express
hover on a div does not manufacture a shared Native event capability.

## Reproduction and independent checks

Run with current compiler and package builds. The two suites preserve their
own expectations instead of reading the expected style values from a contract:

```sh
node --test --test-concurrency=1 packages/tailwind-conformance/src/toolbar-owner.test.ts
node --test --test-concurrency=1 examples/storybook-demo/scripts/owner-toolbar.test.mjs
```

Native reads the real selected package entry/manifest through a capture,
epoch and lease. Both aliases share one project preparation. The actual
emitted caller executes through Metro's source transformer and the actual
Toolbar source, against Android/iOS host stand-ins. Raw, literal, opaque,
prepared and alias routes, each with an author and after its removal, give
20 observations. Tests require preserved root identity/structure, working
child actions, authored gap precedence, once-per-render author access and
invalidated-session refusal. Resolver instrumentation has a raw positive
control; prepared literal names must not reach it.

Web uses the existing ordinary-lowering composition/session fixture, not a
new pipeline. The production browser bundle must include the actual built
Toolbar and exclude compiler/Tailwind/manifest machinery. Its browser suite
requires 12 selected-style observations (candidate, independent Tailwind and
prepared CSS across four phases), existing child focus/arrow/activation
wiring, preserved root identity and six stylesheet-removal/restoration controls.

Both suites retain source-bound JSON, including partial failures, under
`artifacts/style-fact-model/toolbar-{native,browser}.json`; Owner Evidence
uploads them as `owner-toolbar-evidence`. Native source, Web owner and shared
fixture inputs are pinned by the existing raw-source cache guards. These
regressions are durable; they add no production runtime infrastructure.

Local CPU-1/Idle validation passed the Native tests and Web preparation/bundle
check. Actual browser execution is delegated to Owner Evidence CI. The
existing compiler-owner selection passed 100 tests with one existing
platform-specific skip; catalog/status/publication/contract checks passed 54.
These overlapping selections are not a global coverage denominator.

## Failed observations and measurement correction

The first Native fixture lacked the primitive anchor the existing Metro
source harness requires to activate. This was a fixture omission, not evidence
that an owner-only module was transformed by the ordinary adapter.

A subsequent author-removal test over-counted getter access. Captured stacks
identified React 19 DEV `addObjectDiffToProperties` inspecting both old/new
enumerable nested getters. Non-enumerable getters still exercise direct
`author.value` reads but exclude that renderer instrumentation. The original
once-per-caller-render assertion is retained; no application behavior was
changed or failing threshold relaxed.

## Retained paths and next deletion boundary

No ordinary Toolbar route or resolver fallback is deleted by this slice.
They remain required until the **Toolbar scoped-admission follow-up** proves
the necessary package/graph, owner semantics and production adapter boundary
and can replace that owner route without shrinking support. In particular,
the caller preview is not permission to broaden Metro partial-owner admission.
There is no audit promotion, default change, conformance headline or global
six-view score increase from the existence of this new contract.
