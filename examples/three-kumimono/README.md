# Kumimono shared Three.js example

The timber bracket study used by the Hozo landing page and the Native GPU probe.
This private example package owns the scene, not a new public library API.

`createKumimonoScene()` constructs the same 56-part geometry, PBR materials,
lights, fog, instanced roof tiles, and two procedural RGBA `DataTexture`s on
Web and Native. It does not use `document`, `Image`, or a 2D canvas. The textures
approximate the supplied study's wood grain; they are not pixel-identical to its
Canvas2D rasterization. Their pixels are deterministic and host-independent.

- `study.update(0..1)` positions the parts and camera; the host owns animation timing.
- `configureKumimonoRenderer(renderer)` configures color, tone mapping, and shadows.
- `study.dispose()` releases geometries, materials, textures, and shadow resources.

The landing uses `@hozo/three/webgl`; the Native probe uses
`@hozo/three/r3f-native` with Expo GL. PBR, shadows, and instancing make this a
GPU example, not a claim of parity on Hozo's portable projection renderer.
The Native collector requires both textures, rendered-frame assembly motion,
and an accessible activation on Android before reporting the fixture as useful.

```sh
pnpm --filter @hozo/example-three-kumimono test
pnpm --filter @hozo/landing dev
```
