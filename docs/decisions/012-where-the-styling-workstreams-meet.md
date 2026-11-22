# 12. Where the styling workstreams meet: the fixed points, and what counts as enough evidence

**Status:** decided; point 4 amended 2026-11-20 (#2047)
**Date:** 2026-11-17

## Why

[RFC 010](../rfcs/010-one-styling-fact-model.md) plans four efforts backwards
from one end state: owner contracts (its phase B), ordering (C, which is
[RFC 007](../rfcs/007-canonical-tailwind-order.md) and #1230), text
inheritance (D, [RFC 006](../rfcs/006-native-text-inheritance.md)) and
manifest-driven compilation (E). It is still a draft, and about 180 merged
pull requests have been built on it.

Two things followed from building on a draft.

- **The points where the phases touch were never fixed**, so each slice
  re-derived them and hedged against the others. The same contract shape,
  carrier and ordering key were implemented three times as bounded spikes
  (BottomSheet's handle, Tabs' tab, Toolbar's root) and none was declared the
  one to build on.
- **Nothing said what evidence is enough.** Each slice added receipts: bundle
  sizes, callback counts, lifetime matrices, a measurement document. The
  count RFC 010 opened with, 55 of 99 slots waiting for an audit, is 56 of
  100 on `b3ea23ff`. One contract of three is `audited`. The four global
  rates of RFC 010 §6 are still `null` in `scripts/style-slots/status.mjs`.

The spikes did their job: they show the shape works. This record fixes the
points so the remaining work is migration, splits it into issues that can
proceed separately, and puts a ceiling on evidence per owner.

RFC 010 stays the description of the end state and of what exists today.
Where it and this record disagree about a junction or a gate, this record is
the decision.

## Decision

### 1. The owner contract is the shape the spikes already use

The contract in `packages/compiler/src/owner-contract.ts`
(`rfc010-owner-shadow-0`) is manifest v2's owner contract. It is authored in
`scripts/style-slots/catalog.mjs` and generated into each package's
`hozo.manifest.json`; nothing else defines an owner.

- One contract per `(owner, classProp)`: `bindings`, `abi`, `authoredStyles`,
  `shapes`, `audit`.
- A shape's `when` is data: `eq` over a named boolean binding, `all`, `any`.
  No expressions, no JavaScript, no JSX. A binding the owner does not supply
  is unavailable, not false.
- A shape names its real hosts (`nativeHost`, `webHost`), the events that host
  observes, and the facts it supplies. Repeated owners (each tab, each
  option) share one contract and supply their own facts.
- Growth is additive: a new host kind, fact or event is a new enum member.
  The catalog's prose `gate` strings are replaced by `when` owner by owner,
  as each migrates, not in one pass.

The `shadow` in the schema name goes when the first owner is routed by
default (point 6). Until then the name is not worth a rename.

### 2. One carrier per platform

- **Native:** an optional prop named by `abi.nativePreparedProp`, typed
  `(state) => StyleProp`, called by the owner with its own live state. This
  is the mechanism `HozoChip`'s `hozoRemoveStyle` already uses for a compiled
  pattern slot, extended to owners outside the `Primitive` enum
  (`hozoTabStyle`, `hozoToolbarStyle`, `hozoHandleStyle`).
- **Web:** the public class prop itself (`abi.webClassProp`), carrying class
  names compiled at the caller, with the CSS emitted beside the caller.
- A caller that hands over the prepared carrier does not also hand over the
  class string (`tabs.native.tsx` throws if both arrive).
- The owner applies what it is given; it does not resolve a literal. An
  opaque or residual value still goes through `hozoClasses(value, facts)` at
  the owner. That path is supported output, not a fallback to delete.
- Explicit `style` stays outside the class plan and keeps
  `hozoAuthoredStyle` as its one normalisation point (RFC 010 §4.3.1).

`abi.nativePartial` exists for one owner whose shapes differ in whether they
have state at all (BottomSheet's handle). It stays optional and is not a
pattern to reach for: prefer one carrier whose stateless shape receives the
resting styles.

### 3. One ordering key, computed only by the build

The key is, in order: composition tier
([decision 009](009-a-callers-class-sits-between-rest-and-state.md)), input
([decision 011](011-styling-inputs-keep-their-own-cascade.md)), then the
frontend's own rank (RFC 007 for Tailwind, StyleX's priority for StyleX).

- A prepared owner plan enters at the caller tier and is ordered by
  `TailwindWritePlan`. An owner migration adds no ordering rule of its own.
- The runtime resolver sorts by ranks the build produced, on a cache miss
  only. It never computes a rank. Residuals it assembles are to carry the
  tier as well as the rank (RFC 010 §7 C), so they follow the same key.
- A rank means something only inside the epoch and candidate map it was
  produced for. It is never compared across manifests.

This is RFC 010 §4.4 unchanged. It is restated because it is the one point
where #1230 and the owner work meet: C can finish without waiting for B or E,
and B and E may not work around an ungraduated domain with a local sort.

### 4. Candidates come from manifests, captured whole or not at all

- The candidate universe is the project's own seed plus the `candidates` of
  every resolved package instance, transitive ones included. This replaces
  walking the source of `@hozo/*` packages.
- An adapter captures the manifests of the edges it resolved, freezes the
  result before the candidate map is used, and identifies it by resolved
  instance and content, never by package version alone
  (`owner-manifest-capture.ts`).
- An incomplete capture selects the ordinary route for the whole build,
  before any output is published. A build never changes route after it has
  emitted code or CSS (`docs/measurements/owner-admission-policy.md`).

**Not decided here:** how Metro freezes a complete map when an edge appears
late, and what a transitive or duplicated instance costs at startup. RFC 010
§9 calls this a major unknown and no spike has closed it. It is its own
issue, and the old scan stays until that issue shows the replacement.

*Amended for #2047: the capture, and an incomplete capture fails.* #2047 is
that issue, and
[`manifest-candidate-capture.md`](../measurements/manifest-candidate-capture.md)
is its measurement.
- **What is captured.** Every adapter (Metro, Vite and Next) captures at
  startup, before any module graph exists. The capture starts from the app's own `package.json` and
  descends only into packages that declare `hozo.manifest`. On both real apps
  it took 33–53 ms and held every manifest the build reached.
- **What the capture missed.** A package with a manifest that a build reaches
  outside the capture fails the build when it is resolved or loaded, and the
  error names the package. That happens before output is published.
- **An incomplete capture now fails the build** instead of selecting the
  ordinary route. The error names each package and the reason, and it comes
  at startup, before any output, so a build still never changes route midway.
  Why the fallback goes:
  - For packages, the ordinary route was the `@hozo/*` source walk that this
    point replaces. Keeping the walk only as a fallback keeps a second
    candidate path for one realistic cause: mixed `@hozo/*` versions. The
    published `@hozo/ui` 0.4.0 ships a v1 manifest, which has no package
    channels.
  - `@hozo/*` is released as one `fixed` group, so that mix is unsupported
    anyway, and "upgrade it to the same version" is the useful answer.
  - The walk read only `@hozo/*`, so it gave a third-party package with a
    broken manifest nothing.
- **What counts as incomplete.**
  - A carrier's manifest is missing, unreadable or conflicting.
  - The closure is over its budget.
  - An `@hozo/*` package has a v1 manifest.
  - A v1 manifest from any other package is **not** incomplete. It is what
    `hozo manifest` still writes: text forwarding, and no candidates. That
    package contributes none, as before #2047. (Since #2112, `hozo manifest
    --sources` writes v2, so an author can ship candidates; without the
    option it still writes v1.)
- **What does not change.** The principle: no build ever uses part of the
  candidates.
- **What still walks sources.**
  - The experimental owner paths, which bring their own capture.
  - An explicit `content.packages`, which names the packages whose sources
    are walked, as Tailwind's `@source` does.
- **Vite.**
  - It compiles the source a captured package ships for its consumer
    (`compiledByConsumer`) because the capture admits it, not because the
    walk listed it. Vite transforms a file under `node_modules` only if it was
    admitted.
  - It still reads those files at startup, but only for the Tailwind ordering
    seed. Without them, the seed filled in while transforms ran, and
    `apps/landing`'s output changed from run to run.

**Owner delivery in ordinary Vite.** The same startup capture supplies the
audited owner contracts of `@hozo/patterns` and `@hozo/form`. The import
specifier only limits which requests to inspect; Vite's resolved package
instance selects the contract. For a bare external import that Node will
load, locate the package from that importer. A missing or unaudited owner
does not fall back to the compiler's built-in table. That table remains for
standalone callers and adapters that have not migrated. An explicit
`content.packages` scan bypasses the startup capture, so package owner
class props remain ordinary there. A pre-output refusal uses the same
capture policy as ordinary Vite.
This does not enable arbitrary third-party owner declarations by default.

### 5. Text publication is a field of the contract

Whether an owner hands text metrics and paint to its children is
`textPublish` on its contract, and `inputs.splitText` on a shape says the
owner splits box from text styles. `PATTERN_HOSTS`' state-sharing flag in
`crates/hozo_parser/src/text_forwarding.rs` moves there when D starts.

D depends on C's text domains and on RFC 006's own gates. It does not wait
for every owner to have a contract, only for the owners that publish text.

### 6. Enough evidence, and what it unlocks

**To migrate one owner, a pull request (or one stack) needs exactly:**

1. the contract, in the catalog;
2. a test that a marker class reaches the declared host for each shape, on
   Web and on Native (RFC 010 §4.6, third rung);
3. for an owner with state facts, one comparison that the same state selects
   the same styles on Web (a real browser) and Native (the resolver);
4. the deletion: literals for that owner are compiled at the caller, and the
   owner's literal-resolving route for them is gone.

**Then, in that same stack:** the contract becomes `audited`, the ordinary
adapters route that owner through the prepared path by default, and a
changeset says so. Promotion is the consequence of the four items, not a
separate approval. A contract that cannot meet them stays `unknown` and its
issue says which item failed.

**Not required per owner:** bundle-size receipts, callback-identity or
evaluation counts, lifetime matrices, a measurement document, device or
screen-reader runs, or a second independent reader of a receipt. Run these
once per phase, or when a specific regression is suspected, and say which.
The repository's existing device and accessibility jobs keep running as they
do for any change.

**Progress is two numbers:** slots still `pending-audit`
(`scripts/style-slots/status.mjs`), and RFC 007's graduation score until
point 7 closes it. The four
global rates of RFC 010 §6 stay defined, and are not a gate for any slice.

### 7. Ordering is finished by deletion, not by parity on every combination

#1230 reached 30 of 36 on 2026-11-08 and 31 on 2026-11-16, with about 150
merged pull requests in between. The five points left are stage 6 of domains
1 to 5: "the domain's old ordering path is deleted".

By the project's own account that deletion has happened. The parser
interaction sort, the Web condition-weight sort, the duplicate owner variant
table and the process-wide switch are removed, and every mechanism still
listed in `docs/measurements/tailwind-order-coverage.md` is marked "keep".
The stage 5 inventory reports no unranked default class or variant in any
domain. What the pull requests since then have been doing is narrowing a
fallback: when one class list holds a write the plan cannot rank (an
arbitrary value, or a class the project's own CSS defines), how many of its
neighbours still get Tailwind's order. That is a product of combinations, so
it has no last case.

So:

- **Stage 6 of a domain is earned when no independent Tailwind precedence
  policy remains for it** and the existing oracle suite and compiled-output
  comparison pass on that state, once. The four-part gate proposed in
  `tailwind-order-coverage.md` is not required per combination.
- **The fallback is a boundary, not an old authority.** An input with an
  unrankable write keeps the order it was written in for the writes that
  cannot be shown independent of it. This is documented behaviour. Narrowing
  it further is not part of #1230.
- **A combination where Hozo and Tailwind choose different winners is a
  bug**, filed by itself with its reproduction, as #2018 and #2027 are. It
  is fixed when someone meets it, not searched for.
- **The build says when the boundary decided something.** If an input falls
  back and holds two writes to one property under one condition, the
  compiler warns, naming the classes. This is the one new piece of work, and
  it is what makes the boundary safe to leave: today that case is silent.
- **#1230 closes** when the five points are ticked on that basis and the
  warning has landed. The ordering policy version then changes only with a
  fix to a filed bug, because each change discards every consumer's cache
  (it went from v56 to v68 between 2026-11-08 and 2026-11-16).

What this gives up: with a conflicting pair and an unrankable write in one
class list, the later-written class wins where Tailwind's stylesheet order
might pick the other, and in one measured RTL case (#2027) the static
output and the runtime-assembled Native result differ. Hozo's own corpus has
318 of 320 multi-write inputs ranked, and switching the old path off changed
none of 281 components, so no shipped component depends on the difference.

## How the work is split

#1458 keeps this record and the overall picture. Each of these is its own
issue with its own owner, and none waits for the others except as stated:

| Issue | Depends on |
| --- | --- |
| Ordering: tick stage 6 on the basis of point 7, add the fallback warning, close #1230 | points 3 and 7 |
| Manifest v2: generate it for `@hozo/patterns`, `@hozo/form` and `@hozo/ui`, and fail CI when it disagrees with the compiled-in tables | point 1 |
| `@hozo/form`'s ten components as contracts | points 1, 2, 6 |
| The 33 component-managed slots, in batches by component | points 1, 2, 6 |
| Candidates from manifests, including the open question in point 4 | point 4 |
| Nothing fails silently: split the dynamic-class diagnostic, report carried literals missing from the candidate set, warn once in development (RFC 010 §4.8) | none |
| Text inheritance as the default | point 5, and C's text domains |

## Evidence

- `packages/compiler/src/owner-contract.ts`: the bounded, data-only reader
  and the `Gate` grammar.
- `scripts/style-slots/catalog.mjs` (`ownerShadow`): three contracts on the
  one shape. A two-shape owner with a stateless shape (`BottomSheet.handle`),
  a repeated owner with selection and disabled facts (`Tabs.Tab`, `audited`),
  and a stateless root (`Toolbar.root`).
- `packages/patterns/src/tabs.native.tsx`, `chip.native.tsx`: the Native
  carrier as a state callback, for a non-`Primitive` owner and a `Primitive`
  slot.
- `docs/measurements/web-owner-class-carrier.md`,
  `tabs-owner-contract-audit.md`, `toolbar-owner-delivery.md`,
  `bottom-sheet-prepared-handle-spike.md`: what each spike compared.
- #1458's §7A checkpoint (2026-11-04): static and runtime paths agree for the
  measured states of one non-`Primitive` owner on both platforms; the
  stateless shape correctly gets no stateful recipe.
- `node scripts/style-slots/status.mjs` on `b3ea23ff`: 27 components, 100
  slots, 56 pending, 33 component-managed and all 33 pending, global
  measures `null`.
- #1230's checkpoints: the scale and 30 of 36 on 2026-11-08, 31 of 36 with
  domain 6 complete on 2026-11-16. Merged pull requests whose body mentions
  `1230`: 148 between 2026-11-08 and 2026-11-18 (a text search).
- `docs/measurements/tailwind-order-coverage.md`: which ordering mechanisms
  remain and that each is kept; 318 of 320 multi-write inputs ranked.
  `tailwind-order-old-path.md`: 0 of 281 Web and 281 Native components
  change with the old compiler ordering off.
- `crates/hozo_ir/src/tailwind_plan.rs`: `TAILWIND_SCALAR_ORDER_POLICY` is
  `scalar-order-v68`; it was v56 at the 2026-11-08 checkpoint.

## Rejected / revisit

- **Accept RFC 010 whole.** It is a thousand lines of end state, inventory and
  history. Accepting it would bind contributors to prose that was written as
  a target, and would still not say which spike to build on.
- **Finish the dashboard and the four global rates first.** Their
  denominators have been open since the RFC was written and no slice needed
  them to decide anything. Two counts that already print are enough to see
  progress.
- **Keep promotion as a separate, later decision.** That is how one contract
  in three came to be audited after three weeks: the evidence existed and
  nothing turned it into a default. It also leaves a second production route
  per owner, which RFC 010 itself rules out.
- **Require device evidence per owner.** The carrier changes which code
  selects a style, not how a host draws it. What a device adds is covered by
  jobs that already run, and by the issues labelled `needs-device`.
- **Design a new contract schema before migrating.** Three owners with
  different shapes fit the existing one.
- **Keep narrowing the ordering fallback until no combination differs from
  Tailwind.** The inputs it affects pair a self-conflicting class list with
  a class Hozo cannot rank. None exists in Hozo's own corpus, and the cost was
  about 150 pull requests for one point. A warning costs one.

Revisit when an owner cannot be expressed in the contract without an
expression, when a migrated owner regresses in a way the four items could
not have caught (raise the bar for that class of owner, and say why), when
point 4's open question is answered, or when filed ordering bugs cluster in
one domain (that domain's boundary is then too wide, and narrowing it is
worth a slice).
