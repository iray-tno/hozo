import type { ThreeConformanceTestReference } from './conformance.ts'

export type PortableCapabilityStatus =
  | 'exact'
  | 'approximate'
  | 'deferred'
  | 'diagnostic'
  | 'silent'

export type PortableCapabilityCategory = 'camera' | 'geometry' | 'material' | 'object' | 'scene'

export interface PortableCapability {
  capability: string
  category: PortableCapabilityCategory
  detail: string
  owner: string
  status: PortableCapabilityStatus
  tests: readonly ThreeConformanceTestReference[]
}

const project = (title: string): ThreeConformanceTestReference => ({
  file: 'src/project.test.ts',
  title,
})

const capability = (
  owner: string,
  name: string,
  status: PortableCapabilityStatus,
  detail: string,
  tests: readonly ThreeConformanceTestReference[],
): PortableCapability => ({
  capability: name,
  category: 'material',
  detail,
  owner,
  status,
  tests,
})

const geometryCapability = (
  owner: string,
  name: string,
  status: PortableCapabilityStatus,
  detail: string,
  tests: readonly ThreeConformanceTestReference[],
): PortableCapability => ({
  capability: name,
  category: 'geometry',
  detail,
  owner,
  status,
  tests,
})

const sceneCapability = (
  owner: string,
  name: string,
  status: PortableCapabilityStatus,
  detail: string,
  tests: readonly ThreeConformanceTestReference[],
): PortableCapability => ({
  capability: name,
  category: 'scene',
  detail,
  owner,
  status,
  tests,
})

const objectCapability = (
  owner: string,
  name: string,
  status: PortableCapabilityStatus,
  detail: string,
  tests: readonly ThreeConformanceTestReference[],
): PortableCapability => ({
  capability: name,
  category: 'object',
  detail,
  owner,
  status,
  tests,
})

const cameraCapability = (
  owner: string,
  name: string,
  status: PortableCapabilityStatus,
  detail: string,
  tests: readonly ThreeConformanceTestReference[],
): PortableCapability => ({
  capability: name,
  category: 'camera',
  detail,
  owner,
  status,
  tests,
})

/**
 * Atomic material behaviours audited for the portable projector.
 *
 * This is intentionally the first category of a larger inventory. It must not
 * be combined with the class-level surface table into a repository-wide
 * percentage: the denominators answer different questions.
 */
