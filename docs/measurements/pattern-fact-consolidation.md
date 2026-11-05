# Pattern fact consolidation, RFC 010 §7B

Baseline: `30d36e40c3fda91b7024628ca542219e61f16c0d`.
Tracking: [#1458](https://github.com/iray-tno/hozo/issues/1458).

## Authority and deletion

`scripts/style-slots/catalog.mjs`'s existing 14 `profiles` author constant
booleans and symbolic live inputs. The same definitions now generate both
the existing compiler tables/types and plain runtime constant objects in
`packages/patterns/src/slot-facts.native.ts`. No new parallel profile list,
runtime predicate evaluator or state subscription is introduced.

The actual CommandPalette, Combobox, Listbox, Menu, OtpInput, Chip,
Pagination, Stepper, Slider and ColorPicker implementations no longer
restate those constant booleans. Live state calculation, event availability,
slot gates, authored precedence and input normalization remain component-owned.
In particular, option focus is not borrowed from a Combobox input, links do
not acquire button-only disabled predicates, descriptive steps do not become
interactive and Native announcements do not manufacture absent Web ARIA facts.

The old `non-control-facts.native.ts` object and then its temporary import
shim are deleted; decorative consumers import the one generated constant.
The form package's separate generated file is kept because that package owns
its own consumer implementation; it reads the same catalog, not a second
handwritten definition. Splitter's unrelated, currently uncatalogued state
object is not silently given a wider NonControl/ARIA predicate domain.

## Checks

All local checks used CPU 1 / Idle; test files ran serially:

- Catalog/status/raw-source-cache guards: 54 passed after deleting the shim.
  They verify exact constant/live keys and generated-file equality. The new
  esbuild test evaluates a single imported constant and proves unrelated
  profiles are absent; disabling tree shaking is a positive control.
- Input/menu/list/OTP selection: 45 passed before the control migration.
- Dynamic-slot/gap-owner/input selection: 57 passed after all ten consumers
  migrated, preserving independent style expectations and diagnostics.
- Patterns typecheck and touched-file Biome passed. These are actual source
  components on stand-in Native hosts, not device events, pixels or a new
  independent rung-3 audit.

## Bounded size receipt

Each entry below bundles its own `.native.tsx` plus local helper graph with
esbuild 0.28.2, `bundle/minify: true`, ESM, neutral platform, automatic JSX,
ES2022 target and `@hozo/*`, React and RN peers external. Baseline sources are
read from the commit above; changed baseline modules, including the deleted
shim, are supplied through esbuild load/resolve overrides. Both sides use
identical options and Node gzip defaults. No application build runs locally.

| Entry | Minified before → after, bytes | Gzip before → after, bytes |
| --- | ---: | ---: |
| CommandPalette | 6,734 → 6,764 | 2,898 → 2,908 |
| Combobox | 4,740 → 4,814 | 2,056 → 2,072 |
| Listbox | 3,545 → 3,606 | 1,586 → 1,598 |
| Menu | 3,448 → 3,612 | 1,467 → 1,484 |
| OtpInput | 5,370 → 5,402 | 2,276 → 2,291 |
| Chip | 4,590 → 4,605 | 1,974 → 1,981 |
| Pagination | 4,257 → 4,272 | 1,854 → 1,863 |
| Stepper | 4,158 → 4,173 | 1,673 → 1,677 |
| Slider | 3,297 → 3,312 | 1,587 → 1,599 |
| ColorPicker | 10,631 → 10,672 | 4,199 → 4,227 |

These overlapping helper graphs are **not additive application sizes**. The
small increases are recorded, not called zero overhead. No latency, render
frequency or end-to-end speedup is inferred from this measurement. Real
production bundles and full repository suites remain CI work.

No default route, audit declaration, support domain, coverage denominator or
six-view progress score is promoted by this consolidation. Independent
Web/Native host delivery and per-domain rollout/deletion remain separate gates.
