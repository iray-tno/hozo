# Three.js portable conformance

Generated against Three.js r180. Run `pnpm --filter @hozo/three report` to update this file and add `--check` to verify it without writing.

This measures the portable Hozo Canvas backend, not Three.js as a whole. It deliberately separates compatibility from safe refusal:

- **Exact** counts rows implemented without a named restriction.
- **Usable** adds partial implementations with documented restrictions.
- **Safe** adds unsupported inputs that produce a diagnostic instead of misleading output.
- **Silent** is a known semantic loss with no diagnostic. These are the highest-priority gaps.
- **Out of scope** is excluded from every percentage.

The rows are an unweighted API surface. The overall Three.js figure excludes Hozo's additional interaction contract, which remains visible as its own category. A later corpus report should weight the upstream rows by real scene usage; ordinary glTF scenes rely heavily on `MeshStandardMaterial`, so this table must not be read as a real-model success rate.

## Summary

| Category | Exact | Usable | Safe | Silent | Out of scope |
| --- | ---: | ---: | ---: | ---: | ---: |
| topology | 5/5 (100.0%) | 5/5 (100.0%) | 5/5 (100.0%) | 0 | 0 |
| object | 11/11 (100.0%) | 11/11 (100.0%) | 11/11 (100.0%) | 0 | 2 |
| camera | 3/4 (75.0%) | 3/4 (75.0%) | 4/4 (100.0%) | 0 | 2 |
| material | 0/17 (0.0%) | 5/17 (29.4%) | 17/17 (100.0%) | 0 | 1 |
| geometry | 10/13 (76.9%) | 12/13 (92.3%) | 13/13 (100.0%) | 0 | 0 |
| scene | 3/8 (37.5%) | 7/8 (87.5%) | 8/8 (100.0%) | 0 | 1 |
| interaction | 4/4 (100.0%) | 4/4 (100.0%) | 4/4 (100.0%) | 0 | 0 |
| **Three.js surface** | **32/58 (55.2%)** | **43/58 (74.1%)** | **58/58 (100.0%)** | **0** | **6** |

## Detailed surface

### topology

| Feature | Status | Behaviour | Test |
| --- | --- | --- | --- |
| triangles | full | Indexed and non-indexed triangles become clipped paths. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates`<br>[test](src/project.test.ts) `indexed geometry emits each triangle` |
| line strip | full | Adjacent vertices become connected Canvas lines. | [test](src/project.test.ts) `Line connects adjacent vertices and honours indexed draw ranges` |
| line loop | full | The final vertex is connected back to the first. | [test](src/project.test.ts) `LineLoop closes its final vertex back to its first` |
| line segments | full | Each vertex pair becomes an independent line. | [test](src/project.test.ts) `LineSegments become independent Canvas lines with material colour and width` |
| points | full | Points become circles with optional perspective attenuation. | [test](src/project.test.ts) `Points become Canvas circles with indexed draw ranges and perspective attenuation` |

### object

| Feature | Status | Behaviour | Test |
| --- | --- | --- | --- |
| BatchedMesh | full | Sparse instance IDs, geometry ranges, visibility, transforms, and colours are projected. | [test](src/project.test.ts) `BatchedMesh projects sparse visible instances with transforms and colours` |
| Bone | out-of-scope | A Bone has no independent render primitive. | — |
| Group | full | Visibility and nested world transforms are traversed. | [test](src/project.test.ts) `world transforms under groups are baked into the projected path` |
| InstancedMesh | full | Instance transforms, colours, and morph weights project independently. | [test](src/project.test.ts) `InstancedMesh applies each instance transform and preserves object identity`<br>[test](src/project.test.ts) `InstancedMesh applies per-instance colours and morph weights` |
| Line | full | Line strips project through the portable line pipeline. | [test](src/project.test.ts) `Line connects adjacent vertices and honours indexed draw ranges` |
| LineLoop | full | Closed line strips project through the line pipeline. | [test](src/project.test.ts) `LineLoop closes its final vertex back to its first` |
| LineSegments | full | Independent line pairs project through the line pipeline. | [test](src/project.test.ts) `LineSegments become independent Canvas lines with material colour and width` |
| LOD | full | The camera-distance level is selected automatically, or manual visibility is preserved. | [test](src/project.test.ts) `LOD selects the camera-distance level and honours manual visibility` |
| Mesh | full | Triangle meshes use the supported material subset. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates` |
| Points | full | Point vertices project through the circle pipeline. | [test](src/project.test.ts) `Points become Canvas circles with indexed draw ranges and perspective attenuation` |
| Skeleton | out-of-scope | A Skeleton is data consumed by SkinnedMesh. | — |
| SkinnedMesh | full | Public CPU morph and bone transforms are evaluated. | [test](src/project.test.ts) `SkinnedMesh evaluates morph targets before public CPU bone transforms` |
| Sprite | full | Camera-facing quads preserve centre, rotation, scale, and size attenuation. | [test](src/project.test.ts) `Sprite projects its billboard centre, rotation, and perspective attenuation` |

### camera

