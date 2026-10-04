# Three.js coverage

Generated against Three.js r180. Run `pnpm --filter @hozo/three report` to update this file and add `--check` to verify it without writing.

This report keeps three different questions separate:

1. **Portable capability coverage** asks which atomic behaviours can be implemented faithfully or approximately without a GPU.
2. **Three.js surface classification** asks what happens when an upstream class or public surface reaches the portable backend.
3. **Real-scene coverage** executes representative, version-pinned applications and assets in its own report and environment workflows.

Neither table below is a claim that an arbitrary Three.js scene works. In particular, class-level surface rows and atomic capability rows have different denominators and must not be added together.

## Portable capability coverage

Capability status has stricter semantics than the class-level surface table:

- **Exact** reproduces the named atomic behaviour within its stated contract.
- **Approximate** is implemented and useful, with a documented rendering difference.
- **Deferred** appears feasible for the portable CPU/Canvas path but is not implemented yet.
- **Diagnostic** requires a GPU pipeline or is deliberately outside the portable contract and is safely rejected.
- **Silent** accepts the input while losing its semantics without a diagnostic. The target is zero.

### Summary

Every category in the current portable surface inventory now has an independently owned capability inventory. Cross-cutting colour, texture, transparency, and normal-shading behaviour belongs to material; geometry owns shape traversal, deformation, transforms, and clipping; objects own discovery, selection, routing, and source identity; cameras own view/projection and multi-viewport composition; scene owns traversal policy, composition, backgrounds, ordering, and fog; topology owns primitive assembly; interaction owns invalidation, frames, hit testing, and semantic controls. This prevents the overall denominator from counting the same behaviour twice.

| Scope | Exact | Approximate | Deferred | Feasible | Implemented feasible | Diagnostic | Silent |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Material** | **21** | **9** | **0** | **30** | **30/30 (100.0%)** | **6** | **0** |
| **Geometry** | **26** | **0** | **0** | **26** | **26/26 (100.0%)** | **0** | **0** |
| **Object** | **22** | **0** | **0** | **22** | **22/22 (100.0%)** | **0** | **0** |
| **Camera** | **7** | **0** | **0** | **7** | **7/7 (100.0%)** | **3** | **0** |
| **Scene** | **14** | **2** | **0** | **16** | **16/16 (100.0%)** | **3** | **0** |
| **Topology** | **5** | **0** | **0** | **5** | **5/5 (100.0%)** | **0** | **0** |
| **Interaction** | **10** | **0** | **0** | **10** | **10/10 (100.0%)** | **0** | **0** |
| **Overall portable capability** | **105** | **11** | **0** | **116** | **116/116 (100.0%)** | **12** | **0** |

Overall exact capability coverage is **105/116 (90.5%)**. Including documented approximations, implemented feasible coverage is **116/116 (100.0%)**. This is a portable capability ceiling, not a real-scene success rate; GPU-required diagnostics remain visible and the separate version-pinned scene corpus reports application-shaped evidence independently.

### Material capability details

