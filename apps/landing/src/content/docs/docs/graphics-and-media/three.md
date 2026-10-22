---
title: "Three.js & 3D (@hozo/three)"
description: "Portable Three.js projection onto @hozo/canvas alongside WebGL, WebGPU, React Three Fiber, and Native GPU entry points."
sidebar:
  order: 3
---

`@hozo/three` connects Three.js scenes and React Three Fiber to Hozo's layout, interaction, and accessibility model across five explicit entry points:

| Entry point | Renderer | Platforms | Use case |
| --- | --- | --- | --- |
| `@hozo/three` | Portable projection onto [`@hozo/canvas`](../canvas/) | Web & React Native | 3D diagrams, charts, wireframes, normal/basic/textured meshes without a GPU context |
| `@hozo/three/webgl` | Three.js `WebGLRenderer` | Web | Full lighting, PBR shaders, shadows, and post-processing on WebGL |
| `@hozo/three/webgpu` | Three.js `WebGPURenderer` (with WebGL 2 fallback) | Web | Modern WebGPU pipeline with lazy async initialization |
| `@hozo/three/r3f` | React Three Fiber (`@react-three/fiber`) | Web | Declarative JSX scene authoring on Web (WebGL or async WebGPU factory) |
| `@hozo/three/r3f-native` | React Three Fiber + `expo-gl` | React Native (Expo prebuild) | Experimental Native GPU 3D rendering on iOS and Android |

## Portable projection (`@hozo/three`)

The root entry projects a Three.js `Scene` and `Camera` into a retained `@hozo/canvas` scene, drawn by Canvas 2D on the Web and Skia on React Native:

```tsx
import { ThreeCanvas } from '@hozo/three'
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three'

const scene = new Scene()
scene.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: '#2563eb' })))

const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 100)
camera.position.z = 4

export function Diagram() {
  return (
    <ThreeCanvas
      accessibilityLabel="Product enclosure diagram"
      scene={scene}
      camera={camera}
      width={320}
      height={180}
    />
  )
}
```

### What the portable projector supports

- **Cameras & viewports:** `PerspectiveCamera` (auto-updating aspect ratio unless `cameraResize="manual"`), `OrthographicCamera`, and `ArrayCamera` sub-viewports.
- **Geometries & meshes:** indexed and non-indexed `BufferGeometry`, `InstancedMesh`, `BatchedMesh`, `SkinnedMesh` (CPU vertex skinning and morph target blending), `LOD`, `Line`, `LineSegments`, `LineLoop`, `Points`, and `Sprite`.
- **Materials:** `MeshBasicMaterial` (flat colours, per-vertex RGB/RGBA, wireframes, and affine `SRGBColorSpace` UV colour textures), `MeshNormalMaterial` (smooth and flat view-space normals), `LineBasicMaterial`, `LineDashedMaterial`, `PointsMaterial`, and `SpriteMaterial`.
- **Scene effects:** `Scene.background` (solid colour or 2D colour texture), `Scene.overrideMaterial`, `Fog` and `FogExp2`, material clipping planes (`clipIntersection`), and uniform `alphaTest`.
- **Honest diagnostics:** unsupported GPU-only features (PBR `MeshStandardMaterial`, custom shaders, lights, environment maps) are never rendered misleadingly; they are omitted and reported as structured diagnostics (`UNSUPPORTED_MATERIAL`, etc.).

## Classic WebGL and Modern WebGPU (`@hozo/three/webgl`, `@hozo/three/webgpu`)

When a Web application needs GPU lighting, PBR materials, or shaders, switch the import subpath:

```tsx
import { ThreeCanvas } from '@hozo/three/webgl'
// or: import { ThreeCanvas } from '@hozo/three/webgpu'

<ThreeCanvas
  accessibilityLabel="Interactive product model"
  scene={scene}
  camera={camera}
  frameloop="always"
  onFrame={(delta) => {
    mesh.rotation.y += delta
  }}
  onObjectPress={({ object }) => selectPart(object.name)}
/>
```

- **Demand-driven by default:** `ThreeCanvas` renders only when props, size, or `revision` change, or when `ref.current.invalidate()` is called. Pass `frameloop="always"` for continuous `onFrame` animation without scheduling React re-renders.
- **No silent fallback:** importing `/webgl` or `/webgpu` on React Native fails explicitly rather than silently degrading to the 2D projector.

## React Three Fiber (`@hozo/three/r3f` & `@hozo/three/r3f-native`)

For declarative R3F scenes, `@hozo/three/r3f` wraps R3F's reconciler with Hozo's responsive sizing and keyboard/screen-reader object controls:

```tsx
import { ThreeCanvas } from '@hozo/three/r3f'
import { useRef } from 'react'
import type * as THREE from 'three'

export function ProductPreview({ openInspector }: { openInspector: () => void }) {
  const product = useRef<THREE.Mesh>(null)

  return (
    <ThreeCanvas
      accessibilityLabel="Product preview"
      style={{ width: '100%', height: 360 }}
      camera={{ position: [0, 2, 5] }}
      accessibleObjects={[
        {
          id: 'product',
          label: 'Inspect product',
          object: product,
          onPress: () => openInspector(),
        },
      ]}
    >
      <ambientLight intensity={0.5} />
      <mesh ref={product} onClick={() => openInspector()}>
        <boxGeometry />
        <meshStandardMaterial color="orange" />
      </mesh>
    </ThreeCanvas>
  )
}
```

### Accessible 3D objects, hidden until focused

Named interactive 3D objects (`object.name` / `getAccessibilityLabel` on direct surfaces, or `accessibleObjects` on R3F) receive real off-screen buttons or links (`href`). While nothing inside the strip is focused, the controls stay off-screen so the canvas has no extra visual chrome. As soon as a keyboard user tabs into the strip, it becomes visible in high-contrast `Canvas` / `CanvasText` system colours (or your `controlClassName`), satisfying WCAG 2.4.7 Focus Visible.

On Expo prebuild apps (`@hozo/three/r3f-native` with `expo-gl`, `expo-asset`, and `expo-file-system`), the same `accessibleObjects` list exposes native accessibility controls to TalkBack and VoiceOver alongside touch raycasting.

## See it live

- **[Three.js showcase](../../../three/):** interactive 3D Kumimono joinery scene and capability breakdown.
