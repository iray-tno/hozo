# @hozo/landing

Official documentation site, interactive browser REPL, and automated conformance matrix for Hozo. Built with [Astro](https://astro.build/), [Tailwind CSS v4](https://tailwindcss.com/), and React.

## Site Structure

- **Landing Home (`/`)**: Core value proposition, 3-tier style compilation model, cross-platform code comparison, accessibility philosophy, and bundler integrations.
- **Interactive REPL (`/repl`)**: Client-side playground executing the Hozo compiler directly in the browser via WebAssembly (`hozo_wasm`). Live compiles TSX to semantic HTML, CSS, and React Native StyleSheet in sub-millisecond cycles.
- **Conformance Matrix (`/conformance`)**: Automated differential cross-platform report importing live data from `packages/tailwind-conformance/snapshot.json`. Displays exact Web fidelity, Native coverage (refusals/no-ops), StyleX mapping tiers, and W3C ARIA specs.
- **Hosted Artifacts**: Serves `/storybook/` (static build of `@hozo/example-storybook`) and `/reports/` (Allure 3 CI test results).

## Static Zero-JS Guarantees

The landing site serves as an automated test probe asserting that Hozo's static subset ships **no JavaScript to the browser**:

- `scripts/check-build.mjs`: Parses `dist/**/*.html` and asserts that Hozo primitives lower to semantic HTML with compiled scoped classes, without shipping `<script>` tags or Astro client islands (`<astro-island>`).
- `scripts/check-static.mjs`: Uses `@hozo/compiler` to inspect `StaticCard.tsx` and assert `needsClientBoundary: false`.
- `scripts/check-repl.mjs`: Headless build verification ensuring WASM compilation targets and bindings assemble cleanly.

## Development

```sh
pnpm --filter @hozo/compiler build:native # build native addon first
pnpm --filter @hozo/landing dev           # start Astro dev server
pnpm --filter @hozo/landing build         # static site generation into dist/
pnpm --filter @hozo/landing test          # build + run static probe assertions
```