| Owner | Capability | Status | Behaviour | Test |
| --- | --- | --- | --- | --- |
| Material | visibility | exact | Invisible materials omit their primitive without a diagnostic. | [test](src/project.test.ts) `an invisible material emits neither geometry nor a diagnostic` |
| Material | normal alpha transparency | exact | Uniform opacity and normal transparency are preserved across supported primitives. | [test](src/project.test.ts) `normal transparent materials project opacity across portable primitives` |
| Material | uniform alpha test | exact | A uniform primitive is discarded when its opacity is below alphaTest. | [test](src/project.test.ts) `uniform alphaTest omits every supported primitive only below its threshold` |
| MeshBasicMaterial | uniform colour | exact | A flat material colour is preserved on projected triangles. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates` |
| MeshBasicMaterial | face side selection | exact | FrontSide, BackSide, and DoubleSide follow Three.js winding semantics. | [test](src/project.test.ts) `face side is respected after the viewport y-axis is flipped` |
| MeshBasicMaterial | solid wireframe | exact | Triangle edges become independent portable lines. | [test](src/project.test.ts) `wireframe MeshBasicMaterial becomes three Canvas lines per triangle` |
| LineBasicMaterial | uniform colour | exact | Line colour is preserved. | [test](src/project.test.ts) `LineSegments become independent Canvas lines with material colour and width` |
| LineBasicMaterial | line width | exact | The requested portable stroke width is preserved. | [test](src/project.test.ts) `LineSegments become independent Canvas lines with material colour and width` |
| LineDashedMaterial | dash and gap intervals | exact | Finite line-distance intervals are split into equivalent solid segments. | [test](src/project.test.ts) `LineDashedMaterial projects line-distance dash and gap intervals` |
| PointsMaterial | uniform colour | exact | Point colour is preserved. | [test](src/project.test.ts) `Points become Canvas circles with indexed draw ranges and perspective attenuation` |
| PointsMaterial | point size | exact | The requested material size becomes the point diameter. | [test](src/project.test.ts) `PointsMaterial can keep a fixed screen-space size` |
| PointsMaterial | size attenuation modes | exact | Perspective and fixed screen-space sizing both follow the material flag. | [test](src/project.test.ts) `Points become Canvas circles with indexed draw ranges and perspective attenuation`<br>[test](src/project.test.ts) `PointsMaterial can keep a fixed screen-space size` |
| SpriteMaterial | rotation | exact | Billboard rotation is preserved. | [test](src/project.test.ts) `Sprite projects its billboard centre, rotation, and perspective attenuation` |
| SpriteMaterial | size attenuation mode | exact | Perspective and fixed screen-space sizing follow the material flag. | [test](src/project.test.ts) `Sprite projects its billboard centre, rotation, and perspective attenuation` |
| MeshBasicMaterial | RGB vertex interpolation | approximate | Vertex colours are interpolated in the portable 2D backend; GPU perspective-correct interpolation is not promised. | [test](src/project.test.ts) `mesh vertex colours become a portable interpolated triangle` |
| Vertex-coloured materials | RGBA vertex alpha interpolation | approximate | Transparent vertex alpha is preserved through the portable colour interpolation path. | [test](src/project.test.ts) `transparent RGBA vertex attributes preserve alpha across portable primitives` |
| MeshBasicMaterial | wireframe vertex-colour interpolation | approximate | Each projected edge uses a portable linear colour gradient. | [test](src/project.test.ts) `wireframe MeshBasicMaterial preserves RGB vertex colours as edge gradients` |
| LineBasicMaterial | vertex-colour interpolation | approximate | Projected segments use portable linear colour gradients. | [test](src/project.test.ts) `LineBasicMaterial projects clipped RGB vertex colours as a portable gradient` |
| PointsMaterial | per-point colour | exact | Each point multiplies its RGB attribute by the material colour. | [test](src/project.test.ts) `PointsMaterial multiplies per-point RGB colours` |
| MeshBasicMaterial | affine colour-map projection | approximate | Supported sRGB maps preserve transformed UVs, but projection is affine rather than perspective-correct. | [test](src/project.test.ts) `MeshBasicMaterial map and UVs become a portable textured triangle` |
| Texture-backed materials | clamp, repeat, and mirrored wrapping | exact | Clamp, repeat, and mirror modes are preserved independently on each texture axis, including negative UVs. | [test](src/project.test.ts) `mixed clamp and repeat wrapping stays portable per texture axis`<br>[test](src/project.test.ts) `mirrored wrapping preserves negative and transformed UVs on either axis` |
| PointsMaterial | point-sprite colour map | approximate | A supported map becomes a portable textured quad without the full GPU sampling pipeline. | [test](src/project.test.ts) `PointsMaterial map becomes a portable point-sprite texture` |
| Texture-backed materials | linear material-colour modulation | exact | Mesh, point, and sprite maps multiply decoded linear RGB by the material colour before encoding; alpha is preserved. Affine/filtering approximation is classified separately. | [test](src/project.test.ts) `texture maps preserve linear material tint for meshes, points, and sprites` |
| SpriteMaterial | affine colour map | approximate | A supported map follows clipped billboard UVs without perspective sampling. | [test](src/project.test.ts) `SpriteMaterial map preserves billboard UVs through clipping` |
| MeshNormalMaterial | smooth view-space normal shading | approximate | Vertex normals become portable colours; per-fragment normal interpolation is not reproduced. | [test](src/project.test.ts) `MeshNormalMaterial projects smooth and flat view-space normals` |
| MeshNormalMaterial | flat view-space normal shading | exact | A face normal is evaluated once for each projected triangle. | [test](src/project.test.ts) `MeshNormalMaterial projects smooth and flat view-space normals` |
| MeshNormalMaterial | wireframe normal shading | approximate | Normal-derived endpoint colours become portable linear edge gradients; GPU perspective-correct interpolation is not promised. | [test](src/project.test.ts) `MeshNormalMaterial wireframe projects normal-coloured clipped edges` |
| MeshNormalMaterial | instanced normal shading | exact | Each instance uses its own view-space normal matrix; the separately inventoried smooth-shading interpolation boundary is unchanged. | [test](src/project.test.ts) `InstancedMesh projects each normal matrix for filled and wireframe normal materials` |
| MeshNormalMaterial | skinned normal shading | exact | Morphed positions and normals use the same weighted bone and bind-matrix transforms as the upstream normal-material vertex path. | [test](src/project.test.ts) `MeshNormalMaterial skins morphed positions and normals in bone space` |
| MeshNormalMaterial | morphed normal shading | exact | Absolute and relative position and normal targets are blended before normal-material projection; the separately inventoried smooth-shading interpolation boundary is unchanged. | [test](src/project.test.ts) `MeshNormalMaterial projects position and normal morph targets` |
| Texture-backed materials | general GPU texture sampling | diagnostic | Unsupported colour spaces, transforms, and GPU sampling state are rejected. | [test](src/project.test.ts) `non-portable texture sampling is refused with an actionable diagnostic` |
| Lit mesh materials | lighting models | diagnostic | Lambert, Phong, Standard, Physical, Toon, and Matcap shading require a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| Depth and shadow materials | depth, distance, and shadow output | diagnostic | Depth, distance, and shadow materials depend on GPU passes unavailable to the portable projector. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| ShaderMaterial | custom shaders | diagnostic | ShaderMaterial and RawShaderMaterial require a programmable GPU pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| MeshNormalMaterial | normal, bump, and displacement maps | diagnostic | Per-fragment and displacement texture evaluation requires a GPU material pipeline. | [test](src/project.test.ts) `non-portable MeshNormalMaterial features stay diagnostic` |
| Material | custom depth, stencil, blending, and sampling state | diagnostic | Non-default GPU pipeline state is rejected instead of being silently approximated. | [test](src/project.test.ts) `non-default depth, stencil, write, offset, blending, and sampling state emit diagnostics` |

### Geometry capability details

| Owner | Capability | Status | Behaviour | Test |
| --- | --- | --- | --- | --- |
| BufferGeometry | non-indexed triangle traversal | exact | Position triples are traversed directly as triangles. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates` |
| BufferGeometry | indexed triangle traversal | exact | Triangle vertex lookup follows the geometry index. | [test](src/project.test.ts) `indexed geometry emits each triangle` |
| BufferGeometry | indexed line traversal | exact | Line vertex lookup follows the geometry index. | [test](src/project.test.ts) `Line connects adjacent vertices and honours indexed draw ranges` |
| BufferGeometry | indexed point traversal | exact | Point vertex lookup follows the geometry index. | [test](src/project.test.ts) `Points become Canvas circles with indexed draw ranges and perspective attenuation` |
| BufferGeometry | mesh draw range | exact | The requested draw range intersects mesh topology and material groups. | [test](src/project.test.ts) `material groups intersect the geometry draw range` |
| BufferGeometry | wireframe draw range | exact | Triangle draw ranges are converted to the equivalent wireframe edge range. | [test](src/project.test.ts) `wireframe projection applies the same doubled draw range as Three.js` |
| BufferGeometry | line draw range | exact | Indexed line traversal is restricted to the requested draw range. | [test](src/project.test.ts) `Line connects adjacent vertices and honours indexed draw ranges` |
| BufferGeometry | point draw range | exact | Indexed point traversal is restricted to the requested draw range. | [test](src/project.test.ts) `Points become Canvas circles with indexed draw ranges and perspective attenuation` |
| BufferGeometry | material groups | exact | Group ranges select the matching entry from a material array. | [test](src/project.test.ts) `material arrays preserve BufferGeometry group colours` |
| Object3D transforms | nested world transforms | exact | Ancestor and local matrices are composed before projection. | [test](src/project.test.ts) `world transforms under groups are baked into the projected path` |
| Object3D transforms | mirrored winding | exact | A negative world determinant preserves Three.js front-face semantics. | [test](src/project.test.ts) `mirrored mesh transforms preserve Three.js front-face semantics` |
| Projection | triangle frustum clipping | exact | Triangles are clipped in homogeneous coordinates against all six planes. | [test](src/project.test.ts) `the homogeneous clip volume cuts a near-plane crossing instead of exploding it` |
| Projection | line frustum clipping | exact | Line segments crossing the clip volume become finite projected segments. | [test](src/project.test.ts) `a line crossing the near plane is clipped to finite viewport coordinates` |
| Projection | point frustum rejection | exact | Points outside the homogeneous clip volume are omitted. | [test](src/project.test.ts) `points outside the homogeneous clip volume are omitted` |
| Clipped attributes | texture-coordinate interpolation | exact | New clip-edge vertices receive the corresponding affine texture coordinates. | [test](src/project.test.ts) `mesh clipping interpolates texture coordinates at generated edges` |
| Clipped attributes | vertex-colour interpolation | exact | New clip-edge vertices receive the corresponding colour and alpha values. | [test](src/project.test.ts) `mesh clipping interpolates vertex colours at generated edges` |
| Morph targets | absolute mesh positions | exact | Absolute position targets are blended before projection. | [test](src/project.test.ts) `absolute and relative mesh morph targets deform projected triangles` |
| Morph targets | relative mesh positions | exact | Relative position deltas are blended before projection. | [test](src/project.test.ts) `absolute and relative mesh morph targets deform projected triangles` |
| Morph targets | point positions | exact | Point position targets move projected points. | [test](src/project.test.ts) `point morph targets move projected points` |
| Morph targets | line positions | exact | Line position targets deform projected segments. | [test](src/project.test.ts) `line morph targets deform projected segments` |
| SkinnedMesh | CPU skinned positions | exact | Morph targets, bind matrices, weights, and the current skeleton pose produce final positions. | [test](src/project.test.ts) `SkinnedMesh evaluates morph targets before public CPU bone transforms` |
| InstancedMesh | instance transforms | exact | Each active instance matrix is applied independently. | [test](src/project.test.ts) `InstancedMesh applies each instance transform and preserves object identity` |
| InstancedMesh | per-instance morph weights | exact | Each instance evaluates its own position morph weights. | [test](src/project.test.ts) `InstancedMesh applies per-instance colours and morph weights` |
| BatchedMesh | geometry and instance ranges | exact | Sparse instance IDs select their geometry range, visibility, and transform. | [test](src/project.test.ts) `BatchedMesh projects sparse visible instances with transforms and colours` |
| Material clipping | intersection half-spaces | exact | World-space clipping planes cut meshes and lines and discard rejected points. | [test](src/project.test.ts) `material clipping planes cut meshes and lines and discard points in world space` |
| Material clipping | union half-spaces | exact | clipIntersection retains the disjoint union of accepted half-spaces. | [test](src/project.test.ts) `clipIntersection retains the disjoint union of material half-spaces` |

