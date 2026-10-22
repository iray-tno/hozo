---
title: "Universal SVG (@hozo/svg)"
description: "One Svg namespace and Icon primitive for Web and React Native, with cross-platform SVG filters."
sidebar:
  order: 1
---

`@hozo/svg` provides universal SVG primitives with one namespace across Web and React Native.

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

On the Web, the compiler lowers the `Svg` namespace directly to intrinsic HTML SVG elements (`<svg>`, `<circle>`, `<path>`, and so on) with zero runtime wrapper. On React Native, lowering imports the matching components from `@hozo/svg`, whose `react-native` export condition delegates to `react-native-svg`.

Install `react-native-svg` (`15.9.0` or newer) only in projects that render SVG on React Native:

```sh
pnpm add @hozo/svg
# On React Native only:
npx expo install react-native-svg
```

`Svg.Link` is a semantic `<a href>` inside the SVG on the Web and a router-aware pressable group on React Native, connected to the same [`@hozo/navigation`](../../reference/navigation/) provider as `Link` and `Button href`.

## Icons (`Icon`)

`Icon` draws an icon from data as an inline `<svg>` on the Web and `react-native-svg` on React Native:

```tsx
import { Icon } from '@hozo/svg'
import { Search, Wifi } from 'lucide' // or the set's per-icon module on Metro

<Icon icon={Search} size={16} />                     // beside a word: decorative, hidden
<Icon icon={Wifi} accessibilityLabel="Connected" />  // the information itself: an image
```

- **No icon set is bundled.** `icon` takes the `IconNode` tuple shape that `lucide` exports for every icon (`[['path', { d }], ['circle', { cx, cy, r }], …]`). Your application brings the icon set it chose and imports only the icons it uses — crucial on Metro, which does not tree-shake barrel modules.
- **Decorative unless named.** Without `accessibilityLabel`, an icon is `aria-hidden="true"` on the Web and hidden from TalkBack and VoiceOver on React Native. With `accessibilityLabel`, it becomes `role="img"` with a `<title>` on the Web and an accessible `image` element on React Native.
- **Colour.** On the Web, `Icon` strokes with `currentColor`, inheriting the surrounding text colour. React Native does not cascade text colour into a `View`, so pass `color` explicitly when you want a non-black stroke on device.

## Cross-platform SVG filters

`@hozo/svg` exposes the filter subset backed by both browser SVG engines and `react-native-svg` (`15.9.0+`):

- **`Svg.Filter`:** filter definition and region bounds (`x`, `y`, `width`, `height`).
- **`Svg.FeColorMatrix` & `Svg.FeGaussianBlur`:** colour matrix transforms and Gaussian blur.
- **`Svg.FeOffset`, `Svg.FeFlood`, `Svg.FeComposite` & `Svg.FeBlend`:** positioning, solid floods, Porter-Duff compositing, and blending (`normal`, `multiply`, `screen`, `darken`, `lighten`).
- **`Svg.FeMerge` & `Svg.FeMergeNode`:** ordered multi-input merging.
- **`Svg.FeDropShadow`:** compact shadow effect (composed from the primitives above on Native).

Define filter graphs inside `Svg.Defs` and reference them by `id`:

```tsx
<Svg viewBox="0 0 80 80" decorative>
  <Svg.Defs>
    <Svg.Filter id="soft-gray" x="-20%" y="-20%" width="140%" height="140%">
      <Svg.FeColorMatrix in="SourceGraphic" type="saturate" values="0" result="gray" />
      <Svg.FeGaussianBlur in="gray" stdDeviation="2" />
    </Svg.Filter>
  </Svg.Defs>
  <Svg.Circle cx={40} cy={40} r={20} fill="#2563eb" filter="url(#soft-gray)" />
</Svg>
```

### Android blur radius compensation

On Android, Hozo compensates `FeGaussianBlur` and `FeDropShadow` for screen density, root `viewBox` scaling, and the difference between SVG standard deviation ($\sigma$) and Android's RenderScript blur radius (derived from AOSP's `rsCpuIntrinsicBlur.cpp` implementation). Fixed numeric viewports need no layout measurement; responsive viewports use their measured native root bounds. iOS uses upstream's Core Image filter directly.

 Note the platform limits of `react-native-svg` on Android:
- Android uses a single isotropic kernel (taking the larger of X/Y deviation) with a maximum radius of 25 bitmap pixels (~10.6px $\sigma$).
- `edgeMode` on `FeGaussianBlur` is not implemented upstream on React Native; keep the default `none` and specify filter region bounds (`x`, `y`, `width`, `height`) wide enough to avoid clipping the blur.

## See it live

- **[Universal SVG showcase](../../../svg/):** interactive filter studio and side-by-side specimens.
- **[Conformance Matrix](../../../conformance/):** live filter element coverage across Web and React Native.
