# @hozo/landing

Official documentation site, interactive browser REPL, and automated conformance matrix for Hozo. Built with [Astro](https://astro.build/), [Tailwind CSS v4](https://tailwindcss.com/), and React.

## Site Structure

- **Landing Home (`/`)**: Core value proposition, interactive Kumimono Three.js study, 3-tier style compilation model, cross-platform code comparison, accessibility philosophy, and bundler integrations.
- **Interactive REPL (`/repl`)**: Client-side playground executing the Hozo compiler directly in the browser via WebAssembly (`hozo_wasm`). Live compiles TSX to semantic HTML, CSS, and React Native StyleSheet in sub-millisecond cycles.
- **Conformance Matrix (`/conformance`)**: Automated differential cross-platform report importing live data from `packages/tailwind-conformance/snapshot.json`. Displays exact Web fidelity, Native coverage (refusals/no-ops), StyleX mapping tiers, and W3C ARIA specs.
- **Hosted Artifacts**: Serves `/storybook/` (static build of `@hozo/example-storybook`) and `/reports/` (Allure 3 CI test results).

## Static Zero-JS Guarantees

The static subset and MDX probe still ship **no component JavaScript**. The homepage deliberately includes one interactive island: Kumimono, hydrated only when visible. Its Three.js scene uses `@hozo/three/webgl` (not an embedded standalone renderer), procedural wood textures, instanced roof tiles, lighting, and shadows. GPU code stays in the island's separate chunk; it is not part of the REPL or static MDX page.

Kumimono starts assembled without autoplay. Its button and labeled slider work with the keyboard, reduced motion makes transitions immediate, and animation pauses outside the viewport or in a hidden tab. Idle scenes render on demand. Page scrolling/touch gestures are not intercepted. WebGL failure leaves a readable fallback and source link. This is a **WebGL example**, not a claim that its DOM-generated textures run unchanged on Native or the portable renderer.

- `scripts/check-build.mjs`: Asserts compiled semantic markup, exactly one visible-only Kumimono island on the homepage, and no JavaScript/islands on the static MDX probe.
- `scripts/check-static.mjs`: Uses `@hozo/compiler` to inspect `StaticCard.tsx` and assert `needsClientBoundary: false`.
- `scripts/check-repl.mjs`: Headless build verification ensuring WASM compilation targets and bindings assemble cleanly.
- `scripts/check-kumimono.mjs`: Real WebGL screenshot pixels, mobile/desktop layout, keyboard controls, reversal, reduced motion, offscreen pause, and WebGL failure fallback. Runs on PR CI independently of the WASM probe.

## Development

```sh
pnpm --filter @hozo/compiler build:native # build native addon first
pnpm --filter @hozo/landing dev           # start Astro dev server
pnpm --filter @hozo/landing build         # static site generation into dist/
pnpm --filter @hozo/landing test          # build + run static probe assertions
```