### Object capability details

| Owner | Capability | Status | Behaviour | Test |
| --- | --- | --- | --- | --- |
| Object3D | individual visibility | exact | An invisible renderable object is omitted. | [test](src/project.test.ts) `object visibility prunes objects and hidden subtrees` |
| Group | descendant traversal | exact | Renderable descendants are discovered through nested groups. | [test](src/project.test.ts) `world transforms under groups are baked into the projected path` |
| Group | hidden-subtree pruning | exact | An invisible ancestor removes its complete subtree. | [test](src/project.test.ts) `object visibility prunes objects and hidden subtrees` |
| Mesh | triangle-pipeline routing | exact | A Mesh is routed to the portable triangle pipeline. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates` |
| Line | line-strip routing | exact | A Line is routed to the portable connected-line pipeline. | [test](src/project.test.ts) `Line connects adjacent vertices and honours indexed draw ranges` |
| LineLoop | closed-line routing | exact | A LineLoop selects the closed portable line topology. | [test](src/project.test.ts) `LineLoop closes its final vertex back to its first` |
| LineSegments | independent-segment routing | exact | LineSegments selects independent portable line pairs. | [test](src/project.test.ts) `LineSegments become independent Canvas lines with material colour and width` |
| Points | point-pipeline routing | exact | Points is routed to the portable point pipeline. | [test](src/project.test.ts) `Points become Canvas circles with indexed draw ranges and perspective attenuation` |
| Sprite | camera-facing quad | exact | A Sprite becomes a camera-facing quad at its projected centre. | [test](src/project.test.ts) `Sprite projects its billboard centre, rotation, and perspective attenuation` |
| Sprite | centre anchor | exact | The public centre shifts the billboard anchor. | [test](src/project.test.ts) `Sprite projects its billboard centre, rotation, and perspective attenuation` |
| Sprite | object scale | exact | World scale controls the billboard dimensions. | [test](src/project.test.ts) `Sprite projects its billboard centre, rotation, and perspective attenuation` |
| Sprite | draw count visibility | exact | A zero draw count omits the sprite. | [test](src/project.test.ts) `Sprite projects its billboard centre, rotation, and perspective attenuation` |
| InstancedMesh | active instance count | exact | Only instances below the public count are projected. | [test](src/project.test.ts) `InstancedMesh applies each instance transform and preserves object identity` |
| InstancedMesh | source object identity | exact | Every projected instance retains the InstancedMesh as its source object. | [test](src/project.test.ts) `InstancedMesh applies each instance transform and preserves object identity` |
| InstancedMesh | per-instance colour | exact | Each instance colour modulates the supported base material colour. | [test](src/project.test.ts) `InstancedMesh applies per-instance colours and morph weights` |
| BatchedMesh | sparse instance selection | exact | Deleted sparse instance IDs are skipped without shifting active IDs. | [test](src/project.test.ts) `BatchedMesh projects sparse visible instances with transforms and colours` |
| BatchedMesh | per-instance visibility | exact | The public visibility flag independently hides a batch instance. | [test](src/project.test.ts) `BatchedMesh projects sparse visible instances with transforms and colours` |
| BatchedMesh | per-instance colour | exact | A batch instance colour modulates the supported base material colour. | [test](src/project.test.ts) `BatchedMesh projects sparse visible instances with transforms and colours` |
| BatchedMesh | source object identity | exact | Every projected batch instance retains the BatchedMesh as its source object. | [test](src/project.test.ts) `BatchedMesh projects sparse visible instances with transforms and colours` |
| LOD | camera-distance selection | exact | Automatic LOD selects the level for the current camera distance. | [test](src/project.test.ts) `LOD selects the camera-distance level and honours manual visibility` |
| LOD | manual level visibility | exact | Disabling automatic updates preserves application-controlled level visibility. | [test](src/project.test.ts) `LOD selects the camera-distance level and honours manual visibility` |
| SkinnedMesh | source object identity | exact | Projected skinned primitives retain their SkinnedMesh source object. | [test](src/project.test.ts) `SkinnedMesh evaluates morph targets before public CPU bone transforms` |

### Camera capability details

| Owner | Capability | Status | Behaviour | Test |
| --- | --- | --- | --- | --- |
| PerspectiveCamera | projection matrix | exact | The public perspective projection matrix maps clip coordinates. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates` |
| PerspectiveCamera | world-to-view transform | exact | The public camera world matrix is inverted before projection. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates` |
| OrthographicCamera | projection matrix | exact | The public orthographic projection matrix maps clip coordinates. | [test](src/project.test.ts) `world transforms under groups are baked into the projected path` |
| OrthographicCamera | world-to-view transform | exact | The public camera world matrix is inverted before orthographic projection. | [test](src/project.test.ts) `world transforms under groups are baked into the projected path` |
| ArrayCamera | declared sub-camera order | exact | Sub-cameras project in their declared order. | [test](src/project.test.ts) `ArrayCamera projects each sub-camera into its bottom-left viewport` |
| ArrayCamera | bottom-left viewport mapping | exact | Three.js bottom-left viewport coordinates map to portable top-left groups. | [test](src/project.test.ts) `ArrayCamera projects each sub-camera into its bottom-left viewport` |
| ArrayCamera | single scene decoration pass | exact | Scene background decoration is emitted once around all sub-camera groups. | [test](src/project.test.ts) `ArrayCamera projects each sub-camera into its bottom-left viewport` |
| ArrayCamera | missing viewport refusal | diagnostic | A sub-camera without an explicit viewport is rejected. | [test](src/project.test.ts) `ArrayCamera diagnoses sub-cameras without a viewport` |
| Camera | base camera projection | diagnostic | A base Camera has no usable projection matrix contract and is rejected. | [test](src/project.test.ts) `unsupported inputs are omitted with actionable diagnostics` |
| CubeCamera | environment capture | diagnostic | Cube environment capture requires a GPU renderer and render target. | [test](src/project.test.ts) `GPU capture cameras remain diagnostic` |

### Scene capability details

| Owner | Capability | Status | Behaviour | Test |
| --- | --- | --- | --- | --- |
| Render list | opaque and transparent partition | exact | Transparent primitives paint after opaque primitives. | [test](src/project.test.ts) `transparent primitives paint after opaque primitives` |
| Render list | primitive painter ordering | approximate | Non-intersecting primitives sort far-to-near, but there is no per-pixel depth buffer. | [test](src/project.test.ts) `far triangles are painted before near triangles` |
| Object3D.renderOrder | explicit object ordering | exact | An explicit object render order overrides portable painter depth. | [test](src/project.test.ts) `renderOrder overrides painter depth while preserving stable object order` |
| Object3D.renderOrder | stable equal-order traversal | exact | Objects with the same render order and depth retain stable traversal order. | [test](src/project.test.ts) `renderOrder overrides painter depth while preserving stable object order` |
| Group.renderOrder | descendant ordering group | exact | A group render order is inherited by its projected descendants. | [test](src/project.test.ts) `Group renderOrder applies to its projected descendants` |
| Layers | camera-object mask filtering | exact | Layer masks filter each renderable without pruning matching descendants. | [test](src/project.test.ts) `camera layers filter objects without hiding matching descendants` |
| Scene.overrideMaterial | eligible material replacement | exact | The override replaces supported materials after render-list visibility is resolved. | [test](src/project.test.ts) `Scene.overrideMaterial preserves render-list visibility and allowOverride` |
| Scene.overrideMaterial | allowOverride opt-out | exact | Materials with allowOverride disabled retain their original appearance. | [test](src/project.test.ts) `Scene.overrideMaterial preserves render-list visibility and allowOverride` |
| Scene.background | solid colour decoration | exact | A colour fills the viewport without becoming an interactive object. | [test](src/project.test.ts) `solid scene backgrounds become non-interactive Canvas rectangles` |
| Scene.background | 2D texture placement | exact | A supported 2D colour texture covers the viewport as non-interactive decoration. | [test](src/project.test.ts) `a 2D texture background becomes a viewport-sized portable mesh` |
| Scene.background | background intensity | exact | Supported 2D backgrounds multiply sampled RGB while preserving texture alpha. | [test](src/project.test.ts) `scene background intensity modulates texture RGB` |
| Scene.background | 2D texture blur semantics | exact | backgroundBlurriness remains a no-op for ordinary 2D textures, matching Three.js; environment maps are classified separately. | [test](src/project.test.ts) `scene background blurriness is a no-op for 2D textures` |
| Scene.background | environment-map sampling | diagnostic | Cube and equirectangular environment projection requires a GPU sampling pipeline. | [test](src/project.test.ts) `environment backgrounds are diagnosed while portable geometry remains visible` |
| Fog | material opt-out | exact | Materials with fog disabled retain their unfogged colour. | [test](src/project.test.ts) `linear fog blends mesh vertices and honours material fog opt-out` |
| Fog | constant-depth linear fog | exact | A constant-depth primitive receives the matching linear fog colour. | [test](src/project.test.ts) `fog follows lines, points, sprites, and exponential density` |
| FogExp2 | constant-depth exponential fog | exact | A constant-depth primitive receives the matching exponential fog colour. | [test](src/project.test.ts) `fog follows lines, points, sprites, and exponential density` |
| Fog | varying-depth vertex fog | approximate | Fog is evaluated at portable vertices and endpoints rather than per fragment. | [test](src/project.test.ts) `fog is evaluated at vertices created by homogeneous clipping`<br>[test](src/project.test.ts) `fog follows lines, points, sprites, and exponential density` |
| Fog | invalid range refusal | diagnostic | Invalid or non-finite fog parameters are rejected instead of producing invalid colours. | [test](src/project.test.ts) `invalid fog ranges are diagnosed instead of producing non-finite colours` |
| Depth buffer | per-pixel depth and stencil | diagnostic | Exact intersecting-surface depth and stencil evaluation requires a raster pipeline. | [test](src/project.test.ts) `non-default depth, stencil, write, offset, blending, and sampling state emit diagnostics` |

### Topology capability details

| Owner | Capability | Status | Behaviour | Test |
| --- | --- | --- | --- | --- |
| Triangles | triangle-list assembly | exact | Every complete vertex triple becomes one triangle primitive. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates`<br>[test](src/project.test.ts) `indexed geometry emits each triangle` |
| Line | line-strip adjacency | exact | Each adjacent vertex pair becomes a connected segment. | [test](src/project.test.ts) `Line connects adjacent vertices and honours indexed draw ranges` |
| LineLoop | loop closure | exact | The final vertex connects back to the first vertex. | [test](src/project.test.ts) `LineLoop closes its final vertex back to its first` |
| LineSegments | independent pairs | exact | Each disjoint vertex pair becomes one segment. | [test](src/project.test.ts) `LineSegments become independent Canvas lines with material colour and width` |
| Points | independent point primitives | exact | Each selected vertex becomes one point primitive. | [test](src/project.test.ts) `Points become Canvas circles with indexed draw ranges and perspective attenuation` |

