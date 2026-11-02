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

## Captured exports select possible caller bindings

`discoverOwnerPackageCallers` projects one importer's exact captured edges into
published export/class-prop requests using the existing contract selector.
Export aliases keep their selected entry/instance; they are not inferred from
component spelling. Ordinary packages, legacy-only channels and ambiguous owner
references remain unassessed. No partial usable request list escapes its budget.
The existing binding-aware caller parser still decides which real JSX sites
occur, and whether literal, opaque, namespace or spread inputs can be prepared.

Finite Vite caller assessments can omit the handwritten `callers` list and use
this projection. Explicit subsets remain supported. Imports are still supplied
to the startup capture: this is not yet source import discovery or a complete
graph. Unknown contracts are not upgraded to audited, and normal `hozo()` is
unchanged. Actual Vite tests cover a published export alias and opaque fallback
without either a handwritten locator or a class-prop binding list.

## Structural static import input

`inspectStaticModuleImports` uses the existing Rust parser/source grammar and
module record, without Native/Web/StyleX lowering. It separates static runtime
ESM requests (including side effects and reexports) from direct value bindings
(named, default and namespace imports). Type-only declarations/specifiers,
comments and strings are not runtime bindings. Syntax errors produce diagnostics
and no partial usable inventory; Node diagnostics use UTF-16 offsets and the
bridge bounds source/request sizes.

This is intentionally not a complete dependency graph: dynamic imports,
CommonJS, plugin-generated modules and their resolution are outside the static
inventory. Actual bundler resolution and final graph checks must still fence
admission. Tests cover those scope boundaries instead of inventing an empty
graph or invoking a lowering backend to discover imports.

## Source-observed Vite capture before publication

`hozoWithDiscoveredOwnerCallers` is an internal BUILD assessment with no
handwritten edges, root map or caller list. It snapshots the existing configured
source discovery/scan once, obtains static ESM requests from the Rust inventory,
uses Vite's real resolver and the same physical manifest capture, then prepares
selected literal owners through the ordinary session/CSS pipeline. The existing
source scan and final candidate/graph checks remain; this is not scan replacement
or a complete dynamic/CommonJS/derived dependency claim.

Source bytes are hashed before asynchronous resolution and revalidated before
capture/CSS/output boundaries. Changes to bytes or the configured source set
refuse publication. External/virtual/unresolved startup requests, syntax/budget
failures and late participating packages remain explicit assessment failures,
not empty compatible graphs. Ordinary `hozo()` has no new parsing/discovery cost.
Transform metadata records actual selected owner identity/context/findings for
independent build evidence, never compiler code in the application bundle.

## Actual package graph and independent browser delivery

The dedicated Vite owner fixture builds the real installed Web patterns and
their dependency graph through `hozoWithDiscoveredOwnerCallers`, not a synthetic
widget or handwritten preparation. It supplies only ordinary root/CSS/content
options; no edges, locator, caller targets or generated classes. Actual module
metadata must show prepared Tabs/BottomSheet identities and three literal sites;
the emitted application graph must contain both real widgets and no build tools.
React peers stay external in the library fixture and are bundled once by the
browser host. The temporary project is removed only after validating its path.

Chrome compares this build with independently generated Tailwind CSS on the
same actual widgets: Tabs selection/disabled behavior and common author styles,
both handle shapes, hover/focus, author removal, ordinary primitive padding,
stable hosts and six exact-stylesheet-removal controls. Failure/partial receipts
are preserved as `owner-vite-evidence`; browser success requires inspecting the
current-source artifact. This is bounded static source/real graph evidence,
not a full dynamic graph, Native pixel or global owner-audit/default claim.

## An observed empty import set is not missing input

The build assessment accepts a source snapshot whose structural inspection has
zero runtime imports, including type-only files. It still observes source bytes
and package ownership, watches metadata and rejects late participating graph
edges. An explicit finite plan with no edges and no source observations remains
invalid. This distinguishes measured absence from unavailable discovery; it
does not claim an empty participant set certifies all application behavior.

## Bounded static dependency traversal

Source-observed capture now follows physical JS static ESM requests through the
same serial Vite resolver before freeze. Source/edge deduplication closes cycles;
512 files, 512 requests, 4 MiB per source and 32 MiB total remain hard limits.
Dependency bytes are watched, revalidated and included in capture identity, so
an unchanged manifest cannot bless edited dependency source. A missing,
malformed, non-JS or over-budget dependency refuses the assessment.

Actual external resolver decisions are listed separately as unassessed imports,
not manifest-less ordinary packages or eligible callers. This remains a bounded
static graph with external boundaries, not dynamic/CommonJS or complete graph
certification. The final participating-package graph fence still applies; no
default admission, arbitrary module execution or scan deletion follows from it.