| Feature | Status | Behaviour | Test |
| --- | --- | --- | --- |
| ArrayCamera | full | Each child camera projects into its bottom-left viewport in declared order. | [test](src/project.test.ts) `ArrayCamera projects each sub-camera into its bottom-left viewport`<br>[test](src/project.test.ts) `ArrayCamera diagnoses sub-cameras without a viewport` |
| Camera | diagnostic | A base camera has no usable projection and is rejected. | [test](src/project.test.ts) `unsupported inputs are omitted with actionable diagnostics` |
| CubeCamera | out-of-scope | Environment capture needs a GPU renderer. | — |
| OrthographicCamera | full | Its public projection matrix is honoured. | [test](src/project.test.ts) `world transforms under groups are baked into the projected path` |
| PerspectiveCamera | full | Its public projection matrix is honoured. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates` |
| StereoCamera | out-of-scope | StereoCamera is a two-camera helper, not a direct render camera. | — |

### material

| Feature | Status | Behaviour | Test |
| --- | --- | --- | --- |
| LineBasicMaterial | partial | Colour, width, RGB vertex gradients, fog, and normal alpha transparency work; advanced base material state does not. | [test](src/project.test.ts) `LineSegments become independent Canvas lines with material colour and width`<br>[test](src/project.test.ts) `LineBasicMaterial projects clipped RGB vertex colours as a portable gradient`<br>[test](src/project.test.ts) `normal transparent materials project opacity across portable primitives` |
| LineDashedMaterial | partial | Finite dash and gap intervals split into portable solid segments before projection. | [test](src/project.test.ts) `LineDashedMaterial projects line-distance dash and gap intervals`<br>[test](src/project.test.ts) `invalid or excessive dashed line intervals emit diagnostics` |
| Material | out-of-scope | The abstract material base has no renderable appearance. | — |
| MeshBasicMaterial | partial | Flat and RGB vertex colours, fog, normal alpha transparency, sides, groups, and wireframe work. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates`<br>[test](src/project.test.ts) `groups can mix solid and wireframe MeshBasicMaterial`<br>[test](src/project.test.ts) `normal transparent materials project opacity across portable primitives` |
| MeshDepthMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| MeshDistanceMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| MeshLambertMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| MeshMatcapMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| MeshNormalMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| MeshPhongMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| MeshPhysicalMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| MeshStandardMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| MeshToonMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| RawShaderMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| ShaderMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| ShadowMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| PointsMaterial | partial | Untextured colour, normal alpha transparency, per-point RGB, fog, size, and attenuation work. | [test](src/project.test.ts) `Points become Canvas circles with indexed draw ranges and perspective attenuation`<br>[test](src/project.test.ts) `PointsMaterial multiplies per-point RGB colours`<br>[test](src/project.test.ts) `normal transparent materials project opacity across portable primitives`<br>[test](src/project.test.ts) `textured points are omitted with a diagnostic` |
| SpriteMaterial | partial | Solid colour, fog, and normal alpha transparency work; textures are diagnosed. | [test](src/project.test.ts) `Sprite projects its billboard centre, rotation, and perspective attenuation`<br>[test](src/project.test.ts) `normal transparent materials project opacity across portable primitives`<br>[test](src/project.test.ts) `unsupported SpriteMaterial features are omitted with diagnostics` |

### geometry

