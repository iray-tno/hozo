# Hozo

[![npm](https://img.shields.io/npm/v/@hozo/core?label=npm&color=c8a882)](https://www.npmjs.com/package/@hozo/core)
[![crates.io](https://img.shields.io/crates/v/hozo_parser?color=c8a882)](https://crates.io/crates/hozo_parser)
[![CI](https://github.com/iray-tno/hozo/actions/workflows/ci.yml/badge.svg)](https://github.com/iray-tno/hozo/actions/workflows/ci.yml)
[![Native](https://github.com/iray-tno/hozo/actions/workflows/native.yml/badge.svg)](https://github.com/iray-tno/hozo/actions/workflows/native.yml)
[![Security Audit](https://github.com/iray-tno/hozo/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/iray-tno/hozo/actions/workflows/security.yml)
[![Conformance](https://img.shields.io/badge/conformance-matrix-556348)](https://iray-tno.github.io/hozo/conformance/)
[![License: MIT](https://img.shields.io/badge/license-MIT-9e3d31)](LICENSE)

> Write React Native. Ship semantic HTML on the Web and native UI on iOS and Android.

Hozo is a compiler written in Rust. You write components with React Native's
vocabulary (`View`, `Text`, `Pressable`, and semantic primitives such as
`Heading` and `Section`) and Tailwind classes. The build turns them into
semantic HTML, CSS and ARIA on the Web, and into React Native components and
`StyleSheet` values on iOS and Android. What the build can read is compiled;
only what it cannot read is left to a small runtime.

**[Documentation](https://iray-tno.github.io/hozo/docs/)** · [Website](https://iray-tno.github.io/hozo/) · [REPL](https://iray-tno.github.io/hozo/repl/) · [Storybook](https://iray-tno.github.io/hozo/storybook/) · [Conformance](https://iray-tno.github.io/hozo/conformance/) · [Releases](https://github.com/iray-tno/hozo/releases)

## What it does

```tsx
import { Heading, Section, Text } from '@hozo/core'

export function Welcome() {
  return (
    <Section accessibilityLabel="Welcome" className="gap-2 p-6">
      <Heading level={2} className="text-xl font-bold">Hello</Heading>
      <Text className="text-gray-600">Compiled at build time.</Text>
    </Section>
  )
}
```

On the Web, the build writes this (compiler output, unedited):

```tsx
<section className="hozo-view hozo-9hei4i-r0-0" aria-label={"Welcome"}><h2 className="hozo-9hei4i-r0-1">Hello</h2><span className="hozo-9hei4i-r0-2">Compiled at build time.</span></section>
```

```css
.hozo-9hei4i-r0-0 { gap: 8px; padding-top: 24px; padding-right: 24px; padding-bottom: 24px; padding-left: 24px; }
.hozo-9hei4i-r0-1 { font-size: 20px; line-height: var(--tw-leading, 28px); font-weight: 700; }
.hozo-9hei4i-r0-2 { color: oklch(44.6% 0.03 256.802); }
```

A `<section>` with a name is a region landmark, the heading is an `<h2>`, and
the classes are real CSS. No React Native for Web and no style runtime is
involved. On React Native the same source becomes `View` and `Text` with
`StyleSheet` values, and the heading a `Text` with the `header` role. The
[REPL](https://iray-tno.github.io/hozo/repl/) shows both outputs for anything
you type.

## Try it

| Stack | Install | Guide |
| --- | --- | --- |
| Vite 8+ | `@hozo/vite` | [Vite](https://iray-tno.github.io/hozo/docs/getting-started/vite/) |
| Next.js | `@hozo/next` | [Next.js](https://iray-tno.github.io/hozo/docs/getting-started/next/) |
| React Native, Expo | `@hozo/metro` | [Metro](https://iray-tno.github.io/hozo/docs/getting-started/metro/) |
| Astro | `@hozo/vite` | [Astro](https://iray-tno.github.io/hozo/docs/getting-started/astro/) |
| Storybook | `@hozo/storybook` | [Storybook](https://iray-tno.github.io/hozo/docs/getting-started/storybook/) |
| TanStack Start | `@hozo/vite` | [TanStack Start](https://iray-tno.github.io/hozo/docs/getting-started/tanstack-start/) |

On Vite, for example:

```sh
npm install --save-dev @hozo/vite @hozo/compiler
npm install @hozo/core
```

```ts
// vite.config.ts: hozo() before react(), so it sees the JSX as written
plugins: [hozo({ css: 'src/theme.css' }), react()]
```

If something stops you, [Troubleshooting](https://iray-tno.github.io/hozo/docs/troubleshooting/)
lists what others hit first. For an existing React Native app,
`npx @hozo/migration-audit .` reports what Hozo would change before you
change anything.

## Status

**Early, `0.x`.** Published to npm and crates.io, and tested in CI on every
change; the Native backend also runs weekly on an Android emulator and an iOS
simulator. Public APIs and package boundaries may still change in any minor
release.

What is partial, manual or not yet tested is listed in
[What Hozo does not do yet](https://iray-tno.github.io/hozo/docs/status/).
How far the output matches Tailwind, React Native and WAI-ARIA is measured, not
claimed: see the [Conformance Matrix](https://iray-tno.github.io/hozo/conformance/).

## Learn more

- [How styles are resolved](https://iray-tno.github.io/hozo/docs/guides/styles/): what compiles, and what is left to the runtime
- [Accessibility](https://iray-tno.github.io/hozo/docs/guides/accessibility/): ARIA as the vocabulary, checked on every build
- [How the packages stack](https://iray-tno.github.io/hozo/docs/concepts/packages/): which packages the compiler runs and which your app runs
- [Design decisions](docs/decisions/): settled questions, with the evidence
- [docs/proposal.md](docs/proposal.md): the design document (Japanese)

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) has the repository layout, setup, and the
checks a pull request runs. Agents also read [AGENTS.md](AGENTS.md).

## License

MIT — see [LICENSE](LICENSE).
