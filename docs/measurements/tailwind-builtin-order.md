# Built-in Tailwind descriptors for a compile with no project CSS

Part of #1230, consolidation domain, the first step toward making Tailwind's
order the default everywhere, not only where a project's CSS is captured.
See [coverage](tailwind-order-coverage.md) for why: deleting the old ordering
paths needs a context for every compile.

## What a compile without project CSS was missing

Hozo already ranks with Tailwind's own comparator, in Rust
(`crates/hozo_ir/src/tailwind_order/comparison.rs`: variant bitset, then
property sort, then declaration count, then the class name compared
numerically). What a captured project supplies is the input to it: each
class's rule descriptor -- its variant bits, the positions of its declared
properties in Tailwind's property list, the declaration count and the rule's
shape for the ownership assessment. The standalone API, WASM and tests had
no descriptors, so every input kept its authored order.

## What this adds

- `scripts/generate-tailwind-builtin-order.mjs` asks the installed Tailwind
  (4.3.3) for every class in its default class list (23,286) and every named
  variant instance, and records per **utility root** (1,154) the body shape(s)
  its classes compile to with their property sort and count, and per
  **variant** (331) its wrapper and position in Tailwind's variant order. The
  descriptor fields depend only on these, never on a class's value, so this
  is per root and per variant, not per class: 160 KB of generated Rust. Shapes
  omit `@property` registrations, which the assessment ignores.
- `hozo_ir::builtin_tailwind_snapshot` builds each class's descriptor from
  that data. Where a root has more than one body (`text`: size or colour), the
  writes Hozo parses for the class choose it -- first by the write's own
  property, then by ownership. A class whose root or any variant is absent
  (arbitrary variants such as `data-[state=open]`), that is `!important`, or
  whose body cannot be chosen is `NotGenerated`: a barrier, never a guess.
- `prepareBuiltinTailwindContext(candidates)` (internal) gives an ordered
  context from it. It is not yet anyone's default; that is the next layer.

## Verification

`builtin-order.test.ts` prepares, for every default Tailwind class, every
named variant on seven probe utilities and five stacked variant pairs
(24,436 ranked rules in all), one context from real Tailwind and one from
the built-in data, and compares `rulePriorities()`:

- **Every rule the built-in data describes gets the same assessment verdict
  and specificity as real Tailwind, and the same relative order among the
  ranked ones.**
- Of the 13,202 ranked rules whose class Hozo can rank at all (every parsed
  write in the ranked domain), **99.8%** are described. The rest: the size
  forms of `shadow-*` and `inset-shadow-*` and the `transition-*` family,
  where two bodies declare the same property and the writes cannot choose,
  plus the deliberate `!` and arbitrary-variant cases.
- Counting every ranked rule, including masks and `inline-*` sizes whose
  writes are outside the ranked domain and so are barriers either way, the
  share is 70.2%. An earlier draft measured that and briefly chose the first
  body for such classes; their own positions then moved, which changes no
  ranking but made the order comparison unable to tell the cases apart, so
  it was reverted and the metric restricted instead
  (`tailwindClassesRankable`, measurement only).
- A second test runs the generator with `--check`, so a Tailwind upgrade
  without regenerating fails.