export const PORTABLE_MATERIAL_CAPABILITIES: readonly PortableCapability[] = [
  capability(
    'Material',
    'visibility',
    'exact',
    'Invisible materials omit their primitive without a diagnostic.',
    [project('an invisible material emits neither geometry nor a diagnostic')],
  ),
  capability(
    'Material',
    'normal alpha transparency',
    'exact',
    'Uniform opacity and normal transparency are preserved across supported primitives.',
    [project('normal transparent materials project opacity across portable primitives')],
  ),
  capability(
    'Material',
    'uniform alpha test',
    'exact',
    'A uniform primitive is discarded when its opacity is below alphaTest.',
    [project('uniform alphaTest omits every supported primitive only below its threshold')],
  ),
  capability(
    'MeshBasicMaterial',
    'uniform colour',
    'exact',
    'A flat material colour is preserved on projected triangles.',
    [project('a Three.js triangle becomes a Canvas path in viewport coordinates')],
  ),
  capability(
    'MeshBasicMaterial',
    'face side selection',
    'exact',
    'FrontSide, BackSide, and DoubleSide follow Three.js winding semantics.',
    [project('face side is respected after the viewport y-axis is flipped')],
  ),
  capability(
    'MeshBasicMaterial',
    'solid wireframe',
    'exact',
    'Triangle edges become independent portable lines.',
    [project('wireframe MeshBasicMaterial becomes three Canvas lines per triangle')],
  ),
  capability('LineBasicMaterial', 'uniform colour', 'exact', 'Line colour is preserved.', [
    project('LineSegments become independent Canvas lines with material colour and width'),
  ]),
  capability(
    'LineBasicMaterial',
    'line width',
    'exact',
    'The requested portable stroke width is preserved.',
    [project('LineSegments become independent Canvas lines with material colour and width')],
  ),
  capability(
    'LineDashedMaterial',
    'dash and gap intervals',
    'exact',
    'Finite line-distance intervals are split into equivalent solid segments.',
    [project('LineDashedMaterial projects line-distance dash and gap intervals')],
  ),
  capability('PointsMaterial', 'uniform colour', 'exact', 'Point colour is preserved.', [
    project('Points become Canvas circles with indexed draw ranges and perspective attenuation'),
  ]),
  capability(
    'PointsMaterial',
    'point size',
    'exact',
    'The requested material size becomes the point diameter.',
    [project('PointsMaterial can keep a fixed screen-space size')],
  ),
  capability(
    'PointsMaterial',
    'size attenuation modes',
    'exact',
    'Perspective and fixed screen-space sizing both follow the material flag.',
    [
      project('Points become Canvas circles with indexed draw ranges and perspective attenuation'),
      project('PointsMaterial can keep a fixed screen-space size'),
    ],
  ),
  capability('SpriteMaterial', 'rotation', 'exact', 'Billboard rotation is preserved.', [
    project('Sprite projects its billboard centre, rotation, and perspective attenuation'),
  ]),
  capability(
    'SpriteMaterial',
    'size attenuation mode',
    'exact',
    'Perspective and fixed screen-space sizing follow the material flag.',
    [project('Sprite projects its billboard centre, rotation, and perspective attenuation')],
  ),
  capability(
    'MeshBasicMaterial',
    'RGB vertex interpolation',
    'approximate',
    'Vertex colours are interpolated in the portable 2D backend; GPU perspective-correct interpolation is not promised.',
    [project('mesh vertex colours become a portable interpolated triangle')],
  ),
  capability(
    'Vertex-coloured materials',
    'RGBA vertex alpha interpolation',
    'approximate',
    'Transparent vertex alpha is preserved through the portable colour interpolation path.',
    [project('transparent RGBA vertex attributes preserve alpha across portable primitives')],
  ),
  capability(
    'MeshBasicMaterial',
    'wireframe vertex-colour interpolation',
    'approximate',
    'Each projected edge uses a portable linear colour gradient.',
    [project('wireframe MeshBasicMaterial preserves RGB vertex colours as edge gradients')],
  ),
  capability(
    'LineBasicMaterial',
    'vertex-colour interpolation',
    'approximate',
    'Projected segments use portable linear colour gradients.',
    [project('LineBasicMaterial projects clipped RGB vertex colours as a portable gradient')],
  ),
  capability(
    'PointsMaterial',
    'per-point colour',
    'exact',
    'Each point multiplies its RGB attribute by the material colour.',
    [project('PointsMaterial multiplies per-point RGB colours')],
  ),
  capability(
    'MeshBasicMaterial',
    'affine colour-map projection',
    'approximate',
    'Supported sRGB maps preserve transformed UVs, but projection is affine rather than perspective-correct.',
    [project('MeshBasicMaterial map and UVs become a portable textured triangle')],
  ),
  capability(
    'Texture-backed materials',
    'clamp and repeat wrapping',
    'exact',
    'Clamp and repeat modes are preserved independently on each texture axis.',
    [project('mixed clamp and repeat wrapping stays portable per texture axis')],
  ),
  capability(
    'PointsMaterial',
    'point-sprite colour map',
    'approximate',
    'A supported map becomes a portable textured quad without the full GPU sampling pipeline.',
    [project('PointsMaterial map becomes a portable point-sprite texture')],
  ),
  capability(
    'SpriteMaterial',
    'affine colour map',
    'approximate',
    'A supported map follows clipped billboard UVs without perspective sampling.',
    [project('SpriteMaterial map preserves billboard UVs through clipping')],
  ),
  capability(
    'MeshNormalMaterial',
    'smooth view-space normal shading',
    'approximate',
    'Vertex normals become portable colours; per-fragment normal interpolation is not reproduced.',
    [project('MeshNormalMaterial projects smooth and flat view-space normals')],
  ),
  capability(
    'MeshNormalMaterial',
    'flat view-space normal shading',
    'exact',
    'A face normal is evaluated once for each projected triangle.',
    [project('MeshNormalMaterial projects smooth and flat view-space normals')],
  ),
  capability(
    'MeshNormalMaterial',
    'wireframe normal shading',
    'deferred',
    'The CPU projection has enough edge and normal data, but this combination is not implemented yet.',
    [project('non-portable MeshNormalMaterial features stay diagnostic')],
  ),
  capability(
    'MeshNormalMaterial',
    'instanced normal shading',
    'deferred',
    'Instance transforms are already projected by the CPU path, but their normal matrices are not connected to this material yet.',
    [project('MeshNormalMaterial transformed meshes remain diagnostic')],
  ),
  capability(
    'MeshNormalMaterial',
    'skinned normal shading',
    'deferred',
    'CPU skinning is available for positions, but deformed normals are not projected for this material yet.',
    [project('MeshNormalMaterial transformed meshes remain diagnostic')],
  ),
  capability(
    'MeshNormalMaterial',
    'morphed normal shading',
    'deferred',
    'CPU morph evaluation is available for positions, but morphed normals are not projected for this material yet.',
    [project('MeshNormalMaterial transformed meshes remain diagnostic')],
  ),
  capability(
    'Texture-backed materials',
    'general GPU texture sampling',
    'diagnostic',
    'Unsupported colour spaces, transforms, mirrored wrapping, and GPU sampling state are rejected.',
    [project('non-portable texture sampling is refused with an actionable diagnostic')],
  ),
  capability(
    'Lit mesh materials',
    'lighting models',
    'diagnostic',
    'Lambert, Phong, Standard, Physical, Toon, and Matcap shading require a GPU material pipeline.',
    [project('unsupported mesh material classes emit diagnostics')],
  ),
  capability(
    'Depth and shadow materials',
    'depth, distance, and shadow output',
    'diagnostic',
    'Depth, distance, and shadow materials depend on GPU passes unavailable to the portable projector.',
    [project('unsupported mesh material classes emit diagnostics')],
  ),
  capability(
    'ShaderMaterial',
    'custom shaders',
    'diagnostic',
    'ShaderMaterial and RawShaderMaterial require a programmable GPU pipeline.',
    [project('unsupported mesh material classes emit diagnostics')],
  ),
  capability(
    'MeshNormalMaterial',
    'normal, bump, and displacement maps',
    'diagnostic',
    'Per-fragment and displacement texture evaluation requires a GPU material pipeline.',
    [project('non-portable MeshNormalMaterial features stay diagnostic')],
  ),
  capability(
    'Material',
    'custom depth, stencil, blending, and sampling state',
    'diagnostic',
    'Non-default GPU pipeline state is rejected instead of being silently approximated.',
    [
      project(
        'non-default depth, stencil, write, offset, blending, and sampling state emit diagnostics',
      ),
    ],
  ),
]

