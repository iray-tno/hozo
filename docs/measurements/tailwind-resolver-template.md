# A cached ordered template for the shared Tailwind fallback contract

Built on #1321 after #1308/#1314 merged. The parent was synchronized onto
main `2f978c38b5114e63833a0d207eabeeabb5e448a4`; its current head is
`9e9fbba38611515db22a129c648a047bc35b5480` with all checks successful.
It merged while this layer was being measured; this layer is submitted
against main rather than asking reviewers to merge an already-merged parent.
Final integration is on main `f010144ee7f390bcad0928b2558475dadc35b45c`.

This implements an executable generated-data ABI, **not default adapter
adoption or a static/fallback winner switch**. Ordinary generated candidate
code remains byte-identical. Important utilities remain explicitly refused.

## Contract and boundaries

Actual candidate generation records emitted Native object keys beside its IR
write evidence. It derives optional `ordering: { schema: 1, ranks }` from the
same Rust priority cache. Each name's compact number array addresses its
actual style/state objects, not the full compiler tuple. Only uniformly
assessed physical scalar writes participate. Logical edges, gap shorthands,
register transforms, unknown selectors and ambiguous/multi-rule objects are
not silently assigned representative ordinals. This is a bounded Native
projection eligibility check, not another family-specific order comparator.

No payload is returned for empty/singleton/conflict-free maps. Potential
conflicts are found from actual emitted scalar keys at build time, not a
runtime property-name heuristic. Once any assessed conflict exists, this
initial representation includes every eligible object's rank; it is not yet
a minimal sparse conflict graph. Publication uses a deterministic BTreeMap,
including at the Node boundary. The enclosing context fingerprint owns the
ordinals; independent namespaces cannot be combined.

`createClassResolver` accepts one schema-1 generated object containing the
existing maps, optional composition/ambient facts and compact ordering. Its
legacy positional ABI stays available. On a class-string cache miss it builds
and stably sorts a template, then discards rank objects before caching it.
State updates select matching entries in that cached order; unconditional
writes are not forcibly appended before every state write. Ambient-only
decisions are still made once. Missing facts retain warn-once behavior.

One unranked emitted object makes the **whole requested string** use the
existing resolver behavior, including its existing state-group ordering.
There is no partial reorder through an unknown domain, invented rank zero,
new subscription, source evaluation or new utility parser on device. Compiler
adapters do not yet call this object ABI; no user feature flag was added.

## Correctness and size evidence

Windows CPU1/Idle, serial. Rust workspace **1,056 passed** initially and
**1,057 passed** after integrating main, including two new projection/conflict
tests (two other tests arrived through main across both integrations). Fmt,
all-target Clippy with warnings denied and fresh addon/builds passed.
Serial focused JavaScript suites passed: engine **80**, compiler **353**
(one existing Windows privilege skip), Tailwind **120**, host selection **61**,
Vite **57**, generated fixture **5** and raw-source cache guards **11**.
Lint checked **1,710 files**; primitive/layout/24 README checks and generated
ABI check (89 helper specifiers, 112 named exports) passed. Turbo dry inputs
include the engine source read directly by the Tailwind integration probe.

Engine tests poison rank reads and Array.sort after cache fill, then exercise
state changes and cache hits. Other controls cover interleaved base/state
writes, unknown barriers, stable legacy results, ambient decisions, compose,
invalid schema/ranks and ordinary classes named `schema`.

The real candidate module's maps and Rust-produced ordering feed the actual
engine implementation in integration tests; this is not a copied comparator
or a replacement resolver. A Chromium oracle also compares actual computed
Tailwind padding/color through four real states in both class orders:
**8 scenarios pass**, and the same oracle detects the legacy `p-4 p-2`
padding winner. The previous priority-facts oracle's eight cases still pass.
These probes test the future factory call explicitly, not normal adapter
output or Native device event delivery.

For 256 overlapping spacing candidates, compact JSON is **3,388 bytes** versus
**163,913 bytes** for descriptive entries with Native-key evidence. Zero/one
candidate and the disjoint padding/background pair have no order payload.
Actual generated module code remains unchanged (**27,722 bytes** for 256).
No gzip/minified application-bundle claim follows from these raw JSON sizes.
The descriptive sidecar still stays off device.

The first integration assertion compared objects from two independent VM
realms and failed despite equal values. The measurement now evaluates the
maps once and gives both resolvers those exact same objects; the failing log
is retained. No priority or barrier behavior was weakened to pass it.

## Cost probe, including the cold cost

`artifacts/tailwind-order/resolver-template/cost.mjs` compares the parent's
resolver, the modified legacy ABI and the new object ABI. Three final fresh
Node25 processes each rotate three strategies over nine samples. Cold samples
fill 2,000 distinct strings; cached/state samples use 30,000 calls. Raw samples
and earlier pilot observations are retained. Median microseconds per call:

| Process | Cold before / legacy-after / planned | Cached before / legacy-after / planned | State before / legacy-after / planned |
| --- | --- | --- | --- |
| 1 | 1.993 / 1.153 / 2.210 | .0137 / .0133 / .0131 | .1561 / .1555 / .1384 |
| 2 | 1.768 / 1.507 / 3.541 | .0135 / .0141 / .0140 | .1500 / .1554 / .1368 |
| 3 | 1.796 / 1.299 / 3.518 | .0147 / .0153 / .0155 | .1572 / .1508 / .1366 |

Cold planned medians exceed the parent by about **0.22–1.77 microseconds**
(roughly 11–100% in this tiny fixture), so the RFC's relative threshold triggers
review, not a zero-cost claim. The largest cold sample was 28.13us; spread/JIT/
GC matter. This is extra cache-fill allocation/sorting work, not work repeated
on each state update. The pilot showed avoidable legacy hot-path work; the
original legacy predicate body was retained rather than routing it through
the new template helper. Final legacy state medians differ by about -4% to+4%.

The planned path also changes winners, so this is a cost probe, not proof of
behavioral equivalence or a blanket speedup. Node is not Hermes or a Native
render benchmark. Before default adoption, review representative cold-string
counts, device cost and the actual emitted payload; this probe alone does not
accept a project-wide startup or allocation budget.

## Still required

Apply the common plan to actual static output and publish compatible final
static/fallback namespaces before installing this generated ABI in adapters.
Keep input/evaluation/value/platform barriers; implement important precedence
across all paths, not a suffix-stripping shortcut. The default owner-state
mismatch in #1230 is not declared fixed by this internal ABI test.

No local full root JS/pack/app/Metro/GPU build, fresh Native pixels/AT, new
conformance percentage or heap/application-bundle improvement is claimed.
