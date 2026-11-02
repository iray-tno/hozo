# Owner live-input delivery audit

This is a bounded part of RFC 010's third/fourth verification rungs, not a
declaration that either complete Owner contract is audited. The inventory and
default routing do not change. No production resolver, component or bundle
code is added by the audit.

| Owner | Authored input cases | Native observations | Web observations |
| --- | --- | --- | --- |
| `Tabs.Tab` | 8 | 32: opaque/direct/caller/package-instance | 24: candidate/Tailwind/package-instance |
| `BottomSheet.handle` | 9 | 36: opaque/caller × Android/iOS Modal models | 27: candidate/Tailwind/package-instance |

These are finite **input-case observations**, not a percentage of all possible
inputs or a property-count multiplier. Each receiver's styles are checked
against authored expectations. Expectations do not read the Owner manifest.

Tabs covers enabling/disabling selected tabs, controlled selection of a
disabled tab, shrinking past the selected index, appending a selected disabled
tab, empty items and repopulation. Box styles, string-label styles and actual
selected/disabled facts must update on retained positional hosts; disabled
activation stays blocked. Existing state and author-style probes run alongside
these inputs. We intentionally do not invent index clamping: an out-of-range
controlled selection selects no item on either platform.

BottomSheet covers omitted, empty, invalid, duplicate and filtered-single
detents, unsorted/valid multi-detents and reverse shape transitions. The
receiver is selected after normalization, **not by authored array length**.
Decoration is a Native View / Web div; resizing is a Native Pressable / Web
button. A same-shape update retains its host; a shape change replaces the host
kind without losing the class or author contribution.

## Reproducing and identifying the evidence

The `owner-evidence` workflow runs the real component tests and browser probes,
then runs:

```sh
node scripts/style-slots/owner-input-audit.mjs --output artifacts/style-fact-model/owner-input-audit.json
```

The report reads `tabs-compiled-native.json`, `tabs-browser.json`,
`handle-inputs-native.json` and `handle-inputs-browser.json` in that directory.
All four must pass and identify the same clean checkout. Missing, stale,
failed, duplicate or incomplete rows fail the command. Prepared Web evidence
must identify the package manifest and ordinary composition path. Style values,
host lifetime and negative controls are checked, not just `passed: true`.
The report and individual receipts are uploaded even on failure. Unit-test
synthetic receipts test the reporter only and never count as observed delivery.

Local runs may leave dirty receipts; those are useful diagnostics but cannot
satisfy this command. Browser evidence is produced in CI when local CPU use is
restricted. Run details identify the exact checkout; this document does not
pin a moving latest-success claim.

## Remaining audit boundaries

Native runs actual component logic with RN host stand-ins and explicitly
scoped Modal lifetime models, not an Android/iOS device runtime. String-label
style delivery is not opaque-descendant text inheritance. Mid-press disabling,
OS cancellation, focus-visible modality transitions, native acceptance/pixels,
arbitrary utility combinations and other Owners remain unassessed here.

Consequently the report leaves `contractAudit: unknown` and `rollout: unchanged`.
The useful progress is a reproducible, falsifiable delivery domain for two real
Owners. Full contract promotion requires closing the remaining event/input
boundaries and naming that larger denominator; manifest self-declaration alone
cannot do so.
