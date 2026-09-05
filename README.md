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
importing from `react-native`), typography from `@hozo/typography`, and
semantic landmarks from `@hozo/semantics`. Hozo lowers those primitives to semantic
HTML5 DOM and CSS on Web, or to React Native components and `StyleSheet` values
on Native. Foundation primitives are completely zero-runtime and safe for static
SSR and React Server Components (RSC) without `'use client'`.

Hozo is a compilation layer rather than a heavyweight component framework. Its Web
output is designed to keep React Native for Web off compiled paths while
preserving React Native's component and event contracts where practical.

Accessibility is a requirement from v1, not an add-on. Every primitive and behavior
is verified against canonical WAI-ARIA and platform accessibility models.

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
Against StyleX 0.19.0's published types that is **451/522 property names
(86.4%)**, including **134/134 (100%)** when the denominator includes both
React Native's published keys and exact compile-time Native equivalents, and
**21/21 (100%)** contextual-runtime names. Web-only lowering is reported
independently at **296/366 (80.9%)**. The
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

Property names are no longer the only StyleX score. The executable practical
corpus currently measures **288/288 (100%)** representative values, **16/16
(100%)** common authoring constructs, and **249/249 (100%)** declarations after
weighting the same values across Card, Typography, Input, Scroll, Motion, Grid,
and Border scenarios. Every representative value runs the Hozo Web and Native
compilers and counts only when Web agrees with the official StyleX Babel output
and Native either lowers faithfully or follows the entry's explicit Web-only policy.
Unsupported cases may remain official residuals, but do not earn coverage.
The current corpus has zero silent failures.

Generated `content` supports the exact common static subset: `normal`, `none`,
quoted strings, and quote-control keywords. Function forms such as `attr()` and
`counter()` remain with the official StyleX compiler until their wider grammar
and pseudo-element use are represented without accepting arbitrary CSS text.

Static StyleX `textShadow` values are portable when they are `none` or one
explicitly coloured layer whose offsets and optional blur use px/zero. Web
keeps the authored CSS semantics; Native expands the declaration to
`textShadowColor`, `textShadowOffset`, and `textShadowRadius`. Multi-layer,
relative-unit, and dynamic values remain with the official StyleX transform.
Portable `placeContent` similarly expands common flex alignment values into
independent `alignContent` and `justifyContent` slots on both platforms.

StyleX's standalone `translate`, `rotate`, and `scale` properties use typed IR
instead of becoming Web-only CSS strings. Web preserves their authored
component count and agrees with the official atomic CSS; Native composes them
into its transform array in CSS's fixed translate-rotate-scale order. The
portable subset covers one- or two-axis px/% translation, degree rotation, and
one- to three-axis numeric/percentage scale. Wider syntax remains residual.

Common animation control longhands are exact Web-only declarations:
composition, signed delay, direction, fill mode, non-negative iteration count,
play state, and keyword, `cubic-bezier()`, or `steps()` timing functions. Native
consumes them with an explicit Web-only diagnostic rather than implying that
arbitrary CSS keyframes run on React Native. A module-scope static
`stylex.keyframes` referenced by
`animationName` is carried in typed IR, content-hashed, hoisted once on Web,
and follows the same explicit Native refusal policy; exported sheets carry it
through the project module registry. Static keyframe references also preserve
the official fallback order in `firstThatWorks(...)` and value arrays. Dynamic
keyframes, simultaneous animation-name lists, and wider easing syntax remain with the
official StyleX compiler. Practical single `animationRange`, `scrollTimeline`, and
`viewTimeline` shorthands expand into independently ranked longhand slots on Web;
lists and dynamic timeline functions remain residual.

Common Web compositing and 3D controls lower without runtime CSS parsing:
`clipPath`, `perspective`, `perspectiveOrigin`, `transformBox`,
`transformStyle`, and `willChange`. Their accepted static grammar is validated
and Native refusal remains explicit. `backdropFilter` deliberately remains the
scorecard's adapter candidate until it has a real BlurView/Expo adapter; Web-only
output is not counted as a Native adapter implementation.