| Feature | Status | Behaviour | Test |
| --- | --- | --- | --- |
| non-indexed BufferGeometry | full | Position triples render directly. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates` |
| indexed BufferGeometry | full | Index buffers drive triangle, line, and point lookup. | [test](src/project.test.ts) `indexed geometry emits each triangle` |
| drawRange | full | Ranges intersect topology and material groups. | [test](src/project.test.ts) `material groups intersect the geometry draw range` |
| geometry groups | full | Material arrays preserve group ranges and colours. | [test](src/project.test.ts) `material arrays preserve BufferGeometry group colours` |
| world transforms | full | Nested object matrices are applied before projection. | [test](src/project.test.ts) `world transforms under groups are baked into the projected path`<br>[test](src/project.test.ts) `mirrored mesh transforms preserve Three.js front-face semantics` |
| homogeneous frustum clipping | full | Triangles and lines clip against all six planes. | [test](src/project.test.ts) `the homogeneous clip volume cuts a near-plane crossing instead of exploding it`<br>[test](src/project.test.ts) `a line crossing the near plane is clipped to finite viewport coordinates` |
| front, back, and double side | full | Face winding and material side are honoured. | [test](src/project.test.ts) `face side is respected after the viewport y-axis is flipped` |
| mesh and point morph targets | full | Absolute and relative position morphs are evaluated before projection. | [test](src/project.test.ts) `absolute and relative mesh morph targets deform projected triangles`<br>[test](src/project.test.ts) `point morph targets move projected points` |
| line morph targets | full | Position morphs deform line vertices. | [test](src/project.test.ts) `line morph targets deform projected segments` |
| vertex colours | partial | Mesh, line, and point RGB attributes work through portable interpolation, including clipped vertices. Mesh interpolation is screen-space rather than perspective-correct, and vertex-coloured wireframes remain diagnosed. | [test](src/project.test.ts) `mesh vertex colours become a portable interpolated triangle`<br>[test](src/project.test.ts) `mesh clipping interpolates vertex colours at generated edges`<br>[test](src/project.test.ts) `PointsMaterial multiplies per-point RGB colours`<br>[test](src/project.test.ts) `LineBasicMaterial projects clipped RGB vertex colours as a portable gradient` |
| textures and UV sampling | diagnostic | Texture sampling requires a GPU backend. | [test](src/project.test.ts) `unsupported MeshBasicMaterial features emit diagnostics`<br>[test](src/project.test.ts) `textured points are omitted with a diagnostic` |
| transparency and blending | partial | Normal alpha transparency maps to Canvas opacity after opaque primitives; custom blending is diagnosed. | [test](src/project.test.ts) `normal transparent materials project opacity across portable primitives`<br>[test](src/project.test.ts) `transparent primitives paint after opaque primitives`<br>[test](src/project.test.ts) `non-default depth, stencil, write, offset, and blending state emit diagnostics` |
| material clipping planes | full | World-space intersection and union clipping cut meshes, lines, and billboards, and discard points. | [test](src/project.test.ts) `material clipping planes cut meshes and lines and discard points in world space`<br>[test](src/project.test.ts) `clipIntersection retains the disjoint union of material half-spaces`<br>[test](src/project.test.ts) `Sprite clipping planes cut billboards and preserve disjoint union regions` |

### scene

| Feature | Status | Behaviour | Test |
| --- | --- | --- | --- |
| object and material visibility | full | Invisible objects and draw calls remain absent. | [test](src/project.test.ts) `an invisible material emits neither geometry nor a diagnostic` |
| depth ordering | partial | Primitives use painter ordering, not a per-pixel depth buffer. | [test](src/project.test.ts) `far triangles are painted before near triangles` |
| Object3D.renderOrder | full | Explicit object render order groups override the portable painter depth order. | [test](src/project.test.ts) `renderOrder overrides painter depth while preserving stable object order`<br>[test](src/project.test.ts) `Group renderOrder applies to its projected descendants` |
| camera layers | full | Camera and object layer masks filter renderable objects without pruning descendants. | [test](src/project.test.ts) `camera layers filter objects without hiding matching descendants` |
| Scene.overrideMaterial | partial | Supported overrides replace eligible render-list materials while preserving visibility and allowOverride. | [test](src/project.test.ts) `Scene.overrideMaterial preserves render-list visibility and allowOverride` |
| Scene.background | partial | Solid colours become non-interactive Canvas rectangles; textures are diagnosed. | [test](src/project.test.ts) `solid scene backgrounds become non-interactive Canvas rectangles`<br>[test](src/three-canvas.test.tsx) `ThreeCanvas paints scene backgrounds without creating an object control`<br>[test](src/project.test.ts) `texture backgrounds are diagnosed while otherwise portable geometry remains visible` |
| scene fog | partial | Fog and FogExp2 blend meshes, wireframes, lines, points, and sprites. Point and constant-depth output is exact; varying-depth gradients approximate the fragment shader at portable vertices and endpoints. | [test](src/project.test.ts) `linear fog blends mesh vertices and honours material fog opt-out`<br>[test](src/project.test.ts) `fog is evaluated at vertices created by homogeneous clipping`<br>[test](src/project.test.ts) `fog follows lines, points, sprites, and exponential density`<br>[test](src/project.test.ts) `invalid fog ranges are diagnosed instead of producing non-finite colours` |
| renderer tone mapping | out-of-scope | The portable Canvas contract fixes NoToneMapping and has no renderer tone-mapping option. | — |
| depth and stencil material state | diagnostic | Non-default depth, stencil, colour-write, polygon-offset, and blending state is rejected. | [test](src/project.test.ts) `non-default depth, stencil, write, offset, and blending state emit diagnostics` |

### interaction

| Feature | Status | Behaviour | Test |
| --- | --- | --- | --- |
| demand invalidation | full | Revision and imperative invalidation re-project mutations. | [test](src/three-canvas.test.tsx) `ThreeCanvas draws a projected Three scene and invalidates imperative mutations` |
| continuous frame loop | full | onFrame runs before each projection and cancels on unmount. | [test](src/three-canvas.test.tsx) `the continuous loop updates before projecting and stops on unmount` |
| object raycast activation | full | Canvas activation carries the source object and intersection. | [test](src/three-canvas.test.tsx) `projected triangles raycast as one named Three object` |
| object semantic controls | full | Many projected shapes share one labelled control per object. | [test](src/three-canvas.test.tsx) `projected triangles raycast as one named Three object` |

## Interpretation

Topology coverage can be complete while general Three.js compatibility remains low. The portable backend handles every core primitive topology, but GPU materials, textures, lighting, skinning, instancing, and per-pixel depth remain separate work. The silent count is intentionally visible: raising the usable percentage must not hide accepted input whose semantics are lost.
