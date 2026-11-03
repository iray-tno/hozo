# Tabs Owner contract audit boundary

RFC 010 separates contract audit from utility coverage, fidelity and device
acceptance. Its third verification rung asks whether a plan reaches the
declared actual receiver for each shape. It does not assert identical browser
heuristics, arbitrary descendant inheritance or verified device pixels.

The selected `Tabs.Tab` contract describes one existing Pressable/button shape,
`tabClassName` / `hozoTabStyle` delivery, the existing authored `tabStyle` order,
interaction and selected/disabled facts, and the owned-label text split. That
split covers primitive labels and transparent containers; it makes no claim
about text inside arbitrary component bodies.

`node scripts/style-slots/tabs-contract-audit.mjs` checks that domain using:

- tsc against actual exported Web/Native props, not manifest-shaped fake types;
- actual Native and browser receipt identities against the current manifest
  hash and the same clean source checkout;
- independent expected contract/ABI facts, not generated declaration equality;
- every state and author-style observation on opaque/prepared/caller/instance
  routes, including the label styles and authored getter evaluation boundary;
- the live-input, modality, primitive-label and container matrices already
  checked by the bounded input audit, including negative controls;
- actual value equality of both published aliases, `Tabs` and `HozoTabs`.

The workflow saves `tabs-contract-audit.json` even when assessment fails. A
declaration saying `audited` cannot fill in missing receipts or authorize a
default route. Synthetic test receipts only test the assessor's refusal rules.

The bounded reader may transport `unknown` or `audited` as a publisher's
declaration. Unknown strings and invented evidence channels are still rejected.
Changing the declaration changes the capture/content identity, but grants no
extra candidate, shape, class-preparation, compiler or adapter authority. The
independent proof is produced by CI, not supplied by that package field.

The initial proof slice left declarations and default routing unchanged.
After its independent gate passed, `Tabs.Tab` is the first shadow declaration
promoted to `audited` for the checked host/ABI domain. `BottomSheet.handle`
remains unknown. The CI gate requires a current, same-manifest proof for every
declared audited shadow owner; a second audit claim without its own proof,
a stale/dirty proof or a duplicate proof fails. The report lists verified and
unknown owners separately. Default adapter routing is still unchanged.

This is not permission to report
100% fidelity: UA/native focus-visible indication, opaque descendant text,
native OS event delivery/cancellation and device rendering remain separate
limits. Nor is one selected contract a complete public-owner denominator.

The legacy slot catalog remains a separate migration surface: its pending
entries are not silently reclassified to turn on old Primitive callback rules.
Inventory counts distinguish one declared audit from one unknown shadow
contract; only the independent CI report certifies that declaration.

The `styling-fact-status` artifact shows declared, verified, unverified-declared,
conflicting and unknown shadow owners separately. It credits a verified host
contract only from one clean same-commit report matching the current manifest
hash and passing declaration gate. Missing/stale/failed reports, a dirty
checkout, or duplicate/conflicting reports cannot raise the verified count.
The global contract-audit metric stays null until a complete public-owner
denominator exists; this selected-contract ledger does not substitute for it.

This distinction avoids two incorrect shortcuts: promoting a manifest because
it agrees with its own generator, and keeping a verified host contract
permanently `unknown` solely because unrelated fidelity/device domains remain
open. Runtime preparation eligibility and default adoption have their own
gates and do not follow automatically from a contract declaration.
