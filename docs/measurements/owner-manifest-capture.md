# Owner manifest capture: bounded shadow, not default resolution

RFC010's package-instance/freeze prerequisite, after the handle's selected-style,
browser and component-bundle probes. Existing manifest v1 and adapter paths are
unchanged. The internal module is not exported from the compiler package map.

`captureOwnerManifests` receives an adapter-declared finite set of import edges
and resolver observations. It performs no package-name lookup, source walk or
config execution. Importer/specifier, resolved instance, selected entry, raw
manifest content, platform and caller epoch all contribute to identity. Package
version alone never does. The epoch must be combined with the adapter's actual
compiler/theme/ABI/output-policy context before any production cache use.

Only the existing bounded `rfc010-owner-shadow-0` data is decoded. No primitive
mapping, JSX, supplied JavaScript or audited claim is accepted by this reader.
The complete snapshot is deeply immutable. Equal repeated observations are
idempotent; ordering is code-unit deterministic, not host-locale dependent.
Changing input objects after capture does not change the snapshot.

Missing/unresolved edges, unexpected late edges, ambiguous resolutions, promised
missing/invalid manifests and conflicting claims for one instance make the
capture incomplete. Incomplete results expose neither a usable binding map nor
a fingerprint. An ordinary nonparticipant (`manifest: none`) is distinct from
a package promising a manifest which cannot be read.

## Limits and next consumers

Completeness means **the adapter-declared resolution set**, not proof of a
complete application graph. Capturing zero declared edges is not proof of zero
dependencies. The prototype budgets 512 expected edges, 1024 observations and
2 MiB total manifest input, in addition to the existing per-shadow reader caps.
Late/content/entry changes need a new capture; nothing here watches files or
silently mutates a previously frozen map.

Unit tests establish identity, independence, deterministic ordering, conflicts,
nonparticipants and rejection boundaries. Filesystem containment, actual
transitive/two-instance/platform resolution, safe reads and adapter startup
freeze are the next layers. No production manifest v2, candidate-map replacement,
owner audit, default/coverage change or phase-A completion is claimed.

## Safe disk observations for an already-resolved instance

`readResolvedOwnerManifest` takes the adapter's explicit package root, selected
entry and manifest declaration. It does not walk for a package, interpret
exports or execute its entry. Root/entry identities are canonicalized; entries
outside the instance and virtual/non-file resolutions stay unresolved.

Only relative `.json` declarations are eligible. Traversal, absolute/drive/
backslash paths and symlinks escaping the canonical instance are rejected.
Reads are bounded to 64 KiB of valid UTF-8 with a file-descriptor size/type
check and a bounded read loop. Nonblocking open prevents a JSON-named FIFO
from hanging before the type check. Missing promises differ from absent
declarations; invalid JSON/schema is still reported by the existing shadow
reader rather than interpreted as executable config or an empty contract.
The decoder preserves a UTF-8 BOM as content rather than silently removing
bytes; the strict JSON/schema reader rejects BOM-prefixed input.

Tests cover containment, aliases/junctions, missing/invalid data, directories,
oversize and invalid UTF-8 without importing the fixture's deliberately
throwing entry. A POSIX FIFO subprocess regression has a bounded deadline;
that POSIX-only case is skipped on Windows. This is not an atomic filesystem
snapshot against hostile concurrent path replacement: adapter invalidation
and rechecking the declared contribution set before use remain required.

## Real resolver fixture and explicit revalidation

A bounded Node driver follows the fixture packages' declared dependency closure
using `createRequire(importer).resolve`. Custom Node conditions choose browser
or react-native exports. The dataset has two installed instances of a package
outside `@hozo/`, a transitive dependency, an ordinary nonparticipant and a
cycle. All entries throw if imported; resolution/metadata capture never runs
them. Five dependency edges/five roots (app plus four installed instances)
are observed without confusing the two same-name versions.

`assertOwnerManifestCaptureCurrent` rejects reuse after changed manifest bytes,
selected entry, late contribution or missing promise. An unchanged version
label cannot conceal byte changes; a version-only label change does not invent
a new owner contract. Fresh captures may be compared at the adapter's freeze/use
boundary; the assertion does no IO, polling, map replacement or implicit retry.
An earlier snapshot remains immutable when a later set differs or is incomplete.

This driver is a fixture, not a second production resolver. Root-level exports
are deliberately authored so the resolved entry identifies its fixture root;
it is not proof of general package-root discovery. Package dependency closure
is not a bundler's actual module graph. Fresh resolver processes establish
re-capture behavior, not a warm Metro/Node cache invalidation mechanism. The
actual Metro/Vite/Next startup/freeze integration, manifests' candidate/export
channels and the removal of old F6/F7 readers remain unassessed. The three
bounded capture/read/resolution suites also run in the macOS/Windows smoke
matrix; this adds no browser/app/emulator build there.

## Adapter epoch and delivery fence

The internal project API now exposes the bounded shadow capture/read helpers
and `OwnerManifestEpoch` for adapter integration. No normal adapter calls it
yet, and the compiler root/manifest-v1 API is unchanged. A complete capture
may be adopted once; equal rechecks retain that original immutable object.
Changed/incomplete observations retire the epoch permanently, as do explicit
watcher/config invalidations. Reverting the bytes cannot revive old leases.

`run` checks after an asynchronous boundary even for a synchronous cache hit,
so retirement while work is pending prevents returning its output. It is a
delivery fence, not a transaction: callbacks must calculate without publishing
external side effects before the returned promise resolves. Lease checks do
no IO, hashing, candidate preparation or sorting. Adapters still own gathering
fresh observations at graph boundaries and invalidating when inputs change.

The next fixture must use a real bundler-ready graph, not the previous package
dependency closure. Vite can capture after graph construction; Metro's current
config-time candidate map precedes that graph. This API does not resolve that
startup mismatch or justify deleting either old F6/F7 reader.

## Vite ready-graph probe (not installed by default)

`ownerManifestGraphProbe` is an explicit internal probe beside the Vite
adapter. It runs alongside the real `hozo()` plugin in a tiny production
build. `buildEnd` receives the bundler's actual static and literal-dynamic
module IDs; the probe freezes that declared graph's shadow observations and
re-reads them in a post `generateBundle` hook. Watch notifications, build
failure and closure retire leases. Changed content before output is refused,
not silently assigned the old map's namespace.

The fixture has two installed versions of a non-Hozo package, transitive and
cyclic imports, a dynamic import and an unused declared package with invalid
data. Six resolved edges are captured; the unused declaration is not a graph
edge. Vite's actual export conditions choose browser/react-native files in
separate builds. No application entry is executed. Metadata is read as JSON
by an explicitly supplied fixture ownership registry, never via package code.
NUL-containing virtual IDs are encoded losslessly as graph identities and
unknown ownership is incomplete, not an ordinary nonparticipant.

This deliberately does not discover arbitrary package roots, map authored
import/export bindings, assess external/lazy runtime dependencies, or prove a
warm Vite watcher rebuild. Graph IDs are resolved module edges, not source
binding names. The root registry and compiler/theme/ABI policy context are
fixture-supplied. A graph/output receipt is not a successful build certificate:
a later output hook may still fail. The probe neither writes candidate maps
nor injects receipts into emitted bundles; `hozo()` does not enable it. Metro
startup, production manifest v2, owner audits and F6/F7 removal remain open.
