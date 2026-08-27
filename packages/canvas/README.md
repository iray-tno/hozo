# @hozo/canvas

Declarative retained-mode Canvas scenes for Hozo. The same scene is drawn with
the browser's built-in Canvas 2D API on Web and `@shopify/react-native-skia` on
React Native.

```tsx
import { Canvas } from '@hozo/canvas'

export function Sparkline() {
  return (
    <Canvas
      width={320}
      height={120}
      viewBox={[0, 0, 100, 40]}
      accessibilityLabel="Revenue increased over the last six months"
    >
      <Canvas.Path
        path="M 0 36 L 20 30 L 40 32 L 60 18 L 80 20 L 100 4"
        stroke="#2563eb"
        strokeWidth={2}
        fill="none"
      />
    </Canvas>
  )
}
```

Canvas pixels are not semantic content. Every root must therefore either have
an `accessibilityLabel`, provide an `accessibleFallback` (for example a data
table), or opt out explicitly with `decorative`.

These are distinct accessibility modes. A label-only Canvas is exposed as one
named image. When `accessibleFallback` is present, the pixel surface is hidden
from assistive technology and the fallback is rendered as a visually hidden
semantic sibling; it is not nested under an image role that would erase the
fallback's table, list, or heading semantics. A decorative Canvas and its
drawing surface are hidden completely.

Build a fallback from the source data rather than trying to reconstruct it
from rectangles and paths. It should be informational rather than interactive:
a visually hidden button or link would create an invisible keyboard or screen
reader focus target.

```tsx
<Canvas
  width={320}
  height={120}
  accessibilityLabel="Revenue by quarter"
  accessibleFallback={
    <table>
      <caption>Revenue by quarter</caption>
      <tbody>{/* rows made from the same series as the chart */}</tbody>
    </table>
  }
>
  {/* visual marks */}
</Canvas>
```

Skia is not installed by this package, so a Web-only installation does not
download its native binaries. Add it only to a React Native app:

```sh
npx expo install @shopify/react-native-skia
```

The Native entry imports Skia directly and will fail at bundle time with a
missing-module error until it is installed. It remains an app-level dependency
so Web-only Hozo installations stay small.
