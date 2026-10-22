---
title: "StyleX"
description: "Reading StyleX sheets into the same compiler, beside Tailwind."
sidebar:
  order: 3
---

Hozo can also read a static StyleX sheet into the same IR. This works alongside
Tailwind on one element and lowers through the ordinary Web and Native backends:

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

## Transform order

The transform order is load-bearing: **Hozo must run before the official
StyleX transform**. Hozo consumes `stylex.props` from the original TSX; the
StyleX pass afterward eliminates the now-unused `stylex.create` definition.
Running StyleX first turns the spread into a second `className`, after which
JSX last-wins semantics have already lost the information needed to combine
the two frontends safely. Vite plugin order should therefore put `hozo()`
before the StyleX plugin; Metro's Hozo wrapper already sends its rewritten
source to the configured Babel transformer afterward.

## Coverage and conformance

The frontend accepts a namespace import, a static `stylex.create`, static
string/number values, and `stylex.props(styles.base, condition && styles.variant)`.
It covers the common universal layout, spacing, size, colour, opacity, radius
and text properties, including border/outline, text-decoration, blend, pointer
and sizing keywords. Against StyleX 0.19.0's published types that is **505/522
property names (96.7%)**, including **134/134 (100%)** when the denominator
includes both React Native's published keys and exact compile-time Native
equivalents, and **21/21 (100%)** contextual-runtime names. Web-only lowering is
reported independently at **349/366 (95.4%)**. The reviewed compiler-relevant
surface is **504/504 (100%)**. Including optional platform adapters it is
**505/505 (100%)**: `backdropFilter` uses an opt-in Native component adapter.
The other 17 published names are not current compiler work: StyleX itself
deliberately disallows 13 shorthands in its default mode, two are `@font-face`
descriptors, and two are obsolete or non-standard. These are property-name upper
bounds: each property still accepts only the statically safe value subset the
shared IR can represent.

The 522-name denominator and every mapped/unmapped claim live in the generated
`packages/tailwind-conformance/stylex-manifest.json`. Each entry records its
Universal, Contextual, Adapter, or Web-only lane and the implementation basis
for counting it. Conformance reports consume that manifest rather than parsing
Rust source formatting; a drift test regenerates it from pinned StyleX and
React Native types plus the frontend lowering table. After a deliberate
frontend or dependency change, refresh it with
`pnpm --filter @hozo/tailwind-conformance stylex:manifest`.

Property names are no longer the only StyleX score. The executable practical
corpus currently measures **349/349 (100%)** representative values, **19/19
(100%)** common authoring constructs, and **271/271 (100%)** declarations after
weighting the same values across Card, Typography, Input, Scroll, Motion, Grid,
and Border scenarios. Every representative value runs the Hozo Web and Native
compilers and counts only when Web agrees with the official StyleX Babel output
and Native either lowers faithfully or follows the entry's explicit Web-only policy.
Unsupported cases may remain official residuals, but do not earn coverage.
The current corpus has zero silent failures.

## Universal and portable properties

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

## Contextual runtime and adapter properties

The contextual slice covers CSS Grid, container queries, and transitions on both platforms:

- **CSS Grid:** static `gridTemplateColumns` / `gridTemplateRows` tracks made from positive `fr`, non-negative `px`, or `minmax(px, fr)` values (plus equal-track `repeat`), and integer line or `auto`/equal-span/full-span item placement. A four-line numeric `gridArea` shorthand expands to row/column start/end and shares the same Native path. A track-only `gridTemplate` or `grid: "rows / columns"` similarly splits rows from columns. On Native these reuse `HozoGrid` and `HozoGridItem`; on Web `grid` additionally emits the shorthand's required initial resets for template areas, implicit tracks, and auto-flow. Unsupported CSS Grid values remain with StyleX and produce `STYLEX_NOT_LOWERED` instead of being approximated.
- **Transitions:** static transition property, duration, delay, and timing configuration reaches the existing Native interaction/ambient transition runtime. The accepted subset is deliberately limited to properties and easing curves that runtime can interpolate faithfully. The practical single-transition shorthand expands to all four reset slots on both platforms, and Native passes its delay through to `Animated.timing`; lists, negative delays, and wider easing syntax remain with official StyleX.
- **Container queries:** static `container`, `containerName`, and `containerType` reuse `HozoContainer` on Native. The supported type subset is `normal`, `size`, and `inline-size`, and the runtime currently accepts one conservative CSS identifier as its lookup name. Multiple names and wider CSS syntax remain with official StyleX.
- **Backdrop blur adapter:** a single static non-negative `backdropFilter: 'blur(Npx)'` on an ordinary View lowers through an opt-in Native component adapter; `none` is a no-op. Expo integration is supplied as a factory without making `expo-blur` a Hozo dependency. CSS blur radius and Expo intensity are different scales, so their mapping is explicitly configurable.

