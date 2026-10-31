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
