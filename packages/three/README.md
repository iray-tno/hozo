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

`width` and `height` are optional. When either is omitted, the Web renderer
families follow a `ResizeObserver`, while the portable surface uses the same
measurement on Web and `onLayout` on Native. The server-rendered fallback is
300 by 150, and `onResize` reports the resolved layout size and pixel ratio.
Give the surface a responsive CSS or Native layout size, for example
`style={{ width: '100%', height: '100%' }}`; without one it keeps the stable
300-by-150 fallback.

Perspective cameras follow the resolved aspect ratio by default. Use
`cameraResize="manual"` when the application owns its projection. Orthographic
cameras are always application-owned because resizing their frustum has no
single correct policy.

Rendering is demand-driven by default. Change the `revision` prop or call
`invalidate()` through a ref after imperative scene mutations. Animated scenes
can opt into `frameloop="always"` and mutate their Three objects in `onFrame`.
GPU surfaces render those continuous frames directly rather than scheduling a
React update. If an `onFrame` mutation changes semantic structure such as an
object's name, visibility, or layer, also change `revision` when that semantic
change occurs so its keyboard and screen-reader controls are rebuilt.

## Classic WebGL renderer

Web applications that need Three.js lighting, shader materials, depth, or the
established `WebGLRenderer` ecosystem can select the classic renderer family
explicitly:

```tsx
import { ThreeCanvas } from '@hozo/three/webgl'

<ThreeCanvas
  accessibilityLabel="Interactive product model"
  scene={scene}
  camera={camera}
  width={640}
  height={360}
/>
```

This entry point owns renderer creation, sizing, drawing, and disposal while
sharing the portable surface's demand/continuous frame-loop contract. It is
currently Web-only; importing it on React Native fails explicitly because Hozo
does not yet provide a Native WebGL context host. It never silently falls back
to the portable renderer. The modern `WebGPURenderer` family will use a
separate `@hozo/three/webgpu` entry point.

`onObjectPress` raycasts the classic WebGL scene and preserves the source
`Object3D` and its intersections. Named interactive meshes, lines, points, and
sprites also receive real off-screen buttons, so the same object can be reached
with a pointer, keyboard, or screen reader. `getAccessibilityLabel` can supply
those names without mutating `object.name`.

## Modern WebGPU renderer family

New Web applications can select Three.js's modern renderer family explicitly:

```tsx
import { ThreeCanvas } from '@hozo/three/webgpu'

<ThreeCanvas
  accessibilityLabel="Interactive product model"
  scene={scene}
  camera={camera}
  width={640}
  height={360}
/>
```

Hozo loads `three/webgpu` lazily and awaits `WebGPURenderer.init()` before the
first draw. Three.js chooses WebGPU when available and otherwise uses its own
modern WebGL 2 backend; pass `rendererOptions={{ forceWebGL: true }}` to force
that backend for testing. This is distinct from the classic
`@hozo/three/webgl` renderer and shares its DOM interaction and accessibility
contract rather than its material or post-processing extension points.

Pass `onObjectPress` to receive the projected Three object and its raycast
intersections. Set `object.name`, or provide `getAccessibilityLabel`, to expose
one keyboard and screen-reader control per object even when it projects into
many triangles.

`onObjectActiveChange` reports the same object-level state for mouse or pen
hover, keyboard focus, and touch hold. Moving across triangle boundaries inside
one object does not emit a false leave and re-entry.

## React Three Fiber authoring

Applications that author scenes with React Three Fiber can opt into a separate
entry point. R3F continues to own its reconciler, renderer, frame loop, and
pointer-event system; Hozo supplies the responsive container and the same
label, fallback, or decorative accessibility choice as its direct surfaces.

```tsx
import { ThreeCanvas } from '@hozo/three/r3f'

<ThreeCanvas
  accessibilityLabel="Rotating product preview"
  style={{ width: '100%', height: 360 }}
  camera={{ position: [0, 2, 5] }}
>
  <ambientLight intensity={0.5} />
  <mesh>
    <boxGeometry />
    <meshStandardMaterial color="orange" />
  </mesh>
</ThreeCanvas>
```

`@react-three/fiber` is an optional peer and is retained only by this entry
point. Native R3F hosting remains explicitly unavailable until the GPU-host
evaluation in issue #596 chooses and verifies a backend. Object-level keyboard
activation uses an explicit list rather than R3F's private instance metadata:

```tsx
const product = useRef<THREE.Mesh>(null)

<ThreeCanvas
  accessibilityLabel="Product preview"
  accessibleObjects={[
    {
      id: 'product',
      label: 'Inspect product',
      object: product,
      onPress: () => openInspector(),
    },
  ]}
>
  <mesh ref={product} onClick={() => openInspector()}>
    <boxGeometry />
    <meshStandardMaterial color="orange" />
  </mesh>
</ThreeCanvas>
```

The hidden native button handles keyboard and screen-reader activation. The
mesh keeps its ordinary R3F pointer handler, so Hozo does not synthesize or
double-dispatch pointer events. A registered object with `href` becomes a real
anchor instead, preserving modifier-click and application-router integration.

### R3F with WebGPU

