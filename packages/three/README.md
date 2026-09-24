# @hozo/three

Projects a documented subset of an ordinary Three.js scene into a portable
`@hozo/canvas` scene. It is useful for flat 3D diagrams, data visualisations,
and a deterministic fallback where a GPU renderer is unavailable.

```ts
import { projectThreeScene } from '@hozo/three'
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three'

const scene = new Scene()
scene.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: '#2563eb' })))

const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 100)
camera.position.z = 4

const projected = projectThreeScene(scene, camera, { width: 320, height: 180 })
```

For React, the same boundary is available as a universal Canvas component:

```tsx
import { ThreeCanvas } from '@hozo/three'

<ThreeCanvas
  decorative
  scene={scene}
  camera={camera}
  width={320}
  height={180}
/>
```

Rendering is demand-driven by default. Change the `revision` prop or call
`invalidate()` through a ref after imperative scene mutations. Animated scenes
can opt into `frameloop="always"` and mutate their Three objects in `onFrame`.

Pass `onObjectPress` to receive the projected Three object and its raycast
intersections. Set `object.name`, or provide `getAccessibilityLabel`, to expose
one keyboard and screen-reader control per object even when it projects into
many triangles.

`onObjectActiveChange` reports the same object-level state for mouse or pen
hover, keyboard focus, and touch hold. Moving across triangle boundaries inside
one object does not emit a false leave and re-entry.

The result is a retained `CanvasScene`, with world transforms and camera
projection already baked into its paths. Indexed and non-indexed triangle
`BufferGeometry`, perspective and orthographic cameras, clipping, face sides,
and flat opaque `MeshBasicMaterial` colours are supported. `Line`,
`LineSegments`, and `LineLoop` with opaque `LineBasicMaterial` are projected
with their declared colour and width. `Points` with opaque, untextured
`PointsMaterial` are projected as circles, including perspective size
attenuation and per-point RGB colours. Wireframe `MeshBasicMaterial` is
projected through the same line pipeline, including its colour and
`wireframeLinewidth`. Mesh material arrays
and `BufferGeometry` groups preserve each group's material and intersect with
the geometry's draw range just as they do in Three.js. `LOD` selects its active
level from the camera distance, and untextured solid-colour `SpriteMaterial`
billboards preserve their centre, rotation, scale, and size attenuation.
`InstancedMesh` applies each instance transform; per-instance colours and morph
weights remain explicitly diagnosed. Position morph targets are evaluated for
meshes, points, and lines, including relative morph geometry.

This is deliberately not a software WebGL implementation. Textures, lighting,
blending, shaders, skinning, instancing, post-processing, and XR need a GPU
backend. Unsupported inputs are omitted and returned as diagnostics rather
than rendered misleadingly.

The version-pinned [Three.js conformance report](./conformance.md) separates
exact and partial support from explicit diagnostics and known silent gaps. Its
rows link back to the tests behind each compatibility claim.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
