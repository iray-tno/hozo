# Contributing

Hozo compiles React Native components and Tailwind classes ahead of time, and
most of what makes that hard is invisible from a diff. This document is the set
of things a newcomer would otherwise learn by breaking them.

Changes land through pull requests. `main` is protected; nothing is pushed to it
directly.

## The shape of the repository

| | |
| --- | --- |
| `crates/` | The compiler, in Rust. `hozo_ir` is the intermediate representation everything else agrees on; `hozo_parser` reads JSX and Tailwind classes into it; `hozo_web` and `hozo_native` lower it; `hozo_cache` backs the project-wide class scan; `hozo_napi` exposes the result to Node; `hozo_wasm` binds it for the browser. The five library crates are published to crates.io at the npm packages' version; the two bindings are not, since npm is how they ship. |
| `packages/` | The published surface, in TypeScript. `@hozo/compiler` loads the native addon, `@hozo/core` is the zero-setup facade over the component packages and owns no implementation, `@hozo/primitives` owns the canonical components, `@hozo/semantics` and `@hozo/typography` provide semantic primitives, `@hozo/patterns` provides stateful accessible widgets, `@hozo/behaviors` is the headless behavior and positioning layer they build on, `@hozo/engine` is what compiled output calls at run time, `@hozo/rn-compat` and `@hozo/svg` are opt-in domains for React Native migration APIs and SVG, `@hozo/canvas` provides declarative 2D graphics, and the rest are build-tool integrations. |
| `packages/tailwind-conformance/` | Not a package anyone installs. It is the evidence: Hozo's output compared against Tailwind's own engine, over a denominator derived from that engine rather than written by hand. |
| `apps/` | Web applications. `landing` hosts the documentation site, in-browser WASM REPL, and automated conformance matrix. |
| `docs/proposal.md` | Where the project is going. |
| `docs/decisions/` | Questions already settled, with the evidence. Read the relevant record before reopening one. |
| `docs/rfcs/` | Technical specifications, API proposals, and assistive technology (AT) verification matrices. |

### Every directory

Generated from the directories that exist and what each one says about
itself (`pnpm docs:layout`).

<!-- generated: repository-layout -->

```
packages/
  behaviors/               Hozo's accessibility and internationalisation behaviours (FocusScope, RovingFocus, LiveRegion, Portal, DismissableLayer, FloatingPositioner), shared by Web and React Native.
  canvas/                  A declarative Canvas scene for Hozo, rendered by Canvas 2D on Web and Skia on React Native.
  compiler/                JS-facing entry point for the Hozo Rust compiler (TSX analysis, Hozo IR, Web/Native lowering, diagnostics).
  core/                    Zero-setup facade over Hozo's canonical authoring packages.
  engine/                  Runtime fallback for genuinely dynamic styles, interactive behavior, and accessibility behavior.
  form/                    Accessible universal form and date-selection components for Hozo applications.
  media/                   Universal video and audio playback with shared controls and platform-owned engines.
  metro/                   Metro integration for the Hozo compiler (Native lowering backend).
  migration-audit/         Measure how safely Hozo can lower a real React Native application.
  native/                  Hozo's optional native module: the accessibility capabilities React Native does not expose to JavaScript.
  navigation/              Router-agnostic universal navigation for Hozo links and destination-bearing controls.
  next/                    Next.js integration for the Hozo compiler (Web lowering backend).
  patterns/                Accessible composite UI patterns for Hozo applications.
  primitives/              Canonical universal UI primitives for Hozo applications.
  rn-compat/               Optional React Native compatibility APIs for incrementally migrating applications to Hozo.
  semantics/               Universal landmarks, document sectioning, and semantic page structure primitives for Hozo.
  storybook/               Zero-config Storybook Vite preset for Hozo.
  svg/                     Universal SVG primitives for Hozo, backed by browser SVG and react-native-svg.
  tailwind/                Tailwind integration for Hozo's Style IR.
  tailwind-conformance/    Differential test: compares Hozo's compiled CSS against the real Tailwind engine's output, per utility.
  test-reporter/           JUnit normalization and Allure 3 test report generator for Hozo
  three/                   Projects Three.js scenes into portable Hozo Canvas scenes.
  typography/              Universal typography, semantic text formatting, and accessible CJK ruby primitives for Hozo.
  ui/                      A styled component library for Hozo, shipped as source and compiled by your own build.
  vite/                    Vite integration for the Hozo compiler (Web lowering backend).
  webview/                 Universal embedded web content for Hozo: an iframe on the Web and react-native-webview on Native.

crates/
  hozo_cache/     Build cache for Hozo's candidate-class scan, with a swappable backing store.
  hozo_ir/        Platform-independent intermediate representation shared across the Hozo compiler pipeline.
  hozo_napi/      Node native binding exposing the Hozo compiler to JS build tooling.
  hozo_native/    Hozo IR to React Native primitive/StyleSheet lowering (Native backend).
  hozo_parser/    TSX analysis and Style IR construction.
  hozo_wasm/      WebAssembly binding exposing the Hozo compiler to a browser.
  hozo_web/       Hozo IR to DOM/CSS/ARIA lowering (Web backend).

apps/
  landing/    Landing site, interactive REPL playground, and the live conformance matrix.

examples/
  astro-demo/           @hozo/example-astro               — Astro, with static components and an island.
  expo-router-demo/     @hozo/example-expo-router-demo    — Real Expo Router type and production-export fixture for @hozo/navigation.
  login-demo/           login-demo                        — Phase 0 benchmark app -- exercises @hozo/core through @hozo/vite end to end.
  native-demo/          @hozo/example-native-demo         — React Native example, and the end-to-end check that a Hozo source survives a real Metro bundle.
  native-showcase/      @hozo/example-native-showcase     — Expo development app with on-device React Native Storybook and shared Hozo demos.
  next-demo/            @hozo/example-next                — Next.js, on both bundlers.
  screen-readers/       @hozo/example-screen-readers      — Real screen readers, NVDA and VoiceOver, reading the Storybook catalogue through Guidepup.
  showcase/             @hozo/example-showcase            — Platform-neutral demo bodies shared by Web and Native Storybook hosts.
  storybook-demo/       @hozo/example-storybook           — Storybook, audited against axe-core in CI.
  tanstack-start-demo/  @hozo/example-tanstack-start      — TanStack Start.
  three-kumimono/       @hozo/example-three-kumimono      — Shared DOM-free Kumimono Three.js scene for the landing page and Native GPU probe.
  three-native-probe/   @hozo/example-three-native-probe  — Device probe for candidate Native GPU hosts used by @hozo/three.

docs/
  proposal.md      the full design document
  primitives.md    every primitive and what it lowers to, generated
  decisions/       settled questions, with the evidence behind them
  measurements/    what was measured, and against what
  rfcs/            technical specifications and AT verification matrices
```

