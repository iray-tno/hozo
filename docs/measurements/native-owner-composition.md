# Native owner composition through actual source edits

Tracking: [#1458](https://github.com/iray-tno/hozo/issues/1458), RFC 010 §7E.
Baseline: main `d412c96e`, after the six-layer owner-alias stack.

## Native rewrite provenance

The shared Native transform can optionally report each actual stage input and
its UTF-16 edits: Canvas paints, lowered root JSX/hooks, author-import removal
and generated import/style prefixes. It does not reconstruct edits from a diff
or parse generated code. Multiple hook insertions at an equal source position
are reported as their exact combined replacement, matching the existing
back-to-front rewrite order. With no observer the ordinary path is unchanged.

The source-provenance regression checks byte equality with unobserved Native
output and one Native module parse. It checks emoji offsets, untouched sibling
attributes, Canvas/hook/candidate-import phases and a lowered-parent negative
control. A carried string inside regenerated JSX has no copy provenance merely
because it still matches the author's text.

```sh
node --test --test-concurrency=1 packages/metro/src/native-provenance.test.ts
```

This first layer does not enable mixed-owner composition. Next, the caller
planner must explicitly identify its module prelude, and the compositor must
map every remaining edit through verified unchanged runs. Missing or ambiguous
mapping must retain the whole ordinary result, not just the failing site.
The worker then needs one shared context, candidate freeze/lifecycle guards
and actual production Metro execution before claiming the new delivery path.

No ordinary routing/default, contract audit, text protocol or global score is
changed by this instrumentation. The Native showcase's source fingerprint is
regenerated even though its emitted fixture body remains unchanged.

## Exact edit composition, not generated-text matching

The Native caller planner now explicitly identifies its module prelude. The
compositor maps every other edit through surviving source runs; insertions
need one unambiguous authored boundary. A generated gap or duplicated copy
must not choose an arbitrary side/occurrence. If the planner's module prelude
is at authored offset zero, it can precede rehomed imports; arbitrary unmarked
zero-length edits cannot use that exception. Other prologue insertion points
must map normally. Metadata stays within the same compiler worker, not a JSON
round-trip that loses its explicit edit identity.

All owner edits must map without overlap and the provenance must match the
entire ordinary output. One unmappable nested site retains **all** ordinary
output, including a separate sibling that could otherwise have been prepared.
At this stage it rejected even identical carried JSX inside a replaced Native
parent; the carried-child integration below removes that bounded restriction.
Full-root Toolbar aliases and BottomSheet's partial insertion have real
compiler/ordinary-transform tests, including authored expressions and a
directive prefix. No worker path is enabled by this second layer yet.

The new raw-source probe's compiler/helper/manifest inputs are explicit Turbo
cache inputs. Its compiler-source wildcard includes transitive planner helpers;
it adds no production dependency merely to invalidate a test cache.

## Worker integration

The internal explicit owner-caller worker now observes ordinary lowering and
collects the owner plan into its existing module/session. It removes the early
return on any non-null ordinary output. Warm complete output and cold retained
ordinary IR both use the same composition guard; a refusal returns that entire
ordinary result. Runtime candidate-map hash checks and the manifest lease still
fence emission, and missing frozen candidates retain the original route.

Real cold-worker instrumentation records one ordinary and two BottomSheet shape
modules, all emitted through the same context object and each disposed once.
The source-worker regression checks both Native platforms, warm output,
once-only authored expression, ordinary byte restoration and nested refusal.
An explicitly identical parent edit may retain its source coordinates. At this
stage an actual JSX replacement did not. The initial old guard used an
identical View parent, so its negative fixture was corrected to require a real
replacement and a separate positive test keeps the identical-parent case.

This removes a mixed-file restriction in the explicit route, not the ordinary
default. Full/partial prepared destinations, aliases and unsupported/dynamic
fallbacks retain their existing semantics. Actual production Metro execution
of the mixed file remains the next integration layer.

## Production Metro integration fixture

The fourth layer extends the existing eight serial Android/iOS Metro builds,
not the build-mode count. The app now executes an ordinary styled Native View
alongside both owner aliases. Each build must report the View's lowered style
and absence of a leaked className. A second explicitly captured module has a
Toolbar inside an actually regenerated View: that entire module must stay
ordinary even while its captured neighbor receives a prepared carrier.
Every row additionally verifies that the successful ordinary resolver capture
contains that exact nested importer/patterns entry edge. A missing capture is
not accepted as a successful unproven-parent refusal.

Toolbar receipt schema 3 requires five routes per build (40 observations),
four prepared alias deliveries, 36 ordinary controls and eight separate
primitive controls. Earlier schema-1/2 receipts remain historical evidence for
their narrower owner-only boundaries; they cannot satisfy the new mixed-file
reader. The BottomSheet build/fallback denominators are unchanged.

The fixture still executes actual distributed widgets and a real candidate
resolver through minified Metro bundles with React/RN host stand-ins. It is
not Yoga, device events or pixel evidence. Execution is delegated to Owner
Evidence CI; synthetic reader tests do not establish production success.

The first mixed-fixture CI failed on its ordinary build before collecting any
owner observations: the tiny classic-JSX `h` stand-in discarded Babel's third
`children` argument, so the new nested host lost its entire child/action tree.
The fixture now embeds a tested pure props/children helper and forwards those
arguments, including null props and multiple children. Its serialized form is
also tested. No application code, style expectation or timeout is changed to
hide that failed run; its partial receipt remains a failure with zero builds.

## Native carried-child emission evidence

The next boundary is a real replacement of a Native parent that carries an
unknown child. The Native renderer can now explicitly return byte ranges for
children it copied from source. Appending rendered children and the existing
Grid/item/spacing/host wrappers shift those ranges by lengths known to the
emitting branch. Nothing searches generated JSX, and identical repeated child
text retains distinct source coordinates. The shared `SourceCopy` type lives
in IR; Web retains its existing re-export and emission behavior.

The request does not change JSX, styles, imports, hooks or diagnostics. An
ordinary call allocates no copy vectors and retains the existing string
formatting. This is a structural cost bound, not a throughput benchmark.
Discarded Image/TextInput children contribute no copies. Generated props are
not assessed, and container-query callbacks/class-evaluation wrappers erase
enclosed evidence rather than assume a newly introduced lexical scope is safe.

```sh
cargo test -p hozo_native source_evidence -- --test-threads=1
```

This backend layer alone does not enable a new owner route: NAPI UTF-16
conversion, Native identifier namespacing and the actual Metro observer must
carry these ranges before nested owner composition can use them. Ordinary
defaults and owner contract audit status remain unchanged.

### Binding delivery

`NativeCompileOptions.sourceEvidence` carries this ordinary-only request through
direct compilation and retained Native IR. NAPI converts both original byte
spans and component-relative emitted byte offsets to JavaScript UTF-16 units.
The ordinary call after an observed call is unchanged. Combining this request
with owner-style/text experiments is rejected explicitly, rather than returning
missing evidence under a different renderer. Cold preparation snapshots the
request; mutating its original JS options cannot change later emission.

```sh
node --test --test-concurrency=1 packages/compiler/src/native-source-evidence.test.ts
```

The binding does not turn ranges into Metro rewrite permission. Its consumer
still must account for the actual identifier-renaming pass and any intervening
Canvas/import/hook edits before composition.

### Metro carried-owner integration

The ordinary transform requests evidence only when its explicit observer is
present, on direct compilation, cold preparation and warm emission. The actual
existing identifier-renaming pass records its edits: untouched child fragments
shift by preceding replacement lengths, while a rename touching a copied
fragment invalidates that whole fragment. Generated offsets are not searched,
and observations do not change ordinary bytes or add a Native parse.

Both full Toolbar carriers (including aliases) and partial BottomSheet handle
insertions can now compose inside a genuinely regenerated Native View. The
all-or-nothing module guard remains: an unproven container-query scope or
missing backend evidence cannot prepare even a separate otherwise eligible
sibling. Existing candidate-map freeze and consumed-IR lifecycle checks remain.

The same eight production Metro builds now expect the captured nested Toolbar
to receive its carrier only in `toolbar-opt-in` mode. Toolbar receipt schema 4
retains 40 observations and eight primitive controls, with six prepared and 34
ordinary controls instead of schema 3's four/36. Old schema-3 results cannot
certify the newly implemented path. This changes neither the BottomSheet build
denominator nor any owner audit/default; the production fixture still uses
React/RN host stand-ins, not Yoga or device pixels.

## Native passthrough-prop composition

The ordinary Native prop writer now carries the evidence from `render_verbatim`
when it actually appends an unchanged prop, including JSX values and authored
render callbacks. A nested primitive can still lower inside that value; only
its surviving raw fragments are certified. The existing prop formatting and
evaluation order are unchanged. Ordinary rendering allocates no copy vectors.
At the final host, prop-copy offsets shift by the actual opening-tag length and
precede the already shifted child copies. Image/TextInput retain their emitted
prop copies but still discard all child evidence.

This removes the blanket omission of passthrough-prop evidence, not the guard
against generated syntax. Props between a pair of spreads may become
`hozoSpreadStyles` arguments. That rewritten range remains unproven; unchanged
props before/after it retain their own evidence. Button's normalized spread,
image-source normalization and the existing new-scope guards remain unassessed.
One unproven owner still keeps the **whole** module ordinary, even if a separate
sibling could prepare.

Rust tests check byte/diagnostic/import/style parity, UTF-8 source slices,
duplicate JSX, nested primitives, grouped-spread exclusions, void-host props
and lexical-scope refusal. Binding tests check the corresponding UTF-16 ranges.
Actual compiler/compositor and source-worker tests include an authored FlatList
`renderItem` callback without inventing another binder or evaluating its author
early. Production Metro execution of that callback remains a separate receipt;
these local tests do not claim list windowing, Yoga, device input or pixels.
