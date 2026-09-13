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
