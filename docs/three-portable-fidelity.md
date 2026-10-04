# Portable Three.js fidelity follow-ups

Current baseline: Three.js r180, 11 approximate capability contracts. The
renderer families remain separate as defined in [RFC 004](rfcs/004-three-renderer-families.md).
Improving a bounded approximation does not make the full contract exact.

## Priority 1: bounded line and wireframe colour stops

Current coloured lines and wireframes send two encoded sRGB endpoints to a
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
controls, shorter-line budgets and reuse need to be evaluated before enabling
it by default. Before implementation:

- Keep uniform colours on the existing fast path. Use bounded local refinement,
  not repeated whole-list scans, and account for projected line length.
- Exercise perspective and orthographic cameras, near/material clipping,
  reversed endpoints, transformed/skinned wireframes and gradients with alpha.
- Compare actual browser and Skia pixels against upstream renderer samples.
  Alpha needs premultiplied-output error checks, not just straight RGB.
- Measure 1,000 and 10,000 coloured edges, both static/demand and animated.
  Retained scene reuse alone is not sufficient when every animation reprojects.
- Keep a hard stop budget, disclose budget exhaustion, and retain approximate
  classification. Start with opaque RGB; normal-derived gradients require
  normalized interpolated normals, not just interpolation of endpoint colours.

This is the first fidelity implementation candidate because it can improve
both colour space and perspective without expanding primitive count.

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