<!-- /generated: repository-layout -->

## Setting up

Requires Node 22+, pnpm 11 and a Rust toolchain.

```sh
pnpm install
pnpm --filter @hozo/compiler build:native   # the Rust addon, once
pnpm build
pnpm test                                   # JS suites + package packing
cargo test --workspace                      # Rust suites
pnpm typecheck
```

The pinned Bluesky corpus is also reproducible from a fresh checkout. The command acquires the
corpus at the exact commit recorded in the measurement, refuses an existing checkout at a
different commit, builds the compiler, writes an audit under `artifacts/measurements`, and compares
it with the committed baseline. It does not install the corpus dependencies:

```sh
pnpm measure:bluesky
```

The publishing metadata for every package is generated by
`scripts/package-metadata.mjs`; `scripts/check-packages.mjs` re-derives it,
fails on drift, and then looks inside the tarballs `npm pack` would produce
to check every entry point is actually in them.

## Before you open a pull request

```sh
cargo fmt --all --check                     # `cargo fmt --all` to fix
cargo test --workspace
pnpm --filter @hozo/compiler build:native   # after any change under crates/
pnpm test                                   # from the repository root
```

Rust is formatted by rustfmt with its defaults, and CI's `lint` job fails on
any difference, as it does for Biome. The four generated modules
(`hozo_ir::class_slots`, `hozo_ir::tailwind_portable`, `hozo_parser::aria`,
`hozo_parser::tailwind_variants`)
are `#[rustfmt::skip]`: regenerating them must not produce a diff (the
style-slots test compares `class_slots.rs` byte for byte), so the generator
decides the layout. Change the generator, not the file.

`pnpm test` is the same command CI runs. Its package build/test tasks,
publishing checks and application integration tests must all succeed. The
final package check must report that every public package packs correctly;
the exact task/package counts grow as packages are added.

A test that fails without your change may be a known flake: see
[`docs/flaky-tests.md`](docs/flaky-tests.md) before chasing it.

If your change moves any conformance number, also run the audit and commit the
new snapshot. Build the addon in release first — the audit is almost entirely
that binary now, and it is the difference between 312 seconds and 48:

```sh
pnpm --filter @hozo/compiler build:native:release
pnpm turbo run report            # writes packages/tailwind-conformance/snapshot.json
pnpm turbo run report -- --check # what CI asserts
```

Switch back to `build:native` afterwards if you are returning to the edit-test
loop; the debug build is six times quicker to produce (1.9s against 12.8s) and
the JS suite runs at the same 120 seconds under either.