/**
 * Shape-processing behaviours owned by the portable projector.
 *
 * Cross-cutting colour, texture, transparency, and normal-shading behaviour is
 * owned by the material inventory so a future overall denominator counts each
 * atomic capability only once.
 */
export const PORTABLE_GEOMETRY_CAPABILITIES: readonly PortableCapability[] = [
  geometryCapability(
    'BufferGeometry',
    'non-indexed triangle traversal',
    'exact',
    'Position triples are traversed directly as triangles.',
    [project('a Three.js triangle becomes a Canvas path in viewport coordinates')],
  ),
  geometryCapability(
    'BufferGeometry',
    'indexed triangle traversal',
    'exact',
    'Triangle vertex lookup follows the geometry index.',
    [project('indexed geometry emits each triangle')],
  ),
  geometryCapability(
    'BufferGeometry',
    'indexed line traversal',
    'exact',
    'Line vertex lookup follows the geometry index.',
    [project('Line connects adjacent vertices and honours indexed draw ranges')],
  ),
  geometryCapability(
    'BufferGeometry',
    'indexed point traversal',
    'exact',
    'Point vertex lookup follows the geometry index.',
    [project('Points become Canvas circles with indexed draw ranges and perspective attenuation')],
  ),
  geometryCapability(
    'BufferGeometry',
    'mesh draw range',
    'exact',
    'The requested draw range intersects mesh topology and material groups.',
    [project('material groups intersect the geometry draw range')],
  ),
  geometryCapability(
    'BufferGeometry',
    'wireframe draw range',
    'exact',
    'Triangle draw ranges are converted to the equivalent wireframe edge range.',
    [project('wireframe projection applies the same doubled draw range as Three.js')],
  ),
  geometryCapability(
    'BufferGeometry',
    'line draw range',
    'exact',
    'Indexed line traversal is restricted to the requested draw range.',
    [project('Line connects adjacent vertices and honours indexed draw ranges')],
  ),
  geometryCapability(
    'BufferGeometry',
    'point draw range',
    'exact',
    'Indexed point traversal is restricted to the requested draw range.',
    [project('Points become Canvas circles with indexed draw ranges and perspective attenuation')],
  ),
  geometryCapability(
    'BufferGeometry',
    'material groups',
    'exact',
    'Group ranges select the matching entry from a material array.',
    [project('material arrays preserve BufferGeometry group colours')],
  ),
  geometryCapability(
    'Object3D transforms',
    'nested world transforms',
    'exact',
    'Ancestor and local matrices are composed before projection.',
    [project('world transforms under groups are baked into the projected path')],
  ),
  geometryCapability(
    'Object3D transforms',
    'mirrored winding',
    'exact',
    'A negative world determinant preserves Three.js front-face semantics.',
    [project('mirrored mesh transforms preserve Three.js front-face semantics')],
  ),
  geometryCapability(
    'Projection',
    'triangle frustum clipping',
    'exact',
    'Triangles are clipped in homogeneous coordinates against all six planes.',
    [project('the homogeneous clip volume cuts a near-plane crossing instead of exploding it')],
  ),
  geometryCapability(
    'Projection',
    'line frustum clipping',
    'exact',
    'Line segments crossing the clip volume become finite projected segments.',
    [project('a line crossing the near plane is clipped to finite viewport coordinates')],
  ),
  geometryCapability(
    'Projection',
    'point frustum rejection',
    'exact',
    'Points outside the homogeneous clip volume are omitted.',
    [project('points outside the homogeneous clip volume are omitted')],
  ),
  geometryCapability(
    'Clipped attributes',
    'texture-coordinate interpolation',
    'exact',
    'New clip-edge vertices receive the corresponding affine texture coordinates.',
    [project('mesh clipping interpolates texture coordinates at generated edges')],
  ),
  geometryCapability(
    'Clipped attributes',
    'vertex-colour interpolation',
    'exact',
    'New clip-edge vertices receive the corresponding colour and alpha values.',
    [project('mesh clipping interpolates vertex colours at generated edges')],
  ),
  geometryCapability(
    'Morph targets',
    'absolute mesh positions',
    'exact',
    'Absolute position targets are blended before projection.',
    [project('absolute and relative mesh morph targets deform projected triangles')],
  ),
  geometryCapability(
    'Morph targets',
    'relative mesh positions',
    'exact',
    'Relative position deltas are blended before projection.',
    [project('absolute and relative mesh morph targets deform projected triangles')],
  ),
  geometryCapability(
    'Morph targets',
    'point positions',
    'exact',
    'Point position targets move projected points.',
    [project('point morph targets move projected points')],
  ),
  geometryCapability(
    'Morph targets',
    'line positions',
    'exact',
    'Line position targets deform projected segments.',
    [project('line morph targets deform projected segments')],
  ),
  geometryCapability(
    'SkinnedMesh',
    'CPU skinned positions',
    'exact',
    'Morph targets, bind matrices, weights, and the current skeleton pose produce final positions.',
    [project('SkinnedMesh evaluates morph targets before public CPU bone transforms')],
  ),
  geometryCapability(
    'InstancedMesh',
    'instance transforms',
    'exact',
    'Each active instance matrix is applied independently.',
    [project('InstancedMesh applies each instance transform and preserves object identity')],
  ),
  geometryCapability(
    'InstancedMesh',
    'per-instance morph weights',
    'exact',
    'Each instance evaluates its own position morph weights.',
    [project('InstancedMesh applies per-instance colours and morph weights')],
  ),
  geometryCapability(
    'BatchedMesh',
    'geometry and instance ranges',
    'exact',
    'Sparse instance IDs select their geometry range, visibility, and transform.',
    [project('BatchedMesh projects sparse visible instances with transforms and colours')],
  ),
  geometryCapability(
    'Material clipping',
    'intersection half-spaces',
    'exact',
    'World-space clipping planes cut meshes and lines and discard rejected points.',
    [project('material clipping planes cut meshes and lines and discard points in world space')],
  ),
  geometryCapability(
    'Material clipping',
    'union half-spaces',
    'exact',
    'clipIntersection retains the disjoint union of accepted half-spaces.',
    [project('clipIntersection retains the disjoint union of material half-spaces')],
  ),
]

