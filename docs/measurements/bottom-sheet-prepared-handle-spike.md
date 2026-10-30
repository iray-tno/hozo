# RFC 010: the first BottomSheet handle application seam

Tracking: [#1458](https://github.com/iray-tno/hozo/issues/1458),
[RFC 010](../rfcs/010-one-styling-fact-model.md). This is the first bounded
application slice, **not completion of phase A or a generalized compiler**.
The ordinary compiler still carries BottomSheet rather than lowering it.

## What changes

Native BottomSheet accepts an internal complete class contribution through
`hozoHandleStyle`. The actual resizable Pressable supplies its existing
interaction state; the decorative View supplies `undefined`, not fabricated
false event facts. The callback is not invoked while `open` is false.
Existing public `handleStyle` still follows the class result through the
same authored-gap projection. Its existing evaluation semantics are not
changed by this slice; closed public-style evaluation is not newly certified.

The producer must consume the original `handleClassName` expression,
including residuals. Supplying both inputs throws rather than silently
discarding a class or applying it twice. With no internal callback the old
resolver path remains. No event machine, host, provider, subscription, drag,
text publication, modal or accessibility behavior is intentionally changed.
Web already has a class carrier on the real handle; it needs no new prop here.

## What the producer is (and is not)

The Native probe now requests `ownerStyle: true` on `compileNativeModule`.
The existing backend records the style expression it actually emits, not a
second lowering or a parse of generated JSX. Ordinary JSX/styles/imports
remain the independent reference and are compared byte-for-byte apart from
the requested metadata. The probe emits the expression directly, hoists each
StyleSheet once and gives the real BottomSheet that callback/value. The old
unmounted React-element allocation and `.props.style` extraction are deleted.
The ordinary plan functions remain only as an independent compiler/Metro
reference; the prepared producer no longer invokes them.

Caller wiring is still a **test-only explicit producer**, not generalized
manifest-based transformation or a declaration that BottomSheet is a Primitive.
It captures the residual into a local before the owner callback; class
assembly still uses the real generated candidate map, not another resolver.
The synthetic preparation hosts are chosen from the validated shadow contract.

This per-call request is restricted to leaf View/Pressable class contributions.
Uncaptured accessors, conditional authored expressions, inherited context,
explicit props/styles, extra host effects, hooks and wrappers are not certified:
ordinary output remains with an error and no partial carrier. The bounded
backend still produces JSX internally, but the emitted producer does not
construct a temporary element at runtime. Existing focus-visible collection
is returned as a requirement, not silently dropped; the actual handle already
observes it. It does not add another event machine to satisfy the requirement.
The retained prepare/emit path preserves the request and its one-shot lifecycle.

The initial hand-written `fixtures/bottom-sheet-handle-contract.json` has
been deleted. The catalog now authors the two-shape description and generates
`scripts/style-slots/owner-shadow.json`, schema `rfc010-owner-shadow-0`.
The compiler's internal data-only reader validates it; both platform probes
consume that same parsed contract. It remains `audit: unknown` and cannot
certify itself or reduce the 55 pending slots. This is a shadow prototype,
not a shipped manifest-v2 reader or a production caller rewrite.

## Shadow contract follow-up

The first bounded vocabulary supports declared symbolic booleans, equality,
conjunction/disjunction, two known host pairs and explicit author order
separate from the prepared carrier. It rejects extra fields, undeclared or
executable bindings, unsupported hosts/events, duplicate IDs/orders and
oversized/deep Gate trees. An unknown input is not false; overlap is ambiguous,
and a definite match competing with an unknown shape is unresolved. Closed
`open: false` can establish absence even without knowing `resizable`.

This inspector takes already supplied facts. It neither discovers nor captures
owner expressions, computes `resizable`, runs package code, nor evaluates
caller getters. The actual BottomSheet still selects its own hosts with its
existing logic; the probes compare that observation with the shadow result.
The default compiler/adapter/application import graphs do not load this module.
The shadow JSON is not advertised or shipped as a participating package manifest.

Missing work remains explicit: semantic fact bindings, text publication,
finite non-boolean domains, export/package-instance resolution, complete
manifest-v2 transport/capture and automatic caller expression capture/rewrite.
Direct compiler-produced Native carriers now replace the element-extraction
scaffold above; generic routing, hygiene and broad owner/domain support remain
open. No conformance headline, Native default or six-workstream completion
percentage moves for this bounded seam.

## Evidence

Native tests use the actual component source with stand-in RN hosts, real
generated helpers and candidate styles. This does not prove OS delivery,
Fabric, TalkBack/VoiceOver or Native pixels.

- Both shapes, with three author contributions (none, frozen generic gap
  plus opacity, nested gap plus row override). The resizable shape follows
  six delivered hover/focus/press/blur events. Prepared and opaque results
  agree, and independent expectations check padding, opacity, background,
  radius, both author gap axes and accessibility roles.
- The actual host identity survives state and residual changes. Host counts,
  types and accessibility grouping match the opaque control; the private
  carrier does not leak to Native host props.
- A real caller getter is read once, not again on owner state updates.
  Residual changes 7px -> 9px -> absent remain live without remounting.
- The generated project resolver is traced through **both** component imports
  and Metro's direct candidate-file imports, without changing its returned
  values. Only residual radius strings reach it; compiled literal portions
  do not. This is not a new cache implementation or a runtime-speed claim.
- One selected Pressable callback reads a frozen author once and sees its
  fresh value. Actual callbacks preserve detent cycling, the measured panel
  translation, accessibility escape and Modal request-close forwarding.
- Closed prepared callbacks stay unevaluated; decoration receives no event
  object. The fixture switches shapes with the same existing component gate.
- Compiling interaction variants on a View still produces three
  `NOT_WIRED_ON_NATIVE` errors, and the real Metro path rejects them. Opaque
  decoration also retains its missing-state warning. The supported decorative
  fixture uses resting classes; it is **not** evidence that Native now
  implements hover/focus/pressed on decorative handles.

Web tests independently compile handle classes and pass the resulting class
carrier into the actual built Web BottomSheet. SSR observes the classes on
exactly one real button/div in each shape, connects the emitted CSS classes,
and checks the bar, dialog semantics, opaque carrier and closed gate. These
are carrier/markup checks, not browser computed-style or pointer/focus proof.

Nine new tests plus the existing inventory/catalog/host/cache selection:
**42 passed, no skips**. Patterns typecheck/build and **156 serial unit tests**
pass. The initial package-unit run used stale Typography dist output for an
already merged CodeBlock reading-order change; a scoped Typography rebuild
made the unchanged suite pass. No CodeBlock implementation or expectation
was edited. Logs remain in `artifacts/style-fact-model/handle-*`.

After the RFC merged, the slice was rebased onto main
`1e993df7572216cec847dfcf1d1c2526779db54e`. A fresh addon and the affected
JS dependencies were rebuilt; the combined new/inventory/legacy-gap/catalog/
host/cache selection then passed **54 tests, no skips**. This is the final
post-rebase selection, not a relabeling of the earlier 42-test run.
The refreshed main also contains three additional patterns unit tests;
recompiling and running that suite serially passes **159 tests**. Lint
checks 1,785 files, docs/metadata checks pass, and the generated ABI remains
current at the rebased main's 58 leaves / 82 names (not new leaves from this
carrier). The independent raw-source guards and Turbo receipt include both
BottomSheet implementations, its rules/Pressable and the local contract.

