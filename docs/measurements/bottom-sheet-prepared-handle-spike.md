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

The Native test fixture compiles real Pressable/View plan functions with the
existing compiler and Metro transformer. It invokes those functions without
mounting their elements, takes their generated style/callback and hands it
to the real public BottomSheet. Literal portions therefore use actual
compiler-generated styles, while the residual uses the actual generated
candidate map at the owner. This is a **test-only producer**, not a new
production transformation or a declaration that BottomSheet is a Primitive.

It deliberately allocates an unmounted React element to obtain a compiled
style. That scaffold proves application, not an accepted optimized producer.
Replace it with direct compiler-produced entries when the generic manifest
owner path lands; never ship it as another runtime compiler/cascade engine.

The data-only `fixtures/bottom-sheet-handle-contract.json` is a proposed
two-shape description, schema `rfc010-spike-0`, with `audit: unknown`.
Neither a production manifest reader nor an executable Gate interpreter
consumes it. Actual hosts/events are independently observed in the tests;
the fixture is not allowed to certify itself or reduce the 55 pending slots.

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
the compiler package. No Rust source changes are part of this slice.

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
too. Then remove the fixture producer/contract in favor of the shared fact
source. No ordinary BottomSheet literal routing, ordering eligibility, text
default, conformance headline or legacy authority is changed here.

Retained failed observations: a shell quoting error before the initial probe
ran; the first fixture's unsupported stateful View (kept as a refusal test);
an incorrect core import for the opt-in BottomSheet (corrected to patterns);
an expectation omitting existing mixed-residual warnings; and an initial
resolver trace that missed Metro's direct file import. The zero trace was
not accepted as evidence: both import routes are now instrumented and the
nonzero residual control passes. None was hidden by weakening diagnostics,
skipping a test or retrying a failure as a flake.
