# @hozo/svg

Universal SVG primitives with one namespace on Web and React Native.

```tsx
import { Svg } from '@hozo/svg'

export function Mark() {
  return (
    <Svg viewBox="0 0 24 24" accessibilityLabel="Complete">
      <Svg.Circle cx={12} cy={12} r={10} />
      <Svg.Path d="M8 12l3 3 5-5" />
    </Svg>
  )
}
```

The Web compiler lowers the namespace to intrinsic SVG elements. Native lowering imports the
matching components from this package, whose `react-native` condition delegates to
`react-native-svg`. Install `react-native-svg` 15.9.0 or newer only in projects that render SVG
on Native. The minimum includes upstream's implemented shadow and composite filters; earlier
15.x versions had warning-only stubs. See the [upstream release](https://github.com/software-mansion/react-native-svg/releases/tag/v15.9.0).

`Svg.Link` is a semantic SVG anchor on Web and a router-aware pressable group on Native. It uses
the same navigation provider as `@hozo/navigation`.

## Filters

The fallback namespace and compiler expose the filter subset backed by Native upstream:

- `Svg.Filter`: definition and region.
- `Svg.FeColorMatrix`, `Svg.FeGaussianBlur`: color transforms and blur.
- `Svg.FeOffset`, `Svg.FeFlood`, `Svg.FeComposite`, `Svg.FeBlend`: position, paint, compositing and blending.
- `Svg.FeMerge`, `Svg.FeMergeNode`: ordered input merging.
- `Svg.FeDropShadow`: a compact shadow effect (upstream composes it from the other effects on Native).

Define effects inside `Svg.Defs` and reference the filter by its ID:

```tsx
<Svg viewBox="0 0 80 80">
  <Svg.Defs>
    <Svg.Filter id="soft-gray" x="-20%" y="-20%" width="140%" height="140%">
      <Svg.FeColorMatrix in="SourceGraphic" type="saturate" values="0" result="gray" />
      <Svg.FeGaussianBlur in="gray" stdDeviation="2" />
    </Svg.Filter>
  </Svg.Defs>
  <Svg.Circle cx={40} cy={40} r={20} fill="#2563eb" filter="url(#soft-gray)" />
</Svg>
```

For a shadow, replace the filter's children with:

```tsx
<Svg.FeDropShadow
  in="SourceGraphic"
  dx={2}
  dy={3}
  stdDeviation="2"
  floodColor="#000000"
  floodOpacity={0.4}
/>
```

Use explicit shadow parameters for predictable output. To build your own graph, assign
`result` names and reference them through `in` and `in2`. Put `Svg.FeMergeNode` children inside
`Svg.FeMerge`; their order determines the merge order, and their `in` values select the inputs.

Web uses the browser's SVG filter implementation. Native delegates to `react-native-svg`
(validated against 15.15.5), including its limitations: Gaussian blur's `edgeMode` is not
implemented there; use the default `none`. Native `FeBlend` supports `normal`, `multiply`,
`screen`, `darken` and `lighten`, not the full browser blend-mode vocabulary. Specify bounds
large enough for the blur to avoid clipping at the filter region. Filters can allocate
offscreen surfaces; apply them to the smallest useful region rather than the entire scene.

The conformance report derives the filter-family denominator from upstream's public exports.
Its Web and Native sections measure API, compiler and import routing, **not pixel equivalence
or device rendering**. Upstream Native warning-only stubs are listed separately, not counted
as implemented. Other filter-family members are not exposed by Hozo yet.

Run `pnpm --filter @hozo/tailwind-conformance report` from the repository root to reproduce it.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
