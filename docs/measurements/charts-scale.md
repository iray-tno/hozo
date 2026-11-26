# Charts at scale: where SVG stops being enough

RFC 015 §8 deferred a Canvas renderer for `@hozo/charts` until a measurement showed at what size
one SVG element per mark costs too much. This is that measurement. It finds that SVG elements are
not the cost. Before this change, the cost was rebuilding everything on each step of the active
datum. After it, the cost is the accessible table.

- **Script:** `node examples/storybook-demo/scripts/measure-charts-scale.mjs`
- **Machine:** Intel Core i7-12700KF (20 threads), Windows 11, Chrome stable, production React
  bundle.
- **Chart:** 800 × 300.
  - Bar has one series and draws one `rect` per value.
  - Line has two series and no dots, so it draws one `path` per series however many values there
    are.
  - `table` is the accessible table alone, as the chart builds it.
- **First draw:** from the render call to the frame after it.
- **Step:** one ArrowRight, then the frame after it. That is what each key press or pointer move
  costs once the chart is up. 7.4 ms is one frame on this display.

## Before: every step rebuilt the layout, the table and every mark

| kind | n | SVG elements | first draw | step median | step max | heap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| bar | 1,000 | 1,052 | 58 ms | 7.3 ms | 11.9 ms | 22 MB |
| bar | 5,000 | 5,049 | 161 ms | 18.1 ms | 31.1 ms | 111 MB |
| bar | 20,000 | 20,047 | 475 ms | 63.3 ms | 105.4 ms | 117 MB |
| line | 1,000 | 51 | 58 ms | 7.4 ms | 11.5 ms | 32 MB |
| line | 5,000 | 48 | 159 ms | 17.8 ms | 32.7 ms | 125 MB |
| line | 20,000 | 46 | 526 ms | 64.6 ms | 103.9 ms | 561 MB |

Line costs the same as Bar with a thousandth of the SVG elements. So the time was not going into
SVG. `Chart` computed the model twice and rebuilt the table and every mark on each change of the
active datum.

## After: the model, the table and the marks are reused across steps

| kind | n | SVG elements | table cells | first draw | step median | step max | heap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bar | 1,000 | 1,052 | 2,002 | 55 ms | 7.4 ms | 7.9 ms | 10 MB |
| bar | 5,000 | 5,049 | 10,002 | 176 ms | 7.4 ms | 9.0 ms | 15 MB |
| bar | 20,000 | 20,047 | 40,002 | 457 ms | 7.4 ms | 13.3 ms | 48 MB |
| line | 1,000 | 51 | 3,003 | 59 ms | 7.3 ms | 8.0 ms | 10 MB |
| line | 5,000 | 48 | 15,003 | 155 ms | 7.4 ms | 8.4 ms | 15 MB |
| line | 20,000 | 46 | 60,003 | 485 ms | 7.4 ms | 8.2 ms | 48 MB |
| table | 1,000 | 0 | 2,002 | 45 ms | | | 10 MB |
| table | 5,000 | 0 | 10,002 | 113 ms | | | 11 MB |
| table | 20,000 | 0 | 40,002 | 351 ms | | | 30 MB |

A step now takes one frame at every size. The fixes:

- The layout model is memoised per drawn width.
- The table element is memoised.
- The axes and marks moved into a memoised `Drawing` that only the tooltip sits beside.

The first step's maximum of about 148 ms at 100 values is the first focus and is not part of the
step cost. The layout model itself is not the cost either: Node computes it in 8.8 ms for 20,000
bars and 14.0 ms for 20,000 two-series points.

## What this says about a Canvas renderer

At 20,000 bars the first draw is 457 ms, and the table alone is 351 ms of it. The 20,000 `rect`s
cost about 100 ms. A Canvas renderer could remove at most those 100 ms. For Line it removes
nothing, because Line already draws one element per series.

What grows with the data is the accessible table: every value is a cell in the tree whether or not
anyone reads it. A 20,000-row table is also not something a screen-reader user can use. So what
large data needs first is a different accessible equivalent, such as a summary or a windowed or
paged table. A second renderer is not the first fix.
