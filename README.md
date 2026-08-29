# Hozo

> A Rust-powered universal UI compiler and accessibility-first layer for React Native.

**Status: working prototype, not yet published.** The Rust compiler, five
bundler and framework integrations, both lowering backends, the runtime
adapters and the conformance suite are implemented and tested. Public APIs
and package boundaries may still change. See
[docs/proposal.md](docs/proposal.md) for the design document (Japanese).

## What is Hozo

Hozo compiles React Native source toward the platform it actually runs on:

- **Web** — semantic DOM, CSS and ARIA, with a minimal runtime
- **Native** — React Native / Fabric, with a minimal runtime

Applications import canonical primitives from `@hozo/core` (or keep
importing from `react-native`). Hozo lowers those primitives to semantic
DOM and CSS on Web, or to React Native components and `StyleSheet` values
on Native. Existing React Native applications can adopt it incrementally,
though today that means changing imports at the migration boundary.

Hozo is a compilation layer rather than a new component framework. Its Web
output is designed to keep React Native for Web off compiled paths while
preserving React Native's component and event contracts where practical.

Accessibility is a requirement from v1, not an add-on.

## Getting started

> Nothing below is on npm yet. These are the commands the first release
> will carry, and what the examples in this repository already run.

Every integration takes the same options, and the only one most projects
need is `css` — the path to the Tailwind entry stylesheet that defines the
project's design tokens. Left out, Hozo looks for the usual filenames and
falls back to Tailwind's defaults if it finds none. If your tokens live
somewhere it did not guess, say so: a project compiled against the wrong
palette gets wrong numbers and unresolved variables, not an error.

### Vite

```sh
npm install --save-dev @hozo/vite @hozo/compiler
npm install @hozo/core @hozo/runtime
```

```ts
// vite.config.ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { hozo } from '@hozo/vite'

export default defineConfig({
  // `hozo()` before `react()`: it has to see the original JSX, before
  // the React plugin's transform touches the file.
  plugins: [hozo({ css: 'src/theme.css' }), react()],
})
```

### Next.js

Works with both bundlers — Turbopack (the default from Next 16) and
`next build --webpack`.

```sh
npm install --save-dev @hozo/next @hozo/compiler
npm install @hozo/core @hozo/runtime
```

```ts
// next.config.ts
import { withHozo } from '@hozo/next'

export default withHozo({ /* your Next config */ }, { css: 'src/theme.css' })
```

### Metro (React Native, Expo)

```sh
npm install --save-dev @hozo/metro @hozo/compiler
npm install @hozo/core @hozo/runtime
```

```js
// metro.config.js
const { getDefaultConfig } = require('@react-native/metro-config')
const { withHozo } = require('@hozo/metro/config')

// Exported as a promise, which Metro awaits: the project-wide candidate
// module has to be generated before the bundle starts.
module.exports = withHozo(getDefaultConfig(__dirname), { css: 'src/theme.css' })
```

### Storybook

Zero configuration beyond the addon — it wraps `@hozo/vite`.

```sh
npm install --save-dev @hozo/storybook
```

```ts
// .storybook/main.ts
export default {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@hozo/storybook'],
}
```

### TanStack Start

The Vite plugin, first in the list:

```ts
export default defineConfig({
  plugins: [hozo({ css: 'src/theme.css' }), tanstackStart(), viteReact(), nitro()],
})
```

## How styles are resolved

Hozo does not treat a dynamic `className` as a single thing to give up on.
There are three tiers, and only the last one costs anything at runtime.

**Static — compiled away.**

```tsx
<View className="p-4 bg-blue-500" />
```

Becomes a scoped class in a real stylesheet. Nothing is left at runtime.

**Structurally dynamic — compiled into a conditional.**

```tsx
<View className={cn('p-4', active && 'bg-blue-500', size === 'lg' && 'text-xl')} />
```

The compiler does not need to know what `active` is. It keeps the shape of
the expression and compiles each branch, so all three classes are real CSS
and the choice between them is a boolean at runtime.

**Truly dynamic — a runtime fallback.**

```tsx
<View className={classNameFromProps} />
```

Here the compiler genuinely cannot tell. Every class *any* source file in
the project mentions is scanned and emitted into one project-wide
stylesheet, so whatever the expression produces is already defined. The
scan is cached and incremental.

The theme behind all of this is read from the project's own Tailwind
entry stylesheet by running Tailwind's resolver, rather than by parsing a
config file — the same discipline the conformance suite uses when it asks
Tailwind for its own class list instead of keeping a copy.

### StyleX frontend (experimental)

Hozo can also read a static same-file StyleX sheet into the same IR. This
works alongside Tailwind on one element and lowers through the ordinary Web
and Native backends:

```tsx
import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'

const styles = stylex.create({
  root: { padding: 16, backgroundColor: '#2563eb' },
  active: { opacity: 0.7 },
})

export function Card({ active }: { active: boolean }) {
  return <View className="rounded-xl" {...stylex.props(styles.root, active && styles.active)} />
}
```

The transform order is load-bearing: **Hozo must run before the official
StyleX transform**. Hozo consumes `stylex.props` from the original TSX; the
StyleX pass afterward eliminates the now-unused `stylex.create` definition.
Running StyleX first turns the spread into a second `className`, after which
JSX last-wins semantics have already lost the information needed to combine
the two frontends safely. Vite plugin order should therefore put `hozo()`
before the StyleX plugin; Metro's Hozo wrapper already sends its rewritten
source to the configured Babel transformer afterward.

The first slice accepts a namespace import, a same-file module-scope static
`stylex.create`, static string/number values, and
`stylex.props(styles.base, condition && styles.variant)`. It covers the common
universal layout, spacing, size, colour, opacity, radius and text properties,
including border/outline, text-decoration, blend, pointer and sizing keywords.
Against StyleX 0.19.0's published types that is **170/522 property names
(32.6%)**, including **116/116 (100%)** when the denominator is restricted to
names React Native also publishes and **13/13 (100%)** contextual-runtime
names. Web-only lowering is reported independently at **41/392 (10.5%)**. The
remaining surface is reported separately as 1 optional-adapter candidate and
the unmapped Web-only names. These are
property-name upper bounds: each
property still accepts only the statically safe value subset the shared IR can
represent.

The 522-name denominator and every mapped/unmapped claim live in the generated
`packages/tailwind-conformance/stylex-manifest.json`. Each entry records its
Universal, Contextual, Adapter, or Web-only lane and the implementation basis
for counting it. Conformance reports consume that manifest rather than parsing
Rust source formatting; a drift test regenerates it from pinned StyleX and
React Native types plus the frontend lowering table. After a deliberate
frontend or dependency change, refresh it with
`pnpm --filter @hozo/tailwind-conformance stylex:manifest`.

The first explicit Web-only slice covers closed-keyword appearance,
color-scheme, image-rendering, overflow/overscroll, print-color adjustment,
resize, scroll snap, scrollbar width/gutter, text rendering, and touch-action
longhands. Their CSS is differential-tested against the official StyleX
plugin. Native consumes the StyleX spread but emits
`WEB_ONLY_PROPERTY_ON_NATIVE` rather than silently dropping the declaration;
values outside the checked keyword grammar remain with official StyleX.
The second Web-only slice reuses existing typed IR for integer `order`,
axis-specific overflow, scroll behavior, physical/logical scroll margin and
padding longhands, and text indentation. This keeps their established
Tailwind lowering and Native refusal policy rather than introducing another
CSS-string path. StyleX shorthands remain residual until their atomic priority
against these longhands is modeled explicitly.

The contextual slice is currently Grid: static `gridTemplateColumns`/
`gridTemplateRows` tracks made from positive `fr`, non-negative `px`, or
`minmax(px, fr)` values (plus equal-track `repeat`), and integer line or
`auto`/equal-span/full-span item placement. On Native these reuse `HozoGrid`
and `HozoGridItem`; unsupported CSS Grid values remain with StyleX and produce
`STYLEX_NOT_LOWERED` instead of being approximated.
Static transition property, duration, and timing configuration also reaches
the existing Native interaction/ambient transition runtime. The accepted
subset is deliberately limited to properties and easing curves that runtime
can interpolate faithfully; other values remain with official StyleX.
Static `containerName` and `containerType` also reuse `HozoContainer` on
Native. The supported type subset is `normal`, `size`, and `inline-size`, and
the runtime currently accepts one conservative CSS identifier as its lookup
name. Multiple names and wider CSS syntax remain with official StyleX.
StyleX 0.19's default property-specificity mode is preserved for the supported
static slice. Hozo resolves the same four atomic priority tiers before entering
the shared IR, so physical longhands still beat later shorthands on both Web
and Native; conditional arguments retain their fallback and override behavior.
This is frontend-only work and adds no runtime priority machinery.

A mixed rule no longer makes its supported declarations all-or-nothing.
Hozo lowers the supported static properties and rebuilds the unsupported
properties as a residual inline `stylex.create`; the official transform
continues to own that residual, while its generated `className` is combined
with Hozo's class instead of replacing it. Conditional `props()` arguments
keep the same guards. If the residual overlaps a lowered property family, or
the rule contains an opaque object spread/computed key, Hozo keeps the original
call intact rather than approximating the cascade.

