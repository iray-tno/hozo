# Text inheritance: what the run-time readers cost in JS

[Decision 013](../decisions/013-text-inheritance-compiled-where-visible.md)
asks for one cost comparison before the route becomes the default.

**Script:** `packages/tailwind-conformance/src/text-inheritance-unified-cost.ts`. Since #2057 it no longer has the `runtime route` column, because RFC 006's route was deleted; the numbers below are from before that.

```sh
cd packages/tailwind-conformance
NODE_ENV=production node src/text-inheritance-unified-cost.ts           # 1000 rows
NODE_ENV=production ROWS=100 node src/text-inheritance-unified-cost.ts  # 100 rows
```

## What it times

- **Setup:** React 19.2.8, production build, `react-test-renderer` with mock
  Native hosts, Node 25.9, Windows 11.
- **What one sample is:** from the root component's render to its layout
  effect, which is one render and commit. Each workload is 41 runs, and the
  median of the last 36 is reported.
- **Why not time around `create`:** the production test renderer commits on
  a later task, so timing around `create` reads 0.00. The first draft did,
  which is why the script now checks that every row rendered.
- **Not measured:** layout, drawing and the bridge. Every route renders the
  same hosts, so those costs are the same for all of them.

## The workloads

**List:** each row is a `View`, an outermost `Text` with its own size, and a
nested `Text`. It compares four routes:

| Route | What it renders |
| --- | --- |
| plain | today's ordinary output |
| leaf | `HozoInheritedLeafText` for the outermost `Text` (decision 013) |
| scoped leaf | the same, under one `HozoInheritedScope` |
| runtime route | RFC 006's current route: `HozoInheritedView` and `HozoInheritedText` on every element |

**Pressed colour:** a parent's colour toggles above 50 memoised label
components. It compares three routes:

| Route | How the colour reaches the labels |
| --- | --- |
| prop | passed by hand to every label |
| scope + leaf | decision 013 |
| runtime route | RFC 006's current route |

## Results

Two runs at 1,000 rows, on `docs/text-inheritance-decision` (`485245ec`).
Times are the median of the update, in ms.

| List of 1,000 rows | Run 1 | Run 2 | Over plain |
| --- | ---: | ---: | --- |
| plain | 0.85 | 0.81 | |
| leaf | 1.05 | 1.07 | +0.20 to +0.26 |
| scoped leaf | 1.08 | 1.07 | +0.23 to +0.27 |
| runtime route | 5.32 | 5.31 | +4.47 to +4.50 |

| List of 100 rows | Update |
| --- | ---: |
| plain | 0.12 |
| leaf | 0.12 |
| scoped leaf | 0.11 |
| runtime route | 0.44 |

| Pressed colour, 50 labels | Toggle |
| --- | ---: |
| prop | 0.04 |
| scope + leaf | 0.03 to 0.04 |
| runtime route | 0.09 |

## What it shows

- **The leaf costs about 0.25 µs per outermost `Text` per commit.**
  - At 1,000 Texts in one commit that is about 0.25 ms. This is RFC 006's
    provisional threshold (the larger of 5% and 0.25 ms). Run 1 was within it
    and run 2 was over by 0.01 to 0.02 ms, which is inside the run-to-run
    difference.
  - At 100 rows it cannot be told apart from plain.
  - A real list is windowed: `FlatList` mounts `initialNumToRender` (10) rows
    and then batches of `maxToRenderPerBatch` (10). So 1,000 Texts in one
    commit is a deliberate upper bound.
- **RFC 006's current route costs about 18 times as much** (4.5 ms at
  1,000 rows), and is over the threshold at 100 rows. The per-element
  selection in decision 013 exists to avoid this.
- **A changing colour costs the same with a scope as with a prop**, because
  only the readers under the scope re-render.

## Not settled here

- **Device timing.** Decision 013 does not require it.
- **Whether a single context, instead of two, would remove the leaf's
  remaining cost.** This is the decision's revisit step, and the list result
  does not call for it.