/**
 * Scene composition and traversal behaviours.
 *
 * Material appearance, shape clipping, and object-type-specific visibility
 * remain owned by their respective inventories.
 */
export const PORTABLE_SCENE_CAPABILITIES: readonly PortableCapability[] = [
  sceneCapability(
    'Render list',
    'opaque and transparent partition',
    'exact',
    'Transparent primitives paint after opaque primitives.',
    [project('transparent primitives paint after opaque primitives')],
  ),
  sceneCapability(
    'Render list',
    'primitive painter ordering',
    'approximate',
    'Non-intersecting primitives sort far-to-near, but there is no per-pixel depth buffer.',
    [project('far triangles are painted before near triangles')],
  ),
  sceneCapability(
    'Object3D.renderOrder',
    'explicit object ordering',
    'exact',
    'An explicit object render order overrides portable painter depth.',
    [project('renderOrder overrides painter depth while preserving stable object order')],
  ),
  sceneCapability(
    'Object3D.renderOrder',
    'stable equal-order traversal',
    'exact',
    'Objects with the same render order and depth retain stable traversal order.',
    [project('renderOrder overrides painter depth while preserving stable object order')],
  ),
  sceneCapability(
    'Group.renderOrder',
    'descendant ordering group',
    'exact',
    'A group render order is inherited by its projected descendants.',
    [project('Group renderOrder applies to its projected descendants')],
  ),
  sceneCapability(
    'Layers',
    'camera-object mask filtering',
    'exact',
    'Layer masks filter each renderable without pruning matching descendants.',
    [project('camera layers filter objects without hiding matching descendants')],
  ),
  sceneCapability(
    'Scene.overrideMaterial',
    'eligible material replacement',
    'exact',
    'The override replaces supported materials after render-list visibility is resolved.',
    [project('Scene.overrideMaterial preserves render-list visibility and allowOverride')],
  ),
  sceneCapability(
    'Scene.overrideMaterial',
    'allowOverride opt-out',
    'exact',
    'Materials with allowOverride disabled retain their original appearance.',
    [project('Scene.overrideMaterial preserves render-list visibility and allowOverride')],
  ),
  sceneCapability(
    'Scene.background',
    'solid colour decoration',
    'exact',
    'A colour fills the viewport without becoming an interactive object.',
    [project('solid scene backgrounds become non-interactive Canvas rectangles')],
  ),
  sceneCapability(
    'Scene.background',
    '2D texture placement',
    'exact',
    'A supported 2D colour texture covers the viewport as non-interactive decoration.',
    [project('a 2D texture background becomes a viewport-sized portable mesh')],
  ),
  sceneCapability(
    'Scene.background',
    'background intensity',
    'deferred',
    'Portable colour modulation is feasible, but backgroundIntensity is not connected yet.',
    [project('scene background modifiers remain diagnostic')],
  ),
  sceneCapability(
    'Scene.background',
    'background blur',
    'deferred',
    'Canvas and Skia can blur a background, but a cross-backend contract is not implemented yet.',
    [project('scene background modifiers remain diagnostic')],
  ),
  sceneCapability(
    'Scene.background',
    'environment-map sampling',
    'diagnostic',
    'Cube and equirectangular environment projection requires a GPU sampling pipeline.',
    [project('environment backgrounds are diagnosed while portable geometry remains visible')],
  ),
  sceneCapability(
    'Fog',
    'material opt-out',
    'exact',
    'Materials with fog disabled retain their unfogged colour.',
    [project('linear fog blends mesh vertices and honours material fog opt-out')],
  ),
  sceneCapability(
    'Fog',
    'constant-depth linear fog',
    'exact',
    'A constant-depth primitive receives the matching linear fog colour.',
    [project('fog follows lines, points, sprites, and exponential density')],
  ),
  sceneCapability(
    'FogExp2',
    'constant-depth exponential fog',
    'exact',
    'A constant-depth primitive receives the matching exponential fog colour.',
    [project('fog follows lines, points, sprites, and exponential density')],
  ),
  sceneCapability(
    'Fog',
    'varying-depth vertex fog',
    'approximate',
    'Fog is evaluated at portable vertices and endpoints rather than per fragment.',
    [
      project('fog is evaluated at vertices created by homogeneous clipping'),
      project('fog follows lines, points, sprites, and exponential density'),
    ],
  ),
  sceneCapability(
    'Fog',
    'invalid range refusal',
    'diagnostic',
    'Invalid or non-finite fog parameters are rejected instead of producing invalid colours.',
    [project('invalid fog ranges are diagnosed instead of producing non-finite colours')],
  ),
  sceneCapability(
    'Depth buffer',
    'per-pixel depth and stencil',
    'diagnostic',
    'Exact intersecting-surface depth and stencil evaluation requires a raster pipeline.',
    [
      project(
        'non-default depth, stencil, write, offset, blending, and sampling state emit diagnostics',
      ),
    ],
  ),
]

