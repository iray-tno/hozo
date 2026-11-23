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
`audited` with none `unknown`. The declaration count alone is not an audit.

### Phase B: the shipped owner shapes and their host tests

The two shipped [Patterns](../../packages/patterns/hozo.manifest.json) and
[Form](../../packages/form/hozo.manifest.json) manifests declare **98 owners,
99 shapes and 193 applicable shape/platform pairs** (95 Web, 98 Native).
Count each non-null host once per shape, not once per public export alias,
utility, or interaction state. A component named below covers its declared
owner prefix, not every public prop.

Web receipts are marker assertions on the real component's DOM in
[`caller-composition.test.mjs`](../../examples/storybook-demo/scripts/caller-composition.test.mjs).
Native receipts use real component implementations with host stand-ins in the
[`patterns-owner-contracts`](../../packages/metro/src/patterns-owner-contracts.test.ts)
or [`form-owner-contracts`](../../packages/metro/src/form-owner-contracts.test.ts)
suite. The compiler-only comparisons and the declared host inventory do not
substitute for those renders.

| Owner groups in the manifests | Web | Native | Host receipts |
| --- | ---: | ---: | --- |
| BottomSheet, Drawer, Popover | 12 | 12 | #2046 secondary slots, #2137 roots; both BottomSheet handle shapes, and #2245 Native scrim host corrections |
| Accordion, RadioGroup, ResizablePane, Slider, Splitter, Tabs, Tree | 22 | 22 | #2046 prepared slots and #2137 additional roots |
| CodeBlock | 8 | 8 | #2046 figure, line/gutter, insert/delete/mark, copy and caption |
| Alert, Checkbox, Switch, Toolbar, Tooltip | 5 | 5 | #2137 box/text and Toolbar placement; Native Tooltip renders through its real FloatingPositioner to a View |
| Form, SubmitButton, FileDropzone | 4 | 3 | #2045 root delivery; #2095 Web-only FileDropzone active slot, driven by drag enter/leave on the compiled caller |
| Field, TextArea | 8 | 8 | #2045 labelled text, required/description/error, input and count |
| NativeSelect | 1 | 5 | #2045 control; #2095 Native-only indicator, sheet, scrim and option; #2245 actual scrim host |
| Calendar | 5 | 5 | #2045 root, header, grid, month navigation and day |
| DatePicker, DateRangePicker, DateTimePicker | 25 | 25 | #2045 trigger and Done state; the same fixtures separately assert the root, open dialog and all forwarded Calendar hosts for each picker |
| TimePicker | 5 | 5 | #2045 root, field, value, period and step |
| **Applicable declared pairs** | **95** | **98** | |

For a stateful owner, the third-rung claim is where a marker lands, not
exhaustive agreement over all states. The decorative BottomSheet handle
has only a resting-style receipt; it does not acquire a press state.
`Animated.View` is the View host for the Native Popover panel. Missing hosts
are explicit: FileDropzone's active slot is Web-only and four NativeSelect
slots are Native-only. The #2149 Primitive comparisons are separate; those
slots are not part of the two manifests' prepared-owner denominator.

This is an index to existing tests, not a dashboard or a change to the
status script's selected receipt scope. It does not raise the global RFC 010
Contract audit rate, attest to device event delivery, or change audit labels.

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