### Interaction capability details

| Owner | Capability | Status | Behaviour | Test |
| --- | --- | --- | --- | --- |
| Demand rendering | imperative invalidation | exact | The public handle re-projects mutations made to stable scene objects. | [test](src/three-canvas.test.tsx) `ThreeCanvas draws a projected Three scene and invalidates imperative mutations` |
| Demand rendering | revision invalidation | exact | Changing the application-owned revision re-projects stable scene objects. | [test](src/three-canvas.test.tsx) `revision re-projects imperative scene mutations` |
| Continuous rendering | onFrame before projection | exact | The frame callback mutates the scene before that frame is projected. | [test](src/three-canvas.test.tsx) `the continuous loop updates before projecting and stops on unmount` |
| Continuous rendering | unmount cancellation | exact | Unmounting cancels the outstanding animation frame. | [test](src/three-canvas.test.tsx) `the continuous loop updates before projecting and stops on unmount` |
| Raycast activation | source object | exact | Activation reports the original Three.js object. | [test](src/three-canvas.test.tsx) `projected triangles raycast as one named Three object` |
| Raycast activation | Three.js intersection | exact | Activation carries the matching Three.js raycast intersection. | [test](src/three-canvas.test.tsx) `projected triangles raycast as one named Three object` |
| Active object | pointer entry | exact | Pointer movement reports the intersected object and intersection. | [test](src/three-canvas.test.tsx) `projected triangles raycast as one named Three object` |
| Active object | pointer leave | exact | Leaving the surface clears the active object. | [test](src/three-canvas.test.tsx) `projected triangles raycast as one named Three object` |
| Semantic controls | one control per source object | exact | Multiple projected primitives from one object share one semantic control. | [test](src/three-canvas.test.tsx) `projected triangles raycast as one named Three object` |
| Semantic controls | object-name label | exact | The source object name labels its semantic control. | [test](src/three-canvas.test.tsx) `projected triangles raycast as one named Three object` |

