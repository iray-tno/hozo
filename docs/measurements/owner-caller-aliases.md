# One owner plan for multiple public aliases

Tracking: [#1458](https://github.com/iray-tno/hozo/issues/1458), RFC 010 §7B/E.
Baseline: main `6bd3f634` after the Toolbar production-Metro stack.

## Boundary and removed restriction

A caller may import both `Toolbar` and `HozoToolbar` from the same captured
package entry. Two public names do not imply two styling owners. The bounded
caller planner can inspect up to eight names together, collect each distinct
recipe/host-shape once, and emit one shared set of declarations. It never
rewrites the output of one independent plan with another plan's offsets.

The instance participant validates every additional export against the same
captured edge and exact shadow contract **before** allocating any IR. Different
owners, absent exports, duplicates and excess names are rejected. Its identity
continues to name the primary selected export; aliases do not acquire a second
package/manifest/epoch identity or upgrade that owner's audit.

The compiler tests cover Web and Native emitted output, shared declarations,
unchanged opaque and locally shadowed callers, author-expression evaluation,
exact shared context use, once-only disposal and lease retirement. They are
compiler/host-model evidence, not browser or device equivalence.

```sh
node --test --test-concurrency=1 packages/compiler/src/owner-caller-plan.test.ts packages/compiler/src/owner-caller-project.test.ts
```

## Adapter follow-up

The Metro layer replaces the `used.size !== 1` whole-module fallback only
for aliases that share that exact captured owner/edge. It must keep ordinary
mixed-lowering, opaque/unsupported recipes and foreign/uncaptured bindings on
their existing paths. Production Metro delivery of both aliases belongs to
the subsequent integration fixture; compiler tests alone do not close it.

The real resolver/source-worker regression uses both captured Toolbar exports
in one module. Both static sites must refer to the same hoisted plan, while
the opaque site and a locally shadowed name keep their original class props.
The ordinary `withHozo` configuration and its byte-identical restoration,
frozen runtime map and invalidation fences are unchanged.

The integration layer extends the existing eight production-Metro builds,
not their platform/mode count. A fourth route executes `HozoToolbar` beside
`Toolbar`, with an identical recipe and a separate authored render. Only in
Toolbar-selected mode must their actual emitted plan functions be identical.
This yields 32 observations: four prepared alias deliveries and 28 ordinary
controls. The Toolbar receipt moves to schema 2, so an older 24-observation
receipt cannot satisfy this new requirement. The historical schema-1 result
remains evidence for its original narrower boundary, not a failed old run.

Both the real Metro execution and its current-source receipt reader run in
Owner Evidence CI. The integration build is not run locally under CPU-1/Idle
constraints; the publishing reader's synthetic tests only test the reader.

No default routing, audit promotion, general multi-owner composition or global
coverage/maturity change is implied. Supported runtime paths and independent
expected styles stay as permanent regressions, not deletion targets.

## Binding-inspection consolidation

After aliases share one plan, Metro does not need to parse source bindings
before the planner parses the same bindings. The selector now returns only
the bounded, same-edge declared exports. The compiler remains the authority
for actual lexical bindings, unsafe sites and per-recipe preparation. Unused
exports acquire no recipes; passing their spelling does not authorize a
foreign import or locally shadowed component.

The `owner-callers.test.ts` regression instruments only the real N-API
`inspectOwnerClassSlots` entry in its isolated test worker and restores it
afterward. The pre-change Android probe observed two calls and failed the
one-call requirement. The replacement requires one call for the two-alias
Toolbar module on both Native platforms. This counts that inspection only,
not all compiler parses and not a wall-clock speedup. The separate partial
handle inspections are not removed or folded into a full-root claim.

Deletion receipt: Metro's own source-binding inspector import, target-building
loop and extra inspection are removed. Opaque, shadowed, unavailable-state and
uncaptured-source regressions remain. The instance selection, lease and frozen
runtime candidate checks still precede delivery; no default or audit changes.

## Web composition consolidation

The existing Web owner/ordinary-lowering participant groups distinct public
names only when the complete selected identity (excluding the public name)
matches. Each group uses the same bounded alias plan. Repeated requests still
reach the existing overlap refusal instead of being deduplicated into success;
different owners/entries stay separate. All group identities are selected
before any owner IR is allocated, with no additional project context/cache.

For the controlled two-shape/two-alias Web probe, the old path prepared four
shape modules; the grouped path prepares two. Ordinary lowering remains one
parse, both copied owner sites are rewritten, both authored expressions are
retained once and the companion owner stylesheet is emitted once. These are
operation/output-count observations, not browser fidelity or latency numbers.
The missing-copy and overlapping-edit refusal regressions still pass. The
following browser layer exercises actual Toolbar aliases and independent CSS.
