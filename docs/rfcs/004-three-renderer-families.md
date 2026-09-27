# RFC 004: Three.js Renderer Families

- **Status**: Accepted
- **Tracking Issue**: #574
- **Target Package**: `@hozo/three`

---

## 1. Summary and motivation

`@hozo/three` currently projects a documented Three.js subset into
`@hozo/canvas`. That portable renderer is useful on the Web and Native, keeps
interaction and accessibility deterministic, and safely diagnoses features it
cannot represent. It is deliberately not a software implementation of WebGL.

Lighting, general texture sampling, shader materials, post-processing, and
per-pixel depth need a GPU renderer. Adding one must not turn the portable API
into an ambiguous renderer switch or imply that Three.js itself has one
interchangeable WebGL/WebGPU implementation.

Three.js has two distinct GPU renderer families:

1. the mature `WebGLRenderer`, imported from `three`; and
2. the modern `WebGPURenderer`, imported from `three/webgpu`, which chooses a
   WebGPU backend by default and can fall back to its own WebGL 2 backend.

The modern renderer's WebGL 2 backend is not the classic `WebGLRenderer`.
Material extension points and post-processing APIs differ between those
families. Hozo therefore exposes renderer families explicitly and delegates
backend selection inside the modern family to Three.js.

## 2. Public entry points

```ts
// Portable projection: Canvas2D on Web and the Hozo Canvas Native backend.
import { ThreeCanvas } from '@hozo/three'

// Classic Three.js renderer family: WebGLRenderer.
import { ThreeCanvas } from '@hozo/three/webgl'

// Modern Three.js renderer family: WebGPURenderer, with Three's own fallback.
import { ThreeCanvas } from '@hozo/three/webgpu'
```

The root remains portable. Installing or importing `@hozo/three` must not pull
a GPU renderer into applications that only need portable projection. GPU entry
points may be introduced incrementally, but their eventual names and ownership
are fixed by this RFC.

`webgpu` names the modern renderer family, not a promise that every execution
uses the WebGPU browser API. Three.js may run that renderer with its WebGL 2
backend when WebGPU is unavailable. An explicit option may expose Three's
`forceWebGL` behavior for testing, but Hozo does not reimplement the fallback.

## 3. Selection boundary

A renderer family is selected once for a render surface. Objects within one
scene do not individually select portable, classic WebGL, or modern WebGPU
rendering.

```text
Three Scene + Camera
        |
        +-- @hozo/three --------> portable projector -> Hozo Canvas
        |
        +-- @hozo/three/webgl --> classic WebGLRenderer
        |
        `-- @hozo/three/webgpu -> WebGPURenderer
                                      |
                                      +-- WebGPU backend
                                      `-- WebGL 2 backend (Three fallback)
```

Applications choose the family at the component import boundary. Hozo will not
silently replace a requested GPU renderer with the portable renderer because
that could substantially change depth, lighting, shader, and compositing
semantics. Applications can render an explicit portable fallback when their
product requirements call for one.

## 4. Shared contract

The three entry points should share the application-facing surface where the
renderer does not require a semantic difference:

- `scene`, `camera`, dimensions, and pixel ratio;
- demand rendering, revision invalidation, and continuous frame loops;
- source `Object3D` identity in interaction callbacks;
- semantic labels and keyboard/screen-reader activation;
- lifecycle and error reporting conventions.

They do not need to pretend that rendering features are identical. Renderer
options, shader extension points, post-processing, output color management,
and device/context loss may use family-specific props or companion APIs.

Shared behavior belongs in renderer-independent modules. Each renderer adapter
owns surface creation, initialization, drawing, resizing, disposal, and its
family-specific capability reporting.

## 5. Intended use

