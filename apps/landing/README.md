# @hozo/landing

Official documentation site, interactive browser REPL, and automated conformance matrix for Hozo. Built with [Astro](https://astro.build/), [Tailwind CSS v4](https://tailwindcss.com/), and React.

## Site Structure

- **Landing Home (`/`)**: Core value proposition, interactive Kumimono Three.js study, 3-tier style compilation model, cross-platform code comparison, accessibility philosophy, and bundler integrations.
- **Interactive REPL (`/repl`)**: Client-side playground executing the Hozo compiler directly in the browser via WebAssembly (`hozo_wasm`). Live compiles TSX to semantic HTML, CSS, and React Native StyleSheet in sub-millisecond cycles.
- **Conformance Matrix (`/conformance`)**: Automated differential cross-platform report importing live data from `packages/tailwind-conformance/snapshot.json`. Displays exact Web fidelity, Native coverage (refusals/no-ops), StyleX mapping tiers, and W3C ARIA specs.
- **Hosted Artifacts**: Serves `/storybook/` (static build of `@hozo/example-storybook`) and `/reports/` (Allure 3 CI test results).
- **Try Hozo (`/#try-hozo`)**: Web Storybook and native showcase entry points. The Pages build opts into bounded GitHub release discovery with `HOZO_SHOWCASE_DOWNLOADS=1`; direct Android/iOS Simulator links appear only for a published release with both uploaded binaries, installation notes, checksums and manifest. Discovery includes prereleases. Local/PR builds stay offline; missing files or API failures show working release/source links instead. iOS downloads are Simulator-only, not iPhone/TestFlight builds.

Pages rebuilds from trusted `main` after a successful tag-triggered `release`
workflow, as well as on its existing push/manual/weekly triggers. A release created
with `GITHUB_TOKEN` cannot itself trigger a release-event workflow, so this uses
`workflow_run` completion; failed builds and credentialless dry runs do not deploy.
GitHub asset presence is discovery, not a second native-test or signature gate:
the release workflow owns verification. The links reflect the last site build,
not a client-side availability check.

## Static Zero-JS Guarantees

The static subset and MDX probe still ship **no component JavaScript**. The homepage deliberately includes one interactive island: Kumimono, hydrated only when visible. Its Three.js scene uses `@hozo/three/webgl` (not an embedded standalone renderer), procedural wood textures, instanced roof tiles, lighting, and shadows. GPU code stays in the island's separate chunk; it is not part of the REPL or static MDX page.

Kumimono starts assembled without autoplay. Its button and labeled slider work with the keyboard, reduced motion makes transitions immediate, and animation pauses outside the viewport or in a hidden tab. Idle scenes render on demand. Page scrolling/touch gestures are not intercepted. WebGL failure leaves a readable fallback and source link. The shared geometry and DOM-free RGBA timber textures live in `examples/three-kumimono` and are also exercised by the Native GPU probe. This remains a **GPU example**, not portable renderer parity.

- `scripts/check-build.mjs`: Asserts compiled semantic markup, exactly one visible-only Kumimono island on the homepage, and no JavaScript/islands on the static MDX probe.
- `scripts/check-static.mjs`: Uses `@hozo/compiler` to inspect `StaticCard.tsx` and assert `needsClientBoundary: false`.
- `scripts/check-repl.mjs`: Headless build verification ensuring WASM compilation targets and bindings assemble cleanly.
- `scripts/check-kumimono.mjs`: Real WebGL screenshot pixels, mobile/desktop layout, keyboard controls, reversal, reduced motion, offscreen pause, and WebGL failure fallback. Runs on PR CI independently of the WASM probe.
- `scripts/showcase-release.test.ts`: Offline release-discovery cases, including prereleases, partial/draft uploads, foreign URLs, missing metadata and unavailable APIs.
- `scripts/check-showcase-build.mjs`: An isolated Astro build using a test-only mock release catalogue, followed by the same browser checks against the actual download UI. No files are published or assumed to exist externally. Its output is separate from the ordinary app build.
- `scripts/check-landing.mjs`: Real-browser checks at 320–1280px for the two install commands, unclipped showcase actions, fixed-header anchor offsets, skip-link focus and reduced motion. Set `LANDING_SCREENSHOT_DIR` to retain hero/showcase screenshots.

## Development

```sh
pnpm --filter @hozo/compiler build:native # build native addon first
pnpm --filter @hozo/landing dev           # start Astro dev server
pnpm --filter @hozo/landing build         # static site generation into dist/
pnpm --filter @hozo/landing test          # build + run static probe assertions
```
