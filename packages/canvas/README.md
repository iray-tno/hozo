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

The Skia peer is optional so a Web-only installation does not download it. It
is required when this package is used from React Native.