Themes/variables, nested selectors, keyframes, cross-file sheets, and `sx`
remain with StyleX. Direction-dependent logical/physical edge conflicts and
Grid shorthand/line conflicts also remain explicit `STYLEX_NOT_LOWERED` gaps:
their Native result needs runtime context or a more expressive Grid IR, so Hozo
does not approximate them.

## Accessibility

ARIA is the vocabulary. React Native has supported the `role` prop since
0.71, so a single `role="switch"` means the same thing to both backends;
`accessibilityRole` is still accepted and mapped where the two differ
(`header` → `heading`, `search` → `searchbox`, `image` → `img`,
`adjustable` → `slider`).

The role table is generated from
[`aria-query`](https://www.npmjs.com/package/aria-query) — the machine-readable
ARIA specification that `eslint-plugin-jsx-a11y` and Testing Library read —
rather than hand-kept, so it cannot quietly drift. With it the compiler can
say more than "that is not a role":

- an abstract role (`role="widget"`) is named as one, not rejected as unknown
- a role used without the states or properties it is meaningless without is
  reported as an incomplete pattern
- a role with no Web equivalent is reported rather than silently dropped

`@hozo/a11y` carries the patterns that need real runtime behaviour — focus
management, keyboard handling — starting with `Dialog`.

## Architecture

```
                       Application
                           │
             ┌─────────────┴─────────────┐
             │                           │
        @hozo/core                Existing RN code
             │                           │
             └─────────────┬─────────────┘
                           │
                           ▼
                    Hozo Compiler
                      (Rust core)
                           │
             ┌─────────────┼─────────────┐
             │             │             │
          Style IR    Semantic IR    Diagnostics
             │             │             │
             └─────────────┼─────────────┘
                           │
                       Hozo IR
                           │
             ┌─────────────┴─────────────┐
             │                           │
         Web backend                Native backend
             │                           │
        DOM + CSS + ARIA           React Native
        semantic HTML              View / Text
                                     StyleSheet
```

## Repository layout

```
packages/
  core/            @hozo/core        — canonical primitives for new projects
  compiler/        @hozo/compiler    — JS entry point over the Rust compiler
  runtime/         @hozo/runtime     — dynamic styles, interaction, a11y behaviour
  a11y/            @hozo/a11y        — accessibility patterns needing a runtime
  tailwind/        @hozo/tailwind    — the project's theme, resolved
  vite/            @hozo/vite        — Vite integration (Web backend)
  next/            @hozo/next        — Next.js integration, Turbopack and webpack
  metro/           @hozo/metro       — Metro integration (Native backend)
  storybook/       @hozo/storybook   — Storybook preset over @hozo/vite
  tailwind-conformance/              — differential tests against real Tailwind,
                                       and snapshot.json, the numbers CI holds

crates/
  hozo_ir/         platform-independent IR shared across the pipeline
  hozo_parser/     TSX analysis + Style IR construction (oxc)
  hozo_web/        Hozo IR -> DOM/CSS/ARIA lowering
  hozo_native/     Hozo IR -> React Native lowering
  hozo_cache/      project-wide candidate scan cache
  hozo_napi/       Node native binding (napi-rs)

examples/
  login-demo/            Vite, Web and SSR
  native-demo/           Metro bundle and Native runtime
  next-demo/             Next.js, both bundlers
  storybook-demo/        Storybook
  tanstack-start-demo/   TanStack Start

docs/
  proposal.md      full design document
  decisions/       settled questions, with the evidence behind them
```

## Development

Requires Node 22+, pnpm 11 and a Rust toolchain.

```sh
pnpm install
pnpm --filter @hozo/compiler build:native   # the Rust addon, once
pnpm build
pnpm test                                   # JS suites + package packing
cargo test --workspace                      # Rust suites
pnpm typecheck
```

The publishing metadata for all nine packages is generated by
`scripts/package-metadata.mjs`; `scripts/check-packages.mjs` re-derives it,
fails on drift, and then looks inside the tarballs `npm pack` would produce
to check every entry point is actually in them.

## What Hozo does not do yet

- **It is not published.** Nothing is on npm; the native addon is built
  locally.
- **Migration is manual.** An existing app adopting Hozo changes its
  imports at the boundary itself; there is no codemod.
- **No physical-device validation.** The Native backend is exercised
  through Metro bundles and `react-test-renderer`, not on a device.
- **The Grid subset is partial**, and the Tailwind surface is wide but not
  complete — `@hozo/tailwind-conformance` reports exactly which utilities
  match the real engine. Its current numbers are committed at
  [packages/tailwind-conformance/snapshot.json](packages/tailwind-conformance/snapshot.json),
  and CI fails if a change moves any of them without moving that file too.
  They are not repeated here: a number copied into prose is a number that
  can drift from the thing it describes.

## License

MIT — see [LICENSE](LICENSE).