/**
 * Object traversal, selection, and source-identity behaviours.
 *
 * Primitive topology, transforms, deformation, and appearance stay owned by
 * geometry, topology, and material rather than being repeated here.
 */
export const PORTABLE_OBJECT_CAPABILITIES: readonly PortableCapability[] = [
  objectCapability(
    'Object3D',
    'individual visibility',
    'exact',
    'An invisible renderable object is omitted.',
    [project('object visibility prunes objects and hidden subtrees')],
  ),
  objectCapability(
    'Group',
    'descendant traversal',
    'exact',
    'Renderable descendants are discovered through nested groups.',
    [project('world transforms under groups are baked into the projected path')],
  ),
  objectCapability(
    'Group',
    'hidden-subtree pruning',
    'exact',
    'An invisible ancestor removes its complete subtree.',
    [project('object visibility prunes objects and hidden subtrees')],
  ),
  objectCapability(
    'Mesh',
    'triangle-pipeline routing',
    'exact',
    'A Mesh is routed to the portable triangle pipeline.',
    [project('a Three.js triangle becomes a Canvas path in viewport coordinates')],
  ),
  objectCapability(
    'Line',
    'line-strip routing',
    'exact',
    'A Line is routed to the portable connected-line pipeline.',
    [project('Line connects adjacent vertices and honours indexed draw ranges')],
  ),
  objectCapability(
    'LineLoop',
    'closed-line routing',
    'exact',
    'A LineLoop selects the closed portable line topology.',
    [project('LineLoop closes its final vertex back to its first')],
  ),
  objectCapability(
    'LineSegments',
    'independent-segment routing',
    'exact',
    'LineSegments selects independent portable line pairs.',
    [project('LineSegments become independent Canvas lines with material colour and width')],
  ),
  objectCapability(
    'Points',
    'point-pipeline routing',
    'exact',
    'Points is routed to the portable point pipeline.',
    [project('Points become Canvas circles with indexed draw ranges and perspective attenuation')],
  ),
  objectCapability(
    'Sprite',
    'camera-facing quad',
    'exact',
    'A Sprite becomes a camera-facing quad at its projected centre.',
    [project('Sprite projects its billboard centre, rotation, and perspective attenuation')],
  ),
  objectCapability(
    'Sprite',
    'centre anchor',
    'exact',
    'The public centre shifts the billboard anchor.',
    [project('Sprite projects its billboard centre, rotation, and perspective attenuation')],
  ),
  objectCapability(
    'Sprite',
    'object scale',
    'exact',
    'World scale controls the billboard dimensions.',
    [project('Sprite projects its billboard centre, rotation, and perspective attenuation')],
  ),
  objectCapability(
    'Sprite',
    'draw count visibility',
    'exact',
    'A zero draw count omits the sprite.',
    [project('Sprite projects its billboard centre, rotation, and perspective attenuation')],
  ),
  objectCapability(
    'InstancedMesh',
    'active instance count',
    'exact',
    'Only instances below the public count are projected.',
    [project('InstancedMesh applies each instance transform and preserves object identity')],
  ),
  objectCapability(
    'InstancedMesh',
    'source object identity',
    'exact',
    'Every projected instance retains the InstancedMesh as its source object.',
    [project('InstancedMesh applies each instance transform and preserves object identity')],
  ),
  objectCapability(
    'InstancedMesh',
    'per-instance colour',
    'exact',
    'Each instance colour modulates the supported base material colour.',
    [project('InstancedMesh applies per-instance colours and morph weights')],
  ),
  objectCapability(
    'BatchedMesh',
    'sparse instance selection',
    'exact',
    'Deleted sparse instance IDs are skipped without shifting active IDs.',
    [project('BatchedMesh projects sparse visible instances with transforms and colours')],
  ),
  objectCapability(
    'BatchedMesh',
    'per-instance visibility',
    'exact',
    'The public visibility flag independently hides a batch instance.',
    [project('BatchedMesh projects sparse visible instances with transforms and colours')],
  ),
  objectCapability(
    'BatchedMesh',
    'per-instance colour',
    'exact',
    'A batch instance colour modulates the supported base material colour.',
    [project('BatchedMesh projects sparse visible instances with transforms and colours')],
  ),
  objectCapability(
    'BatchedMesh',
    'source object identity',
    'exact',
    'Every projected batch instance retains the BatchedMesh as its source object.',
    [project('BatchedMesh projects sparse visible instances with transforms and colours')],
  ),
  objectCapability(
    'LOD',
    'camera-distance selection',
    'exact',
    'Automatic LOD selects the level for the current camera distance.',
    [project('LOD selects the camera-distance level and honours manual visibility')],
  ),
  objectCapability(
    'LOD',
    'manual level visibility',
    'exact',
    'Disabling automatic updates preserves application-controlled level visibility.',
    [project('LOD selects the camera-distance level and honours manual visibility')],
  ),
  objectCapability(
    'SkinnedMesh',
    'source object identity',
    'exact',
    'Projected skinned primitives retain their SkinnedMesh source object.',
    [project('SkinnedMesh evaluates morph targets before public CPU bone transforms')],
  ),
]

