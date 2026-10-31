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