The common mask longhands are exact Web-only declarations: prefixed and
standard mask images, mode, repeat, position, size, origin, clip, composite,
and type. The accepted subset includes ordinary URLs and gradients, layered
keyword values, and static length/percentage positions and sizes. Wider image
functions, variables, the `mask` shorthand, and mask-border remain with the
official StyleX compiler instead of being approximated.

Static motion paths and float shapes cover the common `offsetAnchor`,
`offsetDistance`, `offsetPath`, `offsetPosition`, and `offsetRotate` longhands,
plus physical `float`/`clear`, `shapeOutside`, `shapeMargin`, and
`shapeImageThreshold`. Safe paths, rays, basic shapes, positions, angles, and
lengths lower exactly on Web. Direction-relative float values, calculations,
newer shape syntax, and the `offset` shorthand remain official residuals.

Common border-image longhands cover `borderImageSource`, `borderImageSlice`,
`borderImageWidth`, `borderImageOutset`, and `borderImageRepeat`. Ordinary URLs
and gradients, `fill`, static number/length/percentage lists, and repeat
keywords lower exactly on Web. The `borderImage` shorthand, wider image
functions, calculations, and variables remain with the official StyleX
compiler; Native refusal remains explicit.

Implicit browser Grid now covers `gridAutoColumns`, `gridAutoRows`,
`gridAutoFlow`, and `gridTemplateAreas`. Static track sizes, dense flow, and
rectangular named-area templates lower exactly on Web and fail explicitly on
Native. Calculated or repeated implicit tracks, variables, and non-rectangular
area definitions remain with the official StyleX compiler.

The static construct slice now flattens recursive `stylex.props` arrays,
preserves logical and ternary guards, and expands module-local `const` object
literals used only through object spreads. A mutable, exported, late-declared,
escaped, or dynamically produced spread stays with the official StyleX pass.
Static `stylex.firstThatWorks(...)` candidates for one typed property also
lower without losing the fallback: Web emits the official reverse declaration
order, while Native selects the first candidate its style model can represent.
Dynamic, empty, multi-declaration, or mismatched candidates remain residual.

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
CSS-string path. The common `columns`, `columnRule`, and `listStyle`
shorthands expand to their final Web-only slots before atomic priority is
resolved. Physical `scrollMargin` and `scrollPadding` expand their exact
one-to-four-value box syntax; their `Block` and `Inline` counterparts expand
one or two values along the logical axis. Ambiguous or wider values remain
residual.

The layout shorthand slice expands `flexFlow`, `gridGap`, `gridRowGap`, and
`gridColumnGap` into the same typed properties React Native already carries,
so the aliases work on both platforms without runtime code. `container`
expands into the existing contextual name/type IR. Their shorthand/longhand
priority is resolved per final property slot, including conditional rules.

The border-axis slice covers the width, style, and color longhands that the
official StyleX compiler actually emits. Logical width and color aliases lower
to existing Native edge properties. Side-specific styles remain exact on Web
and fail explicitly on Native, whose single `borderStyle` cannot preserve
different styles per edge. The compound `border`/`borderTop` family remains
unmapped because StyleX 0.19 itself rejects those shorthands in its default
property-specificity mode.

The contextual slice is currently Grid: static `gridTemplateColumns`/
`gridTemplateRows` tracks made from positive `fr`, non-negative `px`, or
`minmax(px, fr)` values (plus equal-track `repeat`), and integer line or
`auto`/equal-span/full-span item placement. A four-line numeric `gridArea`
shorthand expands to row/column start/end and shares the same Native path. A track-only
`gridTemplate` similarly splits rows from columns. On Native these reuse `HozoGrid`
and `HozoGridItem`; unsupported CSS Grid values remain with StyleX and produce
`STYLEX_NOT_LOWERED` instead of being approximated.
Static transition property, duration, delay, and timing configuration also reaches
the existing Native interaction/ambient transition runtime. The accepted
subset is deliberately limited to properties and easing curves that runtime
can interpolate faithfully. The practical single-transition shorthand expands
to all four reset slots on both platforms, and Native passes its delay through
to `Animated.timing`; lists, negative delays, and wider easing syntax remain
with official StyleX.
Static `container`, `containerName`, and `containerType` also reuse `HozoContainer` on
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