The current checkout's parser differed from the last verified addon. The
addon was rebuilt before compiler-backed tests (Cargo jobs=1), followed by
the compiler package. Those initial application-seam and shadow slices did
not change Rust. The direct-carrier follow-up does change the Native backend
and NAPI; it rebuilds the addon before executing the updated probes.

## Cost and remaining gates

At the same esbuild minification/gzip settings, bundling the Native BottomSheet
local helper graph with package/React/RN peers external changes 4,856 ->
5,013 minified bytes (**+157**) and 2,122 -> 2,202 gzip bytes (**+80**).
The retained receipt is `artifacts/style-fact-model/handle-graph-cost.json`.
This isolates the carrier seam's source delta, not a Metro production app,
installed binary, cache-miss timing or the test producer's cost. No claim of
zero overhead or an app speedup is made. Local work is CPU 1 / Idle / serial.

Before phase A is complete, add the manifest-v2 authoring/shadow reader and
direct caller/owner-plan generation (including full shape/fact semantics),
independent real-browser state/style evidence and a representative production
bundle comparison. The complete manifest set/freeze experiment remains open
too. Then replace explicit fixture wiring with the shared fact/caller route;
the hand-written contract and element-extraction producer are already deleted.
No ordinary BottomSheet literal routing, ordering eligibility, text
default, conformance headline or legacy authority is changed here.

