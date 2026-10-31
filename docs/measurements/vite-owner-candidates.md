# Vite package candidate consumption

## Source-fact inventory boundary

Manifest candidates use `ownerPackageCandidateContribution`: a normal opaque
native scan record with a distinct package-capture identity/revision. The same
function feeds the existing overlay used by Metro. No adapter authors scan
records or parses utilities in JavaScript.

Vite's inventory can register one complete package contribution set and replay
it beside authored and derived-module records. Its `publicationInputs` include
the package receipt, so a downstream publisher does not silently lose tokens
that exist only in a manifest. Authored file/module denominators remain separate;
the report names its scope `runtime-source-and-package-facts` only when package
facts were explicitly registered. Ordinary inventories retain their old scope
and shape. `finalOrderingReady` remains false: these are source facts, not an
order namespace, an owner audit or a successful-build certificate.

Changing or incompletely registering a package capture permanently invalidates
that inventory even if a caller catches the exception. Missing/mismatched module
receipts still prevent a complete candidate report. Reconciliation replays
records without scanning, and empty package contributions remain distinguishable
from no package assessment. The existing Native overlay output is unchanged.

This first layer does not install package candidates in `hozo()`. It prepares
the ledger boundary needed before explicit resolver-backed CSS consumption.

## Explicit resolver-backed production build

`hozoWithOwnerCandidates` runs the ordinary plugin implementation with an
explicit finite startup import plan and an embedding adapter's ownership
callback. Each startup import is resolved by Vite itself before candidate CSS
is consumed. The callback cannot retarget that actual selected file. Safe
contained manifests, bounded package metadata and the captured CSS/options
context form one candidate epoch; package names are never used to guess roots.
The current limits are 512 imports, 128 metadata files, 64 KiB per metadata file
and 2 MiB total unique metadata. An absent/invalid manifest is not an empty
package, and an unavailable Tailwind snapshot refuses candidate consumption.

The explicit path overlays manifest candidates using the same native receipt
and CSS renderer as the ordinary scan. Authored scans, helper discovery,
StyleX facts and the existing transform remain intact. Package-source extraction
is not removed on this Vite slice: the final inventory still requires its
authored receipts. Helper/text/owner contract facts are not installed.

Before a candidate CSS write, at graph completion and at post-generate output,
the capture is revalidated. Changed manifest/metadata bytes, a late participant,
a different cross-package entry or a derived participant module refuse output.
Same-instance source edges are allowed. Virtual/external/non-JS domains are
outside this package-JS assessment, not assessed empty manifests. Incomplete
graph/output validation retires the source-fact inventory as failed. Successful
inventory reconciliation is still not a certificate that later output succeeded.

Watch signals invalidate old leases; warm transform checks reuse one lease and
do not poll metadata/manifests or allocate another capture. Paths are normalized
for Windows watcher spellings. A fresh production build acquires a fresh set;
development-server use is explicitly refused rather than pretending HMR is
implemented. The normal `hozo()` entry, options and fallback behavior are unchanged.

Final review added a mutation-during-collection control. The first implementation
read target facts only after all asynchronous resolutions, so a later resolver
could change an earlier package and have the new bytes treated as the original
set. The regression failed with a missing expected rejection before the fix.
Targets are now observed immediately after selection and the complete original
set is revalidated before admission. The control covers both package metadata
and manifest bytes; neither mixed set may reach CSS preparation.

Tiny actual Vite builds select two versions through browser exports, including
transitive/cyclic imports. Manifest-only p-2/p-4 become padding 14px/28px under
spacing 7px in emitted CSS and survive final inventory reconciliation without
increasing its authored file count. Returning to the normal plugin drops the
manifest-only candidates. Mutation after graph freeze, an omitted startup
participant, missing manifests, retargeted ownership and retired pending work
are negative controls. No browser/device pixel, full application, SSR or
multi-environment claim follows from these client library builds. Automatic
ownership/plan discovery, dev HMR, full public v2 and default promotion remain open.