| Entry point | Prefer it when | Important boundary |
| --- | --- | --- |
| `@hozo/three` | The same scene needs a deterministic Web/Native fallback, accessible flat 3D output, or no GPU dependency | Only the documented portable subset is rendered |
| `@hozo/three/webgl` | Existing Three.js assets depend on `WebGLRenderer`, `ShaderMaterial`, `onBeforeCompile`, or the established post-processing ecosystem | It is the classic renderer, not the modern renderer forced onto WebGL 2 |
| `@hozo/three/webgpu` | A new application prefers TSL, node materials, modern post-processing, or WebGPU features | Three.js may execute through its own WebGL 2 backend; classic extension points are not automatically compatible |

Portable support should continue growing where the result is honest and useful.
GPU support does not make portable approximations exact, and portable coverage
does not measure GPU renderer compatibility.

## 6. Platform boundaries

The portable entry point remains the cross-platform baseline. A GPU entry point
is only supported on a platform after Hozo has a real surface/context host and a
verified lifecycle for that platform.

The first classic WebGL adapter may therefore be Web-only. Native GPU support
must be added as an explicit host integration rather than inferred from the
presence of Three.js. The same rule applies to the modern renderer: browser
WebGPU availability does not by itself establish a React Native WebGPU host.

Unsupported platform/entry-point combinations must fail clearly at build time
or component initialization. They must not render an empty surface or silently
change renderer families.

## 7. Conformance and reporting

Conformance is reported independently for each family:

- **Portable conformance** retains exact, usable, safe diagnostic, silent, and
  out-of-scope states.
- **Classic WebGL integration** measures Hozo's surface/lifecycle/interaction
  contract and any divergence from direct `WebGLRenderer` usage.
- **Modern WebGPU integration** measures the same Hozo contract separately and
  records whether a test ran on WebGPU or Three's WebGL 2 backend.

No aggregate percentage may combine these into a number that suggests renderer
interchangeability. Shared scene fixtures may be used to compare output and
behavior, but each report must identify its renderer family and actual backend.

## 8. Delivery order

1. Extract and test the renderer-independent `ThreeCanvas` surface contract.
2. Add the classic WebGL Web adapter and lifecycle tests.
3. Add semantic overlay and object interaction parity for the WebGL adapter.
4. Add classic WebGL integration conformance and example coverage.
5. Add the modern WebGPU adapter, preserving its asynchronous initialization.
6. Exercise both modern backends and report which backend ran.
7. Evaluate Native GPU hosts separately; do not block the Web adapters on that
   investigation.

The classic WebGL adapter comes first because it gives existing Three.js scenes
the broadest immediate compatibility and establishes the shared contract before
the asynchronous modern renderer is introduced.

## 9. Rejected alternatives

### One component with `renderer="portable" | "webgl" | "webgpu"`

This makes family-specific code easier to include accidentally, obscures the
large compatibility difference between renderer families, and complicates
bundler tree-shaking. Explicit entry points keep the dependency boundary clear.

### One generic `gpu` entry point

Classic WebGL and the modern renderer do not share all material and
post-processing extension points. Calling both simply "GPU" hides a choice
users already need to make in Three.js.

### A Hozo-owned WebGPU-to-WebGL fallback

`WebGPURenderer` already owns that selection. Duplicating it would create a
second capability policy and could select the classic renderer when Three.js
expects its modern WebGL 2 backend.

### Automatic GPU-to-portable fallback

The portable renderer intentionally has different visual semantics for many
scenes. An automatic fallback would be convenient but could present materially
incorrect output without an application decision.

## 10. Upstream evidence and reopening conditions

This design follows the Three.js renderer split documented by
[`WebGPURenderer`](https://threejs.org/docs/pages/WebGPURenderer.html) and the
official [WebGPU renderer guide](https://threejs.org/manual/pages/webgpurenderer).

Revisit this RFC if Three.js unifies the classic and modern renderer families,
removes the modern WebGL 2 backend, or provides a stable renderer-neutral
extension and post-processing contract. A stable cross-platform Three.js GPU
surface for React Native would also justify revisiting the platform boundaries,
but not the explicit family selection by itself.
