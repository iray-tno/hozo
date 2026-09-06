# @hozo/tailwind-conformance

Automated differential test suite comparing Hozo against upstream oracles (Tailwind CSS, React Native Fabric, StyleX, and W3C ARIA specifications).

> **Live Conformance Matrix**: The latest verified measurements from CI are published directly on the web at [`/conformance/`](https://iray-tno.github.io/hozo/conformance/).

For each candidate utility, component, and property, it compiles both ways — through the actual upstream package (`tailwindcss`, `@stylexjs/stylex`, React Native type checkers, `aria-query`) and through Hozo — and diffs the results with zero silent tolerances.

## Two Denominators

It measures Tailwind lowering against two lists, and they say different things:

- **Curated** (`candidates.ts`, 120 utilities) — a hand-picked slice of what real app code uses. Good for "does the common path work", useless as an unbounded claim about Tailwind coverage: we chose it, and we chose it knowing what Hozo implements.
- **Full catalogue** (`catalog.ts`) — every class Tailwind's own design system can generate, asked for through `__unstable__loadDesignSystem().getClassList()`, the entry point the official IntelliSense extension uses. Nothing in it is our choice. Entries Tailwind itself produces no standalone CSS for (a gradient stop with no gradient, a negative form of something that takes none) leave the denominator, and Tailwind decides that too.

## Report Sections

The conformance audit measures five key cross-platform dimensions:

### 1. Web Lowering
- **Coverage & Fidelity**: Compares normalized declarations against Tailwind CSS output.
- Every class must match the exact property name, canonical value, and rule cascade order. Zero mismatches permitted.

### 2. Native Lowering
- **Coverage**: Measures whether utilities lower to real React Native StyleSheet properties and Fabric primitives on `View` and `Text`.
- Categorized into:
  - `COVERED`: Lowers faithfully to a valid native style or prop.
  - `REFUSED`: Raises a build-stopping error naming the utility and reason (e.g. `content`, `outline`, multiple `boxShadow` offsets).
  - `NO-OP`: Deliberately emitted as empty where React Native already exhibits the behavior by default (e.g. `box-border` in Yoga).
  - `SILENT`: Compiles to nothing without a diagnostic. **Guaranteed to be 0.**

### 3. StyleX Surface & Practical Scorecard
- **Property Surface Mapping**: Audits against StyleX's published `CSSProperties` type denominator (522 property names). StyleX 0.19 publishes 522 names; 13 shorthands emit no CSS because they are deliberately disallowed in its default property-specificity mode, two are `@font-face`-only descriptors, and two are obsolete or non-standard. The reviewed compiler-relevant surface is 504/504 (or 504/505 including optional platform adapters like `backdropFilter`).
- **Practical Scorecard**: Measures real executable fixtures across Card, Typography, Input, Scroll, Motion, Grid, and Border scenarios. Validates that Web output agrees with the official StyleX Babel plugin and Native either lowers or triggers explicit Web-only diagnostics.

### 4. Accessibility & ARIA Invariants
- **Role Validation**: Validates all roles against the machine-readable W3C ARIA specification (`aria-query`). Verifies 113 valid roles (83 static, 30 interactive) with 0 false positives.
- **A11y Contracts**: Confirms that all semantic primitives enforce required accessible properties (e.g. `href` on links, `alt` on images) and report incomplete patterns.

### 5. Compiler Diagnostics & RNW-Free Audit
- **Diagnostic Coverage**: Audits declared compiler diagnostics across the pipeline, ensuring each diagnostic has real test fixtures and no dead or silent codes.
- **React Native Web-Free**: Asserts that all semantic primitives and responder bridges lower to pure HTML5/DOM and CSS without importing or depending on `react-native-web`.

## Commands

```sh
pnpm --filter @hozo/compiler build:native       # rebuild Rust addon first
pnpm --filter @hozo/tailwind-conformance report # run full differential audit
pnpm --filter @hozo/tailwind-conformance test   # fast unit & snapshot tests
```

### StyleX Compile Benchmark

Property-family changes can be benchmarked on the same machine and runtime. The benchmark warms up the compiler and measures median compile time for Web and Native pairs. Slowdowns greater than 5% exit non-zero:

```sh
pnpm --filter @hozo/tailwind-conformance benchmark:stylex --output stylex-main.json
pnpm --filter @hozo/tailwind-conformance benchmark:stylex --compare stylex-main.json
```

## Why a Normalizer

The two sides constantly differ without disagreeing:

| Tailwind | Hozo |
|---|---|
| `flex: 1` | `flex: 1 1 0%` |
| `padding: calc(var(--spacing) * 4)` | four `padding-*: 16px` longhands |
| `background-color: var(--color-blue-500)` | `background-color: oklch(…)` |
| `line-height: calc(1.75 / 1.25)` | `line-height: 28px` |

`normalize.ts` resolves custom properties, folds `calc()`, converts rem→px, expands shorthands to longhands, and canonicalizes value spelling. Anything that cannot be resolved with certainty is reported as `SKIPPED` rather than guessed, preventing manufactured matches or mismatches.

## Verdicts

| Verdict | Meaning |
|---|---|
| `MATCH` | Normalized declarations are identical |
| `MISMATCH` | Both emit, and they disagree — a fidelity bug |
| `UNSUPPORTED` | Hozo emits nothing — an explicit coverage gap |
| `SKIPPED` | One side could not be normalized; no claim made |
