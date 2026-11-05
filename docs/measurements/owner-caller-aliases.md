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

The next layer replaces Metro's `used.size !== 1` whole-module fallback only
for aliases that share that exact captured owner/edge. It must keep ordinary
mixed-lowering, opaque/unsupported recipes and foreign/uncaptured bindings on
their existing paths. Production Metro delivery of both aliases belongs to
the subsequent integration fixture; compiler tests alone do not close it.

No default routing, audit promotion, general multi-owner composition or global
coverage/maturity change is implied. Supported runtime paths and independent
expected styles stay as permanent regressions, not deletion targets.