/** Camera projection, view, and multi-viewport composition behaviours. */
export const PORTABLE_CAMERA_CAPABILITIES: readonly PortableCapability[] = [
  cameraCapability(
    'PerspectiveCamera',
    'projection matrix',
    'exact',
    'The public perspective projection matrix maps clip coordinates.',
    [project('a Three.js triangle becomes a Canvas path in viewport coordinates')],
  ),
  cameraCapability(
    'PerspectiveCamera',
    'world-to-view transform',
    'exact',
    'The public camera world matrix is inverted before projection.',
    [project('a Three.js triangle becomes a Canvas path in viewport coordinates')],
  ),
  cameraCapability(
    'OrthographicCamera',
    'projection matrix',
    'exact',
    'The public orthographic projection matrix maps clip coordinates.',
    [project('world transforms under groups are baked into the projected path')],
  ),
  cameraCapability(
    'OrthographicCamera',
    'world-to-view transform',
    'exact',
    'The public camera world matrix is inverted before orthographic projection.',
    [project('world transforms under groups are baked into the projected path')],
  ),
  cameraCapability(
    'ArrayCamera',
    'declared sub-camera order',
    'exact',
    'Sub-cameras project in their declared order.',
    [project('ArrayCamera projects each sub-camera into its bottom-left viewport')],
  ),
  cameraCapability(
    'ArrayCamera',
    'bottom-left viewport mapping',
    'exact',
    'Three.js bottom-left viewport coordinates map to portable top-left groups.',
    [project('ArrayCamera projects each sub-camera into its bottom-left viewport')],
  ),
  cameraCapability(
    'ArrayCamera',
    'single scene decoration pass',
    'exact',
    'Scene background decoration is emitted once around all sub-camera groups.',
    [project('ArrayCamera projects each sub-camera into its bottom-left viewport')],
  ),
  cameraCapability(
    'ArrayCamera',
    'missing viewport refusal',
    'diagnostic',
    'A sub-camera without an explicit viewport is rejected.',
    [project('ArrayCamera diagnoses sub-cameras without a viewport')],
  ),
  cameraCapability(
    'Camera',
    'base camera projection',
    'diagnostic',
    'A base Camera has no usable projection matrix contract and is rejected.',
    [project('unsupported inputs are omitted with actionable diagnostics')],
  ),
  cameraCapability(
    'CubeCamera',
    'environment capture',
    'diagnostic',
    'Cube environment capture requires a GPU renderer and render target.',
    [project('GPU capture cameras remain diagnostic')],
  ),
]

export interface PortableCapabilitySummary {
  approximate: number
  deferred: number
  diagnostic: number
  exact: number
  feasible: number
  implemented: number
  silent: number
  total: number
}

export function summarizePortableCapabilities(
  capabilities: readonly PortableCapability[],
): PortableCapabilitySummary {
  const count = (status: PortableCapabilityStatus) =>
    capabilities.filter((entry) => entry.status === status).length
  const exact = count('exact')
  const approximate = count('approximate')
  const deferred = count('deferred')
  return {
    approximate,
    deferred,
    diagnostic: count('diagnostic'),
    exact,
    feasible: exact + approximate + deferred,
    implemented: exact + approximate,
    silent: count('silent'),
    total: capabilities.length,
  }
}
