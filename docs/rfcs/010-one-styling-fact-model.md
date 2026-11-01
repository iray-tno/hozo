# RFC 010: One styling fact model — the end state for composition, ordering, inheritance and cross-file facts

- **Status**: Draft v3 (repository review). A target to plan backwards from;
  changes no behaviour, default, ABI or eligibility by itself.
- **Authors**: iray-tno
- **Tracking issue**: [#1458](https://github.com/iray-tno/hozo/issues/1458).
  Continues [#1230](https://github.com/iray-tno/hozo/issues/1230); gathers the
  historical composition/inheritance/cross-file work in #1152, #1207, #656
  and #950. Closed source issues are not reopened or treated as rollout proof.
- **Target packages**: compiler crates, `@hozo/compiler`, `@hozo/metro`,
  `@hozo/vite`, `@hozo/next`, `@hozo/engine`, `@hozo/primitives`,
  `@hozo/patterns`, `@hozo/form`, `@hozo/ui`, `scripts/style-slots/`.
- **Source baseline rechecked**: main `d2a04c39759e57fe1159bd0ca65420ce88a1f64d`
  (2026-10-30). Catalog counts, Native inheritance's default, the manifest
  schema, source discovery and a bounded resolver probe were checked.
- **Historical behavioural evidence**: claims marked *(probe)* are the
  supplied draft's `hozo_native::lower` observations at `cb0e9c8`; they were
  not rerun as new compiler/browser/device experiments for this docs PR.
  Source locations below identify symbols, not stable line numbers.
- **v3**: preserves the supplied v2 draft and incorporates the repository
  review in §11. The next implementation is the bounded §7 A spike, not
  blanket acceptance of this document.

Related specifications:
[composition tiers](../decisions/009-a-callers-class-sits-between-rest-and-state.md),
[input cascade](../decisions/011-styling-inputs-keep-their-own-cascade.md),
[text inheritance](006-native-text-inheritance.md), and
[canonical Tailwind order](007-canonical-tailwind-order.md).

## Three principles

Everything below applies these. Each pair is one thing to own and one thing
that is allowed to stay plural.

1. **One source of truth per fact; more than one independent way to check it.**
   A contract a component declares is never its own evidence.
2. **One authority for ordering semantics; two ways to execute it.** Static
   output at build time, prepared entries assembled at run time. The runtime
   may sort by ranks the build produced; it never defines what a rank means.
3. **One inheritance protocol; separate update channels inside it.** Metrics
   and paint stay separate contexts; that is RFC 006's design, not a split.

## Where we are

Kept at the top and updated as phases land. "Unexplained divergence" is
defined in §6. Counts here are source inventories unless stated otherwise;
the four measured rates are not newly available because this RFC exists.
Phase A supplies their reproducible dashboard and pinned denominators.
The three channels are transport/ownership boundaries, not a claim that all
styling semantics fit into three physical source files.

| Measure | Baseline | End state |
| --- | ---: | ---: |
| Fact definition/check locations inventoried (§2.1) | 9 (F9 is a check) | 3 transport channels; one authoring source per fact |
| Catalog slots whose owner is `pending-audit` | 55 of 99 | 0 |
| …of which applied by the component at run time | 32 of 32 | 0 |
| `@hozo/form` components with secondary class props outside the catalog | 9 (plus Form's root) | 0 |
| Authorities that define ordering (§2.3) | 4 | 1 |
| Native text-inheritance mechanisms (§2.4) | 5 | 1 protocol (two channels), statically erased where RFC 006 §5 proves it |
| Native routes for a class list (§2.2) | 4 | 1 plan, applied at build time or assembled at run time |
| Known silent-failure categories on Native (§2.5) | 3 identified, not an exhaustive denominator | 0 unexplained cases in each measured scope |

## 1. Why a target, not another slice

The [live inventory/scoped-receipt report](../measurements/styling-fact-status.md)
prints the current catalog separately from this pinned historical baseline.
Browser state pairs and component-bundle bytes have their own denominators;
missing global measures remain unmeasured. This reporting slice does not
complete phase A or authorize an owner/default migration.

Four related efforts have substantial implementations but still have open
integration, rollout and deletion work: composition (decision 009, #1152),
ordering (decision 011, RFC 007, #1230), inheritance (RFC 006, #1207) and
cross-file facts (#656, #950). They meet
on the same objects — an element, the classes written on it, the state its
owner has, the text styles it hands down — but each grew its own tables and
its own transition route. Every new slice now has to be checked against the
other three's half-finished states.

This RFC states the shape they plug into, so work can be ordered backwards
from it and each slice can delete something instead of adding a parallel
path. It does not change decision 009's tiers, decision 011's input
boundary, RFC 007's comparator or graduation method, or RFC 006's protocol
and proof rules. It decides where their facts come from, how those facts are
checked, where their results are applied, and what is deleted when they land.

RFC 010 is about **structure and disclosure**. It does not replace RFC 007's
goal of supporting and matching every Tailwind feature (§6's Coverage and
Fidelity); it makes sure that whatever is not yet supported is never silent.

## 2. What exists today

### 2.1 Nine places define or check component facts

| # | Fact | Where | Who can contribute |
| --- | --- | --- | --- |
| F1 | Which exports the compiler lowers, and as what | `primitive_for_name`, `crates/hozo_parser/src/jsx.rs`, over the closed `Primitive` enum | Hozo only |
| F2 | Which modules those exports are trusted from | `DEFAULT_PRIMITIVE_SOURCES`, `packages/compiler/src/sources.ts` | Hozo; a project may override |
| F3 | Slot → style prop, owner, profile, events, gate, composition | `scripts/style-slots/catalog.mjs` → generated `hozo_ir/src/class_slots.rs`, `hozo_native/src/pattern_contracts.rs`, `patterns/src/slot-facts.native.ts` | `@hozo/patterns` only (27 components) |
| F4 | Owner facts for form components | hand-written `packages/form/src/class-facts.native.ts` (the catalog's `NonControl` profile, value for value) and inline objects in each `.native.tsx` | `@hozo/form` only |
| F5 | Which hosts and patterns hand text styles to children | `FORWARDING_HOSTS`, `HOST_MODULES`, `PATTERN_HOSTS`, `crates/hozo_parser/src/text_forwarding.rs` | Hozo only |
| F6 | What an exported component forwards as text | per-file summary → `hozo.manifest.json` `textForwarding`; read by Metro (`dependencyTextForwarding`, `getCacheKey`, `set_text_forwarding`) | any package; today only `@hozo/ui` ships one |
| F7 | Which class strings a package's own code requests at run time | `packageSources`, `packages/compiler/src/project.ts`: walks the source of `@hozo/*` packages declared in the project's `package.json` | `@hozo/*` names only |
| F8 | Which project functions join classes | `classHelpers` / `foundClassHelpers` in `metro.json` (#964) | the project |
| F9 | Whether a component's Native half reads a class prop at all | `apps/landing/scripts/ui-native-unapplied.mjs`: a TypeScript-AST check that the prop is read outside its type and destructure, or may travel in a rest spread | docs build only |

F9 is different in kind from the others: it does not define a fact, it
**checks** one against the code. That is worth keeping (§4.6). It is also
weaker than it looks: "read somewhere" is not "applied at the right owner".

Two more observations from the code:

- The catalog's `gate` and `composition` fields are prose
  (`'src-defined-and-not-failed'`, `'each-filtered-option'`,
  `'root/panel text inheritance; classes/explicit-style'`; `gate` alone has 27
  distinct values). They are documentation, not data a compiler can act on.
- F6 and F7 locate the same package two different ways: the manifest by a
  hand-written walk up `node_modules/<name>` (`installedPackage`,
  `manifest.ts`), the sources by `createRequire(...).resolve`
  (`project.ts`). Neither asks the bundler, and both assume one installed
  instance per name.

### 2.2 A class list reaches a Native element by one of four routes

| Route | When | What happens *(probe)* |
| --- | --- | --- |
| R1 compiled primitive | element is a `Primitive` (F1) | static StyleSheet entries and guards |
| R2 compiled pattern slot | a `Primitive` pattern with a catalog slot (F3); 11 components | e.g. `<Chip removeClassName="px-2 hover:bg-red-500">` → `hozoRemoveStyle={({ pressed, hovered, …, disabled: __hozoSlotDisabled, … }) => [hozoStyles.hozo1, hovered && hozoStyles.hozo1_hover]}` |
| R3 component-managed | a pattern not in F1 (16 catalog components), `@hozo/form` | the literal is carried unchanged: `<Tabs tabClassName="px-3 hover:bg-red-500" />` reaches the component as a string, which calls `hozoClasses(value, facts)` |
| R4 opaque caller string | a residual of a mixed or opaque `className` | `hozoClasses(extra)` inserted between tiers (decision 009 §2) |

`@hozo/ui` drives R3 with literals today (`<Tabs tabClassName={own.tab} …>`,
`<BottomSheet handleClassName={handle} …>`). They are compiled with the
application — Metro lowers any `.tsx`, including installed ones, and only
suppresses their diagnostics (`metro/src/transform.ts`) — yet still
resolved on device.

### 2.3 Four authorities define order

- **O1** `crates/hozo_parser/src/interaction_order.rs`: sorts owner-interaction
  conditions within every non-StyleX input at parse time (`jsx.rs`),
  graduated inputs included.
- **O2** the legacy specificity sort inside `group_by_condition`,
  `crates/hozo_ir/src/lib.rs`, skipped when a canonical Tailwind input is
  present. `group_by_condition` also groups and coalesces equal
  conditions for the backends; only the sort is an ordering authority.
- **O3** the shared plan, `TailwindWritePlan::order_scalars`
  (`crates/hozo_ir/src/tailwind_plan.rs`) and `tailwind_order/`: re-sorts an
  input after O1, all-or-nothing per input (RFC 007, policy v8).
- **O4** the runtime resolver, `packages/engine/src/class-resolver.ts`: on a
  cache miss `resolve` sorts by build-time ranks. If any class in the string
  lacks a rank, the whole string takes its legacy base/group path and ranked
  condition groups are sorted there instead.

Executing order in two places (O3 at build time, O4 at a cache miss) is
correct and stays. What should be one is the **authority**: O1, O2's sort and
O4's legacy path each still decide order for inputs the plan has not
graduated.

### 2.4 Five text-inheritance mechanisms

- T1 same-file forwarding through visible nodes (`hozo_native/src/text.rs`, `render.rs`).
- T2 cross-file summaries and manifests (F5, F6).
- T3 `hozoTextStyle` handed to a Pressable's direct children (`primitives/src/pressable.native.tsx`, `foundation.native.tsx`).
- T4 the numeric text-size context (`engine/src/text-size.ts` and its readers).
- T5 RFC 006's protocol (`engine/src/text-inheritance.ts`): two contexts,
  `HozoInheritedMetricsContext` and `HozoInheritedPaintContext`, behind the
  `textInheritance` option, which defaults to `false`
  (`crates/hozo_napi/src/lib.rs`). No bundler adapter sets it; only
  tests, conformance probes and native-showcase's comparison scenarios do.
  Ordinary Metro builds and `/docs` screenshots do not use it.

### 2.5 Three ways a class silently does nothing on Native

1. **Not in the candidate universe.** The resolver warns about classes the
   compiler recognised and refused (`unsupported`), and ignores every other
   unknown name by design (`class-resolver.ts`). The universe is the
   project scan plus F7, so a class in a non-`@hozo/` library, or in an
   `@hozo/` package reached only transitively, has no entry. #1297 was this,
   inside Hozo's own showcase.
2. **A class prop the component never applies.** F9 finds these, in the docs
   build only.
3. **Facts that are present but wrong.** Missing facts are *not* silent: a
   state class with no state warns (`class-resolver.ts`), and a missing
   key warns (`supplied`). What is silent is a component passing a fact whose
   meaning differs from the Web owner's — the kind of mismatch the catalog
   notes record by hand ("aria-current is not aria-selected"). Only an audit
   catches it.

The build already says something about item 1, but not enough. Every opaque
residual gets the same `DYNAMIC_CLASS_NAME_NOT_RESOLVED` warning *(probe)*:
`className={className}`, `` `p-4 ${extra}` `` and `` `bg-${color}-500 p-4` ``
produce the same message. The last expression cannot by itself establish which full colour tokens to
prepare. It is not inherently unresolvable: if `bg-red-500` was prepared
elsewhere or belongs to an explicitly supplied finite candidate set, the
resolver can match that full string even when it was assembled at run time.
Without decomposing the template, its independent literal `p-4` goes to the
runtime too. Automatic discovery and runtime lookup are different claims.

## 3. The end state in one paragraph

**Every class list resolves to one ordered plan of guarded writes. The plan's
meaning is fixed at build time from facts that each have one source and are
each checked independently against the code. It is applied at the element
that owns the state — compiled there when the build can read the classes,
assembled from prepared entries at run time when it cannot. On Native that
owner then publishes resolved text metrics and paint, and descendants read
them unless RFC 006 proves the read away. Nothing that fails to apply does so
silently: what the build can detect it reports, and what only the runtime can
see it reports in development.**

## 4. Target model

### 4.1 Three fact channels, one per kind of fact

| Channel | Carries | Identity | Read by |
| --- | --- | --- | --- |
| **Package manifest** (`hozo.manifest.json`, v2) | exports (primitive mapping, owner contracts per class prop), text publication, the class strings the package's own runtime-resolved code requests, its class joiners, whether its sources are meant to be compiled by the consumer | the resolved package instance and the manifest's content hash (§4.7) | every adapter, once per epoch; folded into cache keys |
| **Project capture** (`metro.json`, Vite/Next sessions) | the CSS graph and theme, the lexical candidate seed of the project's sources, the project's helpers and options | the epoch fingerprint, as today | every transform in that epoch |
| **Module** | what one file says about itself | the file | its own transform only |

No other independent authority may define the same component fact. A catalog
can author the manifest and generated tables; component handlers still
compute live state. Generated copies and state values are not new semantic
authorities. In particular:

- **Hozo's packages use the manifest like any other package.** The catalog
  remains the authoring source for `@hozo/patterns` and gains `@hozo/form`;
  its output is each package's manifest. The generated Rust tables become a
  compiled-in copy of those manifests for standalone and WASM calls — same
  generator, checked equal in CI — not a second source.
- **The `Primitive` vocabulary stays closed and stays in the compiler.** It
  is compiler semantics (how a `View` lowers). What moves to the manifest is
  "this export of this package is that primitive", which F1 by name and F2 by
  module approximate today.
- **Candidate strings come from manifests, not from walking `node_modules`.**
  The universe becomes *project seed ∪ candidates of every resolved package
  instance in the graph*, transitive ones included. This replaces F7's scan.
  It does **not** stop Hozo from reading package sources: a package that
  ships `.tsx` for the consumer to compile (as `@hozo/ui` does) is still
  transformed by the application's build. The manifest says so explicitly
  rather than leaving it to the file extension.

A third-party library becomes a participant by shipping a manifest. Nothing
here requires one to exist; it requires that Hozo's own packages could be
third-party without losing anything.

### 4.2 The owner contract: what an owner is

Every class list has one owner: the element whose state its variants
describe (decision 009 §3). The contract describes **that element**, and
nothing about how a particular class list reaches it:

```ts
// Conceptual; serialised in the manifest per (export, classProp).
interface OwnerContract {
  /** Known true, known false, supplied at run time, or absent (unavailable). */
  facts: Partial<Record<FactKey, true | false | { supplied: string }>>
  /** Interaction events this owner observes. Unobserved is not false. */
  events: { pointer: boolean; focus: boolean }
  /** When the owner exists, as data, not prose. Several shapes allowed. */
  shapes: Array<{
    when: Gate                      // machine-readable form of today's `gate`
    host: 'control' | 'decoration' | 'text' | 'image'
    facts?: Partial<OwnerContract['facts']>   // overrides for this shape
    events?: Partial<OwnerContract['events']>
  }>
  /** Whether this owner publishes text metrics/paint to its children. */
  textPublish?: { metrics: boolean; paint: boolean; states: boolean }
  /** How to hand this owner a prepared plan (§4.3). */
  abi: {
    nativePreparedProp: string
    nativeCallback?: string
    webClassProp: string
  }
  /** Public explicit-style contributions, distinct from the prepared prop. */
  authoredStyles?: Array<{ prop: string; order: number }>
  /** Explicitly unknown is allowed; it is never the default. */
  audit: 'audited' | 'unknown'
}
```

`shapes` is needed because real owners are conditional, and the catalog
already knows it in prose: Avatar's image and fallback exist under opposite
gates; Stepper's step is a button only with `onStepPress`
(`optionalOwner`); Chip's row is a toggle or a composite; BottomSheet's
handle is a `Pressable` with interaction facts when the sheet is resizable
and a hidden `View` with no state otherwise
(`patterns/src/bottom-sheet.native.tsx`).

This is what unblocks Toolbar and RadioGroup (#1152): they need a contract,
not a place in the `Primitive` enum.

This is conceptual schema, not a promise to serialize JavaScript. Phase A
must bound `Gate` to validated data (for example supplied booleans, finite
prop equality and conjunction/disjunction), define unknown and overlapping
shape handling, and use symbolic supplied-fact identifiers rather than
arbitrary executable strings. A missing fact is unavailable, not false.
Facts and event bindings are validated against the declared shape's actual
host. Repeated owners (each option, day or line) instantiate the contract
with their own facts; they never borrow a sibling's state.

Several class props may contribute to the same physical owner, while one
prop may be used by repeated owners. The binding must name the owner and
contribution, not assume that one prop always means one distinct host.
The schema must distinguish the prepared-class carrier from public authored
styles and their composition order; a bare `styleProp` string is insufficient.

### 4.3 The application plan: how a class list reaches its owner

Separate from the contract, because it depends on the **input**, not the
owner. The same `handleClassName` can be a literal one day and a variable the
next.

| Input on an owner with an audited contract | Application |
| --- | --- |
| literal, or decomposable into literals | compiled at the caller; the owner receives prepared entries through `abi` (today's R2 mechanism, generalised beyond `Primitive`s) |
| mixed | literal pieces compiled as above; the residual assembled at run time (R4) between the tiers |
| opaque | assembled at run time (R4) from the candidate map, with the contract's facts |

R3 as it exists today — a literal carried as a string and resolved by the
component — disappears for audited owners. A component still *applies* what
it is handed with its own facts; it no longer *resolves* literals.

Generalising R2 is per-component work: each R3 component must accept the
prepared form through its contract's `abi`, as `HozoChip` accepts
`hozoRemoveStyle`. It starts with one component (phase A's spike).
The Web carrier must reach the real DOM owner as classes/selectors; the
Native carrier must reach the matching host's style/callback. Native-only
callback generation is not evidence of a cross-platform application plan.

### 4.3.1 The explicit-style composition boundary

Explicit styles stay outside the ordered class plan, but not outside the
owner's application contract. At the actual owner, keep these operations
distinct:

1. Select that shape and its real state; capture authored expressions with
   the existing evaluation order/count and short-circuit behaviour.
2. Apply the prepared class contributions in their established tiers.
3. Normalize each explicit author's own contribution **before** mixing it
   with class output, then apply explicit-style precedence and box/text split.
4. Publish resolved text only from the destination that owns it.

The [gap measurements](../measurements/tailwind-gap-alias-boundary.md) show
why step 3 matters: Yoga axis/generic gutter precedence is not repaired by
merely sorting classes or flattening the entire mixed array. Existing
`hozoAuthoredStyle` remains the shared author normalization boundary; do not
replace it with per-widget normalizers or run it eagerly for closed owners.
Registered/nested styles, null/reset/percentage values, row reuse keys and
style accessors require their existing supported semantics and independent
tests. New carriers must not double-resolve a class string, apply an author
twice, change host identity or turn a closed popup's author getter into work.

The [consumer inventory](../measurements/native-gap-owner-inventory.md)
records 38 files across 381 Native/shared modules in 14 package roots:
33 have projection calls, two are class-only, two (CodeBlock/CodeLines) need
composition review, and one is a generated forwarding leaf. These are not
38 audited contracts. A marker reaching a host does not alone prove its
tier, author normalization, conditional lifetime or memo/reuse invalidation.

Whether this shrinks the Native bundle is a measurement, not a claim: static
names already stay out of the runtime candidate map, so compiled literals
remove candidate entries but add generated callbacks.

### 4.4 One ordering authority

The composition model has three levels, in this order:

1. **Composition tier** (decision 009): resting look < caller < state.
   Explicit `style` stays outside the plan.
2. **Input** (decision 011): specificity, then JSX input order.
3. **Frontend order**: RFC 007's rule comparator for Tailwind; StyleX's own
   priority for StyleX.

These levels constrain individual guarded writes, not one guessed
specificity for an entire input. Preserve importance and original selector
specificity where those domains are assessed; a later input does not erase
an earlier stronger conjunction. Do not compare unrelated Tailwind and
StyleX ordinals or flatten them into a new universal condition sort.
Unsupported domains retain their explicit barrier until RFC 007 graduates
them. A prepared rank only has meaning in its compatible context/map
namespace and epoch, not across arbitrary package manifests.

The build is the only authority for these. It executes them in two places:

- **Build time:** static output for compiled applications (R1, generalised R2).
- **Run time, at a cache miss:** O4 assembles the requested names' prepared
  entries into a template by build-time rank, once per distinct string.

The runtime never computes a rank, specificity or Tailwind rule order, and
never sorts on a cache hit or a state-only update (already RFC 007 §5's rule).

O1, O2's sort and O4's legacy path stop being authorities as each domain
graduates (§7, C). `group_by_condition`'s grouping and coalescing stay.

### 4.5 One text protocol, statically erased where proved

An owner whose contract has `textPublish` publishes RFC 006's resolved
metrics and paint, in its two existing contexts. Descendants read them. This
is T5, on by default at the end.

The other mechanisms do not become correct by being "seen" by the compiler.
**RFC 006 §5 decides erasure**: per property/channel and per proved region,
a read is removed only if no reachable runtime ancestor can change the value,
and a publish only if no reachable opaque child can consume it. A same-file
parent or a manifest's `textForwarding` entry is optimisation evidence, not
proof — "not finding a parser summary is not proof that inheritance is
absent". So:

- T1 and T2 survive only as inputs to RFC 006 §5's "closed static" plan.
- T3 and T4 are replaced by reads of the same resolved metrics and paint, and
  removed after RFC 006's inventory and update-cost measurements, as RFC 006
  §4 already plans for the font-size context.
- Project-local wrappers that forward text (#656) are served by the runtime
  boundary. That is the protocol's job, not a defect.

The protocol consumes resolved writes and carries no specificity down
(RFC 006, RFC 007 invariant 6). Text-metric domains must therefore be
graduated in ordering before inheritance of them becomes the default (§7, D).
D advances on RFC 006 §6's evidence — device performance, portals,
interrupted transitions, re-render equivalence — not on a date.

### 4.6 Every contract is checked by something other than itself

A manifest saying `audit: 'audited'` is a claim. Each claim has an
independent check, and the checks are a ladder from cheapest to strongest:

| Claim | Check | Exists today as |
| --- | --- | --- |
| the slot exists on the public Web and Native types | TypeScript type discovery against the catalog | `scripts/style-slots.test.mjs` |
| the Native component reads the prop at all | AST reading of `.native.tsx` | F9, docs build only |
| the prepared plan or resolved style reaches the declared host, for each shape | render the component with a marker class per slot and assert the host's style | per-component tests, not systematic |
| the declared facts match the Web owner's semantics | run the same state on Web (browser) and Native (resolver) and compare selected styles | `candidate-cascade.test.mjs`, `caller-composition.test.mjs` for some owners |
| it looks right | native-showcase screenshots of every docs demo, closed and open | `/docs` captures |

The end state moves F9 out of the landing into CI as the second rung, and
adds the third rung for every audited slot. An `audited` contract without the
third rung fails CI.

### 4.7 Manifest identity

- **Instance, not name.** A manifest is keyed by the package instance the
  bundler resolved for the importing module, per platform where entries
  differ, so two versions of one package can coexist.
- **Content, not version.** Its contribution to a cache key is its content
  hash, as `dependencyTextForwarding` already does. Version strings are not
  used; a workspace package or a patched dependency changes content without
  changing version.
- **Which manifests a module consults** is the dependencies of the package
  that module belongs to, not only the application's direct dependencies.
  `@hozo/ui`'s own `tabs.tsx`, compiled by the application, imports from
  `@hozo/patterns`; that import is resolved from `@hozo/ui`.
- **One resolution.** F6 and F7's two lookups (§2.1) become the bundler's own
  resolver, captured once per epoch.
- Metro still reads manifests when it starts; a change needs a restart, as
  today. Vite can watch them.

#### Capture completeness and trust are part of the protocol

The target union over resolved instances is not yet an implementation
algorithm. Current Metro generates its candidate module during setup, before
ordinary module transforms. Phase A/E must demonstrate how the adapter makes
the needed manifest set available before freezing that map. Specify whether
the set comes from a resolver-backed dependency closure or a ready graph,
which platform/conditional entry was selected, and how cycles and two
instances of one package are identified. Neither a package-name-only walk
nor assuming the final graph already exists satisfies this requirement.

Every captured set has a completeness status and fingerprint. Late
contributions, missing declared manifests, changed workspace bytes and virtual/lazy
modules cannot silently reuse a map or numeric rank namespace that omitted
them. Each adapter must declare its restart/invalidation/rebuild behaviour,
and expose incomplete assessment instead of claiming a complete frozen set.
An ordinary package that advertises no manifest is a non-participant, not a
broken participant: keep its semantics unassessed and its existing supported
interoperability route. Distinguish that from a promised manifest that is
missing, invalid or incompatible. Completeness of the captured participant
set is not proof that arbitrary runtime strings or non-participants are covered.
Implement bounded transitive/two-version/platform and warm replacement
fixtures before deleting F7. Manifest content identity is combined with the
selected entry/platform and the existing compiler/ABI/output-policy context;
a version bump is neither required nor sufficient for invalidation.

Manifests are validated bounded data, not executable config: reject unknown
incompatible schemas, invalid bindings/gates, unsafe paths and unbounded
payloads with an explicit assessment/diagnostic result. Never execute a
package's config or evaluate supplied JavaScript to discover facts.
An export-to-Primitive mapping is a semantic/trust claim, not permission to
replace arbitrary third-party component behaviour. Ordinary custom
components keep their implementation and receive prepared carriers; only a
validated, trusted primitive mapping may select builtin lowering.

### 4.8 Nothing fails silently

- **At build time, for what the build can see.** Split today's single
  `DYNAMIC_CLASS_NAME_NOT_RESOLVED` into:
  - *pass-through* (`className={className}`): no class token is assembled at
    this forwarding site. It may be informational when the supplying sites
    are assessed, but forwarding alone does not prove that the eventual
    values are literals or have been checked elsewhere;
  - *assembled* (`` `bg-${color}-500` ``): the full tokens cannot be
    discovered from this expression alone. Diagnose an unproven candidate
    set, not the impossibility of lookup; an explicitly declared finite set
    or candidates already prepared elsewhere can make the lookup valid.
    Compile separable literals only when doing so preserves expression
    evaluation, coercion, token boundaries and own/caller provenance;
  - *opaque value* (a variable whose values the build cannot enumerate): the
    existing warning, plus a way for a project to declare the value set.
- **At transform time, for carried literals.** Metro's workers already
  receive the epoch's runtime candidates in the `metro.json` transfer, and
  Vite's plugin holds its candidate inventory in process. Any literal class token it carries
  to the runtime (R3 today, the residual of R4) that is absent from that set
  is reported then, with the file and line. This catches #1297's case without
  parsing anything at run time.
- **At run time, in development, for the rest.** A name missing from the map
  that the build-time checks could not see warns once. Attributing it to a
  file needs a call-site id in the generated `hozoClasses` call, which is an
  ABI change decided with phase E's ABI; until then the warning names the
  class only.
- **Wrong facts** (§2.5 item 3) are checked by the fourth rung of §4.6, not
  inferred correct by a runtime lookup. The guarantee is bounded by that
  independent state/shape matrix.
- **Intentional non-styling names** must remain distinguishable from missing
  styling candidates. Existing callers can use ordinary custom CSS or marker
  names. Define the explicit project/contract declaration and diagnostic
  category before changing the current unknown-name policy; do not add a
  runtime Tailwind parser or quiet every missing styling name through a
  blanket suppression. A pass-through informational message is not evidence
  that every eventual value was checked.

## 5. What this RFC is not

- Not "one sorter function". One authority, two executions.
- Not "one context". One protocol, metrics and paint channels.
- Not "no package source is read". No `node_modules` *scan* for candidates;
  source-shipped packages are still compiled.
- Not a Tailwind coverage target. That is RFC 007's.

## 6. Invariants and metrics of the end state

Four separate metrics, reported side by side so none hides another:

| Metric | Question | Owned by |
| --- | --- | --- |
| **Coverage** | What share of the denominator does Hozo support on each platform? | RFC 007 and the conformance suite |
| **Fidelity** | Of what is supported, what share matches the browser's Tailwind result? | RFC 007 |
| **Diagnostic completeness** | Of what is unsupported or divergent, what share is reported at build, transform or development time? | this RFC |
| **Contract audit** | What share of owners is audited and checked to the third rung of §4.6? | this RFC |

For each pinned platform/domain denominator `D`, let `M` contain cases
independently shown supported and matching, and `R` contain cases whose
specific unsupported/divergent result is tied to an attributable diagnostic.
Then unexplained cases are `D minus (M union R)`: take the union before counting,
rather than subtracting overlapping totals twice. Unmeasured cases stay
unmeasured; no source-inventory count can substitute for this denominator.
A general opaque-expression warning does not put every feature/value that
expression might produce into `R`. The finding must identify the measured
subject, platform, condition/owner and result well enough to link it to the
case. Report missing evidence and deliberately unassessed domains separately.

The end state is zero unexplained divergence **within each measured scope**
and the Coverage/Fidelity targets RFC 007 sets; the first without the second
is not done. No finite test denominator proves that all arbitrary app code
or all future class strings are understood.

Invariants, each checkable in CI:

1. **One source per fact kind**; compiled-in tables equal the manifests they
   were generated from.
2. **Every audited contract is independently checked** (§4.6, third rung).
3. **Zero unexplained divergence** in the conformance denominator.
4. **The build is the only ordering authority**; no rank computation at run
   time; no sort on a cache hit or state-only update.
5. **Hozo dogfoods its channels**: a fixture package outside `@hozo/`,
   consumed only through its manifest, passes the same suite as
   `@hozo/patterns`.
6. **Zero `unknown` owners** in Hozo's own packages.
7. **One route per decision in a default build**: `textInheritance`,
   `textStatic`, `textReference` and `tailwindPlan` become test-only or go.

## 7. Working backwards: phases

The arrows are evidence dependencies **per owner/domain**, not global
barriers that require every owner to finish before the next one can move:

```
A: schema/shadow + one vertical spike
        |
        +--> B(owner): contract + independent delivery
        |          +--> E(owner): manifest/carrier migration
        |
        +--> C(domain): ordering graduation + old authority deletion
                   +--> D(text region): required text domains + RFC 006 gates
```

This docs PR starts none of those production paths and does not deliver the
dashboard, schema-v2 implementation or spike. Advance only the verified
owner/domain; unrelated groups can continue. No existing six-workstream
progress or historical evidence is reset.

### Relationship to the existing six workstreams

| Existing workstream | Place in this RFC | Completion/deletion boundary |
| --- | --- | --- |
| 1. Compound text / size | C(text domain), then D | Prove winning metrics and live inheritance; remove replaced text routes only after RFC 006 gates. |
| 2. Shorthand / logical / gap | C(domain), B/E(actual owners) | Settle author/tier/gate/reset/percentage/grid/RTL semantics; graduate static/candidate together and remove the corresponding old ordering path. |
| 3. Transform / registers | C(domain) | Model register interactions before graduating; no scalar-rank shortcut. |
| 4. Direct properties | C(domain), already advanced | Preserve existing default assessed output; delete redundant authority only after paired regression evidence. |
| 5. Conditions / variants | B(owner facts) and C(condition domain) | Model real facts/events including unknown; preserve frontend-specific priority and independently verify Web/Native selection. |
| 6. Default consolidation / old path removal | C/D/E | Ordinary adapters/docs select the verified route; remove replaced tables/options/helpers without shrinking support. |

These are overlapping work classifications, not twelve sequential phases or
combinable completion percentages. The current per-domain policy remains
RFC 007's; this RFC adds an end-state structure and deletion obligations.

### A. Make it measurable, and test the biggest assumption (no default change)

- Put the top table first in RFC 006, RFC 007 and this RFC, with a script
  that prints every number, and the four §6 metrics.
- Define manifest v2: `exports`, owner contracts with `shapes` and machine
  `Gate`s, `textPublish`, `candidates`, `helpers`, `compiledByConsumer`.
  Keep `textForwarding` readable for one release.
- Generate v2 for `@hozo/patterns` and `@hozo/ui`; load them **in shadow** and
  fail CI if they disagree with the compiled-in tables. Name the authoring
  source for each fact: generated-file equality tests transport, not whether
  the authoring fact matches the real component.
- Prototype manifest instance/candidate capture independently of rollout:
  one transitive dependency, two instances, platform entries and a late or
  changed contribution. Record how Metro can freeze a complete map before
  using this as the basis for removing the old scan.
- **Spike, end to end, one slot:** BottomSheet's `handleClassName`. Its
  component already supplies `Pressable` interaction facts in the resizable
  shape and none in the decorative one, but the catalog has no contract for
  it. Write that two-shape contract (a slice of B); compile a literal at the
  caller and hand it through a new `abi` callback (a slice of E); keep the
  opaque path through `hozoClasses`; then compare static and runtime results
  on Web, Native selected styles, both shapes, cache behaviour and the
  production bundle. Include explicit authored overrides, both carriers,
  getter/gate lifetime, callback identity/evaluation counts and unchanged
  focus/a11y host structure. Preserve the original component as an
  independent negative/reference route; source-table agreement alone is not
  behavioural evidence. A second spike, Tabs' `tabClassName`, adds selection
  and disabled facts once the first passes.

*Exit:* the dashboard prints; shadow equality holds; the spike shows static
and runtime paths agree for one non-`Primitive` owner, or shows why not.

The [first handle application slice](../measurements/bottom-sheet-prepared-handle-spike.md)
adds a bounded Native carrier and Web/Native transport probes. Its producer
is still explicitly wired test scaffolding, but its old temporary-element
extraction is replaced by an opt-in direct Native carrier from the existing
renderer. A follow-up replaces the hand-written contract JSON
with a catalog-generated shadow and an internal bounded data-only compiler
reader (symbolic booleans and three-valued Gate selection). This is not the
complete manifest-v2 schema, a production manifest reader or generalized
lowering. Phase A, owner audit and default routing remain open.

### B. One owner contract everywhere

- Add `@hozo/form`'s nine components with secondary class props, and
  `Form`'s root, to the catalog. Replace duplicated semantic definitions in
  `class-facts.native.ts` and inline objects with generated contracts;
  components still compute and supply their own live state/events.
- Turn the catalog's prose `gate`s and `composition`s into `shapes` data.
- Audit the 55 `pending-audit` owners, the 32 component-managed slots first.
  Each audit writes a contract **and** its third-rung test (§4.6).
- Move F9 from the landing into CI as the second rung.
- Move `PATTERN_HOSTS`' state-sharing flag into `textPublish`.
- Give Toolbar and RadioGroup contracts (#1152's leftovers).

*Exit per owner:* independent shape delivery and facts; its E migration can
start without waiting for all other B owners. *Final B exit:* invariants 2
and 6, Contract audit 100% under the declared public-owner denominator.

### C. One ordering authority (continues RFC 007)

- Continue RFC 007's graduation unchanged in method, with one added rule:
  **graduating a domain removes O1's sort, O2's sort and O4's legacy path for
  that domain**, in the same PR or the next in its stack. Grouping stays.
- Order the remaining domains by measured use — `@hozo/ui`, `/docs` demos,
  Envarly, Ankiniki, the Bluesky corpus — while still covering every domain.
- Give O4 the tier position as well as the rank for R4 residuals, so an
  assembled template follows the same three-level key.

*Exit:* invariant 4; Fidelity and unexplained divergence reported per domain.

### D. One text protocol by default (completes RFC 006 / #1207)

After C graduates the text-metric domains, and only on RFC 006 §6's evidence:
make T5 the default route; feed T1/T2 into RFC 006 §5 classification only;
replace and then remove T3 and T4; retire the text options to tests.

*Exit:* invariant 7 for text; ordinary builds and `/docs` captures use it.

### E. The compiler reads manifests (alongside C, after B for that owner)

- Compiler reads contracts and the export→primitive mapping from manifests,
  resolved per §4.7; compiled-in tables become the standalone copy.
- Generalise R2 to every audited owner, one component at a time, starting
  with the 16 catalog patterns that are not `Primitive`s.
- Replace F7's `@hozo/` walk with manifest `candidates`.
- Ship §4.8: the split diagnostics, the transform-time carried-literal check,
  the development warning, and decide the call-site id ABI.
- Pack and install the non-`@hozo/` fixture as a consumer dependency and run
  the suite through it. Registry publication is not needed to prove this
  boundary and would require separate release authority.

*Exit per owner/instance:* prepared and opaque routes agree, manifest
identity/invalidation and authored-style composition are proven, and the old
definition/carrier is removed. *Final E exit:* invariants 1, 3 and 5 under
their measured scopes.

### Deletion receipts, not another permanent shadow route

Every migration PR records the fact's authoring source, generated/read
locations, independent checks, default consumer and exact obsolete definition
or branch removed. A bounded spike may keep a reference behind tests, with a
named follow-up before rollout. It must not leave an unowned second
production authority indefinitely.

| Slice | What becomes authoritative | What is removed after evidence |
| --- | --- | --- |
| B/E owner migration | Catalog-authored manifest contract and the real owner's live facts | Duplicate semantic tables/profiles and replaced component-managed literal resolution for that owner; not its event machine or authored-style precedence. |
| C domain graduation | Common prepared-write priority for static and runtime application | O1 ordering, O2 ordering and O4 legacy ordering for that assessed domain. Grouping/coalescing and unassessed behaviour remain. |
| D text-region rollout | RFC 006 resolved metrics/paint protocol or proved static erasure | Replaced T3/T4 paths and production route switches; T1/T2 survive only as proof inputs. |
| E package-instance capture | Complete resolver-backed manifest contribution set for an epoch | The replaced F6/F7 lookup/scan paths, only after late/missing/transitive/platform cases are demonstrated. |

Do not delete an unassessed fallback merely to make the authority count one.
Do not widen unsupported output or downgrade known static support to match
today's smaller dynamic domain. Accepted changes remain bounded by their
semantic evidence and measured cost.

## 8. Status table template

| Domain or phase | Coverage | Fidelity | Diagnosed | Unexplained | Audited owners | Removed so far |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| e.g. spacing (template only) | not recorded | not recorded | not recorded | not measured | n/a | none claimed by this RFC |

Include source/compiler/frontend versions, platform, case/owner denominator
and evidence links. A blank or template cell is not a measured zero. Keep
numeric helper/slot inventories separate from Coverage/Fidelity rates.

## 9. Risks and open questions

- **Workspace staleness.** Hozo's own manifests change with every edit in the
  monorepo. Measure regeneration and restart cost before E makes the compiler
  depend on them.
- **Standalone compilation** keeps a compiled-in copy; invariant 1 keeps it honest.
- **Manifest size and trust.** Data only, read under migration-audit's safe-
  loader rules. Measure `@hozo/ui`'s `candidates` first.
- **Project-local wrappers.** Their frequency decides the runtime cost of
  text inheritance in practice; #656 closed for lack of evidence that Envarly
  and the Bluesky corpus can now supply.
- **R2 generalisation and complete manifest capture before map freeze are
  major unknowns**, which is why A tests them before broad migration.
- **Third-party demand is hypothetical.** The fixture package is there to keep
  Hozo's own packages honest.

## 10. Rejected

- **Keep each effort's tables and reconcile later.** The cost grows per slice.
- **Grow `Primitive` until every pattern is one.** Ties correctness to
  compiler releases and leaves `@hozo/form`, `@hozo/ui` and applications out.
- **Trust declared contracts.** Recreates silent failure inside the manifest.
- **Forbid runtime sorting.** Arbitrary opaque strings need assembly; what
  must not happen at run time is *deciding* order.
- **Classify unknown names at run time by parsing them.** Moves a compiler
  into the device; the build and the transform can see almost all of it.
- **A runtime cascade engine for R3.** Decision 009 rejected it.
- **Scan `node_modules` more widely.** Finds what the project never asked for
  and still cannot know a library's runtime strings.

## 11. Changes from v1, and the review behind them

An external review of v1 was checked claim by claim against `cb0e9c8`.

| Review point | Verdict | Change |
| --- | --- | --- |
| Self-declared contracts can hide "declared applied, actually ignored"; F9 is a real check, not a table | Correct. F9 is a TypeScript-AST check (`ui-native-unapplied.mjs`); `slot-facts.native.ts` says components still compute their own facts | §4.6 verification ladder; F9 kept and moved to CI; v1's "delete F9" withdrawn |
| "The runtime never orders" is too strong; cache-miss assembly by rank is needed | Correct. v1's invariant already allowed it, but its headline did not; also found: one unranked class sends the whole string to the legacy path | Principle 2; §4.4; O4 described precisely |
| "No silent miss" cannot be met by a runtime check without parsing; the file name is not available from `hozoClasses(value, state)` | Correct. Also found: today's warning is identical for pass-through, separated and assembled templates *(probe)* | §4.8 moves detection to build and transform time; call-site id deferred to E's ABI |
| Owner semantics and plan application should be separate; owners can be conditional | Correct. Verified gates (Avatar), `optionalOwner` (Stepper), BottomSheet's two handle shapes; gates are prose today | §4.2 `shapes`, §4.3 application plan |
| Manifest identity needs content and resolved instance, not version; source-shipped packages are still compiled | Correct, and v1 was wrong to say "version": the current key already hashes content. Also found: two different lookups, project-direct dependencies only | §4.7; §4.1 `compiledByConsumer` |
| Static erasure is RFC 006 §5's call, not the contract's; keep two contexts | Correct. v1 overstated erasure ("same file or manifest is enough") | §4.5 rewritten around RFC 006 §5 |
| Split Coverage, Fidelity, diagnostic completeness and contract audit | Agreed | §6 |
| O2 also groups; delete only its ordering | Correct (`group_by_condition` groups and coalesces). Also: O1 still runs on graduated inputs before the plan re-sorts them | §2.3, §7 C |
| Spike one non-`Primitive` owner first | Agreed. The review called BottomSheet's handle facts "already handled": the component does supply them in one shape, but the catalog has no contract, so the spike includes writing it | §7 A |

Found while checking, not raised by the review: v1's §2.5 item 3 said a state
class on an unaudited owner is silent. Missing facts already warn
(`class-resolver.ts`, `supplied` and the final owner-state resolver); the silent case is facts that are present
but mean something different from the Web owner's.

### v3 repository review and baseline receipt

- Kept v2's principles and existing ADR/RFC authority rather than declaring a
  new runtime cascade, new component taxonomy or completed rollout.
- Replaced "each nearly done" with the actual remaining integration/deletion
  work. Closed #1152/#1207 are historical records, not proof that Toolbar,
  RadioGroup or ordinary text defaults are settled.
- Added the authored-style/host boundary and distinct Native/Web carriers.
  The recent gap inventory is a discovery aid, not contract audit evidence.
- Added manifest-set freeze/incompleteness, instance/platform/content identity
  and safe-data/trusted-primitive constraints. The graph union is a target,
  not a demonstrated Metro startup API.
- Corrected the assembled-token claim: a bounded Node probe on the source
  baseline imports the real `createClassResolver`, prepares
  `{ 'bg-red-500': { backgroundColor: '#f00' } }`, assembles that name at run
  time and asserts the exact selected object. It passes; this is not an
  automatic discovery or fresh compiler/browser test.
- Defined non-overlapping case accounting via `M union R`, attributable
  diagnostics and explicit unmeasured values. No noisy generic warning can
  certify an entire expression's possible values.
- Made B/E and C/D gates per owner/domain, retained the six workstreams and
  required deletion receipts before broad default consolidation.

Rechecked at `d2a04c39759e57fe1159bd0ca65420ce88a1f64d`:

| Observation | Reproduction / scope | Result |
| --- | --- | --- |
| Catalog inventory | Import `components` from `scripts/style-slots/catalog.mjs`, flatten its arrays and count `owner`/`lowering`. No application code executed. | 27 components; 99 slots; 55 pending; 32 component-managed, all pending. |
| Form public Native props | Read the ten public Native interfaces; nine have secondary class props, Form has only its root; none is in the patterns catalog. | Catalog inclusion remains proposed, not newly implemented. |
| Package manifests | Enumerate tracked `packages/**/hozo.manifest.json`; read `MANIFEST_VERSION` in compiler/manifest. | One package manifest (UI), schema 1. |
| Default inheritance | Read `CompileOptions` handling and inspect adapters for the internal option. | Native option still defaults false; no default route changed here. |
| Gap consumer inventory | Invoke the existing `nativeGapInventory(process.cwd())` on this checkout. | 14 roots / 381 physical modules / 38 consumers; not a slot audit. |
| Dynamic full token | The real resolver probe above. | Prepared full token resolves even when assembled at runtime. |

The original supplied compiler probes remain attributed to `cb0e9c8`.
This baseline refresh does not claim new device, AT, browser, performance,
bundle-size, complete diagnostic-rate or conformance-denominator evidence.

### Incremental package producer (experimental)

`buildPackageManifest` adds bounded package channels to the existing v1
envelope under `package`. The root `version: 1` and `textForwarding` stay
readable by existing text consumers; no second text summary is serialized.
The bounded package reader normalizes this envelope and the earlier standalone
`rfc010-package-shadow-0` fixture through the same validator. This is **not**
the finalized manifest-v2 ABI.

The package build supplies its public value exports, exact published source
set, helper declarations and source-compilation policy. Candidate extraction
uses the existing Rust scanner once at publication, without executing source
or resolving dependency implementations. Budgets reject oversized input;
there is no truncation. `owners: null` does not certify an owner audit, and
export membership does not authorize primitive lowering. Default adapter
discovery and text consumers remain unchanged.

`pnpm manifests` now opts `@hozo/ui` into this extension. Its current source
set has 42 production TS/TSX files, 85 value exports and 324 runtime candidate
strings; the 10 existing text summaries remain equivalent. The JSON is 36,518
UTF-8 bytes, below the 65,536-byte reader budget (formerly 22,211 bytes).
These are transport inventories, not utility coverage or owner audit rates.
Tests/stories/declarations and consumer-generated CSS are excluded from
candidate production. The existing metadata export/files list ships the JSON.
The producer refuses unresolved export-star lists rather than certifying an
incomplete public export set. Owner contracts remain null and helpers empty
for this package; neither is inferred from JSX export names.

`scripts/component-manifests-packed.test.mjs` runs the real pnpm publication
packer for UI, checks publishable dependency ranges and source inventory,
then regenerates the manifest from the unpacked archive alone. It also reads
the archive through the bounded instance reader/capture and compares candidate
CSS and Native resolver generation against direct source scanning. This is
package transport/code-generation evidence, **not** an installed UI app,
browser/device rendering, complete adapter graph capture or owner audit.

Catalog publication routing is authored beside the shadow contracts as
`ownerPublications`. `packageOwnerChannels` attaches a contract only to its
declared owning package and existing public value exports. BottomSheet's handle
belongs to `@hozo/patterns` under `BottomSheet` and `HozoBottomSheet`; matching
names in `@hozo/ui` or `@hozo/core` do not acquire it through re-exporting.
Duplicate publishers, absent export aliases, unassigned contracts and unknown
catalog slots fail generation. The bounded reader still rejects an `audited`
claim. Export existence/publication routing is not proof of implementation
identity or semantics, and does not authorize builtin lowering or rollout.

The patterns package now publishes the same catalog contract through its own
`hozo.manifest.json` metadata/export/files entry. Its 106 production TS/TSX
source files produce 11 runtime candidate strings and 72 public value exports;
the 7,206-byte envelope has one unknown-audit owner and no text summaries.
`compiledByConsumer` is false for its built distribution, unlike source-shipped
UI's true. A single package envelope is currently accepted only when split
Web/Native entries have equal value-export and legacy-text inventories; drift
fails rather than pretending the selected platform does not matter. Sources
continue to ship for maps, not as permission to transform the built package.
UI's manifest/text data and the default adapter routes remain unchanged.

The packed-patterns regression regenerates this envelope from archive sources,
checks the compiled default/native entry export sets, and records separate
platform/selected-entry captures. The transported contract also feeds the
existing explicit literal-caller preview: state-independent padding prepares,
while state-dependent and mismatched-facade inputs stay authored. This does
not install the contract into an adapter, authorize a global name lookup or
audit actual host behavior. Package publication and execution remain separate
evidence levels.

`selectOwnerPackageContract` is an explicit, lease-bound selector over the
captured import edge and its exact selected entry. It retains package instance,
manifest content hash, platform and epoch alongside the public export and
class-prop identity. Same-name exports from another instance, missing edges,
ordinary/owner-only packages and ambiguous contracts cannot supply a selected
contract. There is no package-name lookup, facade chasing or filesystem polling
on this path. Selection remains an unknown-audit transport fact; its no-IO
lease check rejects use after the original epoch retires.

`InstanceOwnerCallerProject` is an opt-in Native preview that owns the existing
`TailwindProjectSession` for one matching compiler/CSS/manifest epoch. It feeds
actual collected IR plus captured package candidates into that session, returns
both binding provenance and the actual prepared context fingerprint, and uses
its existing exact-context cache/cancellation/disposal path. Manifest retirement
aborts the session; CSS/ABI edits require explicit invalidation. Invalid and
unassessed new requests enter module supersession before validation, so they
cannot leave an older version of that importer eligible for delivery. Opaque
or unassessed style expressions stay authored; there is no direct compile
fallback, mutable rank setter, new ordering engine or default adapter change.