## Web-only properties and Native diagnostics

Declarations that have no React Native equivalent lower on the Web and emit
`WEB_ONLY_PROPERTY_ON_NATIVE` on React Native rather than silently dropping the
declaration:

- **Content and carets:** generated `content` supports `normal`, `none`, quoted strings, and quote-control keywords (function forms such as `attr()` and `counter()` remain with official StyleX). The `caret` shorthand expands into independently ranked `caret-color` and `caret-shape` slots on Web and is refused explicitly on Native.
- **Font shorthand:** the common single-family `font` shorthand lowers on Web for optional normal/italic style, numeric or keyword weight, a static size, optional line-height, and one identifier or quoted family, preserving its reset behavior.
- **Keyframes and animation controls:** common animation longhands (composition, signed delay, direction, fill mode, iteration count, play state, and keyword, `cubic-bezier()`, or `steps()` timing functions) and module-scope static `stylex.keyframes` referenced by `animationName` are carried in typed IR, content-hashed, and hoisted once on Web; exported sheets carry keyframes through the project module registry. Practical single `animationRange`, `scrollTimeline`, and `viewTimeline` shorthands expand into independently ranked longhand slots on Web.
- **Compositing, masks, and border images:** `clipPath`, `perspective`, `perspectiveOrigin`, `transformBox`, `transformStyle`, `willChange`, mask longhands and single-layer `mask` / `maskBorder` shorthands, and `borderImage*` longhands / `borderImage` shorthand are validated and lowered on Web.
- **Anchor placement, corner shapes, motion paths, and implicit Grid:** `positionArea`, `positionTry*`, `cornerShape` keywords (`round`, `scoop`, `bevel`, `notch`, `square`, `squircle`), `offset*` motion paths, `float`/`clear`, `shapeOutside`/`shapeMargin`/`shapeImageThreshold`, and implicit browser Grid (`gridAutoColumns`, `gridAutoRows`, `gridAutoFlow`, `gridTemplateAreas`) lower on Web with explicit Native refusal.
- **Browser UI and scrolling:** closed-keyword appearance, color-scheme, image-rendering, overflow/overscroll, print-color adjustment, resize, scroll snap, scrollbar width/gutter, text rendering, touch-action, integer `order`, scroll behavior, physical/logical `scrollMargin` and `scrollPadding`, text indentation, and `columns` / `columnRule` / `listStyle` shorthands.

## Priority, constructs, and partial lowering

StyleX 0.19's default property-specificity mode is preserved for the supported
static slice. Hozo resolves the same four atomic priority tiers before entering
the shared IR, so physical longhands still beat later shorthands on both Web
and Native; conditional arguments retain their fallback and override behavior.
This is frontend-only work and adds no runtime priority machinery.

The static construct slice flattens recursive `stylex.props` arrays,
preserves logical and ternary guards, and expands module-local `const` object
literals used only through object spreads. Static `stylex.firstThatWorks(...)`
candidates for one typed property also lower without losing the fallback: Web
emits the official reverse declaration order, while Native selects the first
candidate its style model can represent.

A mixed rule does not make its supported declarations all-or-nothing.
Hozo lowers the supported static properties and rebuilds the unsupported
properties as a residual inline `stylex.create`; the official transform
continues to own that residual, while its generated `className` is combined
with Hozo's class instead of replacing it. Conditional `props()` arguments
keep the same guards. If the residual overlaps a lowered property family, or
the rule contains an opaque object spread/computed key, Hozo keeps the original
call intact rather than approximating the cascade.

## Cross-file sheets and re-exports

Static sheets may live in another file and pass through named, star, or
namespace re-export chains. Vite, Next, and Metro feed their authoritative
alias resolution into the shared module registry; Metro keeps those answers
separate per platform. Unsupported members remain with official StyleX.

`createTheme`, dynamic keyframes, unsupported nested selectors/at-rules, and `sx`
remain with StyleX. Direction-dependent logical/physical edge conflicts and
Grid shorthand/line conflicts also remain explicit `STYLEX_NOT_LOWERED` gaps:
their Native result needs runtime context or a more expressive Grid IR, so Hozo
does not approximate them.

The [StyleX page](../../../stylex/) shows sample sheets beside what each backend
makes of them, and the [Conformance Matrix](../../../conformance/) tracks live
property and value counts.
