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

This uses Metro's current `getPackageForModule` callback (deprecated upstream),
not a new private package lookup fallback. If the host removes it, assessment is
incomplete. No normal withHozo change or candidate rendering replacement yet.