Retained failed observations: a shell quoting error before the initial probe
ran; the first fixture's unsupported stateful View (kept as a refusal test);
an incorrect core import for the opt-in BottomSheet (corrected to patterns);
an expectation omitting existing mixed-residual warnings; and an initial
resolver trace that missed Metro's direct file import. The zero trace was
not accepted as evidence: both import routes are now instrumented and the
nonzero residual control passes. None was hidden by weakening diagnostics,
skipping a test or retrying a failure as a flake.

## Direct-carrier verification (2026-10-31)

On base `eccf6d1810718a1abf9c9609b820907a0f8f8feb`, CPU 1 / Idle / serial:

- `cargo test --workspace --quiet -- --test-threads=1`: 1,088 passed,
  zero failed, one existing IR ignore. Two new backend tests include ordinary
  output equality and refusal of unassessed roots/capture/host effects.
- Fresh debug addon rebuild, compiler build/typecheck: passed.
- Scoped compiler contract/owner/manifest, both handle platforms, gap inventory,
  pattern gap owners, catalog/cache/native-host guards: 75 passed, no skips.
  Native-loader platform smoke: another six passed, including the new opt-in
  NAPI carrier/focus-visible requirement check.
- `cargo fmt --all --check`, workspace/all-targets Clippy with warnings denied,
  lint (1,789 files), docs, metadata, generated ABI (58 leaves / 82 names),
  conventional title and diff checks: passed. Source-cache dry runs include
  the owner backend and retained NAPI emitter in both consuming test tasks.

Retained development failures: the first capture guard rejected a required
focus-visible host flag (fixed by returning its requirement, not dropping it);
an incorrect negative test assumed RN's supported `pointerEvents` style was
a non-style effect (replaced with a real disabled host-prop case); the CJS
test loader initialized a reused StyleSheet import after Metro's prepended
stylesheet declaration (the explicit producer now uses a separate aliased
StyleSheet binding, leaving the ordinary Metro reference independent);
the theme test initially used `name` instead of the actual `token` API and
the one-shot test expected the wrong error wording. These are corrected
probes/implementation findings, not evidence of a flake. No production Metro
app, physical device, GPU, AT or full-root JS suite was run locally.

CI follow-up: run `41087267360` passed Rust, package tests, text proof stages,
lint and both platform smoke jobs, but failed Native Showcase's committed
fixture reproducibility check. The compiler-source receipt had not been
regenerated after the backend/NAPI edits. Regeneration changes only five
source hashes and adds `owner_style.rs` to the pinned graph (33 -> 34); all
factory code, case output hashes and route decisions are unchanged. The
new file also has an independently checked hash and a Showcase source-cache
input. The strict generator `--check` assertion remains intact.

After this correction, targeted text/cache checks pass 16/16 and the complete
Showcase unit suite passes 239 tests with zero failures and its one existing
Windows SIGTERM-fixture skip. No retry of the unchanged CI run was used as a
substitute for fixing the stale receipt.

## Caller facts prerequisite (no default rewrite)

An explicit `inspectOwnerClassSlots` request now uses the parser's AST and
import-symbol references to report literal class attributes at real caller
sites. Aliased named imports are assessed; lexical shadowing, type-only and
foreign imports do not borrow that identity. Spread/duplicate/private-carrier,
opaque-value and namespace sites retain explicit unassessed reasons. Invalid
syntax or mutable/unresolved bindings fail the inspection instead of certifying
an empty census. JS edit spans and the post-directive/hashbang module insertion
offset are UTF-16, including astral text before the JSX.

This is compiler-owned discovery, not a second JS parser or permission to trust
an unaudited manifest. Ordinary compilation never invokes the extra semantic
pass. The next caller-plan layer must separately prepare every relevant host
shape, preserve unassessed input and apply the carrier; this API alone performs
no rewrite or class resolution. Later adapter integration should consume its
existing parse rather than putting this opt-in evidence pass in the hot path.
The generated text fixture pins the two new compiler modules (34 -> 36 sources);
its factory code, output hashes and route decisions remain unchanged.
