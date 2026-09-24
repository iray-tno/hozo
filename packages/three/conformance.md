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
| object | 8/11 (72.7%) | 9/11 (81.8%) | 11/11 (100.0%) | 0 | 2 |
| camera | 2/4 (50.0%) | 2/4 (50.0%) | 4/4 (100.0%) | 0 | 2 |
| material | 0/17 (0.0%) | 5/17 (29.4%) | 17/17 (100.0%) | 0 | 1 |
| geometry | 9/13 (69.2%) | 10/13 (76.9%) | 13/13 (100.0%) | 0 | 0 |
| scene | 3/8 (37.5%) | 5/8 (62.5%) | 8/8 (100.0%) | 0 | 1 |
| interaction | 4/4 (100.0%) | 4/4 (100.0%) | 4/4 (100.0%) | 0 | 0 |
| **Three.js surface** | **27/58 (46.6%)** | **36/58 (62.1%)** | **58/58 (100.0%)** | **0** | **6** |

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
| BatchedMesh | diagnostic | Rejected before batch transforms can be lost. | [test](src/project.test.ts) `BatchedMesh emits a diagnostic before losing per-instance state` |
| Bone | out-of-scope | A Bone has no independent render primitive. | — |
| Group | full | Visibility and nested world transforms are traversed. | [test](src/project.test.ts) `world transforms under groups are baked into the projected path` |
| InstancedMesh | partial | Instance transforms project independently; instance colours and morph weights are diagnosed. | [test](src/project.test.ts) `InstancedMesh applies each instance transform and preserves object identity`<br>[test](src/project.test.ts) `InstancedMesh diagnoses per-instance colours before losing them` |
| Line | full | Line strips project through the portable line pipeline. | [test](src/project.test.ts) `Line connects adjacent vertices and honours indexed draw ranges` |
| LineLoop | full | Closed line strips project through the line pipeline. | [test](src/project.test.ts) `LineLoop closes its final vertex back to its first` |
| LineSegments | full | Independent line pairs project through the line pipeline. | [test](src/project.test.ts) `LineSegments become independent Canvas lines with material colour and width` |
| LOD | full | The camera-distance level is selected automatically, or manual visibility is preserved. | [test](src/project.test.ts) `LOD selects the camera-distance level and honours manual visibility` |
| Mesh | full | Triangle meshes use the supported material subset. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates` |
| Points | full | Point vertices project through the circle pipeline. | [test](src/project.test.ts) `Points become Canvas circles with indexed draw ranges and perspective attenuation` |
| Skeleton | out-of-scope | A Skeleton is data consumed by SkinnedMesh. | — |
| SkinnedMesh | diagnostic | Rejected with UNSUPPORTED_MESH. | [test](src/project.test.ts) `unsupported mesh variants emit diagnostics` |
| Sprite | full | Camera-facing quads preserve centre, rotation, scale, and size attenuation. | [test](src/project.test.ts) `Sprite projects its billboard centre, rotation, and perspective attenuation` |

### camera

| Feature | Status | Behaviour | Test |
| --- | --- | --- | --- |
| ArrayCamera | diagnostic | Rejected until child camera viewports are supported. | [test](src/project.test.ts) `ArrayCamera emits a diagnostic instead of using its inherited perspective matrix` |
| Camera | diagnostic | A base camera has no usable projection and is rejected. | [test](src/project.test.ts) `unsupported inputs are omitted with actionable diagnostics` |
| CubeCamera | out-of-scope | Environment capture needs a GPU renderer. | — |
| OrthographicCamera | full | Its public projection matrix is honoured. | [test](src/project.test.ts) `world transforms under groups are baked into the projected path` |
| PerspectiveCamera | full | Its public projection matrix is honoured. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates` |
| StereoCamera | out-of-scope | StereoCamera is a two-camera helper, not a direct render camera. | — |

### material

