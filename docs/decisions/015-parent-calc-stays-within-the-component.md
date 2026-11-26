# 15. Parent-relative `%` `calc()` stays within the component; cross-component layouts use `@container`

**Status:** decided
**Date:** 2026-11-26
**Issue:** #2294

## Why

React Native's Yoga layout engine evaluates plain percentages (`width: '50%'`)
natively, but cannot parse CSS math expressions that mix percentages with
lengths (`calc(100% - 2rem)`, `clamp(200px, 50%, 400px)`).

Hozo lowers two opt-in layout-measured cases accurately without adding wrapper
`View`s:

1. **Self-sized and `@container`-backed expressions** (#2312):
   - `translate*`, `rounded*`, `gap*`, and `HozoGrid` column tracks resolve `%`
     against the element's own `onLayout` box (`HozoSelfMeasured` / `HozoGrid`).
   - `cqw`/`cqh`/`cqi`/`cqb`/`cqmin`/`cqmax` resolve against the nearest
     `@container` (`HozoContainer` + `HozoContainerSizeQuery`).
2. **Same-component parent-relative expressions** (#2317):
   - When a child and its direct parent live in the same component (and the
     parent is a single layout-reporting host, not `ScrollView`/`FlatList`,
     `HozoGrid`, or `display: contents`), the compiler promotes the parent to
     `HozoMeasuredParent`.
   - Because `HozoMeasuredParent` receives the parent's `style` prop directly,
     it flattens border widths, padding insets, and `flexDirection`, publishing
     exact content-box (`width`/`height`), padding-box (`paddingBoxWidth` /
     `paddingBoxHeight`), and main-axis (`mainAxisSize`) measurements via
     `HozoParentSizeQuery`.

That leaves one open question from #2294 (Phase 3, Slice 3.3): **when an element
using `w-[calc(100%-2rem)]` (or `h`, `m*`, `p*`, `basis`, `inset*`) is a
component root or sits under a custom component boundary, should Hozo fall back
to React Native Fabric's `ref.current?.parentElement?.clientWidth` inside
`useLayoutEffect`?**

## Evidence (`react-native@0.87.1`)

Checked directly against the installed `react-native@0.87.1` type declarations
(`node_modules/react-native/types/public/ReactNativeTypes.d.ts`, lines 182–255)
and guarded by
`packages/tailwind-conformance/src/fabric-parent-calc.test.ts`:

- **What Fabric exposes on `HostInstance = ReactNativeElement extends ReadOnlyElement`:**
  - `parentElement: null | ReadOnlyElement`
  - `clientWidth: number`, `clientHeight: number` (padding box: border-box minus border)
  - `clientLeft: number`, `clientTop: number` (border widths)
  - `getBoundingClientRect(): DOMRect` (border box)
- **What `react-native@0.87.1` does NOT expose:**
  - **No `getComputedStyle` / content-box API.** `parentElement.clientWidth` and
    `clientHeight` include the parent's padding, and `ReadOnlyElement` exposes
    neither the parent's resolved padding insets nor its `flexDirection`.
    - **Measured drift on any padded parent:** for a `300px`-wide card with
      `p-4` (`16px` left + `16px` right padding), the CSS content box is
      `268px`, so `w-[calc(100%-2rem)]` (`2rem = 32px`) must resolve to
      `236px`. `HozoMeasuredParent` computes `268 - 32 = 236px`. Reading
      `parentElement.clientWidth - 32` computes `300 - 32 = 268px` — overflowing
      the intended width by `32px` (100% of the parent's horizontal padding),
      and overflowing the content box altogether whenever the subtracted term is
      smaller than the parent's padding (e.g. `w-[calc(100%-8px)]` produces
      `292px` inside a `268px` content box).
    - For `basis-[calc(...)]`, a cross-component child cannot determine whether
      its parent is `flex-row` or React Native's default `flex-col`.
  - **No `ResizeObserver`.** Reading `parentElement.clientWidth` in
    `useLayoutEffect` (even combined with a `Dimensions` window listener) misses
    every parent resize that does not re-render the child or resize the window —
    collapsible sidebars, split panes, animated container widths, sibling growth,
    or orientation-independent layout shifts. Because the child's computed style
    sets an explicit numeric `width`/`height`, the child's own `onLayout` does
    not fire when the parent grows or shrinks around it, leaving the child
    permanently stuck at a stale pixel size.

## Decision

**Do not emit a Fabric `parentElement.clientWidth` fallback across component
boundaries.**

1. **Same-component parents measure via `HozoMeasuredParent`** (#2317), which
   has access to the parent's `onLayout` and resolved `style` (exact content-box,
   padding-box, and `flexDirection`, plus live updates on any parent resize).
2. **Cross-component or non-box parents stay refused at compile time** with
   `WEB_ONLY_PROPERTY_ON_NATIVE` and an actionable message pointing to:
   - `@container` on the ancestor + `cqw`/`cqh` (`w-[calc(100cqw-2rem)]`), which
     crosses arbitrary component boundaries with live `onLayout` updates and
     explicit container-box semantics;
   - keeping the parent `<View>` in the same component; or
   - flex / viewport sizing (`flex-1`, `w-[calc(100vw-2rem)]`, or container
     padding).
3. **Auto-height `grid-rows-[calc(...)]` stays refused** because `HozoGrid`
   derives its total height from its row tracks; evaluating `%` row tracks
   against an indefinite auto height would be self-referential (indefinite in
   CSS Grid as well).
4. **Keep the revisit trigger in tests.**
   `packages/tailwind-conformance/src/fabric-parent-calc.test.ts` checks
   `react-native/types` on every run so a React Native upgrade that adds
   `ResizeObserver` or `getComputedStyle` fails loudly and prompts a
   re-evaluation.

## Rejected

- **Ship `useLayoutEffect` + `parentElement.clientWidth` by default.** Silently
  overflows padded containers by the parent's full padding and goes stale on any
  non-window parent resize. Silent layout drift contradicts Hozo's rule of
  refusing honestly where Native cannot match Web semantics.
- **Ship `parentElement.clientWidth` only for `position: 'absolute'` insets.**
  Even though `absolute` insets use the padding box (matching `clientWidth` /
  `clientHeight`), the missing `ResizeObserver` still leaves positioned children
  stale whenever the parent resizes without re-rendering the child.
- **Inject a wrapper `View` to measure available space.** Violates Yoga flex
  semantics (`flex`, `gap`, `alignSelf`, `flexGrow`, and `HozoGrid` direct-child
  inspection all break when an extra `View` sits between parent and child).

## Revisit

Reopen this decision when React Native ships **both**:

1. A parent-resize subscription API (`ResizeObserver` or equivalent on Fabric
   `ReadOnlyElement`) so cross-component children update when a parent resizes
   without a window resize; and
2. A way to read the parent's content box (resolved padding insets and
   `flexDirection`, via `getComputedStyle` or content-box getters on
   `ReadOnlyElement`).
