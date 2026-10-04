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
`react-native-svg`. Install `react-native-svg` only in projects that render SVG on Native.

`Svg.Link` is a semantic SVG anchor on Web and a router-aware pressable group on Native. It uses
the same navigation provider as `@hozo/navigation`.

## Filters

`Svg.Filter`, `Svg.FeColorMatrix` and `Svg.FeGaussianBlur` are exposed in the fallback namespace
and compiler output. Define effects inside `Svg.Defs` and reference the filter by its ID:

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

Web uses the browser's SVG filter implementation. Native delegates to `react-native-svg`
(validated against 15.15.5), including its limitations: Gaussian blur's `edgeMode` is not
implemented there; use the default `none`. Specify bounds large enough for the blur to avoid
clipping at the filter region. Filters can allocate offscreen
surfaces; apply them to the smallest useful region rather than the entire scene.

The conformance report derives the filter-family denominator from upstream's public exports.
Its Web and Native sections measure API, compiler and import routing, **not pixel equivalence
or device rendering**. Upstream Native warning-only stubs are listed separately, not counted
as implemented. Other filter-family members are not exposed by Hozo yet.

Run `pnpm --filter @hozo/tailwind-conformance report` from the repository root to reproduce it.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
