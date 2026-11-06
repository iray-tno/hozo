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
prepared and alias routes, plus minified distributed ordinary/prepared bundles,
each with an author and after its removal, give 28 observations. Tests require preserved root identity/structure, working
child actions, authored gap precedence, once-per-render author access and
invalidated-session refusal. Resolver instrumentation has a raw positive
control; source-prepared literal names must not reach it. The two distributed
bundles inline the same captured map, execute with external React/RN peers
and stand-in RN hosts, and must include `patterns/dist/toolbar.native.js`,
exclude compiler/Tailwind/manifest machinery and retain identical peer sets.
Their minified/gzip bytes and SHA-256 are retained in the Native receipt.
This is a production component bundle, not a Metro app or device binary.

At the same source, ordinary versus prepared component bundles measured
5,260 → 5,412 minified bytes and 2,529 → 2,558 gzip bytes (+152 / +29),
with the same React, React JSX-runtime and RN external peers. This compares
the two routes after adding the seam, not the seam's cost versus old main,
an application bundle size or execution speed.

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

[Owner Evidence run 42043426988](https://github.com/iray-tno/hozo/actions/runs/42043426988)
passed at clean PR merge checkout `5dcbbfa6d9644c3f7f52c4fd08f7441e1ca6be0f`.
Its retained JSON verifies 20 source-host Native observations, 12 Web
observations and six Web controls. The later eight distributed-bundle Native
observations are not retroactively attributed to that run; they need the
follow-up head's CI.

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

## Explicit Metro caller-selection follow-up

The internal config entry `withHozoOwnerCallers(config, preflight, target,
options)` selects one bounded target: `Toolbar.root` or `BottomSheet.handle`.
It is not a normal `withHozo` option, inferred contract trust or a per-widget
family of flags. The existing BottomSheet helper delegates to this same path.
Target identity participates in the config/context/cache identity; the former
`partialHandle` selector and `partial-owner-transform` mode are replaced by
the shared owner-caller selection path.

Selection requires the exact captured importer/package entry and validated
owner identity. One bounded parser inspection associates actual JSX sites
with captured public export aliases. No namespace/name-text inference is
used. More than one used request/alias, an uncaptured importer, opaque or
unassessed styles and ordinary mixed lowering keep the ordinary module.
The worker requires the selected full/partial disposition and preserves its
existing frozen-runtime-map and late-invalidation fences.

The resolver/source-worker tests cover both Native platforms, both Toolbar
aliases, target/cache separation, invalid serialized targets and return to
byte-identical ordinary output/cache identity. Those source-worker tests alone
are not production Metro bundle observations; the fixture below adds that
required boundary. No default route or audit declaration changes here.

## Production Metro fixture

The next stack layer extends the existing production Metro fixture rather
than adding another build harness:

```sh
node --test --test-concurrency=1 examples/native-demo/scripts/metro-partial-owner-bundle.test.mjs
```

It requires eight minified Metro builds: Android/iOS, each ordinary,
BottomSheet opt-in, exhausted-preflight ordinary fallback and Toolbar opt-in.
All execute the actual distributed Toolbar, real captured candidate resolver
and generated carrier in an isolated installed app. React and RN hosts remain
stand-ins, not a renderer, device, Yoga or event-delivery measurement.

Each build observes the literal, runtime-selected and uncaptured-sibling
Toolbar. The alias follow-up adds the same recipe through `HozoToolbar`;
only the explicitly selected literal/alias may receive a carrier, and those
two actual callback objects must be identical. All 32 observations preserve
padding/gap author precedence, root role/name,
one author evaluation, runtime input evaluation and a working item action;
no private prop or Web item wiring may escape. Each build records its hash,
bytes and the ordinary resolver capture; the capture references the actual
ordinary bundle from that platform. Controls remain ordinary while selecting
the other owner, and exhaustion must not opt Toolbar in.

The old BottomSheet receipt keeps its four-build/two-fallback denominator.
The new `metro-toolbar-owner-bundle.json` retains Toolbar observations and
partial failures separately; the existing Owner Evidence upload includes both.
This fixture is delegated to CI, not run locally under the CPU-1 constraint.
Adding its expectations is not a claim that those builds already passed,
and neither receipt changes scoped admission, `audit: unknown` or defaults.

The follow-up receipt reader runs in Owner Evidence CI and is reproducible as:

```sh
node scripts/style-slots/toolbar-metro-evidence.mjs artifacts/style-fact-model/metro-toolbar-owner-bundle.json
```

It rejects dirty/stale/failed receipts, missing or duplicated platform/mode
rows, changed manifest identity, disconnected ordinary captures and any
incorrect positive or negative observation. Its schema-2, 32-observation denominator is
only this fixture: four prepared alias deliveries and 28 ordinary controls,
not a new global coverage denominator or an audited contract declaration.
The reader and mutation regressions are permanent test infrastructure; they
add no runtime machinery and do not change the existing status dashboard.

The earlier schema-1 fixture measured three routes (24 observations). Its
historical receipts remain valid for that narrower result; they cannot satisfy
the alias follow-up's schema-2 reader. No extra Metro build or broader audit
denominator is introduced by adding the alias to each existing bundle.

The subsequent mixed-Native follow-up is recorded in
[Native owner composition](native-owner-composition.md). It advances the
current reader to schema 3: each existing bundle also lowers a styled View
and executes a captured Toolbar inside regenerated JSX as a retained control.
Its 40 owner observations and eight primitive controls replace neither the
historical schema-2 result nor the separate BottomSheet denominator. Production
success for this added boundary requires its own current-source CI receipt.
