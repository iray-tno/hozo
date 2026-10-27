# Final static styles from Vite's real production graph

Historical measurement of the shadow route introduced in #1334. That default
route has since been removed: bounded scalar ordering does not require one
global numeric namespace. Its second emission and graph retention were
unnecessary. Measurements below are retained, not claims about current
shipping output. See [the replacement](tailwind-default-order.md).

Built above #1333 (`f67606bc`). Production transforms now borrow the actual
post-Canvas parse for initial JS, then transfer its continuation to a graph
owner. After Vite/OXC and downstream transforms have produced the final module
graph, `buildEnd` emits those same owned parses through one completed context.
This is actual compiler output, not a reconstruction from compiled JSX.

**It is not activated in CSS assets yet.** Vite already processed companion
imports before `buildEnd`; rewriting their files then would leave stale CSS in
the bundle. The result is an internal cache artifact, not a late-file-write
workaround or a Web-only default cascade switch.

## Authority, ownership and scope

`candidate-inventory` exposes the existing sealed input/output receipt check to
the publisher. Configured authored content and full environment/query module
IDs remain different authorities. Native scan records are replayed, not rebuilt
by scanning compiled JS. No second primitive source parse, global setter,
shared cache writer, native-handle serialization or invented cached-module
hook is introduced.

The final graph selects live continuations with matching source revisions.
Superseded handles are disposed immediately; absent graph modules are discarded
before async preparation. The common finite publisher validates opaque runtime
records and owns accepted IR through one-shot emit/disposal. Missing live IR,
stale revisions, wrong environments, changed CSS epochs and missing final-code
receipts never produce a partial `styles` array or final fingerprint. In
particular, valid **cached transform metadata is not a live native handle**:
that case is explicitly incomplete, not claimed as solved cached-transform reuse.

Build start retires previous evidence before snapshot acquisition/scanning can
fail. Failed graph builds, unavailable snapshots and incomplete publications
replace old results. A generation guard prevents a retired async publication
from overwriting a newer build's collecting/final record. Abort/disposal remains
effective even when CSS preparation does not cooperate.

The internal file is
`node_modules/.hozo/final-styles-<environment>.json`:

- `scope: 'static-final-styles'` and `staticOrderingReady` describe this compiler
  stage, not the whole application build;
- `bundleOutputPolicy: 'passthrough'`, `bundleValidation: 'not-assessed'` and
  `finalOrderingReady: false` explicitly exclude bundle/default graduation;
- complete records contain module IDs/revisions, final CSS and Hozo-level
  pre-OXC code digests (not bundle hashes),
  plus the policy-qualified fingerprint shared with candidate generation;
- no generated Native candidate code, full priority descriptors or IR handles
  are serialized into this artifact or shipped JS/CSS assets.

Dev keeps its existing ready/session path. Unavailable project snapshots keep
the existing warned lowering. Candidate stylesheet publication remains on its
old route. This layer neither changes active winners nor makes the cache JSON
a public API, a distribution asset or a successful-build certificate.

This is not an atomic filesystem transaction. Revisions belong to the captured
graph/source observations; edits queued for a following build do not make the
earlier graph a magically current snapshot. CSS epoch checks and cancellation
prevent observed stale deliveries, not every possible filesystem race.

## Evidence

Windows, CPU1/Idle, serial, Node25/debug addon, Vite **8.2.4** / Rolldown **1.2.4**.
Vite **69 tests pass**, including **12 new tests**. They exercise real tiny
production builds, not just plugin hook mocks:

- actual final graph/OXC, transformed MDX and full query identity;
- current/replaced/deleted sources and unimported authored contributions;
- lost metadata, stale/cached observations, environment mismatch and no rescan;
- cancellation, late CSS epochs, and an old build completing after a new one;
- snapshot unavailability and scan/build failures replacing old evidence;
- actual final `p-4 p-2` CSS has 16px while the active companion and minified
  bundle still have 8px. The test explicitly proves that activation has **not**
  happened and build metadata does not leak into output.

A deliberately failing **later `generateBundle` hook** exposed another boundary:
Vite 8.2.4 does not pass that failure through `renderError` or
`closeBundle(error)` in this path. `buildEnd`'s static result can therefore be
complete even though a later asset hook failed. The initial test expected a
failed static record and was wrong about the host lifecycle. It now preserves
the injected bundle failure and checks the explicit **not-assessed bundle**
contract instead of treating graph completion as deployment success. Observed
build/render errors still retire the record; this does not promise to observe
every later hook or file-write failure.

Other initial failures were TypeScript declaration inference exposing a private
issue type, Node strip-only syntax rejecting a parameter property, and fixture
assumptions: CSS minification folds physical padding to a shorthand; an overly
broad MDX fixture accidentally transformed its `.hozo.css` too. The fixture now
matches actual MDX paths only. Failures and subsequent passing logs remain under
`artifacts/tailwind-order/vite-final-style-graph`; none are classified as flakes.

## Actual bounded build cost

The probe bundles the exact parent Vite entry/inventory source from `f67606bc`
for its control, with the same current compiler/addon and unchanged epoch code.
Five alternating builds per route and fixture, in each of three fresh Node
processes. Fixtures have 1/8/32 static components plus an entry. Parsing, project
preparation, companion/cache I/O, finalization and Vite/minification are included;
`write: false` omits final distribution-file writes. Median milliseconds:

| Components | Parent, three processes | Final graph, three processes |
| --- | --- | --- |
| 1 | 41.38 / 43.52 / 42.96 | 51.19 / 44.52 / 46.46 |
| 8 | 50.52 / 47.76 / 46.02 | 49.44 / 47.60 / 53.09 |
| 32 | 95.18 / 94.41 / 100.60 | 107.74 / 112.65 / 105.36 |

All **45 before/after emitted JS/CSS hash pairs match** in the final runs.
The additional work is not called zero cost: 32-component medians add about
**4.8–18.2ms**, crossing the relative review threshold. Cold/outlier samples stay,
including parent **172.53ms** and new **160.87ms** maxima. Earlier rounds are
also retained, including negative median differences and a **181.46ms** new-route
sample; they do not justify a speedup or perfectly stable incremental-cost claim.

Cache artifacts in these fixtures are about **2KB / 10.7KB / 40.4KB**. They are
build-time storage, not extra device/bundle bytes. These tiny library-mode builds
do not certify full-app cumulative time, peak native IR/heap retention, Hermes,
fresh browser/device/AT results or a new conformance percentage. The parent
continuation's isolated cost is [recorded separately](tailwind-web-style-continuation.md).

## Next before default activation

Use a supported late CSS asset/delivery route, with content hashing and map/
manifest/HTML/library/SSR behavior intact; finish Web candidate CSS under the
same namespace; solve cached transforms without pretending receipt JSON restores
live IR; and connect matching Metro/Next ownership before coordinated defaults.
Do not call a source-file rewrite, a complete static cache artifact or a green
comparison test the shipped default switch.