## Three.js surface classification

This measures the version-audited upstream surface presented to the portable Hozo Canvas backend. It deliberately separates compatibility from safe refusal:

- **Exact** counts rows implemented without a named restriction.
- **Usable** adds partial implementations with documented restrictions.
- **Safe** adds unsupported inputs that produce a diagnostic instead of misleading output.
- **Silent** is a known semantic loss with no diagnostic. These are the highest-priority gaps.
- **Out of scope** is excluded from every percentage.

The rows are an unweighted API surface. The overall Three.js surface figure excludes Hozo's additional interaction contract, which remains visible as its own category. A later corpus report should weight the upstream rows by real scene usage; ordinary glTF scenes rely heavily on `MeshStandardMaterial`, so this table must not be read as a real-model success rate.

### Summary

| Category | Exact | Usable | Safe | Silent | Out of scope |
| --- | ---: | ---: | ---: | ---: | ---: |
| topology | 5/5 (100.0%) | 5/5 (100.0%) | 5/5 (100.0%) | 0 | 0 |
| object | 11/11 (100.0%) | 11/11 (100.0%) | 11/11 (100.0%) | 0 | 2 |
| camera | 3/4 (75.0%) | 3/4 (75.0%) | 4/4 (100.0%) | 0 | 2 |
| material | 0/17 (0.0%) | 6/17 (35.3%) | 17/17 (100.0%) | 0 | 1 |
| geometry | 10/13 (76.9%) | 13/13 (100.0%) | 13/13 (100.0%) | 0 | 0 |
| scene | 3/8 (37.5%) | 7/8 (87.5%) | 8/8 (100.0%) | 0 | 1 |
| interaction | 4/4 (100.0%) | 4/4 (100.0%) | 4/4 (100.0%) | 0 | 0 |
| **Class-level surface** | **32/58 (55.2%)** | **45/58 (77.6%)** | **58/58 (100.0%)** | **0** | **6** |

