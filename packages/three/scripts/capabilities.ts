import type { ThreeConformanceTestReference } from './conformance.ts'

export type PortableCapabilityStatus =
  | 'exact'
  | 'approximate'
  | 'deferred'
  | 'diagnostic'
  | 'silent'

export type PortableCapabilityCategory = 'geometry' | 'material'

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
    'Material',
    'transparent render ordering',
    'exact',
    'Transparent primitives paint after opaque primitives using stable painter ordering.',
    [project('transparent primitives paint after opaque primitives')],
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
    'Fog-enabled materials',
    'fog shading',
    'approximate',
    'Linear and exponential fog are evaluated at projected vertices rather than per fragment.',
    [project('fog follows lines, points, sprites, and exponential density')],
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