| Feature | Status | Behaviour | Test |
| --- | --- | --- | --- |
| LineBasicMaterial | partial | Opaque colour and width work; advanced base material state does not. | [test](src/project.test.ts) `LineSegments become independent Canvas lines with material colour and width` |
| LineDashedMaterial | partial | Finite dash and gap intervals split into portable solid segments before projection. | [test](src/project.test.ts) `LineDashedMaterial projects line-distance dash and gap intervals`<br>[test](src/project.test.ts) `invalid or excessive dashed line intervals emit diagnostics` |
| Material | out-of-scope | The abstract material base has no renderable appearance. | — |
| MeshBasicMaterial | partial | Opaque flat colour, sides, groups, and wireframe work. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates`<br>[test](src/project.test.ts) `groups can mix solid and wireframe MeshBasicMaterial` |
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
| PointsMaterial | partial | Opaque untextured material and per-point RGB colours, size, and attenuation work. | [test](src/project.test.ts) `Points become Canvas circles with indexed draw ranges and perspective attenuation`<br>[test](src/project.test.ts) `PointsMaterial multiplies per-point RGB colours`<br>[test](src/project.test.ts) `textured points are omitted with a diagnostic` |
| SpriteMaterial | partial | Solid opaque colour works; texture and translucent features are diagnosed. | [test](src/project.test.ts) `Sprite projects its billboard centre, rotation, and perspective attenuation`<br>[test](src/project.test.ts) `unsupported SpriteMaterial features are omitted with diagnostics` |

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
| vertex colours | partial | Per-point RGB works; interpolated mesh and line colours remain diagnosed. | [test](src/project.test.ts) `PointsMaterial multiplies per-point RGB colours`<br>[test](src/project.test.ts) `unsupported MeshBasicMaterial features emit diagnostics` |
| textures and UV sampling | diagnostic | Texture sampling requires a GPU backend. | [test](src/project.test.ts) `unsupported MeshBasicMaterial features emit diagnostics`<br>[test](src/project.test.ts) `textured points are omitted with a diagnostic` |
| transparency and blending | diagnostic | Non-opaque materials are rejected. | [test](src/project.test.ts) `unsupported MeshBasicMaterial features emit diagnostics` |
| material clipping planes | diagnostic | Per-material clipping planes are rejected. | [test](src/project.test.ts) `unsupported MeshBasicMaterial features emit diagnostics` |

### scene

| Feature | Status | Behaviour | Test |
| --- | --- | --- | --- |
| object and material visibility | full | Invisible objects and draw calls remain absent. | [test](src/project.test.ts) `an invisible material emits neither geometry nor a diagnostic` |
| depth ordering | partial | Primitives use painter ordering, not a per-pixel depth buffer. | [test](src/project.test.ts) `far triangles are painted before near triangles` |
| Object3D.renderOrder | full | Explicit object render order groups override the portable painter depth order. | [test](src/project.test.ts) `renderOrder overrides painter depth while preserving stable object order`<br>[test](src/project.test.ts) `Group renderOrder applies to its projected descendants` |
| camera layers | full | Camera and object layer masks filter renderable objects without pruning descendants. | [test](src/project.test.ts) `camera layers filter objects without hiding matching descendants` |
| Scene.overrideMaterial | diagnostic | Affected geometry is omitted with UNSUPPORTED_SCENE rather than using original materials. | [test](src/project.test.ts) `scene-wide material overrides and fog diagnose and omit affected geometry` |
| Scene.background | partial | Solid colours become non-interactive Canvas rectangles; textures are diagnosed. | [test](src/project.test.ts) `solid scene backgrounds become non-interactive Canvas rectangles`<br>[test](src/three-canvas.test.tsx) `ThreeCanvas paints scene backgrounds without creating an object control`<br>[test](src/project.test.ts) `texture backgrounds are diagnosed while otherwise portable geometry remains visible` |
| scene fog | diagnostic | Fog-affected geometry is omitted with UNSUPPORTED_SCENE. | [test](src/project.test.ts) `scene-wide material overrides and fog diagnose and omit affected geometry` |
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
