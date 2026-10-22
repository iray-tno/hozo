---
title: "2D Canvas (@hozo/canvas)"
description: "Declarative retained-mode 2D Canvas scenes drawn with Canvas 2D on the Web and React Native Skia on iOS and Android."
sidebar:
  order: 2
---

`@hozo/canvas` lets you author declarative, retained-mode 2D scenes in JSX. The same scene is drawn with the browser's Canvas 2D API on the Web and `@shopify/react-native-skia` on React Native.

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

Skia is an optional peer dependency so Web-only projects never download native binaries. In a React Native app, install Skia alongside `@hozo/canvas`:

```sh
pnpm add @hozo/canvas
# On React Native only:
npx expo install @shopify/react-native-skia
```

## Scene primitives and meshes

Inside `<Canvas>`, you compose retained drawing nodes:

- **Vector shapes:** `Canvas.Rect`, `Canvas.Circle`, `Canvas.Line`, `Canvas.Path`, `Canvas.Text`, and `Canvas.Group` (with nested transforms and clipping).
- **Indexed triangle meshes (`Canvas.TriangleMesh`):** draw projected geometry directly without serializing triangles to SVG path strings.

`Canvas.TriangleMesh` supports both per-vertex sRGB colours (interpolated via Skia `Vertices` on Native and bounded barycentric ramps on Web Canvas 2D) and affine UV texture mapping:

```tsx
<Canvas.TriangleMesh
  vertices={[
    { x: 10, y: 10 },
    { x: 90, y: 10 },
    { x: 50, y: 70 },
  ]}
  colors={[
    { r: 1, g: 0, b: 0 },
    { r: 0, g: 1, b: 0 },
    { r: 0, g: 0, b: 1 },
  ]}
/>
```

Texture mapping accepts `wrap: 'clamp' | 'repeat' | 'mirror'` (or axis-specific `wrapX` / `wrapY`), `filter: 'linear' | 'nearest'`, and linear-RGB `intensity` / `tint` modulation.

## Geometry hit-testing and interaction

Every Canvas leaf supports portable `onPress` and destination-bearing `href`:

```tsx
<Canvas.Rect
  x={40}
  y={10}
  width={20}
  height={30}
  href="/orders/42"
  accessibilityLabel="Open order 42"
  onPress={(event) => {
    // event.point is in viewBox/scene coordinates;
    // event.surfacePoint is in CSS pixels / RN layout points (for tooltips).
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      event.preventDefault()
      toggleSelectedOrder(42)
    }
  }}
/>
```

- **Geometry, not pixel readback:** hit-testing walks the retained scene in reverse paint order, accounting for `viewBox`, `fit`, nested group `translate`/`rotate`/`scale`/`origin`, and clip rectangles. Changing only an event handler or `disabled` updates the interaction registry without redrawing the canvas.
- **Navigation integration:** `href` connects to [`@hozo/navigation`](../../reference/navigation/), preserving Ctrl/Command-click and middle-click in the browser.
- **Keyboard and screen-reader reach:** because painted pixels cannot receive focus, every named interactive shape (`onPress` or `href` + `accessibilityLabel`) automatically gets a real `<button>` or `<a href>` in a visually hidden sibling layer on the Web and an accessible node on React Native.

## The three accessibility modes

Canvas pixels carry no inherent semantics. Every `<Canvas>` root must declare one of three modes:

1. **`accessibilityLabel`:** exposes the canvas as a single named image (`role="img"`).
2. **`accessibleFallback`:** hides the pixel surface from assistive technology and renders a visually hidden semantic sibling (such as a `<table>` or `<List>` built from the same data series) outside the image role so table/list semantics survive:
   ```tsx
   <Canvas
     width={320}
     height={120}
     accessibilityLabel="Revenue by quarter"
     accessibleFallback={
       <table>
         <caption>Revenue by quarter</caption>
         <tbody>{/* rows built from the same data */}</tbody>
       </table>
     }
   >
     {/* visual marks */}
   </Canvas>
   ```
3. **`decorative`:** hides the canvas and its drawing surface completely from assistive technology (`aria-hidden="true"`).

## See it live

- **[2D Canvas showcase](../../../canvas/):** interactive financial chart built with `@hozo/canvas`.
