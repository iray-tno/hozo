# Portable Three.js fidelity follow-ups

Current baseline: Three.js r180, 11 approximate capability contracts. The
renderer families remain separate as defined in [RFC 004](rfcs/004-three-renderer-families.md).
Improving a bounded approximation does not make the full contract exact.

## Priority 1: bounded line and wireframe colour stops

Previously coloured lines and wireframes sent two encoded sRGB endpoints to a
host gradient. There are two separate errors: the host interpolates encoded
RGB rather than Three.js's linear working RGB, and varying perspective depth
requires rational rather than screen-linear interpolation. Even an
orthographic red/green line has the first error.

For screen-space position `s` and clipped endpoint homogeneous coordinates
`w0`, `w1`, the source interpolation ratio is
`t = s * w0 / ((1 - s) * w1 + s * w0)`. Evaluate the original linear colour
at `t`, then encode a colour stop. More stops improve the existing one-gradient,
one-line draw without generating additional Canvas nodes or draw primitives.

An analytic prototype is reproducible with:

```sh
pnpm --filter @hozo/three exec node scripts/audit-portable-gradients.mjs
```

The r180 red/green fixture evaluates 4,097 positions per line, including
quantization of CSS colour stops. A 32-stop cap with a 1/255 refinement target
gave these maximum errors in 8-bit RGB channel units:

| Endpoint depth ratio | Existing two stops | Bounded prototype | Stops |
| --- | ---: | ---: | ---: |
| 1 | 73.22 | 0.96 | 23 |
| 2 | 105.93 | 1.11 | 25 |
| 4 | 136.54 | 1.22 | 25 |
| 16 | 185.40 | 1.25 | 26 |
| 100 | 223.87 | 1.13 | 32 |

These are mathematical interpolation measurements, not browser/Skia pixel
comparisons or an error guarantee over arbitrary input. The current prototype
still allocates Three.js colours; its timings are not a
production performance claim. The script also reports a warmed five-trial,
1,000-line preparation-only median; it excludes host gradient construction,
drawing, clipping and GPU work. Existing interval errors are reused rather
than reevaluating all colour samples after each split. A local Windows/Node 25
run measured about 32 ms for preparing 1,000 refined lines versus 0.22 ms for
two-stop lines. Thus the candidate is not a free animation improvement: quality
controls, shorter-line budgets and reuse are necessary.

### Implemented opaque RGB boundary

Opaque RGB `LineBasicMaterial` / `LineDashedMaterial` segments and
`MeshBasicMaterial` wireframe edges now evaluate the ratio above **after**
near/viewport/material clipping. The default `lineColorInterpolation="bounded"`
uses a 4,097-entry sRGB lookup table, cached interval errors and at most
`min(32, max(2, 1 + ceil(projectedLength / 2)))` stops. Projected length is in
logical viewport pixels. A one-channel-unit refinement target can be exhausted
by either cap; it is not a general error guarantee. Uniform RGB skips
refinement. A 256-entry FIFO cache reuses immutable stops for equal endpoint
colours, depth ratio and budget, regardless of translation. It is bounded even
when the scene animates continuously.

Use `lineColorInterpolation="endpoints"` on `ThreeCanvas`, or the same option
in `projectThreeScene`, to select the old, cheaper approximation. Transparency,
RGBA, fog, normal-derived colour, disabled colour management and non-linear-sRGB
working spaces are deliberately not refined in this change. Scene node count,
ordering, clipping and source-object identity are unchanged. Classification
remains approximate: exact 105/116 (90.5%), approximate 11, feasible 116/116.

Reproduce upstream pixel comparisons and host timings with:

```sh
pnpm --filter @hozo/three exec node scripts/check-gpu.mjs --portable-only --output ../../artifacts/three-line-fidelity
```

The report compares actual Canvas 2D pixels with upstream r180 `WebGLRenderer`
pixels: orthographic, perspective depth ratios 1/2/16/100, reversed depths,
wireframe, material clipping, viewport clipping and near clipping. Sampling
uses fully covered shared interior pixels, away from vertices where different
wireframe edges overlap. A local Windows Chromium/SwiftShader run compared
1,696 pixels across ten cases: old maximum RGB channel errors 74–221 became
1–2. This does **not** prove identical raster coverage, transparent output or
Native Skia pixels. The Native gradient API accepts the same stop arrays, but
device/Skia pixel evidence remains a follow-up.

Local Node 25 five-trial medians: preparing 1,000 repeated gradient conditions
took 0.47 ms; 1,000 changing, distinct depth conditions took 14.24 ms, compared
with 34.41 ms for the allocating prototype. At 10,000 those production cases
took 4.02 ms and 145.40 ms. The audit also records full projection, including
clipping, and both endpoint/bounded paths. Its full-scene fixture repeats five
conditions, so it must not be presented as a unique-edge cache-miss benchmark.

The browser report includes host gradient creation, raster work and a pixel
readback (three-trial medians, report only). The same repeating-condition
fixture took 11.0/17.8 ms for endpoint/bounded animated projection plus drawing
at 1,000 edges, and 105.8/163.7 ms at 10,000. This headless software/readback
measurement is not device FPS. An unchanged demand scene performs no redraw;
the cached-scene benchmark deliberately forces drawing. Large moving wireframes
still belong on a GPU renderer, or can choose endpoints mode.

Remaining fidelity follow-ups:

- Extend real-pixel evidence to Native Skia and transformed/skinned wireframes.
- Extend colour refinement to alpha only with premultiplied-output pixel checks,
  not just straight RGB. Normal-derived gradients require normalized
  interpolated normals, not just interpolation of endpoint colours.
- Add full-scene/device timings with unique colours and depths. The preparation
  cache-miss benchmark and repeating-condition raster benchmark measure
  different workloads; neither establishes mobile frame rates.

This first fidelity implementation improves both colour space and perspective
without expanding primitive count.

## Priority 2: opt-in, bounded textured-triangle refinement

The projector already retains homogeneous coordinates and UVs through clipping.
It can subdivide only triangles whose projective mapping differs appreciably
from affine mapping, interpolate in source/clip space and emit affine patches.
Constant-depth triangles should remain untouched.

This increases primitive count, unlike line stops. Require a per-triangle and
per-scene budget, explicit quality control, shared-edge handling to avoid cracks,
and pixel/CPU measurements before choosing a default. Preserve source object
identity, clipping, culling and ordering. Without decoded texture dimensions at
projection time, a normalized-UV threshold is not a promise of texel accuracy.
Do not call bounded tessellation perspective-correct sampling.

## Priority 3: reuse refinement for fog and normal shading

Line refinement can evaluate existing fog functions at intermediate source
positions rather than merely interpolating endpoint fog colours. For filled
triangles, reuse a single bounded subdivision pass for normal/fog/colour errors;
independent passes would multiply the draw cost. Normal shading must normalize
interpolated normals before encoding each evaluated sample.

## Not a low-cost follow-up

Intersecting triangles and per-pixel depth cannot be repaired by sorting more
carefully. BSP splitting or a CPU depth buffer brings different memory, order,
transparency and performance contracts. Leave this approximation documented
until those costs have a separate design and benchmark.

Reference: [Three.js colour management](https://threejs.org/manual/pages/color-management.html).
