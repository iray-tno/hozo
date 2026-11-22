# Styling fact status: inventories are not coverage

Reproduce the current catalog inventory without the addon, app build or browser:

```sh
node scripts/style-slots/status.mjs
```

Optionally assess existing receipts from the **same checkout commit**:

```sh
node scripts/style-slots/status.mjs --output artifacts/style-fact-model/status.json artifacts/style-fact-model/handle-bundle.json artifacts/style-fact-model/handle-browser.json
```

This reads JSON and repository-owned catalog data, not application config.
Missing receipts are `missing`; old commits are `stale`; failures, malformed
observations, duplicate states or mismatched pairs cannot become `measured`.
Tracked working-tree edits label a receipt `uncommitted`, not current-source
evidence. This is a conservative guard, not a certificate of untracked files
or a substitute for CI's clean checkout.
The commit identity is conservative: even a merge with identical subject bytes
requires a fresh receipt. A generated status report is not proof that tests ran.
The original CI job and its preserved artifact are the evidence.

## Live source inventory, not a progress percentage

At base `44c75e2f`, the script prints 27 components / **100 slots / 56 pending**,
with 33 component-managed slots, all pending, and one unknown-audit shadow
contribution. RFC010's original `d2a04c39` baseline was 99 / 55 / 32: Accordion's
`panelContentClassName` was subsequently cataloged in `a8ca0ce8` / #1475.
That is inventory growth, not lost coverage or an audit regression caused by
the handle spike. This report does not turn known catalog descriptions into
independently audited contracts.

On `76bb7926` the inventory has 0 pending out of 100 pattern slots (46
component-managed), 0 pending out of 52 form slots, and 98 contracts declared
`audited` with none `unknown`. The owner migration evidence is already split
among the Chromium/Native comparisons in
[`caller-composition.test.mjs`](../../examples/storybook-demo/scripts/caller-composition.test.mjs)
and the real component implementations driven with Native host stand-ins in
[`form-owner-contracts.test.ts`](../../packages/metro/src/form-owner-contracts.test.ts)
and [`patterns-owner-contracts.test.ts`](../../packages/metro/src/patterns-owner-contracts.test.ts).
The Form cases include single-platform hosts (#2045, #2095); the Patterns
cases cover the migrated slots and roots (#2046, #2137) and the audited
Primitive facts (#2149). Use these tests for Phase B rather than repeating the
spikes. They are not yet joined by public owner, platform and declared shape:
the status script's independently verified rows are still only for its
selected receipt scope. Do not turn the 98 declarations into a Contract audit
percentage.

## Separate claims

| Output | What its denominator means |
| --- | --- |
| `inventory` | Catalog/source entries; not supported feature cases. |
| Browser `matchedPairs / denominator` | Five explicit Web handle state/property pairs. Never all Tailwind utilities, all owner shapes or Native support. |
| Bundle `delta` | Two measured component bundles with external peers. Recomputed from rows; not an application budget or speed estimate. |
| `globalMeasures` | Coverage, fidelity, diagnostic completeness and contract audit remain `null` until their full pinned denominators exist. `null` is not zero or 100%. |

The existing six-workstream estimates are not reset or increased by these
inventories. Default adapter routing, manifest instances/graph freezing,
dynamic capture, device/AT evidence and complete owner audit remain separate
gates. See [the bounded spike](bottom-sheet-prepared-handle-spike.md) and
[RFC010](../rfcs/010-one-styling-fact-model.md).