### Detailed surface

#### topology

| Feature | Status | Behaviour | Test |
| --- | --- | --- | --- |
| triangles | full | Indexed and non-indexed triangles become clipped paths. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates`<br>[test](src/project.test.ts) `indexed geometry emits each triangle` |
| line strip | full | Adjacent vertices become connected Canvas lines. | [test](src/project.test.ts) `Line connects adjacent vertices and honours indexed draw ranges` |
| line loop | full | The final vertex is connected back to the first. | [test](src/project.test.ts) `LineLoop closes its final vertex back to its first` |
| line segments | full | Each vertex pair becomes an independent line. | [test](src/project.test.ts) `LineSegments become independent Canvas lines with material colour and width` |
| points | full | Points become circles or textured point-sprite quads with optional perspective attenuation. | [test](src/project.test.ts) `Points become Canvas circles with indexed draw ranges and perspective attenuation` |

#### object

| Feature | Status | Behaviour | Test |
| --- | --- | --- | --- |
| BatchedMesh | full | Sparse instance IDs, geometry ranges, visibility, transforms, and colours are projected. | [test](src/project.test.ts) `BatchedMesh projects sparse visible instances with transforms and colours` |
| Bone | out-of-scope | A Bone has no independent render primitive. | — |
| Group | full | Visibility and nested world transforms are traversed. | [test](src/project.test.ts) `world transforms under groups are baked into the projected path`<br>[test](src/project.test.ts) `object visibility prunes objects and hidden subtrees` |
| InstancedMesh | full | Instance transforms, colours, and morph weights project independently. | [test](src/project.test.ts) `InstancedMesh applies each instance transform and preserves object identity`<br>[test](src/project.test.ts) `InstancedMesh applies per-instance colours and morph weights` |
| Line | full | Line strips project through the portable line pipeline. | [test](src/project.test.ts) `Line connects adjacent vertices and honours indexed draw ranges` |
| LineLoop | full | Closed line strips project through the line pipeline. | [test](src/project.test.ts) `LineLoop closes its final vertex back to its first` |
| LineSegments | full | Independent line pairs project through the line pipeline. | [test](src/project.test.ts) `LineSegments become independent Canvas lines with material colour and width` |
| LOD | full | The camera-distance level is selected automatically, or manual visibility is preserved. | [test](src/project.test.ts) `LOD selects the camera-distance level and honours manual visibility` |
| Mesh | full | Triangle meshes use the supported material subset. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates` |
| Points | full | Point vertices project through the portable point pipeline. | [test](src/project.test.ts) `Points become Canvas circles with indexed draw ranges and perspective attenuation` |
| Skeleton | out-of-scope | A Skeleton is data consumed by SkinnedMesh. | — |
| SkinnedMesh | full | Public CPU morph and bone transforms are evaluated. | [test](src/project.test.ts) `SkinnedMesh evaluates morph targets before public CPU bone transforms` |
| Sprite | full | Camera-facing quads preserve centre, rotation, scale, and size attenuation. | [test](src/project.test.ts) `Sprite projects its billboard centre, rotation, and perspective attenuation` |

#### camera

