# Theme alias dependency delivery

Measured on Windows on 2026-11-05, with one logical CPU, for [#1722](https://github.com/iray-tno/hozo/issues/1722).

An ordinary `@theme` alias resolves its dependency where the alias is declared.
Replacing it with nested fallbacks at the consuming element changes that scope.
The compiler instead delivers reachable declarations in `@layer theme` at
`:root, :host`, and keeps Tailwind's resolved utility value. Inline declarations
can supply dependencies of other variables; reference-only declarations still
leave delivery to the imported stylesheet.

## Browser comparison

```sh
node --test --test-concurrency=1 examples/storybook-demo/scripts/theme-alias.test.mjs
```

1,440 comparisons passed against Tailwind's actual compiled CSS in separate
Chromium documents. The matrix covers four theme modes (ordinary, inline,
reference, inline reference), five candidates (an alias, its opacity form, a
chained alias, an external dependency and an escaped reference), six emission
paths (ordinary, ready, retained preview, retained final, candidate and owner
class), six override states and both stylesheet orders.

Overrides target the root, descendants, or both, including invalidating an alias
with `initial` and placing overrides in the `base` layer. Layer creation order
is compared with Tailwind directly: an earlier layer cannot be reordered by a
later layer-order declaration. For unlayered overrides, an ordinary alias keeps
its root-computed value while an inline alias follows its descendant dependency.
The oracle stylesheet cannot provide missing variables to Hozo's document.

Native assertions keep the resolved alias as `#ff0000`, mark the external
dependency unresolved, and reject CSS `var()` output. The size probe also checks
that the complete Native result is identical before and after this change.

## CSS size

```sh
node scripts/measure-theme-alias.mjs 30d36e40
```

The probe loads the previous Tailwind adapter from the baseline commit and the
current adapter through the same rebuilt addon. The old metadata shape emits
the previous fallback-based CSS, with no delivered variables. The fixture uses
`bg-alias bg-alias/50 text-chain border-base`, three reachable declarations
(`--color-base`, `--color-alias`, `--color-chain`), and one unused declaration.
Only the three reachable declarations are delivered.

| Output | Before, bytes | After, bytes | Difference | Before gzip | After gzip |
| --- | ---: | ---: | ---: | ---: | ---: |
| One component's CSS | 535 | 694 | +159 | 306 | 364 |
| Candidate stylesheet | 831 | 902 | +71 | 246 | 281 |
| 24 components' concatenated CSS | 12,863 | 16,679 | +3,816 | 398 | 479 |

The 24-component result is synthetic CSS concatenation before bundler
minification, with separate component selectors and repeated theme declarations.
It measures delivery overhead rather than an application's production bundle or
JavaScript size. Hoisting shared declarations is a possible later optimization;
the current output keeps each emission self-contained.

The Rust dependency walker uses CSS tokens to exclude strings, comments and URLs
and to decode escaped identifiers. Unit cases cover fallback dependencies,
cycles, unused declarations and escaped declaration names.
