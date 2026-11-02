# From resolved files to bounded owner admission

RFC010 requires instance identity, not a name-based package walk. The prior
finite Vite assessment supplied a handwritten `locate` callback. That proved
transport and publication fences, not how an actual resolved file is owned.

`locateResolvedOwnerPackage` observes an already resolved physical file. It
follows directory links to the real installation and examines bounded nearest
package metadata, never package code, config, exports conditions or dependency
names. A missing npm package stops at `node_modules`; invalid nearer metadata
cannot borrow a parent application's declaration. A package without a manifest
remains an ordinary nonparticipant; malformed declarations are unresolved.
The existing manifest reader still validates the declared path and JSON/schema.

The result records absent nearer `package.json` boundaries as well as the
selected metadata hash. Adapters must retain/watch/revalidate those observations:
creating a nested package can change ownership without editing the old parent.
This standalone observer has no cache, no completeness claim and no default
adapter activation. The tests cover same-name installations, ordinary and
missing metadata, invalid/non-file/oversized declarations, directory links and
new nested boundaries. They do not certify manifest semantics or a whole graph.

## Vite observes physical ownership by default within its finite capture

Finite candidate/caller assessments no longer require `locate`: Vite still
selects each import entry, and the shared physical observer determines its
package. Explicit embedding overrides remain supported. This does not enable
the assessment in normal `hozo()` or discover imports automatically.

The capture watches positive and absent metadata boundaries. It revalidates
them and importer ownership at freeze/output boundaries, and retains the
existing manifest/graph/lease fences. Creating a nearer `package.json` cannot
turn a previously consulted participant into an ordinary package after code
preparation. Warm lease checks remain filesystem-free. Actual Vite tests use
two installations and prepared caller output without a handwritten root map;
new importer/target boundaries reject publication and retire the lease.
