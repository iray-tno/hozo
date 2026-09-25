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
and flat `MeshBasicMaterial` colours are supported. Normal alpha transparency
maps to Canvas opacity and paints after opaque primitives. `ArrayCamera`
projects each child camera into its declared bottom-left viewport. `Line`,
`LineSegments`, and `LineLoop` with `LineBasicMaterial` are projected
with their declared colour and width. Solid and dashed lines interpolate RGB
vertex colours through portable Canvas gradients, including clipped endpoints.
Solid meshes likewise preserve RGB vertex attributes and interpolate colours
across clipped triangles. The portable mesh interpolation is screen-space;
perspective-correct interpolation remains a GPU-backend concern.
`Fog` and `FogExp2` blend supported meshes, wireframes, lines, points, and
sprites in the same working colour space as Three.js, while respecting each
material's `fog` opt-out. Constant-depth shapes and individual points match
the shader formula; varying-depth portable gradients evaluate fog at their
vertices or endpoints rather than per fragment.
`LineDashedMaterial` uses Three's
`lineDistance`, dash size, gap size, and scale to emit portable segments before
projection. `Points` with untextured
`PointsMaterial` are projected as circles, including perspective size
attenuation and per-point RGB colours. Wireframe `MeshBasicMaterial` is
projected through the same line pipeline, including its colour and
`wireframeLinewidth`. Default world-space material clipping planes cut meshes
and lines and discard clipped points. `clipIntersection` preserves the union of
material half-spaces for meshes, lines, points, and sprites.
Mesh material arrays
and `BufferGeometry` groups preserve each group's material and intersect with
the geometry's draw range just as they do in Three.js. `Scene.overrideMaterial`
replaces supported render-list materials while preserving source visibility and
`allowOverride`. `LOD` selects its active
level from the camera distance, and untextured solid-colour `SpriteMaterial`
billboards preserve their centre, rotation, scale, and size attenuation.
`InstancedMesh` applies each instance transform, colour, and morph weight.
`BatchedMesh` projects its geometry ranges, sparse instance IDs, visibility,
transforms, and optional instance colours through public Three.js APIs. Position
morph targets are evaluated for meshes, points, and lines, including relative
morph geometry. `SkinnedMesh` uses Three's public CPU vertex evaluation so morphs,
bind matrices, bone weights, and the current skeleton pose remain aligned.

This is deliberately not a software WebGL implementation. Textures, lighting,
custom blending, shaders, post-processing, and XR need a GPU
backend. Unsupported inputs are omitted and returned as diagnostics rather
than rendered misleadingly.

The version-pinned [Three.js conformance report](./conformance.md) separates
exact and partial support from explicit diagnostics and known silent gaps. Its
rows link back to the tests behind each compatibility claim.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