| Feature | Status | Behaviour | Test |
| --- | --- | --- | --- |
| ArrayCamera | full | Each child camera projects into its bottom-left viewport in declared order. | [test](src/project.test.ts) `ArrayCamera projects each sub-camera into its bottom-left viewport`<br>[test](src/project.test.ts) `ArrayCamera diagnoses sub-cameras without a viewport` |
| Camera | diagnostic | A base camera has no usable projection and is rejected. | [test](src/project.test.ts) `unsupported inputs are omitted with actionable diagnostics` |
| CubeCamera | out-of-scope | Environment capture needs a GPU renderer. | [test](src/project.test.ts) `GPU capture cameras remain diagnostic` |
| OrthographicCamera | full | Its public projection matrix is honoured. | [test](src/project.test.ts) `world transforms under groups are baked into the projected path` |
| PerspectiveCamera | full | Its public projection matrix is honoured. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates` |
| StereoCamera | out-of-scope | StereoCamera is a two-camera helper, not a direct render camera. | — |

#### material

| Feature | Status | Behaviour | Test |
| --- | --- | --- | --- |
| LineBasicMaterial | partial | Colour, width, RGB vertex gradients, fog, and normal alpha transparency work; advanced base material state does not. | [test](src/project.test.ts) `LineSegments become independent Canvas lines with material colour and width`<br>[test](src/project.test.ts) `LineBasicMaterial projects clipped RGB vertex colours as a portable gradient`<br>[test](src/project.test.ts) `normal transparent materials project opacity across portable primitives` |
| LineDashedMaterial | partial | Finite dash and gap intervals split into portable solid segments before projection. | [test](src/project.test.ts) `LineDashedMaterial projects line-distance dash and gap intervals`<br>[test](src/project.test.ts) `invalid or excessive dashed line intervals emit diagnostics` |
| Material | out-of-scope | The abstract material base has no renderable appearance. | — |
| MeshBasicMaterial | partial | Flat and RGB vertex colours, including wireframe edge gradients, a constrained affine colour map, fog, normal alpha transparency, sides, groups, and wireframe work. | [test](src/project.test.ts) `a Three.js triangle becomes a Canvas path in viewport coordinates`<br>[test](src/project.test.ts) `MeshBasicMaterial map and UVs become a portable textured triangle`<br>[test](src/project.test.ts) `groups can mix solid and wireframe MeshBasicMaterial`<br>[test](src/project.test.ts) `wireframe MeshBasicMaterial preserves RGB vertex colours as edge gradients`<br>[test](src/project.test.ts) `normal transparent materials project opacity across portable primitives` |
| MeshDepthMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| MeshDistanceMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| MeshLambertMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| MeshMatcapMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| MeshPhongMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| MeshPhysicalMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| MeshStandardMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| MeshToonMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| RawShaderMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| ShaderMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| ShadowMaterial | diagnostic | Rejected because correct output needs a GPU material pipeline. | [test](src/project.test.ts) `unsupported mesh material classes emit diagnostics` |
| MeshNormalMaterial | partial | Smooth and flat view-space normals become portable vertex colours for ordinary, instanced, morphed, and skinned meshes, including wireframes; normal/bump/displacement maps stay diagnostic. | [test](src/project.test.ts) `MeshNormalMaterial projects smooth and flat view-space normals`<br>[test](src/project.test.ts) `MeshNormalMaterial wireframe projects normal-coloured clipped edges`<br>[test](src/project.test.ts) `InstancedMesh projects each normal matrix for filled and wireframe normal materials`<br>[test](src/project.test.ts) `MeshNormalMaterial projects position and normal morph targets`<br>[test](src/project.test.ts) `MeshNormalMaterial skins morphed positions and normals in bone space`<br>[test](src/project.test.ts) `non-portable MeshNormalMaterial features stay diagnostic` |
| PointsMaterial | partial | Colour, normal alpha transparency, per-point RGB, fog, size, attenuation, and the constrained point-sprite colour-map subset work. | [test](src/project.test.ts) `Points become Canvas circles with indexed draw ranges and perspective attenuation`<br>[test](src/project.test.ts) `PointsMaterial multiplies per-point RGB colours`<br>[test](src/project.test.ts) `normal transparent materials project opacity across portable primitives`<br>[test](src/project.test.ts) `PointsMaterial map becomes a portable point-sprite texture` |
| SpriteMaterial | partial | Solid colour, fog, normal alpha transparency, and the constrained affine colour-map subset work. | [test](src/project.test.ts) `Sprite projects its billboard centre, rotation, and perspective attenuation`<br>[test](src/project.test.ts) `SpriteMaterial map preserves billboard UVs through clipping`<br>[test](src/project.test.ts) `normal transparent materials project opacity across portable primitives`<br>[test](src/project.test.ts) `unsupported SpriteMaterial features are omitted with diagnostics` |

#### geometry

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
| vertex colours | partial | Mesh, wireframe, line, and point RGB attributes work through portable interpolation, including clipped vertices. Transparent RGBA attributes also preserve vertex alpha; opaque RGBA and alpha-tested gradients stay diagnostic. Filled mesh interpolation is screen-space rather than perspective-correct. | [test](src/project.test.ts) `mesh vertex colours become a portable interpolated triangle`<br>[test](src/project.test.ts) `mesh clipping interpolates vertex colours at generated edges`<br>[test](src/project.test.ts) `wireframe MeshBasicMaterial preserves RGB vertex colours as edge gradients`<br>[test](src/project.test.ts) `PointsMaterial multiplies per-point RGB colours`<br>[test](src/project.test.ts) `LineBasicMaterial projects clipped RGB vertex colours as a portable gradient`<br>[test](src/project.test.ts) `transparent RGBA vertex attributes preserve alpha across portable primitives`<br>[test](src/project.test.ts) `opaque RGBA vertex attributes diagnose instead of changing blend semantics` |
| textures and UV sampling | partial | Clamped, independently repeated, or mirrored sRGB mesh, sprite, point-sprite, and 2D background colour maps use affine Canvas sampling. Mesh, point, and sprite material colours multiply linear RGB; vertex-colour/fog modulation, mipmaps, and other texture roles stay diagnostic. | [test](src/project.test.ts) `MeshBasicMaterial map and UVs become a portable textured triangle`<br>[test](src/project.test.ts) `RepeatWrapping preserves out-of-range UVs for portable tiling`<br>[test](src/project.test.ts) `mixed clamp and repeat wrapping stays portable per texture axis`<br>[test](src/project.test.ts) `mirrored wrapping preserves negative and transformed UVs on either axis`<br>[test](src/project.test.ts) `texture maps preserve linear material tint for meshes, points, and sprites`<br>[test](src/project.test.ts) `mesh clipping interpolates texture coordinates at generated edges`<br>[test](src/project.test.ts) `SpriteMaterial map preserves billboard UVs through clipping`<br>[test](src/project.test.ts) `unsupported MeshBasicMaterial features emit diagnostics`<br>[test](src/project.test.ts) `PointsMaterial map becomes a portable point-sprite texture` |
| transparency and blending | partial | Normal alpha transparency maps to Canvas opacity after opaque primitives, and uniform alphaTest discards whole primitives. Per-fragment alpha hash, MSAA alpha-to-coverage, dithering, and custom blending are diagnosed. | [test](src/project.test.ts) `normal transparent materials project opacity across portable primitives`<br>[test](src/project.test.ts) `uniform alphaTest omits every supported primitive only below its threshold`<br>[test](src/project.test.ts) `transparent primitives paint after opaque primitives`<br>[test](src/project.test.ts) `non-default depth, stencil, write, offset, blending, and sampling state emit diagnostics` |
| material clipping planes | full | World-space intersection and union clipping cut meshes, lines, and billboards, and discard points. | [test](src/project.test.ts) `material clipping planes cut meshes and lines and discard points in world space`<br>[test](src/project.test.ts) `clipIntersection retains the disjoint union of material half-spaces`<br>[test](src/project.test.ts) `Sprite clipping planes cut billboards and preserve disjoint union regions` |

#### scene

| Feature | Status | Behaviour | Test |
| --- | --- | --- | --- |
| object and material visibility | full | Invisible objects and draw calls remain absent. | [test](src/project.test.ts) `an invisible material emits neither geometry nor a diagnostic` |
| depth ordering | partial | Primitives use painter ordering, not a per-pixel depth buffer. | [test](src/project.test.ts) `far triangles are painted before near triangles` |
| Object3D.renderOrder | full | Explicit object render order groups override the portable painter depth order. | [test](src/project.test.ts) `renderOrder overrides painter depth while preserving stable object order`<br>[test](src/project.test.ts) `Group renderOrder applies to its projected descendants` |
| camera layers | full | Camera and object layer masks filter renderable objects without pruning descendants. | [test](src/project.test.ts) `camera layers filter objects without hiding matching descendants` |
| Scene.overrideMaterial | partial | Supported overrides replace eligible render-list materials while preserving visibility and allowOverride. | [test](src/project.test.ts) `Scene.overrideMaterial preserves render-list visibility and allowOverride` |
| Scene.background | partial | Solid colours and constrained 2D colour textures, including background intensity and the upstream 2D blur no-op, become non-interactive viewport decoration; environment sampling is diagnosed. | [test](src/project.test.ts) `solid scene backgrounds become non-interactive Canvas rectangles`<br>[test](src/project.test.ts) `a 2D texture background becomes a viewport-sized portable mesh`<br>[test](src/three-canvas.test.tsx) `ThreeCanvas paints scene backgrounds without creating an object control`<br>[test](src/project.test.ts) `environment backgrounds are diagnosed while portable geometry remains visible`<br>[test](src/project.test.ts) `scene background intensity modulates texture RGB`<br>[test](src/project.test.ts) `scene background blurriness is a no-op for 2D textures` |
| scene fog | partial | Fog and FogExp2 blend meshes, wireframes, lines, points, and sprites. Point and constant-depth output is exact; varying-depth gradients approximate the fragment shader at portable vertices and endpoints. | [test](src/project.test.ts) `linear fog blends mesh vertices and honours material fog opt-out`<br>[test](src/project.test.ts) `fog is evaluated at vertices created by homogeneous clipping`<br>[test](src/project.test.ts) `fog follows lines, points, sprites, and exponential density`<br>[test](src/project.test.ts) `invalid fog ranges are diagnosed instead of producing non-finite colours` |
| renderer tone mapping | out-of-scope | The portable Canvas contract fixes NoToneMapping and has no renderer tone-mapping option. | — |
| depth and stencil material state | diagnostic | Non-default depth, stencil, colour-write, polygon-offset, and blending state is rejected. | [test](src/project.test.ts) `non-default depth, stencil, write, offset, blending, and sampling state emit diagnostics` |

#### interaction

| Feature | Status | Behaviour | Test |
| --- | --- | --- | --- |
| demand invalidation | full | Revision and imperative invalidation re-project mutations. | [test](src/three-canvas.test.tsx) `ThreeCanvas draws a projected Three scene and invalidates imperative mutations`<br>[test](src/three-canvas.test.tsx) `revision re-projects imperative scene mutations` |
| continuous frame loop | full | onFrame runs before each projection and cancels on unmount. | [test](src/three-canvas.test.tsx) `the continuous loop updates before projecting and stops on unmount` |
| object raycast activation | full | Canvas activation carries the source object and intersection. | [test](src/three-canvas.test.tsx) `projected triangles raycast as one named Three object` |
| object semantic controls | full | Many projected shapes share one labelled control per object. | [test](src/three-canvas.test.tsx) `projected triangles raycast as one named Three object` |

## Interpretation

Topology surface coverage can be complete while general Three.js compatibility remains low. The portable backend handles every core primitive topology and a deliberately constrained affine colour map, but general GPU materials, texture sampling, lighting, and per-pixel depth remain separate work. The capability inventory makes approximation and feasible-but-deferred work explicit; the surface table records safe rejection of upstream classes. The silent count stays visible in both models so that raising a percentage cannot hide accepted input whose semantics are lost.