R3F also accepts an asynchronous renderer factory. Keep the factory stable and
initialize Three's modern renderer before returning it:

```tsx
import type { R3FRendererFactoryProps } from '@hozo/three/r3f'

const createWebGPURenderer = async ({ canvas }: R3FRendererFactoryProps) => {
  const { WebGPURenderer } = await import('three/webgpu')
  const renderer = new WebGPURenderer({
    canvas: canvas as HTMLCanvasElement,
    antialias: true,
  })
  await renderer.init()
  return renderer
}

<ThreeCanvas accessibilityLabel="Product preview" gl={createWebGPURenderer}>
  {/* ordinary R3F scene */}
</ThreeCanvas>
```

The dynamic import keeps Three's modern renderer out of applications that use
the default R3F WebGL path. Hozo passes the factory through; R3F owns awaiting,
configuration, frame scheduling, error propagation, and disposal. Runtime GPU
availability still belongs to the browser and should be covered by an
application-level fallback or error boundary.

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
across clipped triangles. RGBA attributes also preserve per-vertex alpha when
the material opts into transparency; opaque RGBA and alpha-tested gradients
remain diagnostic because Canvas source-over would change WebGL blend
semantics. The portable mesh interpolation is screen-space; perspective-correct
interpolation remains a GPU-backend concern.
Primary `MeshBasicMaterial.map` colour textures also project when they use
`SRGBColorSpace`, clamp or repeat wrapping on either axis, a URL/URI or Native
asset source, and complete two-component UVs. Texture transforms and `flipY`
are preserved, including UVs created by clipping. Sampling is affine in screen
space and has no mipmaps; mirrored wrapping, tint/vertex-colour/fog modulation,
and per-pixel alpha tests stay diagnostic instead of being silently
approximated.
Solid `Scene.background` colours and constrained 2D colour textures fill the
portable viewport without creating an interactive object. Cube/equirectangular
environment backgrounds, blur, and intensity modulation remain diagnostic.
`Fog` and `FogExp2` blend supported meshes, wireframes, lines, points, and
sprites in the same working colour space as Three.js, while respecting each
material's `fog` opt-out. Constant-depth shapes and individual points match
the shader formula; varying-depth portable gradients evaluate fog at their
vertices or endpoints rather than per fragment.
Uniform `alphaTest` is preserved for the untextured subset by omitting a whole
primitive when its material opacity is below the threshold. Per-vertex alpha,
alpha hashing, MSAA alpha-to-coverage, and dithering are diagnosed rather than
silently flattened into ordinary opacity.
`LineDashedMaterial` uses Three's
`lineDistance`, dash size, gap size, and scale to emit portable segments before
projection. `PointsMaterial` projects untextured points as circles and the
constrained colour-map subset as screen-aligned point-sprite quads, including
perspective size attenuation. Per-point RGB colours remain available for the
untextured path. Wireframe `MeshBasicMaterial` is
projected through the same line pipeline, including uniform or per-vertex RGB
colour and `wireframeLinewidth`. Default world-space material clipping planes cut meshes
and lines and discard clipped points. `clipIntersection` preserves the union of
material half-spaces for meshes, lines, points, and sprites.
Mesh material arrays
and `BufferGeometry` groups preserve each group's material and intersect with
the geometry's draw range just as they do in Three.js. `Scene.overrideMaterial`
replaces supported render-list materials while preserving source visibility and
`allowOverride`. `LOD` selects its active
level from the camera distance. `SpriteMaterial` billboards preserve their
centre, rotation, scale, and size attenuation for solid colours and the same
constrained affine colour-map subset as meshes.
`InstancedMesh` applies each instance transform, colour, and morph weight.
`BatchedMesh` projects its geometry ranges, sparse instance IDs, visibility,
transforms, and optional instance colours through public Three.js APIs. Position
morph targets are evaluated for meshes, points, and lines, including relative
morph geometry. `SkinnedMesh` uses Three's public CPU vertex evaluation so morphs,
bind matrices, bone weights, and the current skeleton pose remain aligned.

This is deliberately not a software WebGL implementation. General GPU texture
sampling, lighting, custom blending, shaders, post-processing, and XR need a GPU
backend. Unsupported inputs are omitted and returned as diagnostics rather
than rendered misleadingly.

`MeshNormalMaterial` is the first non-basic portable mesh material: smooth and
flat view-space normals become Canvas vertex colours for ordinary meshes.
Texture-perturbed normals, wireframe, skinning, instancing, and active morphs
remain diagnostic rather than receiving an inaccurate approximation.

The version-pinned [Three.js conformance report](./conformance.md) separates
exact and partial support from explicit diagnostics and known silent gaps. Its
rows link back to the tests behind each compatibility claim.

GPU renderer conformance is environment-dependent and is therefore measured on
main, weekly, and on demand rather than folded into the portable percentage.
Run `pnpm --filter @hozo/three test:gpu` to produce JSON and Markdown reports
for classic WebGL, the modern renderer's automatic backend choice, and its
forced WebGL 2 backend. A missing native WebGPU backend is recorded as
`unavailable`; classic WebGL and modern forced-WebGL 2 remain required to draw
and expose working semantic controls.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