Nothing else differs between the two. A panic reports the same message and the
same file, line and column in both — `panic!` carries its location regardless
of the profile — and this codebase has no `debug_assert!` and no
`cfg(debug_assertions)` at all. The one real divergence is that release does
not check integer overflow, which is theory here rather than practice: the
numeric work is `f64`, and an `as` cast truncates silently in both.

## Five things that will bite you

**`pnpm turbo run test` is not `pnpm test`.** The root script is
the package build/test/pack checks followed by publishing and integration
checks. `scripts/check-packages.mjs` is where a broken `exports` map surfaces;
running only the Turborepo tests skips this and the release checks and can
report green while CI is red. This has happened.

**`packages/*/package.json` is generated.** `scripts/package-metadata.mjs`
writes it and `scripts/check-packages.mjs` verifies it. Editing one by hand
passes every local test and fails CI at the last step. Change the generator.

**A stale addon makes a passing test a lie.** The JS side loads a compiled
`.node` file. Until you rebuild it, every JS test is measuring the previous
version of your Rust change — including the ones that pass.

**The Native text fixture also pins compiler sources.** When changing a file
fingerprinted by `text-inheritance-device-source.ts`, regenerate with
`node examples/native-showcase/scripts/generate-text-inheritance.mjs` after
rebuilding the addon, then run it with `--check`. Even unchanged emitted code
needs the new source hashes committed. Keep that provenance check intact.

**A raw source probe needs raw source cache inputs.** A test that reads or
bundles another package by filesystem path must include those paths in its
Turbo `test` task's `inputs`, alongside `$TURBO_DEFAULT$`. This includes local
helpers reached by the probe, not just its entry point. Do not add a production
dependency merely to make a test's cache change. Keep narrowly scoped probes
narrow (media reads Slider and its rules); a test that enumerates every
component package, such as class-name parity, legitimately needs all of them.
`scripts/turbo-source-inputs.test.mjs` guards the known source probes outside
Turbo. Add new probes there, and verify task hashes with `turbo --dry=json`.

**You cannot rebuild the addon while the audit is running.** On Windows the
running report holds the `.node` file open and the build fails with `EBUSY`.
Let the audit finish, or don't start it.

**The snapshot fails on improvement too.** `--check` compares every headline
number and rejects any change in either direction. A count that went up is a
fact that belongs in the diff of the commit that earned it, not a silent
upgrade.

## How this project knows things

The conformance suite exists because the alternative — a hand-written list of
cases someone thought of — measures the author's imagination rather than the
compiler. Every denominator here is derived from a system outside this
repository: Tailwind's own engine enumerates the utilities and variants, React
Native's type definitions decide which refusals are supportable, `aria-query`
supplies the roles and their required attributes.

Two consequences worth internalising.

**The numbers can move without a commit.** A Tailwind release changes the
denominator. That is why the audit also runs on a schedule.

**When a measurement and the thing measured disagree, suspect the
measurement.** In this repository's history that has been the right guess far
more often than not: a conformance check that could never have failed, a
diagnostic that pointed away from the correct answer, a probe that read the
wrong element. Before fixing a compiler defect a report found, confirm the
report is asking the right question.

A count of zero deserves the same suspicion. `silent: 0` looked like a clean
result for a long time and was in fact structurally impossible to fail; when it
was repaired it found 939 real cases.

## Commits and pull requests

Pull request titles are `type(scope): summary` and CI checks them, because the
title is what lands on `main` and several agents open pull requests here. The
types, the scopes, and the conventions for branches, issues and labels are in
[`AGENTS.md`](AGENTS.md); they apply to people as much as to agents.

The prefix is for sorting; the summary still has to say what is different
afterwards and, where there is room, what it cost or found —
`fix(core): refuse a length there is nothing to resolve, instead of calling it
zero`, not `fix: length handling`. No trailing period.

Keep unrelated repairs in their own commits. A formatting sweep mixed into a
behavioural change makes the behavioural change unreviewable.

## Publishing

Normal releases are deliberately credentialless. After the version pull
request is merged, a `v*` tag runs `.github/workflows/release.yml`; npm and
crates.io authenticate that workflow with short-lived OIDC credentials. Every
published npm package and crate must therefore trust `iray-tno/hozo` and the
workflow filename `release.yml` in its registry settings.

A registry cannot trust a name that does not exist yet. When the repository
adds a new public package, platform binding, or crate, run the manual
`bootstrap-publish` workflow for that exact name. It refuses existing, unknown,
and private targets and publishes only the requested identity using
`NPM_BOOTSTRAP_TOKEN` or `CARGO_BOOTSTRAP_TOKEN`. Configure `release.yml` as its
Trusted Publisher immediately afterwards, delete the GitHub secret, and revoke
the temporary registry token. Bootstrap is never a fallback for a broken normal
release: tokens bootstrap identities; OIDC publishes releases.

In the pull request, say what you measured. A claim that something works is
worth as much as the command that showed it.
