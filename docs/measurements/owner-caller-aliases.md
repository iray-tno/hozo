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
