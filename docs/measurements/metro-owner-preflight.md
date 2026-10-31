# Metro owner preflight: declaration closure, not a ready module graph

The internal collector asks the supplied Metro resolver from each actual
selected entry and uses its package-ownership callback. It never walks for a
package by name or executes package entries/config. Canonical contained entries,
bounded package JSON, declarations and metadata hashes form a finite preflight
seed for the existing worker transfer. Cycles are bounded by root/entry identity;
two instances of one name remain distinct. A changed metadata file refuses
adoption; neither a partial seed nor a partial route map is exposed.

Scope is explicit: dependencies, peers and optional dependencies, not dev-only
declarations or all authored imports/subpaths. Missing optional/peer packages
are incomplete too. Roots/origins and a ready resolver context must be supplied
upstream. Asset/empty/virtual resolutions, unavailable ownership APIs, metadata
races and exceeded budgets fail closed. The current bounds are 128 root/entry
nodes, 512 edges, 64 KiB per metadata file and 2 MiB total unique metadata.
Resolution uses the supplied context's condition/import-mode profile; mixed
import/require modes and arbitrary authored subpath imports are not inferred
from package declarations. A different successful entry is refused by the
shadow guard, not silently accepted as the same frozen namespace.

This uses Metro's current `getPackageForModule` callback (deprecated upstream),
not a new private package lookup fallback. If the host removes it, assessment is
incomplete. No normal withHozo change or candidate rendering replacement yet.

## Real Metro resolver fixture

The bounded fixture loads the actual `metro-resolver` installed by native-demo
(measured at 0.87.1), not an imitation of its resolution algorithm. Test-only
filesystem and explicit root-registry callbacks satisfy its context contract;
ownership lookup stops at every node_modules boundary. This registry is fixture
data, not proof of general production ownership discovery.

Android/iOS export conditions, a nested second version, transitive/cyclic
declarations and configured resolver overrides preserve actual selected entries
through transfer to a worker. Fresh conditional-entry replacement invalidates
metadata adoption; a missing optional dependency returns no partial seed. Entries
throw if executed and are never loaded. No Metro server/file-map bootstrap,
application bundle, arbitrary Haste/asset plugin or device is claimed.

## Explicit withHozo shadow connection

`withHozoOwnerShadow` is an internal config-entry harness, not a root/default
option. A caller supplies a complete ready-resolver preflight. The explicit
harness requires metadata for the configured package root in the preflight;
a different project's capture is rejected before config publication.
Normal withHozo, candidate rendering, helper/text facts and default cache keys
remain unchanged.
The mode is explicitly assessment-only: package-only candidate support is not
enabled or certified. Tests compare normal/shadow candidate and transform bytes.

Config folds its actual CSS/preflight/sources/font state into the owner context.
The large route/metadata set lives in a hash-checked sidecar, not metro.json,
which carries compact references. Worker/cache-key adoption validates sidecar,
metadata, transfer and source bytes once per active root/platform epoch. Warm
transforms do no new manifest reads; resolver checks use cached route/maps and
Metro's ownership callback. Unknown/cross-instance/subpath or changed successful
package resolutions require restart, not growth of the frozen union. Same-owner
relative modules and non-source relative assets are outside this package-edge
assessment. No complete module graph coverage is inferred.

Retirement checks fence actual upstream async output, not only compiler output.
Replacing the configured snapshot changes the cache key and prevents suspended
old work from returning. Partial inputs fail before publishing normal config.
Metadata/source changes while an already adopted worker runs still require
restart; this is not filesystem polling or automatic invalidation. Ready context
bootstrap, production candidate/fact consumption, full v2 and F6/F7 removal remain
open. Cross-platform smoke uses the same bounded resolver/transform tests, not a
Metro server/app bundle or a physical device.