Static sheets may live in another file and pass through named, star, or
namespace re-export chains. Vite, Next, and Metro feed their authoritative
alias resolution into the shared module registry; Metro keeps those answers
separate per platform. Unsupported members remain with official StyleX.

`createTheme`, keyframes, unsupported nested selectors/at-rules, and `sx`
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

`@hozo/behaviors` carries the headless primitives that need real runtime behaviour — focus
management, keyboard handling, floating positioning, and hover delay groups.

All 39 Storybook stories are continuously checked against `axe-core` in CI,
catching automated regressions in contrast, structural ARIA syntax, and roles
with zero violations. Full accessibility conformance still requires manual
screen reader testing (VoiceOver, TalkBack, NVDA).

## Three-Layer Component Hierarchy

Hozo organizes universal UI across three clean layers, maximizing compile-time
static guarantees and minimizing runtime overhead:

```
┌───────────────────────────────────────────────────────────────┐
│ Layer 3: Universal Components (Compound Compositions)         │
│   Dialog · Popover · Menu · Tabs · Toolbar · Radio · Tooltip  │
│   Composed from Layer 1 primitives + Layer 2 behaviors        │
└───────────────────────────────────────────────────────────────┘
                               ▲
┌───────────────────────────────────────────────────────────────┐
│ Layer 2: Universal Behaviors (Minimal Runtime, @hozo/behaviors)│
│   FocusScope · DismissableLayer · Portal · RovingFocus        │
│   FloatingPositioner · LiveRegion · useHoverTrigger           │
│   Safe Polygon · DelayGroupMachine (Warmup/Cooldown)          │
└───────────────────────────────────────────────────────────────┘
                               ▲
┌───────────────────────────────────────────────────────────────┐
│ Layer 1: Universal Primitives (Zero Runtime / Static SSR Safe)│
│   @hozo/core        View, Text, Pressable, Link, FlatList     │
│   @hozo/typography  Heading, Paragraph, Strong, Ruby, Rt      │
│   @hozo/semantics   Main, Header, Footer, Aside, Nav, Time    │
└───────────────────────────────────────────────────────────────┘
```

- **Layer 1 (Zero-Runtime Primitives)**: Lower directly to native HTML5 tags on Web and foundational primitives on React Native. Completely safe for static SSR / React Server Components (RSC) without `'use client'`.
- **Layer 2 (Universal Behaviors)**: Minimal headless runtime behavior units. The compiler statically removes what is knowable at build time (e.g. static initial focus, build-time ARIA IDs, static sibling `inert` for portals).
- **Layer 3 (Universal Components)**: Accessible compound components composed strictly from Layer 1 and Layer 2.

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
  core/            @hozo/core        — canonical primitives and compound components
  compiler/        @hozo/compiler    — JS entry point over the Rust compiler
  runtime/         @hozo/runtime     — dynamic styles, interaction, behavior
  behaviors/       @hozo/behaviors   — headless behaviors and floating positioning
  typography/      @hozo/typography  — universal typography, ruby, and inline formatting
  semantics/       @hozo/semantics   — document structure, landmarks, disclosures
  canvas/          @hozo/canvas      — declarative 2D scene graph (Web Canvas & Skia)
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
  storybook-demo/        Storybook (39 stories, CI axe-core automated audit)
  tanstack-start-demo/   TanStack Start

docs/
  proposal.md      full design document
  decisions/       settled questions, with the evidence behind them
  rfcs/            technical specifications and AT verification matrices
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

The publishing metadata for all twelve packages is generated by
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
